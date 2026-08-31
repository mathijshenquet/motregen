# MIP-6: deploy — unattended NixOS op de OVH-VPS

Status: accepted (PO, 2026-08-31)
Auteur: orchestrator (fable), 2026-08-31

## 1. Het probleem

De PO heeft een OVH-VPS gekocht (2 vCPU, 4 GB RAM, 40 GB NVMe, 500 Mbps
onbeperkt, ~€45/jr, locatie Limburg DE) als "brains van de operatie":
motregen.nl moet daar volledig unattended draaien — ingest, serving en
updates zonder handmatig onderhoud — met Cloudflare ervoor (vervroegt het
CDN-moment uit MIP-3 §5; het cachecontract lag er al). Gemeten voetafdruk
(3 dagen unattended op ageq-mthq): daemon piek 324 MB, caddy 32 MB,
werkset 300 MB, ingress ~9 GB/dag — de box is ruim bemeten.

## 2. Eerder werk

Alles draait al als losse processen op ageq-mthq (daemon + Caddyfile.dev +
vite). NixOS-huisstijl: nix-config-repo met flakes; composix bewijst
NixOS-VM-checks als gate-mechanisme. nixos-anywhere + disko installeren
NixOS over SSH op een bestaand OVH-image; `system.autoUpgrade` met een
flake-URL naar GitHub main geeft unattended app- én systeemupdates
(gitsitter-achtig: de repo is de bron van waarheid, de box volgt).

## 3. Aanbeveling

Alles in-repo als flake, zodat de hele machine één closure is:

1. **`flake.nix` + `nix/`**: `nixosConfigurations.motregen` (x86_64, disko-
   layout voor de 40 GB NVMe, 4 GB-profiel incl. zram-swap).
2. **Services**: `motregen-ingest` als gehard systemd-service
   (DynamicUser, Restart=always, state in `/var/lib/motregen`), Caddy als
   productie-vhost voor motregen.nl (frontend-statics + `/data/*` met het
   MIP-3-headercontract; TLS via Caddy's auto-HTTPS, Cloudflare op
   "Full (strict)").
3. **Frontend in de closure**: de Vite-build via nixpkgs' pnpm-hooks
   (`pnpm.fetchDeps`), zodat web + daemon + config atomisch samen
   deployen.
4. **Unattended updates**: `system.autoUpgrade` (dagelijks, flake →
   `github:mathijshenquet/motregen`), automatische nix-gc wekelijks,
   reboot alleen binnen een venster als de kernel het vraagt.
5. **Secrets**: KNMI-keys in een eenmalig handmatig geplaatste
   `/var/lib/motregen/secrets.env` (root-only, buiten de store) —
   pragmatisch v1; sops-nix kan later zonder herontwerp.
6. **Bewijs vóór de box er is**: een NixOS-VM-test in `nix flake check`
   die de volledige config boot met een stub-datamap en asserteert dat de
   services starten en Caddy het contract serveert (headers, Range, 200's).
7. **Runbook** `docs/deploy.md`: nixos-anywhere-installatie zodra het IP
   er is (één commando), Cloudflare-stappen (DNS proxied, cache-rules,
   SSL-modus) — de CF-dashboardkant is PO-werk.

## 4. Open vragen

1. Auto-upgrade direct van `main` (aanbevolen: ja — elke merge is al
   onafhankelijk geverifieerd; de VM-check in flake check is de extra
   gordel) of van een aparte `deploy`-branch die de orchestrator promoveert?
2. Monitoring v1: alleen restart-policies + manifest-versheid als
   healthcheck-endpoint (aanbevolen), of meteen externe alerting?

## 5. Besluit (PO, 2026-08-31)

- **Auto-upgrade direct van `main`**: ja — elke geverifieerde merge is
  's nachts productie; de VM-test in `nix flake check` is de extra gordel.
- **Alerting**: YAGNI — restart-policies + het smoke-script als timer
  volstaan; externe alerting pas als er een reden is.
- **NixOS-versie**: de installatie bleek op unstable te staan
  (26.11-pre-pin); PO wil gewoon de stabiele release → nixpkgs-input om
  naar **nixos-26.05** (uitgevoerd als T4-follow-up, met volledige
  flake-check + VM-test vóór de switch).

## Changelog

- 2026-08-31: draft; track T4 direct gestart op PO-go.
- 2026-08-31: accepted; besluit §5 (main-deploy, geen alerting, stable
  26.05).
- 2026-08-31: PO-verduidelijking op de versie-call: stable geldt specifiek
  voor het OS/de deploy-flake; development mag prima unstable/rolling
  blijven. Zo staat het ook: devenv gebruikt devenv-nixpkgs/rolling (dev,
  ageq-mthq), de deploy-flake nixos-26.05 + gelockte rust-overlay (VPS).
  Deze scheiding is bewust — niet gelijktrekken.
- 2026-08-31: overwogen en geparkeerd (PO-vraag, orchestrator-call):
  (a) Rust uit een unstable-input i.p.v. rust-overlay — gelijkwaardig,
  overlay is de nettere pin; alleen de moeite als een crates-track ooit
  gratis kan zakken naar rust-version 1.95. (b) Closures pushen vanuit
  CI i.p.v. on-box bouwen — afgewezen voor nu: het pull-model is de
  unattended-eis zelf, de box bewees de zwaarste rebuild aan te kunnen
  zonder serveerimpact, en elke extra schakel (runner/cache/secrets) is
  een nieuw faalpunt. Herzien pas bij bewezen build-pijn; dan is een
  binary cache gevuld vanaf ageq-mthq (waar merge-verificatie toch al
  bouwt) de tussenvorm — box downloadt dan, maar blijft autonoom.
