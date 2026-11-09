use fontdue::{Font, FontSettings};
use std::sync::{Arc, OnceLock};

fn load(
    cell: &'static OnceLock<Result<Arc<Font>, &'static str>>,
    bytes: &'static [u8],
) -> Result<Arc<Font>, &'static str> {
    cell.get_or_init(|| Font::from_bytes(bytes, FontSettings::default()).map(Arc::new))
        .clone()
}

/// Klok, datum en titel (bediening).
pub(crate) fn inter() -> Result<Arc<Font>, &'static str> {
    static FONT: OnceLock<Result<Arc<Font>, &'static str>> = OnceLock::new();
    load(&FONT, include_bytes!("../assets/InterVariable.ttf"))
}

/// Kaartgetallen en -labels (U107, docs/kaartstijl.md): dezelfde letter als de plaatsnamen op de platen.
pub(crate) fn map_regular() -> Result<Arc<Font>, &'static str> {
    static FONT: OnceLock<Result<Arc<Font>, &'static str>> = OnceLock::new();
    load(&FONT, include_bytes!("../assets/NotoSans-Regular.ttf"))
}

/// Het getal in de windbadge (gewicht 800, zoals de app).
pub(crate) fn map_bold() -> Result<Arc<Font>, &'static str> {
    static FONT: OnceLock<Result<Arc<Font>, &'static str>> = OnceLock::new();
    load(&FONT, include_bytes!("../assets/NotoSans-ExtraBold.ttf"))
}
