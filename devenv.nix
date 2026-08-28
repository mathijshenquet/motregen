{ pkgs, ... }:

{
  env.ECCODES_DIR = pkgs.eccodes;
  env.BINDGEN_EXTRA_CLANG_ARGS = "-isystem ${pkgs.glibc.dev}/include";
  env.LIBCLANG_PATH = "${pkgs.llvmPackages.libclang.lib}/lib";

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
    pkgs.llvmPackages.libclang
  ];
}
