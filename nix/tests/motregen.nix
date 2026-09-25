{ self }:

{
  name = "motregen-deployment";

  nodes.machine =
    { lib, pkgs, ... }:
    let
      fakeIngest = pkgs.writeShellApplication {
        name = "motregen-ingest";
        runtimeInputs = [ pkgs.coreutils ];
        text = ''
          while true; do
            sleep 3600
          done
        '';
      };
    in
    {
      imports = [
        ../modules/host.nix
        ../modules/motregen.nix
      ];

      services.motregen = {
        enable = true;
        enableTls = false;
        ingestPackage = fakeIngest;
        camsPackage = self.packages.${pkgs.stdenv.hostPlatform.system}.motregen-ingest;
        frontendPackage = self.packages.${pkgs.stdenv.hostPlatform.system}.motregen-web;
      };

      # Geen netwerk in de VM: de CAMS-job decodeert de opgenomen ADS-fixture.
      systemd.services.motregen-cams.environment.MOTREGEN_CAMS_GRIB =
        "${../../crates/ingest/tests/fixtures/cams-ads-20260925T00-l0-24.grib2}";

      system.autoUpgrade.enable = lib.mkForce false;
      nix.gc.automatic = lib.mkForce false;
      users.users.root.openssh.authorizedKeys.keys = lib.mkForce [ ];
      environment.etc."motregen-test/usage-day.jsonl".source = ../fixtures/usage-day.jsonl;
      environment.systemPackages = [
        pkgs.curl
        pkgs.jq
      ];

      systemd.tmpfiles.rules = [
        "C /var/lib/motregen/manifest.json 0644 root root - ${../fixtures/manifest.json}"
        "d /var/lib/motregen/chunks 0755 root root -"
        "C /var/lib/motregen/chunks/test-g0000000000000000.mrf 0644 root root - ${../fixtures/test.mrf}"
        "C /var/lib/motregen/secrets.env 0600 root root - ${../fixtures/secrets.env}"
        "C /var/lib/motregen-usage/stats-auth.env 0600 root root - ${../fixtures/stats-auth.env}"
      ];
    };

  testScript = ''
    start_all()
    machine.wait_for_unit("motregen-ingest.service")
    machine.wait_for_unit("caddy.service")
    machine.succeed("systemctl is-active motregen-ingest.service caddy.service")

    manifest_headers = machine.succeed(
      "curl --silent --show-error --dump-header - --output /tmp/manifest http://localhost/data/manifest.json"
    ).lower()
    print(manifest_headers)
    assert "200 ok" in manifest_headers, manifest_headers
    assert "cache-control: public, max-age=15, stale-while-revalidate=60" in manifest_headers, manifest_headers
    assert "access-control-allow-origin: *" in manifest_headers, manifest_headers
    assert "accept-ranges: bytes" in manifest_headers, manifest_headers
    assert "x-robots-tag: noindex" in manifest_headers, manifest_headers
    machine.succeed("grep -F '\"version\": 0' /tmp/manifest")

    chunk_headers = machine.succeed(
      "curl --silent --show-error --header 'Range: bytes=0-7' --dump-header - --output /tmp/chunk http://localhost/data/chunks/test-g0000000000000000.mrf"
    ).lower()
    print(chunk_headers)
    assert "206 partial content" in chunk_headers, chunk_headers
    assert "cache-control: public, max-age=31536000, immutable" in chunk_headers, chunk_headers
    assert "content-range: bytes 0-7/" in chunk_headers, chunk_headers
    machine.succeed("test \"$(cat /tmp/chunk)\" = MRF0TEST")

    frontend_headers = machine.succeed(
      "curl --silent --show-error --dump-header - --output /tmp/index http://localhost/"
    ).lower()
    print(frontend_headers)
    assert "200 ok" in frontend_headers, frontend_headers
    assert "x-robots-tag" not in frontend_headers, frontend_headers
    machine.succeed("grep -F '<div id=\"root\"></div>' /tmp/index")

    missing_headers = machine.succeed(
      "curl --silent --show-error --dump-header - --output /dev/null http://localhost/data/missing"
    ).lower()
    assert "404" in missing_headers, missing_headers
    assert "x-robots-tag: noindex" in missing_headers, missing_headers

    # U39: dagelijkse CAMS-job met de ADS-fixture; zelfde dynamische user als de ingest.
    machine.succeed("systemctl list-timers --all | grep -F motregen-cams.timer")
    machine.succeed("systemctl cat motregen-cams.timer | grep -F 'OnCalendar=*-*-* 09:00:00 UTC'")
    machine.succeed("systemctl start motregen-cams.service")
    import json
    sidecar = json.loads(machine.succeed("cat /var/lib/motregen/cams.json"))
    assert sidecar["license"] == "Contains modified Copernicus Atmosphere Monitoring Service information", sidecar
    assert sidecar["run"] == "2026-09-25T00:00:00Z" and sidecar["provider"] == "ads", sidecar
    fields = sorted(chunk["field"] for chunk in sidecar["chunks"])
    assert fields == ["no2", "o3", "pm10", "pm25", "pollen_mugwort"], fields
    ingest_uid = machine.succeed(
      "ps -o uid= -p \"$(systemctl show -p MainPID --value motregen-ingest.service)\""
    ).strip()
    for chunk in sidecar["chunks"]:
      assert chunk["source"] == "cams" and len(chunk["times"]) == 24, chunk
      owner = machine.succeed(f"stat -L -c %u /var/lib/motregen/{chunk['url']}").strip()
      assert owner == ingest_uid, (owner, ingest_uid, chunk["url"])
      status = machine.succeed(
        f"curl --silent --output /dev/null --write-out '%{{http_code}}' http://localhost/data/{chunk['url']}"
      )
      assert status == "200", (chunk["url"], status)
    sidecar_status = machine.succeed(
      "curl --silent --output /dev/null --write-out '%{http_code}' http://localhost/data/cams.json"
    )
    assert sidecar_status == "404", sidecar_status

    robots = machine.succeed("curl --silent --show-error --fail http://localhost/robots.txt")
    assert "Disallow: /data/" in robots, robots

    # MIP-13: gebruiksmeting. Tot hier mag er niets in het usage-log staan.
    import json
    usage_today = "/var/lib/motregen-usage/usage/$(date +%F).jsonl"
    machine.succeed(f"test ! -s {usage_today}")
    machine.succeed("test -z \"$(ls -A /var/log/caddy 2>/dev/null | grep access)\"")

    body = '{"v":1,"search":true,"range":null,"theme":"dark","coarse":false,"width":">=960","dur":"1-5"}'
    hit_status = machine.succeed(
      "curl --silent --show-error --output /dev/null --write-out '%{http_code}' "
      "--header 'X-Forwarded-For: 198.51.100.7' --header 'CF-Connecting-IP: 198.51.100.7' "
      "--user-agent 'U32-secret-agent' --header 'Content-Type: text/plain' "
      f"--data '{body}' http://localhost/hit"
    )
    assert hit_status == "204", hit_status
    machine.wait_until_succeeds(f"test \"$(wc -l < {usage_today})\" = 1", timeout=30)
    raw = machine.succeed(f"cat {usage_today}")
    print(raw)
    for forbidden in ["remote_ip", "client_ip", "198.51.100.7", "U32-secret-agent", "headers", "User-Agent"]:
      assert forbidden not in raw, (forbidden, raw)
    line = json.loads(raw)
    assert set(line) <= {"level", "ts", "logger", "msg", "uri", "hit"}, line
    assert line["uri"] == "/hit", line
    assert json.loads(line["hit"]) == json.loads(body), line
    assert len(line["ts"]) == len("2026-09-25T12:34+02:00") and line["ts"][16] != ":", line

    session_headers = machine.succeed(
      "curl --silent --show-error --dump-header - --output /dev/null 'http://localhost/data/manifest.json?s=1'"
    ).lower()
    assert "200 ok" in session_headers, session_headers
    assert "cache-control: no-store" in session_headers, session_headers
    assert "max-age" not in session_headers, session_headers
    machine.wait_until_succeeds(f"test \"$(wc -l < {usage_today})\" = 2", timeout=30)
    session_line = json.loads(machine.succeed(f"tail -n 1 {usage_today}"))
    assert session_line["uri"] == "/data/manifest.json" and "hit" not in session_line, session_line

    machine.succeed("head -c 1500 /dev/zero | tr '\\0' a > /tmp/big")
    for method_and_url, expected in [
      ("--request GET http://localhost/hit", "405"),
      ("--data @/tmp/big http://localhost/hit", "413"),
      ("'http://localhost/data/manifest.json?s=2'", "200"),
      ("http://localhost/", "200"),
    ]:
      status = machine.succeed(
        f"curl --silent --output /dev/null --write-out '%{{http_code}}' {method_and_url}"
      )
      assert status == expected, (method_and_url, status)
    machine.succeed("sleep 2")
    machine.succeed(f"test \"$(wc -l < {usage_today})\" = 2")

    # Een herstart van de ingest (DynamicUser, StateDirectory) mag usage/ niet overnemen.
    machine.succeed("systemctl restart motregen-ingest.service caddy.service")
    machine.wait_for_unit("caddy.service")
    machine.succeed("test \"$(stat -c %U /var/lib/motregen-usage/usage /var/lib/motregen-usage/stats | sort -u)\" = motregen-usage")
    machine.succeed(f"curl --silent --fail --data '{body}' http://localhost/hit")
    machine.wait_until_succeeds(f"test \"$(wc -l < {usage_today})\" = 3", timeout=30)

    # Rapport: een complete fixture-dag, een verlopen dag, en vandaag (nog niet rapporteren).
    machine.succeed(
      "install -o motregen-usage -g motregen-usage -m 0640 /etc/motregen-test/usage-day.jsonl /var/lib/motregen-usage/usage/2000-01-01.jsonl",
      "install -o motregen-usage -g motregen-usage -m 0640 /etc/motregen-test/usage-day.jsonl \"/var/lib/motregen-usage/usage/$(date -d yesterday +%F).jsonl\"",
    )
    machine.succeed("systemctl list-timers --all | grep -F motregen-usage-report.timer")
    machine.succeed("systemctl start motregen-usage-report.service")
    machine.succeed("test ! -e /var/lib/motregen-usage/usage/2000-01-01.jsonl")
    machine.succeed("test ! -e /var/lib/motregen-usage/stats/2000-01-01.json")
    machine.succeed("test ! -e /var/lib/motregen-usage/stats/$(date +%F).json")
    machine.succeed(f"test -e {usage_today}")
    day = json.loads(machine.succeed("cat /var/lib/motregen-usage/stats/$(date -d yesterday +%F).json"))
    print(day)
    assert (day["sessions"], day["beacons"], day["rejected"]) == (5, 4, 3), day
    features = {name: value["pct"] for name, value in day["features"].items()}
    assert features["search"] == 50 and features["geo"] == 25 and features["fav"] == 25, features
    assert features["play"] == 25 and features["about"] == 0, features
    assert day["dimensions"]["range"]["none"] == {"n": 2, "pct": 50}, day
    assert day["dimensions"]["coarse"]["true"]["n"] == 2, day
    assert day["dimensions"]["unit"]["kmh"] == {"n": 1, "pct": 25}, day

    stats_unauth = machine.succeed(
      "curl --silent --show-error --dump-header - --output /dev/null http://localhost/stats/"
    ).lower()
    assert "401" in stats_unauth.splitlines()[0], stats_unauth
    assert "x-robots-tag: noindex" in stats_unauth, stats_unauth
    wrong = machine.succeed(
      "curl --silent --output /dev/null --write-out '%{http_code}' --user stats:fout http://localhost/stats/"
    )
    assert wrong == "401", wrong
    html = machine.succeed("curl --silent --show-error --fail --user stats:test-stats-password http://localhost/stats/")
    assert "Laatste 30 dagen" in html and "<td>search</td><td>2</td><td>50 %</td>" in html, html
    machine.succeed(
      "curl --silent --show-error --fail --user stats:test-stats-password "
      "--output /dev/null http://localhost/stats/$(date -d yesterday +%F).json"
    )
  '';
}
