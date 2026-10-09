{ pkgs, ... }:

{
  env.ECCODES_DIR = pkgs.eccodes;
  env.BINDGEN_EXTRA_CLANG_ARGS = "-isystem ${pkgs.glibc.dev}/include";
  env.LIBCLANG_PATH = "${pkgs.llvmPackages.libclang.lib}/lib";
  env.PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
  env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = true;
  env.MOTREGEN_FIREFOX_MESA = pkgs.mesa;
  env.MOTREGEN_FIREFOX_GL = pkgs.libglvnd;

  languages.rust.enable = true;

  languages.javascript = {
    enable = true;
    pnpm.enable = true;
  };

  packages = [
    pkgs.caddy
    pkgs.tilemaker
    pkgs.pmtiles
    pkgs.osmium-tool
    pkgs.gdal
    pkgs.unzip
    pkgs.ffmpeg
    pkgs.eccodes
    pkgs.hdf5
    pkgs.pkg-config
    pkgs.uv
    pkgs.zstd
    pkgs.jq
    pkgs.llvmPackages.libclang
    pkgs.playwright-driver.browsers
    pkgs.xvfb-run
  ];
}
