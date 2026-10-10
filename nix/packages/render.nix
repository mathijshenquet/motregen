{ lib, rustPlatform, makeWrapper, ffmpeg }:

rustPlatform.buildRustPackage {
  pname = "motregen-render";
  version = "0.1.0";
  src = lib.fileset.toSource {
    root = ../..;
    fileset = lib.fileset.unions [ ../../Cargo.toml ../../Cargo.lock ../../crates ];
  };
  cargoLock.lockFile = ../../Cargo.lock;
  cargoBuildFlags = [ "-p" "render" ];
  cargoTestFlags = [ "-p" "render-core" "-p" "render" ];
  nativeBuildInputs = [ makeWrapper ];
  postFixup = ''
    wrapProgram "$out/bin/motregen-render" --prefix PATH : ${lib.makeBinPath [ ffmpeg ]}
  '';
  meta = {
    description = "Rust renderer for national rain loops and stills";
    license = lib.licenses.mit;
    platforms = lib.platforms.linux;
    mainProgram = "motregen-render";
  };
}
