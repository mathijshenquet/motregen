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
        motregen-ingest = pkgs.callPackage ./nix/packages/ingest.nix { inherit rustPlatform; };
        motregen-web = pkgs.callPackage ./nix/packages/web.nix { };
      };
    in
    {
      packages.${system} = motregenPackages // {
        default = motregenPackages.motregen-ingest;
      };

      nixosModules = {
        motregen = import ./nix/modules/motregen.nix;
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
        nixos-vm = pkgs.testers.runNixOSTest (
          import ./nix/tests/motregen.nix { inherit self; }
        );
      };
    };
}
