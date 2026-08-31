{
  imports = [
    ./disko.nix
    ./modules/host.nix
    ./modules/motregen.nix
  ];

  networking = {
    useDHCP = false;
    useNetworkd = true;
  };

  systemd.network.networks."10-ovh-uplink" = {
    matchConfig.MACAddress = "fa:16:3e:c7:02:3f";
    linkConfig.RequiredForOnline = "routable";
    networkConfig = {
      DHCP = "ipv4";
      IPv6AcceptRA = false;
      DNS = [
        "213.186.33.99"
        "1.1.1.1"
      ];
    };
    dhcpV4Config = {
      RouteMetric = 100;
      UseDNS = false;
    };
    addresses = [
      { Address = "2001:41d0:701:1100::d923/128"; }
    ];
    routes = [
      {
        Destination = "2001:41d0:701:1100::/64";
        Scope = "link";
      }
      {
        Destination = "::/0";
        Gateway = "2001:41d0:701:1100::1";
        GatewayOnLink = true;
      }
    ];
  };

  boot = {
    initrd.availableKernelModules = [
      "ahci"
      "nvme"
      "sd_mod"
      "virtio_pci"
      "virtio_scsi"
    ];
    loader = {
      efi.canTouchEfiVariables = false;
      grub = {
        enable = true;
        devices = [ "/dev/sda" ];
        efiSupport = true;
        efiInstallAsRemovable = true;
      };
    };
  };

  services.motregen.enable = true;
}
