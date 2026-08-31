{
  lib,
  rustPlatform,
  pkg-config,
  llvmPackages,
  makeWrapper,
  stdenv,
  eccodes,
  hdf5,
  netcdf,
}:

rustPlatform.buildRustPackage {
  pname = "motregen-ingest";
  version = "0.1.0";
  src = lib.fileset.toSource {
    root = ../..;
    fileset = lib.fileset.unions [
      ../../Cargo.toml
      ../../Cargo.lock
      ../../crates
    ];
  };

  cargoLock.lockFile = ../../Cargo.lock;
  cargoBuildFlags = [
    "-p"
    "motregen-ingest"
  ];
  cargoTestFlags = [
    "-p"
    "motregen-ingest"
  ];

  nativeBuildInputs = [
    pkg-config
    llvmPackages.libclang
    makeWrapper
  ];
  buildInputs = [
    eccodes
    hdf5
    netcdf
  ];

  ECCODES_DIR = eccodes;
  LIBCLANG_PATH = "${lib.getLib llvmPackages.libclang}/lib";
  BINDGEN_EXTRA_CLANG_ARGS = "-isystem ${lib.getDev stdenv.cc.libc}/include";

  postFixup = ''
    wrapProgram "$out/bin/motregen-ingest" \
      --prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath [
        eccodes
        hdf5
        netcdf
      ]}
  '';

  meta = {
    description = "KNMI data ingest daemon for motregen.nl";
    license = lib.licenses.mit;
    mainProgram = "motregen-ingest";
    platforms = lib.platforms.linux;
  };
}
