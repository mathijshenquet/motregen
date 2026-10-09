{
  lib,
  stdenvNoCC,
  stdenv,
  callPackage,
  nodejs,
  rustc,
  pnpm_10,
  pnpmConfigHook,
  makeWrapper,
}:

stdenvNoCC.mkDerivation {
  pname = "motregen-bot";
  version = "0.1.0";
  inherit (callPackage ./javascript-deps.nix { }) src pnpmDeps;
  nativeBuildInputs = [ nodejs rustc stdenv.cc pnpm_10 pnpmConfigHook makeWrapper ];

  buildPhase = ''
    runHook preBuild
    pnpm --filter motregen-bot run build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    pnpm --offline --filter motregen-bot --config.inject-workspace-packages=true deploy --prod "$out/lib/motregen-bot"
    mkdir -p "$out/bin"
    makeWrapper ${lib.getExe nodejs} "$out/bin/motregen-bot" \
      --add-flags "$out/lib/motregen-bot/dist/bot/main.js"
    runHook postInstall
  '';

  meta = {
    description = "Telegram Mini App and national weather stills for motregen.nl";
    license = lib.licenses.mit;
    platforms = lib.platforms.linux;
    mainProgram = "motregen-bot";
  };
}
