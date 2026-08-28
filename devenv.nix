{ pkgs, ... }:

{
  languages.rust.enable = true;

  languages.javascript = {
    enable = true;
    pnpm.enable = true;
  };

  packages = [
    pkgs.eccodes
    pkgs.hdf5
    pkgs.pkg-config
    pkgs.uv
    pkgs.zstd
    pkgs.jq
  ];
}
