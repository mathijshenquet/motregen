{
  description = "motregen.nl unattended NixOS deployment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    disko = {
      url = "github:nix-community/disko";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{
      self,
      nixpkgs,
      disko,
      rust-overlay,
      ...
    }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        overlays = [ (import rust-overlay) ];
      };
      rustToolchain = pkgs.rust-bin.stable."1.97.0".minimal;
      rustPlatform = pkgs.makeRustPlatform {
        cargo = rustToolchain;
        rustc = rustToolchain;
      };
      motregenPackages = {
        motregen-basemap = pkgs.callPackage ./nix/packages/basemap.nix { };
        motregen-ingest = pkgs.callPackage ./nix/packages/ingest.nix { inherit rustPlatform; };
        motregen-web = pkgs.callPackage ./nix/packages/web.nix { };
        motregen-bot = pkgs.callPackage ./nix/packages/bot.nix { };
      };
    in
    {
      packages.${system} = motregenPackages // {
        default = motregenPackages.motregen-ingest;
      };

      nixosModules = {
        motregen = { config, lib, pkgs, ... }: import ./nix/modules/motregen.nix {
          inherit config lib pkgs self;
        };
        motregen-host = import ./nix/modules/host.nix;
      };

      nixosConfigurations.motregen = nixpkgs.lib.nixosSystem {
        inherit system;
        specialArgs = { inherit self; };
        modules = [
          disko.nixosModules.disko
          ./nix/configuration.nix
        ];
      };

      checks.${system} = motregenPackages // {
        bot-roles =
          let
            poller = self.nixosConfigurations.motregen.config.systemd.services.motregen-bot;
            renderer = (nixpkgs.lib.nixosSystem {
              inherit system;
              modules = [ self.nixosModules.motregen {
                services.motregen.bot.enable = true;
                services.motregen.bot.role = "renderer";
              } ];
            }).config;
          in
          assert poller.environment.MOTREGEN_BOT_ROLE == "poller";
          assert !(poller.environment ? MOTREGEN_CHROMIUM_PATH);
          assert !(poller.environment ? PLAYWRIGHT_BROWSERS_PATH);
          assert !(builtins.any (package: package == pkgs.ffmpeg) poller.path);
          assert poller.serviceConfig.MemoryMax == "256M";
          assert renderer.systemd.services.motregen-bot.environment ? MOTREGEN_CHROMIUM_PATH;
          assert renderer.systemd.services.motregen-bot.environment.MOTREGEN_ORIGIN == "https://motregen.nl";
          assert !(renderer.systemd.services ? motregen-ingest);
          assert !renderer.services.caddy.enable;
          pkgs.runCommand "motregen-bot-roles" { } "touch $out";
        nixos-vm = pkgs.testers.runNixOSTest (
          import ./nix/tests/motregen.nix { inherit self; }
        );
      };
    };
}
