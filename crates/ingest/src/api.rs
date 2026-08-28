use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};

use anyhow::{Context, Result, bail, ensure};
use reqwest::{
    StatusCode,
    blocking::{Client, RequestBuilder, Response},
    header::{AUTHORIZATION, CONTENT_RANGE, RANGE},
};
use serde::{Deserialize, Deserializer, de::Error as _};

const DEFAULT_API_BASE: &str = "https://api.dataplatform.knmi.nl/open-data/v1";

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFile {
    pub filename: String,
    #[serde(deserialize_with = "deserialize_u64")]
    pub size: u64,
    pub last_modified: String,
}

#[derive(Deserialize)]
struct FileList {
    files: Vec<RemoteFile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadUrl {
    temporary_download_url: String,
    #[serde(deserialize_with = "deserialize_u64")]
    size: u64,
}

fn deserialize_u64<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u64, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Number {
        Integer(u64),
        String(String),
    }
    match Number::deserialize(deserializer)? {
        Number::Integer(value) => Ok(value),
        Number::String(value) => value.parse().map_err(D::Error::custom),
    }
}

pub struct ApiClient {
    client: Client,
    api_key: String,
    base_url: String,
}

impl ApiClient {
    pub fn new(api_key: String, base_url: Option<String>) -> Result<Self> {
        ensure!(!api_key.trim().is_empty(), "KNMI API key is empty");
        Ok(Self {
            client: Client::builder()
                .connect_timeout(Duration::from_secs(30))
                .timeout(Duration::from_secs(30 * 60))
                .build()?,
            api_key,
            base_url: base_url.unwrap_or_else(|| DEFAULT_API_BASE.to_owned()),
        })
    }

    pub fn list_files(
        &self,
        dataset: &str,
        version: &str,
        max_keys: usize,
    ) -> Result<Vec<RemoteFile>> {
        let url = format!(
            "{}/datasets/{dataset}/versions/{version}/files",
            self.base_url
        );
        let response = self
            .send(
                self.client
                    .get(url)
                    .header(AUTHORIZATION, &self.api_key)
                    .query(&[
                        ("maxKeys", max_keys.to_string()),
                        ("orderBy", "lastModified".to_owned()),
                        ("sorting", "desc".to_owned()),
                    ]),
            )?
            .error_for_status()?;
        Ok(response.json::<FileList>()?.files)
    }

    pub fn download_url(&self, dataset: &str, version: &str, file: &RemoteFile) -> Result<String> {
        ensure_safe_filename(&file.filename)?;
        let url = format!(
            "{}/datasets/{dataset}/versions/{version}/files/{}/url",
            self.base_url, file.filename
        );
        let response = self
            .send(self.client.get(url).header(AUTHORIZATION, &self.api_key))?
            .error_for_status()?
            .json::<DownloadUrl>()?;
        ensure!(
            response.size == file.size,
            "download metadata size changed for {}",
            file.filename
        );
        Ok(response.temporary_download_url)
    }

    pub fn cache_file(
        &self,
        dataset: &str,
        version: &str,
        file: &RemoteFile,
        cache_dir: &Path,
    ) -> Result<PathBuf> {
        ensure_safe_filename(&file.filename)?;
        fs::create_dir_all(cache_dir)?;
        let path = cache_dir.join(&file.filename);
        if path
            .metadata()
            .is_ok_and(|metadata| metadata.len() == file.size)
        {
            return Ok(path);
        }
        let url = self.download_url(dataset, version, file)?;
        let mut response = self.send(self.client.get(url))?.error_for_status()?;
        ensure!(
            response.content_length() == Some(file.size),
            "download response size changed for {}",
            file.filename
        );
        let mut temporary = tempfile::NamedTempFile::new_in(cache_dir)?;
        std::io::copy(&mut response, &mut temporary)?;
        temporary.flush()?;
        ensure!(
            temporary.as_file().metadata()?.len() == file.size,
            "short download for {}",
            file.filename
        );
        temporary.as_file().sync_all()?;
        temporary.persist(&path).map_err(|error| error.error)?;
        Ok(path)
    }

    pub fn fetch_range(&self, url: &str, start: u64, end: u64) -> Result<Vec<u8>> {
        ensure!(end >= start, "invalid byte range {start}-{end}");
        let mut response = self.send(
            self.client
                .get(url)
                .header(RANGE, format!("bytes={start}-{end}")),
        )?;
        ensure!(
            response.status() == StatusCode::PARTIAL_CONTENT,
            "server did not honor byte range {start}-{end}: {}",
            response.status()
        );
        let expected_content_range = format!("bytes {start}-{end}/");
        let content_range = response
            .headers()
            .get(CONTENT_RANGE)
            .context("range response lacks Content-Range")?
            .to_str()?;
        ensure!(
            content_range.starts_with(&expected_content_range),
            "unexpected Content-Range {content_range}"
        );
        let expected_len = usize::try_from(end - start + 1)?;
        let mut bytes = Vec::with_capacity(expected_len);
        response.read_to_end(&mut bytes)?;
        ensure!(
            bytes.len() == expected_len,
            "short byte range {start}-{end}: got {} bytes",
            bytes.len()
        );
        Ok(bytes)
    }

    fn send(&self, request: RequestBuilder) -> Result<Response> {
        for attempt in 1..=5 {
            let retry = request
                .try_clone()
                .context("HTTP request body cannot be retried")?;
            match retry.send() {
                Ok(response)
                    if (response.status() == StatusCode::TOO_MANY_REQUESTS
                        || response.status().is_server_error())
                        && attempt < 5 => {}
                Ok(response) => return Ok(response),
                Err(_) if attempt < 5 => {}
                Err(error) => return Err(error.into()),
            }
            std::thread::sleep(Duration::from_secs(attempt));
        }
        bail!("HTTP request exhausted retry attempts")
    }

    pub fn cache_range(&self, url: &str, start: u64, size: u64, path: &Path) -> Result<()> {
        if path.metadata().is_ok_and(|metadata| metadata.len() == size) {
            return Ok(());
        }
        let parent = path.parent().context("range cache path has no parent")?;
        fs::create_dir_all(parent)?;
        let end = start
            .checked_add(size)
            .and_then(|value| value.checked_sub(1))
            .context("range end overflow")?;
        let bytes = self.fetch_range(url, start, end)?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
        temporary.write_all(&bytes)?;
        temporary.flush()?;
        temporary.as_file().sync_all()?;
        temporary.persist(path).map_err(|error| error.error)?;
        Ok(())
    }
}

fn ensure_safe_filename(filename: &str) -> Result<()> {
    let path = Path::new(filename);
    ensure!(
        path.file_name().and_then(|value| value.to_str()) == Some(filename),
        "unsafe remote filename {filename:?}"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_knmi_string_encoded_file_size() {
        let file: RemoteFile = serde_json::from_str(
            r#"{"filename":"RAD.h5","size":"107047","lastModified":"2026-08-28T16:00:00Z"}"#,
        )
        .unwrap();
        assert_eq!(file.size, 107_047);
    }
}
