# Track U32 — gebruiksmeting serverkant: Caddy-log zonder IP, /hit, dagaggregaat (MIP-13) (claude opus 5.5)

Read first: `AGENTS.md`, `.dev/proposals/0013-anonieme-gebruiksmeting.md`,
`nix/modules/motregen.nix` (Caddy-vhost, systemd-services), `nix/tests/
motregen.nix` (NixOS-test: breid uit), `docs/deploy.md`. Your LOG:
`.dev/tracks/u32-gebruiksmeting-deploy/LOG.md`. Branch
`track/u32-gebruiksmeting-deploy` vanaf main. Eigen worktree. Kan
onafhankelijk van U31 (het contract staat in MIP-13); merge na U31.

## Opdracht

1. Caddy: `handle /hit` → alleen POST, body ≤ 1 kB, antwoord 204, en een
   apart JSON-log dat uitsluitend logt: tijdstip (op de minuut afgerond),
   `request.uri` voor `/data/manifest.json?s=1`, en de `/hit`-body. Geen
   `remote_ip`, geen headers, geen user-agent (Caddy `log` met `format
   filter`/`delete`-filters of een eigen `skip`-set; bewijs met een NixOS-test
   dat het IP-veld ontbreekt).
2. Rotatie: dagbestanden onder `/var/lib/motregen/usage/`, 30 dagen, daarna
   verwijderd (timer). Het gewone Caddy-access-log blijft zoals nu (uit, of
   ongewijzigd).
3. `motregen-usage-report.timer` (dagelijks 04:00): `jq`-script dat per dag
   sessies telt en per feature het percentage sessies, naar
   `/var/lib/motregen/stats/YYYY-MM-DD.json` en een `stats.html` (statisch,
   simpel, één tabel per dag + 30-daags overzicht) op `/stats/` achter basic
   auth (wachtwoord uit een sops/agenix-secret of een bestand buiten git;
   documenteer). Nachtelijke `rsync` van `stats/` naar ageq-mthq via de
   bestaande SSH-route (bestaat er geen, documenteer wat de PO moet
   aanmaken).
4. `docs/analytics.md`: de exacte veldenlijst (privacycontract), bewaar-
   termijnen, waar het rapport staat, en de Cloudflare-zone-analytics als
   grove tweede meter.
5. NixOS-test: POST `/hit` → 204 en één logregel zonder `remote_ip`;
   rapportscript op een fixture-log geeft de verwachte percentages.

## Gates

`nix flake check` (incl. de NixOS-test) synchrone exit status in de LOG;
`nix build` van de module. Geen deploy — dat doet de auto-upgrade na merge.
Draft-PR.
