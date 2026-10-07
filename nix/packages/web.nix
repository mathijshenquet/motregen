{
  lib,
  stdenvNoCC,
  nodejs,
  pnpm_10,
  callPackage,
  pnpmConfigHook,
}:

stdenvNoCC.mkDerivation {
  pname = "motregen-web";
  version = "0.1.0";
  inherit (callPackage ./javascript-deps.nix { }) src pnpmDeps;

  nativeBuildInputs = [
    nodejs
    pnpm_10
    pnpmConfigHook
  ];

  buildPhase = ''
    runHook preBuild
    pnpm --filter motregen-web run build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p "$out"
    cp -r web/dist/. "$out/"
    runHook postInstall
  '';

  meta = {
    description = "Static motregen.nl frontend";
    license = lib.licenses.mit;
    platforms = lib.platforms.all;
  };
}
