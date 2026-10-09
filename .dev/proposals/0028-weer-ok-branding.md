# MIP-28 — Branding "weer ok?" naast motregen.nl

Status: accepted (PO 2026-10-09 22:15) · auteur: orkestrator (PM)

## Wat
De PO heeft weerok.nl geregistreerd (TransIP). De productnaam wordt **"weer ok?"** (zo geschreven: kleine
letters, spatie, vraagteken); motregen.nl blijft bestaan en beide domeinen serveren dezelfde app ("hou maar
beide aan … serveer ze maar beide voor nu"). Interne namen (repo, nix-module `services.motregen`, cachemappen,
botnaam @motregen_bot) blijven ongewijzigd; alleen wat de gebruiker ziet verandert.

## Hoe
1. **Tekst/branding** (web): titel, meta/OG, PWA-manifest (name/short_name), splash, About-dialoog, bijschriften
   en de bot-starttekst: "weer ok?" als naam; de link in bijschriften blijft naar het domein waarop gediend wordt
   (bot: `MOTREGEN_ORIGIN`, voorlopig motregen.nl). Canonical blijft motregen.nl tot de PO wisselt.
2. **Serveren** (nix): `services.motregen.domain` → `domains` (lijst; eerste = canonical/origin), Caddy-vhost met
   alle hostnamen (`motregen.nl, www.motregen.nl, weerok.nl, www.weerok.nl`), ACME per naam; `www.` → apex 308.
3. **DNS** weerok.nl: A/AAAA apex + www → prod (57.129.47.17), via de TransIP-API (`TRANSIP_TOKEN` in `.env`).
   Blokkade 2026-10-09 22:20: de API antwoordt `The API is not enabled for this customer` (401) — de PO moet in het
   TransIP-controlepaneel de API aanzetten (en whitelist/IP-restrictie van het token controleren).

## Decision
PO 2026-10-09: "de branding wordt weer ok? ipv motregen.nl, serveer ze maar beide voor nu". Track U74.
