{
  imports = [
    ./disko.nix
    ./modules/host.nix
    ./modules/motregen.nix
  ];

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
