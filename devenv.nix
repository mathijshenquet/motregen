{ pkgs, ... }:

{
  env.ECCODES_DIR = pkgs.eccodes;
  env.BINDGEN_EXTRA_CLANG_ARGS = "-isystem ${pkgs.glibc.dev}/include";
  env.LIBCLANG_PATH = "${pkgs.llvmPackages.libclang.lib}/lib";
  env.PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
  env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = true;

  languages.rust.enable = true;

  languages.javascript = {
    enable = true;
    pnpm.enable = true;
  };

  packages = [
    pkgs.caddy
    pkgs.eccodes
    pkgs.hdf5
    pkgs.pkg-config
    pkgs.uv
    pkgs.zstd
    pkgs.jq
    pkgs.llvmPackages.libclang
    pkgs.playwright-driver.browsers
  ];
}
