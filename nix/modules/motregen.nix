{
  config,
  lib,
  pkgs,
  self,
  ...
}:

let
  cfg = config.services.motregen;
  caddyDataDir = "/run/motregen-data";
  dataHeaders = ''
    header {
      Access-Control-Allow-Origin "*"
      Access-Control-Expose-Headers "Accept-Ranges, Content-Length, Content-Range, ETag"
      Accept-Ranges "bytes"
    }
  '';
in
{
  options.services.motregen = {
    enable = lib.mkEnableOption "motregen ingest and web serving";

    domain = lib.mkOption {
      type = lib.types.str;
      default = "motregen.nl";
      description = "Public hostname served by Caddy.";
    };

    enableTls = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Let Caddy obtain and serve public TLS certificates.";
    };

    dataDir = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/motregen";
      readOnly = true;
      description = "Mutable ingest state served below /data/.";
    };

    secretsFile = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/motregen/secrets.env";
      description = "Root-managed environment file kept outside the Nix store.";
    };

    ingestPackage = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.motregen-ingest;
      defaultText = lib.literalExpression "self.packages.\${pkgs.stdenv.hostPlatform.system}.motregen-ingest";
      description = "Ingest daemon package.";
    };

    frontendPackage = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.motregen-web;
      defaultText = lib.literalExpression "self.packages.\${pkgs.stdenv.hostPlatform.system}.motregen-web";
      description = "Vite dist tree served by Caddy.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.tmpfiles.rules = [ "d ${cfg.dataDir} 0755 root root -" ];

    systemd.services.motregen-ingest = {
      description = "KNMI ingest for motregen.nl";
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ];

      environment = {
        MOTREGEN_DATA_DIR = cfg.dataDir;
        RUST_LOG = "info";
      };

      serviceConfig = {
        Type = "simple";
        ExecStart = lib.getExe cfg.ingestPackage;
        EnvironmentFile = cfg.secretsFile;
        DynamicUser = true;
        StateDirectory = "motregen";
        StateDirectoryMode = "0755";
        UMask = "0022";

        Restart = "always";
        RestartSec = "5s";
        RestartSteps = 7;
        RestartMaxDelaySec = "5min";

        NoNewPrivileges = true;
        PrivateDevices = true;
        PrivateTmp = true;
        ProtectClock = true;
        ProtectControlGroups = true;
        ProtectHome = true;
        ProtectHostname = true;
        ProtectKernelLogs = true;
        ProtectKernelModules = true;
        ProtectKernelTunables = true;
        ProtectProc = "invisible";
        ProtectSystem = "strict";
        ProcSubset = "pid";
        RestrictAddressFamilies = [
          "AF_INET"
          "AF_INET6"
          "AF_UNIX"
        ];
        RestrictNamespaces = true;
        RestrictRealtime = true;
        RestrictSUIDSGID = true;
        LockPersonality = true;
        CapabilityBoundingSet = "";
        AmbientCapabilities = "";
        SystemCallArchitectures = "native";
      };
    };

    services.caddy = {
      enable = true;
      globalConfig = lib.optionalString (!cfg.enableTls) "auto_https off";
      virtualHosts.${cfg.domain} = {
        hostName = if cfg.enableTls then cfg.domain else ":80";
        extraConfig = ''
          @manifest path /data/manifest.json
          handle @manifest {
            root * ${caddyDataDir}
            uri strip_prefix /data
            ${dataHeaders}
            header Cache-Control "public, max-age=15, stale-while-revalidate=60"
            file_server
          }

          @chunks path /data/chunks/*
          handle @chunks {
            root * ${caddyDataDir}
            uri strip_prefix /data
            ${dataHeaders}
            header Cache-Control "public, max-age=31536000, immutable"
            header -Content-Encoding
            file_server
          }

          handle /data/* {
            respond 404
          }

          handle {
            root * ${cfg.frontendPackage}
            try_files {path} /index.html
            file_server
          }
        '';
      };
    };

    systemd.services.caddy = {
      after = [ "motregen-ingest.service" ];
      serviceConfig.BindReadOnlyPaths = [ "${cfg.dataDir}:${caddyDataDir}" ];
    };
  };
}
