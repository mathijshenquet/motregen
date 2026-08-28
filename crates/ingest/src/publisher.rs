use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

use anyhow::{Context, Result, ensure};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Manifest {
    pub version: u32,
    pub generated: String,
    pub now: String,
    pub chunks: Vec<ManifestChunk>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ManifestChunk {
    pub url: String,
    pub source: String,
    pub field: String,
    pub run: String,
    pub header_len: usize,
    pub times: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct ProducedChunk {
    pub filename: String,
    pub bytes: Vec<u8>,
    pub manifest: ManifestChunk,
}

pub fn produced_chunk(filename: String, bytes: Vec<u8>) -> Result<ProducedChunk> {
    ensure!(
        Path::new(&filename)
            .file_name()
            .and_then(|value| value.to_str())
            == Some(filename.as_str()),
        "unsafe chunk filename"
    );
    let index = mrf::parse_header(&bytes)?;
    let manifest = ManifestChunk {
        url: format!("chunks/{filename}"),
        source: index.header.source,
        field: index.header.field,
        run: index.header.run,
        header_len: index.header_len,
        times: index
            .header
            .frames
            .into_iter()
            .map(|frame| frame.time)
            .collect(),
    };
    Ok(ProducedChunk {
        filename,
        bytes,
        manifest,
    })
}

pub fn publish(
    data_dir: &Path,
    now: String,
    chunks: &[&ProducedChunk],
    prune_age: Duration,
) -> Result<Manifest> {
    ensure!(!chunks.is_empty(), "cannot publish an empty manifest");
    let chunks_dir = data_dir.join("chunks");
    fs::create_dir_all(&chunks_dir)?;
    for chunk in chunks {
        let path = chunks_dir.join(&chunk.filename);
        if path.exists() {
            ensure!(
                fs::read(&path)? == chunk.bytes,
                "immutable chunk collision at {}",
                path.display()
            );
        } else {
            atomic_write(&path, &chunk.bytes)?;
        }
    }
    let manifest = Manifest {
        version: 0,
        generated: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
        now,
        chunks: chunks.iter().map(|chunk| chunk.manifest.clone()).collect(),
    };
    let json = serde_json::to_vec_pretty(&manifest)?;
    atomic_write(&data_dir.join("manifest.json"), &json)?;
    prune_chunks(&chunks_dir, chunks, prune_age)?;
    Ok(manifest)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().context("atomic output path has no parent")?;
    fs::create_dir_all(parent)?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(bytes)?;
    temporary.flush()?;
    temporary.as_file().sync_all()?;
    temporary.persist(path).map_err(|error| error.error)?;
    Ok(())
}

fn prune_chunks(chunks_dir: &Path, current: &[&ProducedChunk], prune_age: Duration) -> Result<()> {
    let current = current
        .iter()
        .map(|chunk| PathBuf::from(&chunk.filename))
        .collect::<HashSet<_>>();
    let cutoff = SystemTime::now()
        .checked_sub(prune_age)
        .context("chunk prune age is too large")?;
    for entry in fs::read_dir(chunks_dir)? {
        let entry = entry?;
        if current.contains(&PathBuf::from(entry.file_name())) || !entry.file_type()?.is_file() {
            continue;
        }
        if entry.metadata()?.modified()? < cutoff {
            fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chunk(source: &str, run: &str, filename: &str) -> ProducedChunk {
        let meta = mrf::ChunkMeta::standard(
            mrf::Grid {
                crs: "EPSG:3857".into(),
                x0: 0.0,
                y0: 1.0,
                dx: 1.0,
                dy: -1.0,
                width: 1,
                height: 1,
            },
            source,
            run,
            vec![run.to_owned()],
        );
        produced_chunk(filename.into(), mrf::encode(&[vec![0]], &meta).unwrap()).unwrap()
    }

    #[test]
    fn published_manifest_matches_contract_fields() {
        let directory = tempfile::tempdir().unwrap();
        let chunks = [chunk(
            "rtcor",
            "2026-08-28T15:00:00Z",
            "rtcor-20260828T1500.mrf",
        )];
        let manifest = publish(
            directory.path(),
            "2026-08-28T15:00:00Z".into(),
            &[&chunks[0]],
            Duration::from_secs(0),
        )
        .unwrap();
        assert_eq!(manifest.version, 0);
        assert_eq!(manifest.chunks[0].field, "rain_rate");
        assert_eq!(manifest.chunks[0].url, "chunks/rtcor-20260828T1500.mrf");
        assert_eq!(
            manifest.chunks[0].header_len,
            mrf::parse_header(&chunks[0].bytes).unwrap().header_len
        );
        let disk: Manifest =
            serde_json::from_slice(&fs::read(directory.path().join("manifest.json")).unwrap())
                .unwrap();
        assert_eq!(disk, manifest);
    }
}
