//! The mrf v0 chunk format shared by motregen ingest and tooling.

use std::ops::Range;

use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const MAGIC: [u8; 4] = *b"mrf0";
pub const VERSION: u32 = 0;
pub const COMPRESSION_LEVEL: i32 = 19;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Grid {
    pub crs: String,
    pub x0: f64,
    pub y0: f64,
    pub dx: f64,
    pub dy: f64,
    pub width: u32,
    pub height: u32,
}

impl Grid {
    pub fn cell_count(&self) -> Result<usize, Error> {
        let count = u64::from(self.width)
            .checked_mul(u64::from(self.height))
            .ok_or(Error::GridTooLarge)?;
        usize::try_from(count).map_err(|_| Error::GridTooLarge)
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Frame {
    pub time: String,
    pub offset: u64,
    pub len: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Header {
    pub version: u32,
    pub grid: Grid,
    pub quant: Vec<Option<f32>>,
    pub source: String,
    pub run: String,
    pub frames: Vec<Frame>,
    pub dict: Option<Vec<u8>>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ChunkMeta {
    pub grid: Grid,
    pub quant: Vec<Option<f32>>,
    pub source: String,
    pub run: String,
    pub frame_times: Vec<String>,
}

impl ChunkMeta {
    pub fn standard(
        grid: Grid,
        source: impl Into<String>,
        run: impl Into<String>,
        frame_times: Vec<String>,
    ) -> Self {
        Self {
            grid,
            quant: quantization_table(),
            source: source.into(),
            run: run.into(),
            frame_times,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct DecodedChunk {
    pub header: Header,
    pub frames: Vec<Vec<u8>>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct HeaderIndex {
    pub header: Header,
    pub header_len: usize,
}

#[derive(Debug, Error)]
pub enum Error {
    #[error("chunk is shorter than its eight-byte prefix")]
    TruncatedPrefix,
    #[error("invalid mrf magic")]
    BadMagic,
    #[error("JSON header is truncated")]
    TruncatedHeader,
    #[error("JSON header length does not fit this platform")]
    HeaderTooLarge,
    #[error("invalid JSON header: {0}")]
    Json(#[from] serde_json::Error),
    #[error("unsupported mrf version {0}")]
    UnsupportedVersion(u32),
    #[error("grid dimensions overflow this platform")]
    GridTooLarge,
    #[error(
        "quantization table must contain exactly 256 entries, with 0.0 at index 0 and null at index 255"
    )]
    InvalidQuantizationTable,
    #[error("mrf v0 requires dict to be null")]
    UnsupportedDictionary,
    #[error("frame count ({times}) does not match supplied frame count ({frames})")]
    FrameCountMismatch { times: usize, frames: usize },
    #[error("frame {index} has {actual} bytes; grid requires {expected}")]
    WrongFrameLength {
        index: usize,
        actual: usize,
        expected: usize,
    },
    #[error("frame {0} is not present in the header")]
    FrameOutOfBounds(usize),
    #[error("frame {index} range overflows the payload")]
    FrameRangeOverflow { index: usize },
    #[error("frame {index} is outside the supplied chunk")]
    TruncatedPayload { index: usize },
    #[error(
        "payload does not end at the end of the chunk: got {actual} bytes, expected {expected}"
    )]
    PayloadLengthMismatch { actual: usize, expected: usize },
    #[error("frame {index} has {actual} decoded bytes; grid requires {expected}")]
    DecodedWrongLength {
        index: usize,
        actual: usize,
        expected: usize,
    },
    #[error("zstd failed: {0}")]
    Zstd(#[from] std::io::Error),
}

/// Returns the v0 byte-to-mm/h table. Entry 255 is `None` for no-data.
pub fn quantization_table() -> Vec<Option<f32>> {
    let mut table = Vec::with_capacity(256);
    table.push(Some(0.0));
    for index in 1..=254 {
        let exponent = (index - 1) as f64 / 253.0;
        table.push(Some(
            (0.01_f64 * (150.0_f64 / 0.01_f64).powf(exponent)) as f32,
        ));
    }
    table.push(None);
    table
}

/// Quantizes a rate using the v0 table. NaN maps to no-data (255); values
/// below half of 0.01 map to dry (0), values above 150 map to 254, and a tie
/// between two table values selects the lower index.
pub fn quantize(value: f32) -> u8 {
    quantize_with_table(value, &quantization_table())
        .expect("the built-in quantization table is valid")
}

/// Quantizes against a table supplied by an mrf header.
pub fn quantize_with_table(value: f32, table: &[Option<f32>]) -> Result<u8, Error> {
    validate_quantization_table(table)?;
    if value.is_nan() {
        return Ok(255);
    }
    let first = table[1].expect("validated table entry");
    let last = table[254].expect("validated table entry");
    if value <= first / 2.0 {
        return Ok(0);
    }
    if value >= last {
        return Ok(254);
    }
    let upper =
        table[..255].partition_point(|candidate| candidate.expect("validated table entry") < value);
    let lower = upper - 1;
    let lower_value = table[lower].expect("validated table entry");
    let upper_value = table[upper].expect("validated table entry");
    if value - lower_value <= upper_value - value {
        Ok(lower as u8)
    } else {
        Ok(upper as u8)
    }
}

pub fn encode(frames: &[Vec<u8>], meta: &ChunkMeta) -> Result<Vec<u8>, Error> {
    validate_meta(meta, frames)?;
    let mut compressed = Vec::with_capacity(frames.len());
    for frame in frames {
        compressed.push(zstd::stream::encode_all(
            frame.as_slice(),
            COMPRESSION_LEVEL,
        )?);
    }
    let mut offset = 0_u64;
    let entries = compressed
        .iter()
        .zip(&meta.frame_times)
        .map(|(bytes, time)| {
            let len = bytes.len() as u64;
            let frame = Frame {
                time: time.clone(),
                offset,
                len,
            };
            offset += len;
            frame
        })
        .collect();
    let header = Header {
        version: VERSION,
        grid: meta.grid.clone(),
        quant: meta.quant.clone(),
        source: meta.source.clone(),
        run: meta.run.clone(),
        frames: entries,
        dict: None,
    };
    let json = serde_json::to_vec(&header)?;
    let header_len = u32::try_from(json.len()).map_err(|_| Error::HeaderTooLarge)?;
    let payload_len: usize = compressed.iter().map(Vec::len).sum();
    let mut chunk = Vec::with_capacity(8 + json.len() + payload_len);
    chunk.extend_from_slice(&MAGIC);
    chunk.extend_from_slice(&header_len.to_le_bytes());
    chunk.extend_from_slice(&json);
    for frame in compressed {
        chunk.extend_from_slice(&frame);
    }
    Ok(chunk)
}

pub fn parse_header(bytes: &[u8]) -> Result<HeaderIndex, Error> {
    if bytes.len() < 8 {
        return Err(Error::TruncatedPrefix);
    }
    if bytes[..4] != MAGIC {
        return Err(Error::BadMagic);
    }
    let json_len = u32::from_le_bytes(bytes[4..8].try_into().expect("prefix has four bytes"));
    let json_len = usize::try_from(json_len).map_err(|_| Error::HeaderTooLarge)?;
    let header_len = 8_usize.checked_add(json_len).ok_or(Error::HeaderTooLarge)?;
    if bytes.len() < header_len {
        return Err(Error::TruncatedHeader);
    }
    let header: Header = serde_json::from_slice(&bytes[8..header_len])?;
    validate_header(&header)?;
    Ok(HeaderIndex { header, header_len })
}

impl HeaderIndex {
    pub fn frame_range(&self, index: usize) -> Result<Range<u64>, Error> {
        let frame = self
            .header
            .frames
            .get(index)
            .ok_or(Error::FrameOutOfBounds(index))?;
        let start = (self.header_len as u64)
            .checked_add(frame.offset)
            .ok_or(Error::FrameRangeOverflow { index })?;
        let end = start
            .checked_add(frame.len)
            .ok_or(Error::FrameRangeOverflow { index })?;
        Ok(start..end)
    }

    pub fn payload_range(&self, index: usize) -> Result<Range<u64>, Error> {
        let frame = self
            .header
            .frames
            .get(index)
            .ok_or(Error::FrameOutOfBounds(index))?;
        let end = frame
            .offset
            .checked_add(frame.len)
            .ok_or(Error::FrameRangeOverflow { index })?;
        Ok(frame.offset..end)
    }

    /// Decodes one independently fetched compressed frame member.
    pub fn decode_frame(&self, index: usize, compressed: &[u8]) -> Result<Vec<u8>, Error> {
        let frame = self
            .header
            .frames
            .get(index)
            .ok_or(Error::FrameOutOfBounds(index))?;
        if usize::try_from(frame.len).ok() != Some(compressed.len()) {
            return Err(Error::TruncatedPayload { index });
        }
        let decoded = zstd::stream::decode_all(compressed)?;
        let expected = self.header.grid.cell_count()?;
        if decoded.len() != expected {
            return Err(Error::DecodedWrongLength {
                index,
                actual: decoded.len(),
                expected,
            });
        }
        Ok(decoded)
    }
}

pub fn decode(bytes: &[u8]) -> Result<DecodedChunk, Error> {
    let index = parse_header(bytes)?;
    let mut frames = Vec::with_capacity(index.header.frames.len());
    for frame_index in 0..index.header.frames.len() {
        let range = index.frame_range(frame_index)?;
        let start = usize::try_from(range.start)
            .map_err(|_| Error::FrameRangeOverflow { index: frame_index })?;
        let end = usize::try_from(range.end)
            .map_err(|_| Error::FrameRangeOverflow { index: frame_index })?;
        let member = bytes
            .get(start..end)
            .ok_or(Error::TruncatedPayload { index: frame_index })?;
        frames.push(index.decode_frame(frame_index, member)?);
    }
    let payload_end = index
        .header
        .frames
        .last()
        .map(|frame| frame.offset + frame.len)
        .unwrap_or(0);
    let expected_len = index
        .header_len
        .checked_add(usize::try_from(payload_end).map_err(|_| Error::HeaderTooLarge)?)
        .ok_or(Error::HeaderTooLarge)?;
    if bytes.len() != expected_len {
        return Err(Error::PayloadLengthMismatch {
            actual: bytes.len(),
            expected: expected_len,
        });
    }
    Ok(DecodedChunk {
        header: index.header,
        frames,
    })
}

fn validate_meta(meta: &ChunkMeta, frames: &[Vec<u8>]) -> Result<(), Error> {
    validate_quantization_table(&meta.quant)?;
    if meta.frame_times.len() != frames.len() {
        return Err(Error::FrameCountMismatch {
            times: meta.frame_times.len(),
            frames: frames.len(),
        });
    }
    let expected = meta.grid.cell_count()?;
    for (index, frame) in frames.iter().enumerate() {
        if frame.len() != expected {
            return Err(Error::WrongFrameLength {
                index,
                actual: frame.len(),
                expected,
            });
        }
    }
    Ok(())
}

fn validate_header(header: &Header) -> Result<(), Error> {
    if header.version != VERSION {
        return Err(Error::UnsupportedVersion(header.version));
    }
    header.grid.cell_count()?;
    validate_quantization_table(&header.quant)?;
    if header.dict.is_some() {
        return Err(Error::UnsupportedDictionary);
    }
    let mut expected_offset = 0_u64;
    for (index, frame) in header.frames.iter().enumerate() {
        if frame.offset != expected_offset {
            return Err(Error::FrameRangeOverflow { index });
        }
        expected_offset = expected_offset
            .checked_add(frame.len)
            .ok_or(Error::FrameRangeOverflow { index })?;
    }
    Ok(())
}

fn validate_quantization_table(table: &[Option<f32>]) -> Result<(), Error> {
    if table.len() != 256 || table[0] != Some(0.0) || table[255].is_some() {
        return Err(Error::InvalidQuantizationTable);
    }
    let mut previous = 0.0_f32;
    for value in table[1..255].iter().flatten() {
        if !value.is_finite() || *value <= previous {
            return Err(Error::InvalidQuantizationTable);
        }
        previous = *value;
    }
    if table[1..255].iter().any(Option::is_none) {
        return Err(Error::InvalidQuantizationTable);
    }
    Ok(())
}
