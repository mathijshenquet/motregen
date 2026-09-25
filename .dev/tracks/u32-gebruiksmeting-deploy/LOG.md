# U32 — gebruiksmeting serverkant (worker: claude opus 5.5)

## 2026-09-25 12:20 — start, ontwerp
- Spec/MIP-13/U31 usage.ts gelezen. Caddy in flake-nixpkgs = 2.11.4 (log_append, log_skip, filter-delete aanwezig).
- BEVINDING: nixpkgs' vhost-`logFormat`-default schrijft NU al een volledig access-log mét
  remote_ip/client_ip/headers (CF-Connecting-IP) naar /var/log/caddy/access-motregen.nl.log.
  MIP-13 zegt "er staat nooit een IP op schijf" → ik zet logFormat = null (spec: "uit").
  Oude bestanden op prod verwijderen = PO/orkestrator-actie (gedocumenteerd).
- BEVINDING: Cloudflare cachet /data/* ("Cache Everything", TTL volgt origin: manifest 15 s).
  `?s=1` zit in de cache-key → origin ziet ≤ 1 sessieverzoek per 15 s per PoP → zware
  onder-telling. Fix: `?s=1`-manifest krijgt `Cache-Control: no-store`.
- Prototype lokaal (caddy run in scratchpad): `log_append <hit {http.request.body}` moet
  EARLY (`<`), anders staat "hit" dubbel in de regel. ts via json `time_format
  "2006-01-02T15:04Z07:00"` + time_local = minuutresolutie.
- Dagbestanden: Caddy kan niet per datum roteren (lumberjack = grootte). Keuze: Caddy
  `output net unix//run/motregen-usage.sock`, socket-geactiveerde gawk-collector
  (Accept=yes) schrijft per regel naar usage/$(datum).jsonl. Verliesvrij over dag-
  grenzen en herstarts (systemd houdt de listen-socket vast).

## 2026-09-25 14:40 — implementatie + eerste VM-groen
- VM-test run 1: usage-regel kwam niet → diagnose in VM: ingest (DynamicUser +
  StateDirectory=motregen) verplaatst /var/lib/motregen naar private/ en chownt RECURSIEF;
  usage/ en stats/ werden van de dynamische user, collector kreeg EACCES.
  → Afwijking van het MIP-13-pad: `/var/lib/motregen-usage/{usage,stats}` (root-dir root:0755,
  subdirs motregen-usage). stats-auth.env ook daar (root 0600).
- Run 2 (na verhuizing): `nix build .#checks.x86_64-linux.nixos-vm` → VM-EXIT: 0.
  Logregel in VM: {"level","ts":"…T14:28+02:00","logger","msg","hit","uri"} — geen request-object.
- Geen KVM op de dev-host in deze sandbox → TCG, boot ~80 s; testtimeouts ruim gezet.
- rsync aan prod toegevoegd (pull vanaf ageq-mthq; route prod→mthq bestaat niet).
- docs/analytics.md + verwijzing in docs/deploy.md (incl. eenmalig oude IP-access-logs weg:
  PO/orkestrator-actie, NIET door mij uitgevoerd).

## 2026-09-25 15:10 — receipts op dc84f28 (klaar voor review)
- `nix flake check -L; echo "FULL-GATE-EXIT: $?"` → FULL-GATE-EXIT: 0 (VM-test vers gedraaid, 138 s script).
- `nix build --no-link .#nixosConfigurations.motregen.config.system.build.toplevel; echo $?` → 0.
- Draft-PR: https://github.com/mathijshenquet/motregen/pull/63
- Repro: bovenstaande twee commando's vanuit de worktree (sandbox uit; geen KVM → TCG, ~6 min).
- Open voor PO/orkestrator: (1) oude IP-access-logs op prod verwijderen (docs/deploy.md);
  (2) stats-wachtwoord plaatsen (docs/analytics.md); (3) pull-timer in ~/nix-config op ageq-mthq;
  (4) pad /var/lib/motregen-usage wijkt af van de MIP-13-tekst (gedwongen door DynamicUser-chown) —
  eventueel Decision-sectie bijwerken. U31 moet `v: 1` in de body zetten, anders telt het
  rapport alle bakens als afgewezen.
