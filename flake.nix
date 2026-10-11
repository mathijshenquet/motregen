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
        motregen-web-weerok = pkgs.callPackage ./nix/packages/web.nix {
          pname = "motregen-web-weerok";
          brandName = "weer ok?";
          canonicalOrigin = "https://weerok.nl";
        };
        motregen-render = pkgs.callPackage ./nix/packages/render.nix { inherit rustPlatform; };
        motregen-bot = pkgs.callPackage ./nix/packages/bot.nix {
          motregen-render = motregenPackages.motregen-render;
        };
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
            # Prod draait "combined" (MIP-26 slot); de rolspecifieke asserts gebruiken losse configuraties.
            combined = self.nixosConfigurations.motregen.config.systemd.services.motregen-bot;
            poller = (nixpkgs.lib.nixosSystem {
              inherit system;
              modules = [ self.nixosModules.motregen {
                services.motregen.bot.enable = true;
                services.motregen.bot.role = "poller";
              } ];
            }).config.systemd.services.motregen-bot;
            renderer = (nixpkgs.lib.nixosSystem {
              inherit system;
              modules = [ self.nixosModules.motregen {
                services.motregen.bot.enable = true;
                services.motregen.bot.role = "renderer";
              } ];
            }).config;
            fallback = modes: (nixpkgs.lib.nixosSystem {
              inherit system;
              modules = [ self.nixosModules.motregen {
                services.motregen.bot.enable = true;
                services.motregen.bot.role = "renderer";
                services.motregen.bot.rustModes = modes;
              } ];
            }).config.systemd.services.motregen-bot;
            nodeRenderer = fallback [ ];
            mixedRenderer = fallback [ "weather" ];
          in
          assert poller.environment.MOTREGEN_BOT_ROLE == "poller";
          assert !(poller.environment ? MOTREGEN_CHROMIUM_PATH);
          assert !(poller.environment ? PLAYWRIGHT_BROWSERS_PATH);
          assert !(poller.environment ? MOTREGEN_RUST_RENDERER);
          assert !(builtins.any (package: package == pkgs.ffmpeg) poller.path);
          assert poller.serviceConfig.MemoryMax == "512M";
          assert combined.environment.MOTREGEN_BOT_ROLE == "combined";
          assert !(combined.environment ? MOTREGEN_CHROMIUM_PATH);
          assert !(combined.environment ? PLAYWRIGHT_BROWSERS_PATH);
          assert combined.environment.MOTREGEN_RUST_RENDERER == "weather,feels,wind";
          assert combined.environment.MOTREGEN_RUST_BASEMAP_DIR == "${self.packages.${system}.motregen-render}/share/motregen-render/basemaps";
          assert combined.serviceConfig.CPUQuota == "200%";
          assert combined.serviceConfig.MemoryHigh == "infinity";
          assert combined.serviceConfig.MemoryMax == "1200M";
          assert combined.serviceConfig.OOMPolicy == "kill";
          assert combined.environment.MOTREGEN_DATA_DIR == "/run/motregen-data";
          assert builtins.elem "/var/lib/motregen:/run/motregen-data" combined.serviceConfig.BindReadOnlyPaths;
          assert combined.serviceConfig.Restart == "always";
          assert combined.serviceConfig.MemorySwapMax == "0";
          assert !(renderer.systemd.services.motregen-bot.environment ? MOTREGEN_CHROMIUM_PATH);
          assert renderer.systemd.services.motregen-bot.environment.MOTREGEN_RUST_RENDERER == "weather,feels,wind";
          assert renderer.systemd.services.motregen-bot.environment.MOTREGEN_DATA_DIR == "/run/motregen-data";
          assert builtins.elem "/var/lib/motregen:/run/motregen-data" renderer.systemd.services.motregen-bot.serviceConfig.BindReadOnlyPaths;
          assert renderer.systemd.services.motregen-bot.environment.MOTREGEN_ORIGIN == "https://motregen.nl";
          assert renderer.systemd.services.motregen-bot.serviceConfig.CPUQuota == "200%";
          assert renderer.systemd.services.motregen-bot.serviceConfig.MemoryHigh == "900M";
          assert renderer.systemd.services.motregen-bot.serviceConfig.MemoryMax == "1100M";
          assert renderer.systemd.services.motregen-bot.serviceConfig.MemorySwapMax == "0";
          assert !(renderer.systemd.services ? motregen-ingest);
          assert !renderer.services.caddy.enable;
          assert nodeRenderer.environment.MOTREGEN_RUST_RENDERER == "";
          assert nodeRenderer.environment ? MOTREGEN_CHROMIUM_PATH;
          assert !(nodeRenderer.environment ? MOTREGEN_DATA_DIR);
          assert nodeRenderer.serviceConfig.BindReadOnlyPaths == [ ];
          assert mixedRenderer.environment.MOTREGEN_RUST_RENDERER == "weather";
          assert mixedRenderer.environment ? MOTREGEN_CHROMIUM_PATH;
          assert mixedRenderer.environment.MOTREGEN_DATA_DIR == "/run/motregen-data";
          pkgs.runCommand "motregen-bot-roles" { } "touch $out";
        nixos-vm = pkgs.testers.runNixOSTest (
          import ./nix/tests/motregen.nix { inherit self; }
        );
      };
    };
}
