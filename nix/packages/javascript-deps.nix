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
    hash = "sha256-ThuGHHHVexQQS6RxF6LDP4Nc6jbF3ymi1T3DCP6oj9k=";
  };
}
