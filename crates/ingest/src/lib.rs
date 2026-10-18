pub mod api;
pub mod arome_tar;
pub mod cams;
pub mod cams_ads;
pub mod cams_open_meteo;
pub mod ecmwf;
pub mod env_file;
pub mod feels_reference;
pub mod grid;
pub mod icon_d2;
pub mod pipeline;
pub mod publisher;

// The Nix ecCodes build has GRIB_PTHREADS=0: separate handles still share its parser.
static GRIB_DECODER_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
