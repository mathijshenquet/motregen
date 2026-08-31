# Track T4 — unattended NixOS-deploy (gpt-5.6-sol)

Read first: `AGENTS.md`, MIP-6 (het ontwerp; §3 is je blauwdruk, §4-keuzes:
neem de aanbevelingen), MIP-3 §2 (het HTTP-cachecontract), `Caddyfile.dev`,
`docs/serving.md`, `docs/seamless.md` (cadansen), en de daemon-CLI
(`crates/ingest`). Your LOG: `.dev/tracks/t4-deploy/LOG.md` — committed.
Branch: `track/t4-deploy`.

## Goal

Een complete, VM-bewezen NixOS-configuratie in de repo die met één
nixos-anywhere-commando op de OVH-VPS (2 vCPU/4 GB/40 GB NVMe, x86_64,
IP volgt) geïnstalleerd kan worden en daarna volledig unattended draait.
De box bestaat nog niet — alles moet dus lokaal bewijsbaar zijn.

## Tasks

1. **Flake**: `flake.nix` aan de root + `nix/`-modules;
   `nixosConfigurations.motregen` met disko-layout (40 GB NVMe, ext4 of
   btrfs — jouw keuze, motiveer), zram-swap, SSH-only root met Mathijs's
   keys uit een `nix/authorized-keys.nix` placeholder (documenteer wat de
   PO moet invullen), firewall dicht op 22/80/443. Let op: de repo gebruikt
   devenv/direnv voor de dev-shell — de flake is puur voor deploy; laat
   devenv met rust.
2. **Ingest-service**: package `motregen-ingest` in de flake (cargo build
   via nixpkgs' rustPlatform; eccodes/hdf5/netcdf runtime-deps uit
   nixpkgs), systemd-service gehard (DynamicUser, ProtectSystem=strict,
   StateDirectory=motregen, Restart=always met backoff), leest
   `EnvironmentFile=/var/lib/motregen/secrets.env` (documenteer het
   formaat; NOOIT keys in de store of repo).
3. **Caddy prod**: motregen.nl-vhost — frontend-statics uit de closure +
   `/data/*` uit de state-dir met exact het MIP-3-headercontract
   (hergebruik/parametriseer de Caddyfile.dev-logica), auto-HTTPS.
4. **Frontend in de closure**: bouw `web/` met nixpkgs' pnpm-hooks
   (`pnpm_9.fetchDeps`-patroon of wat nixpkgs-current biedt); het
   `dist/`-resultaat is een flake-output die de Caddy-vhost serveert.
5. **Unattended**: `system.autoUpgrade` dagelijks vanaf
   `github:mathijshenquet/motregen` (main), `nix.gc.automatic` wekelijks,
   `system.autoUpgrade.allowReboot` binnen een nachtvenster.
6. **VM-bewijs**: een NixOS-test (`nix flake check`) die de config boot
   met een stub `/var/lib/motregen` (mini-manifest + één mrf-chunk als
   fixture, fake secrets.env), en asserteert: beide services actief, Caddy
   serveert manifest (200, juiste Cache-Control), chunk-Range → 206, en de
   frontend-index → 200. TLS uitgeschakeld/HTTP in de test.
7. **Runbook** `docs/deploy.md`: (a) nixos-anywhere-installatiecommando
   voor zodra IP + root-wachtwoord er zijn; (b) secrets.env plaatsen; (c)
   Cloudflare-stappen voor de PO (DNS A-record proxied, SSL Full strict,
   cache rule `/data/*`); (d) hoe je een update forceert en hoe je de box
   controleert (twee commando's max).

## Out of scope

De daadwerkelijke installatie op de VPS (volgt als het IP er is — houd het
runbook zo dat de orchestrator dat zelf kan draaien), monitoring/alerting
voorbij restart-policies, sops-nix, wijzigingen aan ingest/web-gedrag.

## Gates & receipts

- `nix flake check -L` green (incl. de VM-test) — dit is de hoofdgate;
  SYNCHRONE receipts met exacte commando's in je LOG. Builds kunnen lang
  duren; dat is geen reden voor detached receipts.
- Workspace-gates blijven green (je raakt Rust/web normaliter niet aan).
- Eerlijke walls: pnpm-in-nix en netcdf-linking zijn de verwachte lastige
  hoeken — documenteer precies wat je probeerde als iets vastloopt.
