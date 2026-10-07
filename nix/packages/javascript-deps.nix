{
  lib,
  pnpm_10,
  fetchPnpmDeps,
}:

let
  src = lib.cleanSource ../..;
in
{
  inherit src;
  pnpmDeps = fetchPnpmDeps {
    pname = "motregen-javascript";
    version = "0.1.0";
    inherit src;
    pnpm = pnpm_10;
    fetcherVersion = 3;
    hash = "sha256-rdThCMFNIPJM+0CUti8/GuALgVhR5M4sJ2TBF4sjc1Y=";
  };
}
