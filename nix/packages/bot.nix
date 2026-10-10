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
  motregen-render,
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
      --add-flags "--max-old-space-size=192 --max-semi-space-size=4 --expose-gc" \
      --set-default MALLOC_ARENA_MAX 2 \
      --set-default MALLOC_MMAP_THRESHOLD_ 131072 \
      --set-default MOTREGEN_RENDER_BIN ${lib.getExe motregen-render} \
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
