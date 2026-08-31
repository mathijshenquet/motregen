{
  config,
  lib,
  ...
}:

{
  networking = {
    hostName = "motregen";
    useDHCP = lib.mkDefault true;
    firewall = {
      enable = true;
      allowedTCPPorts = [
        22
        80
        443
      ];
      allowedUDPPorts = [ 443 ];
    };
  };

  time.timeZone = "Europe/Amsterdam";

  services.openssh = {
    enable = true;
    openFirewall = false;
    settings = {
      PasswordAuthentication = false;
      KbdInteractiveAuthentication = false;
      PermitRootLogin = "prohibit-password";
    };
  };
  users.users.root.openssh.authorizedKeys.keys = import ../authorized-keys.nix;

  assertions = [
    {
      assertion = config.networking.firewall.enable;
      message = "The motregen host firewall must remain enabled.";
    }
    {
      assertion = config.networking.firewall.allowedTCPPorts == [
        22
        80
        443
      ];
      message = "The motregen host may only expose TCP ports 22, 80, and 443.";
    }
    {
      assertion = config.networking.firewall.allowedUDPPorts == [ 443 ];
      message = "The motregen host may only expose UDP port 443 for HTTP/3.";
    }
  ];

  zramSwap = {
    enable = true;
    algorithm = "zstd";
    memoryPercent = 50;
  };

  nix = {
    settings = {
      auto-optimise-store = true;
      experimental-features = [
        "nix-command"
        "flakes"
      ];
    };
    gc = {
      automatic = true;
      dates = "Sun 04:30";
      options = "--delete-older-than 30d";
    };
  };

  system.autoUpgrade = {
    enable = true;
    flake = "github:mathijshenquet/motregen#motregen";
    dates = "03:15";
    randomizedDelaySec = "30min";
    fixedRandomDelay = true;
    allowReboot = true;
    rebootWindow = {
      lower = "03:00";
      upper = "05:00";
    };
  };

  system.stateVersion = "25.11";
}
