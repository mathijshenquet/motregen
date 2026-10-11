use fontdue::{Font, FontSettings};
use std::sync::{Arc, OnceLock};

pub(crate) fn inter() -> Result<Arc<Font>, &'static str> {
    static FONT: OnceLock<Result<Arc<Font>, &'static str>> = OnceLock::new();
    FONT.get_or_init(|| {
        Font::from_bytes(
            include_bytes!("../assets/InterVariable.ttf") as &[u8],
            FontSettings::default(),
        )
        .map(Arc::new)
    })
    .clone()
}
