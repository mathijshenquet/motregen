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

  hardening = {
    NoNewPrivileges = true;
    PrivateDevices = true;
    PrivateNetwork = true;
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
    RestrictAddressFamilies = [ "AF_UNIX" ];
    RestrictNamespaces = true;
    RestrictRealtime = true;
    RestrictSUIDSGID = true;
    LockPersonality = true;
    CapabilityBoundingSet = "";
    AmbientCapabilities = "";
    SystemCallArchitectures = "native";
  };

  # Buiten dataDir: de ingest (DynamicUser + StateDirectory) chownt dataDir recursief.
  usageRoot = "/var/lib/motregen-usage";
  usageDir = "${usageRoot}/usage";
  statsDir = "${usageRoot}/stats";
  usageSocket = "/run/motregen-usage.sock";
  usageUser = "motregen-usage";

  # Caddy kan niet per kalenderdag roteren; de collector kiest per regel het dagbestand.
  usageCollector = pkgs.writeText "motregen-usage-collector.awk" ''
    {
      file = dir "/" strftime("%Y-%m-%d") ".jsonl"
      if (file != current) {
        if (current != "") close(current)
        current = file
      }
      print >> file
      fflush(file)
    }
  '';

  usageReport = pkgs.writeShellApplication {
    name = "motregen-usage-report";
    runtimeInputs = [
      pkgs.coreutils
      pkgs.jq
    ];
    text = ''
      usage=${usageDir}
      stats=${statsDir}
      jq_lib=${../usage}
      today=$(date +%F)
      cutoff=$(date -d '30 days ago' +%F)

      for log in "$usage"/*.jsonl; do
        [ -e "$log" ] || continue
        day=$(basename "$log" .jsonl)
        [[ "$day" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue
        [[ "$day" < "$today" ]] || continue
        if [[ "$day" < "$cutoff" ]]; then
          rm -- "$log"
          continue
        fi
        if [ ! -e "$stats/$day.json" ] || [ "$log" -nt "$stats/$day.json" ]; then
          jq -nR -L "$jq_lib" --arg day "$day" -f "$jq_lib/day.jq" < "$log" > "$stats/.$day.json.tmp"
          mv -- "$stats/.$day.json.tmp" "$stats/$day.json"
        fi
      done

      shopt -s nullglob
      days=("$stats"/????-??-??.json)
      if [ ''${#days[@]} -gt 0 ]; then jq -s . "''${days[@]}"; else echo '[]'; fi \
        | jq -r -L "$jq_lib" --arg cutoff "$cutoff" --arg generated "$(date '+%F %H:%M')" -f "$jq_lib/html.jq" \
        > "$stats/.stats.html.tmp"
      mv -- "$stats/.stats.html.tmp" "$stats/stats.html"
    '';
  };
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

    basemapPackage = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.motregen-basemap;
      defaultText = lib.literalExpression "self.packages.\${pkgs.stdenv.hostPlatform.system}.motregen-basemap";
      description = "Versioned PMTiles archives served below /data/basemap/.";
    };

    camsPackage = lib.mkOption {
      type = lib.types.package;
      default = cfg.ingestPackage;
      defaultText = lib.literalExpression "config.services.motregen.ingestPackage";
      description = "Package providing motregen-cams (daily CAMS pollen/air-quality job).";
    };

    camsInManifest = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = ''
        Let the ingest daemon add the daily CAMS pollen/air-quality chunks (cams.json) to
        manifest.json. Off until the client uses them: they add ~18 KB to every manifest poll
        and ~63 KB of header prefetch per session (docs/pollen.md).
      '';
    };

    frontendPackage = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.motregen-web;
      defaultText = lib.literalExpression "self.packages.\${pkgs.stdenv.hostPlatform.system}.motregen-web";
      description = "Vite dist tree served by Caddy.";
    };

    bot = {
      enable = lib.mkEnableOption "Telegram long polling and still renderer";
      package = lib.mkOption {
        type = lib.types.package;
        default = self.packages.${pkgs.stdenv.hostPlatform.system}.motregen-bot;
        description = "Package providing the Telegram bot and renderer.";
      };
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.tmpfiles.rules = [
      "d ${cfg.dataDir}/basemap 0755 root root -"
      "d ${cfg.dataDir} 0755 root root -"
      "d ${usageRoot} 0755 root root -"
      "d ${usageDir} 0750 ${usageUser} ${usageUser} -"
      "d ${statsDir} 0755 ${usageUser} ${usageUser} -"
    ];

    # ageq-mthq haalt stats/ nachtelijks op met rsync over SSH (docs/analytics.md).
    environment.systemPackages = [ pkgs.rsync ];

    users.users.${usageUser} = {
      isSystemUser = true;
      group = usageUser;
    };
    users.groups.${usageUser} = { };

    systemd.sockets.motregen-usage = {
      description = "MIP-13 usage log socket for Caddy";
      wantedBy = [ "sockets.target" ];
      socketConfig = {
        ListenStream = usageSocket;
        Accept = true;
        SocketUser = config.services.caddy.user;
        SocketGroup = config.services.caddy.group;
        SocketMode = "0600";
      };
    };

    systemd.services."motregen-usage@" = {
      description = "MIP-13 usage log collector";
      serviceConfig = {
        ExecStart = "${lib.getExe pkgs.gawk} -v dir=${usageDir} -f ${usageCollector}";
        StandardInput = "socket";
        StandardOutput = "journal";
        User = usageUser;
        Group = usageUser;
        UMask = "0027";
        ReadWritePaths = [ usageDir ];
      }
      // hardening;
    };

    systemd.services.motregen-usage-report = {
      description = "MIP-13 daily usage aggregate and stats.html";
      after = [ "systemd-tmpfiles-setup.service" ];
      serviceConfig = {
        Type = "oneshot";
        ExecStart = lib.getExe usageReport;
        User = usageUser;
        Group = usageUser;
        UMask = "0022";
        ReadWritePaths = [
          usageDir
          statsDir
        ];
      }
      // hardening;
    };

    systemd.timers.motregen-usage-report = {
      wantedBy = [ "timers.target" ];
      timerConfig = {
        OnCalendar = "*-*-* 04:00:00";
        Persistent = true;
      };
    };

    systemd.services.motregen-ingest = {
      description = "KNMI ingest for motregen.nl";
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ];

      environment = {
        MOTREGEN_DATA_DIR = cfg.dataDir;
        MOTREGEN_CAMS_IN_MANIFEST = lib.boolToString cfg.camsInManifest;
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

    # U39: dagelijkse CAMS-run. Schrijft chunks + cams.json in dataDir; de ingest-daemon neemt
    # ze op in het manifest. Zelfde dynamische user als de ingest, dus dezelfde eigenaar.
    systemd.services.motregen-cams = {
      description = "CAMS pollen and air-quality forecast for motregen.nl";
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ];

      environment = {
        MOTREGEN_DATA_DIR = cfg.dataDir;
        RUST_LOG = "info";
      };

      serviceConfig = {
        Type = "oneshot";
        ExecStart = lib.getExe' cfg.camsPackage "motregen-cams";
        EnvironmentFile = cfg.secretsFile;
        DynamicUser = true;
        User = "motregen-ingest";
        StateDirectory = "motregen";
        StateDirectoryMode = "0755";
        UMask = "0022";
        # ADS publiceert de 00Z-run rond 08–10 UTC; een te vroege poging probeert later opnieuw.
        Restart = "on-failure";
        RestartSec = "30min";

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
        LockPersonality = true;
        CapabilityBoundingSet = "";
        AmbientCapabilities = "";
        SystemCallArchitectures = "native";
      };
    };

    systemd.timers.motregen-cams = {
      wantedBy = [ "timers.target" ];
      timerConfig = {
        OnCalendar = "*-*-* 09:00:00 UTC";
        Persistent = true;
      };
    };

    users.users.motregen-bot = lib.mkIf cfg.bot.enable {
      isSystemUser = true;
      group = "motregen-bot";
    };
    users.groups.motregen-bot = lib.mkIf cfg.bot.enable { };

    systemd.services.motregen-bot = lib.mkIf cfg.bot.enable {
      path = [ pkgs.ffmpeg ];
      description = "Telegram bot and national still renderer for motregen.nl";
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      after = [ "network-online.target" "caddy.service" ];
      environment = {
        MOTREGEN_ORIGIN = "https://${cfg.domain}";
        MOTREGEN_RENDER_CACHE = "/var/cache/motregen-bot/stills";
        PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
        MOTREGEN_CHROMIUM_PATH = "${pkgs.playwright-driver.browsers}/chromium_headless_shell-${pkgs.playwright-driver.browsersJSON."chromium-headless-shell".revision}/chrome-headless-shell-linux64/chrome-headless-shell";
        PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
      };
      serviceConfig = hardening // {
        ExecStart = lib.getExe cfg.bot.package;
        EnvironmentFile = cfg.secretsFile;
        User = "motregen-bot";
        Group = "motregen-bot";
        CacheDirectory = "motregen-bot";
        CacheDirectoryMode = "0755";
        UMask = "0022";
        Restart = "on-failure";
        RestartSec = "15s";
        TimeoutStopSec = "90s";
        LimitCORE = 0;
        PrivateNetwork = false;
        RestrictAddressFamilies = [ "AF_UNIX" "AF_INET" "AF_INET6" "AF_NETLINK" ];
      };
    };

    services.caddy = {
      enable = true;
      globalConfig = lib.optionalString (!cfg.enableTls) "auto_https off";
      logFormat = ''
        format filter {
          wrap json
          fields {
            request delete
          }
        }
      '';
      virtualHosts.${cfg.domain} = {
        hostName = if cfg.enableTls then cfg.domain else ":80";
        # MIP-13: geen access-log met IP of headers; alleen het usage-log hieronder.
        logFormat = null;
        extraConfig = ''
          @noindex path /data/*
          header @noindex X-Robots-Tag "noindex"
          @pwa path /sw.js /manifest.webmanifest
          header @pwa Cache-Control "no-cache"

          # MIP-13 privacycontract: het hele request-object (IP, headers, UA) gaat eruit;
          # over blijven ts (op de minuut), uri-pad en de /hit-body.
          log usage {
            output net unix/${usageSocket} {
              soft_start
            }
            format filter {
              wrap json {
                time_format "2006-01-02T15:04Z07:00"
                time_local
              }
              fields {
                request delete
                resp_headers delete
                user_id delete
                duration delete
                size delete
                status delete
                bytes_read delete
              }
            }
          }
          @nonusage {
            not {
              method POST
              path /hit
            }
            not {
              path /data/manifest.json
              query s=1
            }
          }
          log_skip @nonusage

          handle /hit {
            @notpost not method POST
            handle @notpost {
              log_skip
              header Allow POST
              respond 405
            }
            @toolarge not header_regexp Content-Length ^([0-9]{1,3}|10[01][0-9]|102[0-4])$
            handle @toolarge {
              log_skip
              respond 413
            }
            request_body {
              max_size 1KB
            }
            # Vroeg (<): anders staat het veld dubbel in de regel (Caddy 2.11).
            log_append <hit {http.request.body}
            log_append uri {http.request.orig_uri.path}
            respond 204
          }

          @manifest path /data/manifest.json
          handle @manifest {
            log_append uri {http.request.orig_uri.path}
            root * ${caddyDataDir}
            uri strip_prefix /data
            ${dataHeaders}
            # De sessieteller mag niet uit de Cloudflare-cache komen.
            @session query s=1
            header @session Cache-Control "no-store"
            @shared not query s=1
            header @shared Cache-Control "public, max-age=15, stale-while-revalidate=60"
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

          @basemap path_regexp basemap ^/data/basemap/nl-[0-9a-f]{16}\.pmtiles$
          handle @basemap {
            root * ${caddyDataDir}
            uri strip_prefix /data
            ${dataHeaders}
            header Cache-Control "public, max-age=31536000, immutable"
            header Content-Type "application/vnd.pmtiles"
            header -Content-Encoding
            file_server
          }

          handle /data/* {
            respond 404
          }

          ${lib.optionalString cfg.bot.enable ''
            @telegramMedia path /telegram/stills/*.jpg /telegram/stills/*.mp4
            handle @telegramMedia {
              root * /var/cache/motregen-bot/stills
              uri strip_prefix /telegram/stills
              header Cache-Control "public, max-age=7200, immutable"
              header X-Robots-Tag "noindex"
              file_server
            }
            handle /telegram/stills/* {
              respond 404
            }
          ''}

          handle {
            root * ${cfg.frontendPackage}
            import ${cfg.frontendPackage}/routes.caddy
          }
        '';
      };
    };

    systemd.services.caddy = {
      after = [
        "motregen-ingest.service"
        "motregen-usage.socket"
      ];
      wants = [ "motregen-usage.socket" ];
      serviceConfig = {
        BindReadOnlyPaths = [
          "${cfg.dataDir}:${caddyDataDir}"
          "${cfg.basemapPackage}:${caddyDataDir}/basemap"
        ];
      };
    };

  };
}
