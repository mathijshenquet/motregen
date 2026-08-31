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
        frontendPackage = self.packages.${pkgs.stdenv.hostPlatform.system}.motregen-web;
      };

      system.autoUpgrade.enable = lib.mkForce false;
      nix.gc.automatic = lib.mkForce false;
      users.users.root.openssh.authorizedKeys.keys = lib.mkForce [ ];
      environment.systemPackages = [ pkgs.curl ];

      systemd.tmpfiles.rules = [
        "C /var/lib/motregen/manifest.json 0644 root root - ${../fixtures/manifest.json}"
        "d /var/lib/motregen/chunks 0755 root root -"
        "C /var/lib/motregen/chunks/test-g0000000000000000.mrf 0644 root root - ${../fixtures/test.mrf}"
        "C /var/lib/motregen/secrets.env 0600 root root - ${../fixtures/secrets.env}"
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
    machine.succeed("grep -F '<div id=\"root\"></div>' /tmp/index")
  '';
}
