{ lib, stdenvNoCC, stdenv, autoPatchelfHook, makeWrapper, ffmpeg, bundle, variant }:

stdenvNoCC.mkDerivation {
  pname = "motregen-wind-preview-${variant}";
  version = "0.1.0";
  src = bundle;
  nativeBuildInputs = [ autoPatchelfHook makeWrapper ];
  buildInputs = [ stdenv.cc.cc.lib ];
  dontConfigure = true;
  dontBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p "$out/bin" "$out/share/motregen-render"
    install -m755 motregen-render "$out/bin/motregen-render"
    cp -r basemaps "$out/share/motregen-render/"
    cp plan.json "$out/share/motregen-render/"
    runHook postInstall
  '';
  postFixup = ''
    wrapProgram "$out/bin/motregen-render" --prefix PATH : ${lib.makeBinPath [ ffmpeg ]}
  '';
  meta = {
    description = "Isolated Wind layer preview; not a production renderer";
    platforms = lib.platforms.linux;
    mainProgram = "motregen-render";
  };
}
