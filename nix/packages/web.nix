{
  lib,
  stdenvNoCC,
  nodejs,
  ffmpeg,
  pnpm_10,
  callPackage,
  pnpmConfigHook,
  # Per domein een eigen bundle (MIP-28); null = de standaard van de build (motregen.nl).
  brandName ? null,
  canonicalOrigin ? null,
  pname ? "motregen-web",
}:

stdenvNoCC.mkDerivation {
  inherit pname;
  version = lib.strings.trim (builtins.readFile ../../VERSION);
  inherit (callPackage ./javascript-deps.nix { }) src pnpmDeps;

  nativeBuildInputs = [
    nodejs
    ffmpeg
    pnpm_10
    pnpmConfigHook
  ];

  env = lib.optionalAttrs (brandName != null) { VITE_BRAND_NAME = brandName; }
    // lib.optionalAttrs (canonicalOrigin != null) { VITE_CANONICAL_ORIGIN = canonicalOrigin; };

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
    description = "Static motregen frontend, branded per domain";
    license = lib.licenses.mit;
    platforms = lib.platforms.all;
  };
}
