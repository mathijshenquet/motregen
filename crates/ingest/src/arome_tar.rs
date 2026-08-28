use anyhow::{Context, Result, bail, ensure};

const TAR_BLOCK_SIZE: u64 = 512;
const HEADER_PROBE_SIZE: u64 = 1_536;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TarMember {
    pub name: String,
    pub lead_hour: u32,
    pub data_offset: u64,
    pub size: u64,
}

pub fn index_lead_members(
    mut fetch: impl FnMut(u64, u64) -> Result<Vec<u8>>,
    horizon_hours: u32,
) -> Result<Vec<TarMember>> {
    let mut archive_offset = 0_u64;
    let mut members = vec![None; horizon_hours as usize + 1];
    for _ in 0..128 {
        if members.iter().all(Option::is_some) {
            return Ok(members.into_iter().flatten().collect());
        }
        let probe_end = archive_offset
            .checked_add(HEADER_PROBE_SIZE - 1)
            .context("tar probe offset overflow")?;
        let probe = fetch(archive_offset, probe_end)?;
        ensure!(
            probe.len() == HEADER_PROBE_SIZE as usize,
            "short tar header probe at byte {archive_offset}"
        );
        let first = header_from_probe(&probe, archive_offset, archive_offset)?;
        validate_header(&first)?;
        let file_header_offset = if first[156] == b'x' {
            let pax_size = parse_octal(&first[124..136])?;
            archive_offset
                .checked_add(TAR_BLOCK_SIZE)
                .and_then(|offset| offset.checked_add(padded_size(pax_size)))
                .context("pax header offset overflow")?
        } else {
            ensure!(
                first[156] == b'0' || first[156] == 0,
                "tar entry is neither a pax header nor a regular file"
            );
            archive_offset
        };
        let file_header =
            if let Ok(header) = header_from_probe(&probe, archive_offset, file_header_offset) {
                header
            } else {
                let bytes = fetch(file_header_offset, file_header_offset + TAR_BLOCK_SIZE - 1)?;
                ensure!(
                    bytes.len() == TAR_BLOCK_SIZE as usize,
                    "short tar member header at byte {file_header_offset}"
                );
                bytes.try_into().expect("checked 512-byte header")
            };
        validate_header(&file_header)?;
        ensure!(
            file_header[156] == b'0' || file_header[156] == 0,
            "tar entry is not a regular file"
        );
        let name = parse_string(&file_header[0..100])?;
        let lead_hour = parse_lead_hour(&name)?;
        let size = parse_octal(&file_header[124..136])?;
        let data_offset = file_header_offset
            .checked_add(TAR_BLOCK_SIZE)
            .context("tar data offset overflow")?;
        if lead_hour <= horizon_hours {
            let slot = &mut members[lead_hour as usize];
            ensure!(slot.is_none(), "duplicate AROME lead +{lead_hour}");
            *slot = Some(TarMember {
                name,
                lead_hour,
                data_offset,
                size,
            });
        }
        archive_offset = data_offset
            .checked_add(padded_size(size))
            .context("tar member offset overflow")?;
    }
    bail!("AROME tar does not contain every lead from +0 to +{horizon_hours}")
}

fn header_from_probe(probe: &[u8], probe_offset: u64, header_offset: u64) -> Result<[u8; 512]> {
    let relative = header_offset
        .checked_sub(probe_offset)
        .context("header precedes probe")?;
    let start = usize::try_from(relative)?;
    let end = start.checked_add(512).context("header range overflow")?;
    let bytes = probe.get(start..end).context("header is outside probe")?;
    Ok(bytes.try_into().expect("checked 512-byte header"))
}

fn validate_header(header: &[u8; 512]) -> Result<()> {
    ensure!(
        &header[257..262] == b"ustar",
        "unsupported or corrupt tar header"
    );
    let expected = parse_octal(&header[148..156])?;
    let actual = header
        .iter()
        .enumerate()
        .map(|(index, byte)| {
            if (148..156).contains(&index) {
                u64::from(b' ')
            } else {
                u64::from(*byte)
            }
        })
        .sum::<u64>();
    ensure!(actual == expected, "tar header checksum mismatch");
    Ok(())
}

fn parse_string(bytes: &[u8]) -> Result<String> {
    let end = bytes
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(bytes.len());
    Ok(std::str::from_utf8(&bytes[..end])?.to_owned())
}

fn parse_octal(bytes: &[u8]) -> Result<u64> {
    let text = std::str::from_utf8(bytes)?.trim_matches(['\0', ' ']).trim();
    if text.is_empty() {
        return Ok(0);
    }
    u64::from_str_radix(text, 8).with_context(|| format!("invalid tar octal value {text:?}"))
}

fn parse_lead_hour(name: &str) -> Result<u32> {
    let encoded = name
        .rsplit('_')
        .nth(1)
        .with_context(|| format!("AROME member has unexpected name {name}"))?;
    let value: u32 = encoded.parse()?;
    if !value.is_multiple_of(100) {
        bail!("AROME member lead is not an hour: {name}");
    }
    Ok(value / 100)
}

fn padded_size(size: u64) -> u64 {
    size.div_ceil(TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn indexes_pax_wrapped_lead_members_with_small_range_reads() {
        let archive = synthetic_archive(&[0, 5, 1, 2]);
        let mut reads = Vec::new();
        let members = index_lead_members(
            |start, end| {
                reads.push((start, end));
                Ok(archive[start as usize..=end as usize].to_vec())
            },
            2,
        )
        .unwrap();
        assert_eq!(members.len(), 3);
        assert_eq!(members[1].name, "HA43_N20_202608281300_00100_GB");
        assert_eq!(members[1].lead_hour, 1);
        assert_eq!(members[1].size, 4);
        assert_eq!(reads.len(), 4);
        assert!(reads.iter().all(|(start, end)| end - start + 1 == 1_536));
    }

    fn synthetic_archive(leads: &[usize]) -> Vec<u8> {
        let mut archive = Vec::new();
        for &lead in leads {
            append_entry(
                &mut archive,
                "././@PaxHeader",
                b"28 mtime=1787932638.0\n",
                b'x',
            );
            append_entry(
                &mut archive,
                &format!("HA43_N20_202608281300_{lead:03}00_GB"),
                &[lead as u8; 4],
                b'0',
            );
        }
        archive.extend_from_slice(&[0; 1_536]);
        archive
    }

    fn append_entry(archive: &mut Vec<u8>, name: &str, data: &[u8], kind: u8) {
        let mut header = [0_u8; 512];
        header[..name.len()].copy_from_slice(name.as_bytes());
        write_octal(&mut header[100..108], 0o644);
        write_octal(&mut header[108..116], 0);
        write_octal(&mut header[116..124], 0);
        write_octal(&mut header[124..136], data.len() as u64);
        write_octal(&mut header[136..148], 0);
        header[148..156].fill(b' ');
        header[156] = kind;
        header[257..263].copy_from_slice(b"ustar\0");
        header[263..265].copy_from_slice(b"00");
        let checksum = header.iter().map(|byte| u64::from(*byte)).sum();
        write_checksum(&mut header[148..156], checksum);
        archive.extend_from_slice(&header);
        archive.extend_from_slice(data);
        archive.resize(
            archive.len() + (padded_size(data.len() as u64) as usize - data.len()),
            0,
        );
    }

    fn write_octal(target: &mut [u8], value: u64) {
        let text = format!("{:0width$o}\0", value, width = target.len() - 1);
        target.copy_from_slice(text.as_bytes());
    }

    fn write_checksum(target: &mut [u8], value: u64) {
        let text = format!("{value:06o}\0 ");
        target.copy_from_slice(text.as_bytes());
    }
}
