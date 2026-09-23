{
  lib,
  stdenvNoCC,
  nodejs,
  pnpm_10,
  fetchPnpmDeps,
  pnpmConfigHook,
}:

stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "motregen-web";
  version = "0.1.0";
  src = lib.cleanSource ../../web;

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm_10;
    fetcherVersion = 3;
    hash = "sha256-iBdu0lI94rn6xFBl7n2g5LfKc/G8dsLcigzOvSIRQEo=";
  };

  nativeBuildInputs = [
    nodejs
    pnpm_10
    pnpmConfigHook
  ];

  buildPhase = ''
    runHook preBuild
    pnpm run build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p "$out"
    cp -r dist/. "$out/"
    runHook postInstall
  '';

  meta = {
    description = "Static motregen.nl frontend";
    license = lib.licenses.mit;
    platforms = lib.platforms.all;
  };
})
