# MIP-25 — Bot-rendering van de prod-VM af

Status: accepted (PO 2026-10-08) · 2026-10-08 · auteur: orkestrator

## Probleem
De tg-bot rendert per nieuwe KNMI-generatie (elke 3–5 min) drie loops van 169 frames plus tien
JPEG's (docs/telegram.md §Rendering). Op ageq-dev2 (13 kernen beschikbaar) kost dat ≈ 50 s per loop,
≈ 3 min per generatie. De prod-VM heeft 2 kernen en 3,8 GB: de oude 49-frameloop deed er al 231 s
over (4,7 s per frame); 169 frames wordt ≈ 13 min per loop, ≈ 40 min per generatie. De VM rendert dus
fulltime, loopt permanent achter, en Caddy/ingest delen die twee kernen. Tijdelijke rem (runtime):
`CPUQuota=150 % CPUWeight=20 MemoryMax=1,5 GB` op `motregen-bot.service` (15:35).

## Opties
1. **Renderer los van de poller** (aanbevolen): een `motregen-bot --render-only` op ageq-dev2 (of later
   een renderbox) rendert per generatie en uploadt naar de cache-groep (`MOTREGEN_CACHE_CHAT_ID`,
   bestaat al: file_id's + `cache-posts`); de prod-bot pollt alleen en beantwoordt uit file_id's. Nodig:
   gedeelde cache-staat via de cache-groep zelf (de bot leest `messageIds` al terug) en een
   "geen eigen renderer"-modus. Kosten: één track (U67), geen hardware. Risico: ageq-dev2 is een dev-host
   (herstarts, load); een eigen kleine renderbox later is de nette vorm.
2. **Kleinere last op de VM**: loops hoogstens elke 15 min opnieuw renderen (stills wel per generatie),
   85 frames (10-min stap) of 720p: ≈ 4× goedkoper, nog steeds ≈ 10 min per generatie op 2 kernen.
   Verliest de 5-minutenloop (PO-keuze U66).
3. **Grotere VM** (8 kernen): simpelste, kost geld; rendert dan ≈ 10 min per generatie — net binnen.
4. **Loops alleen op aanvraag** met cache per generatie: eerste vrager wacht 13 min; niet bruikbaar.

## Voorstel
Optie 1 als richting, optie 2 (loops elke 15 min) als overbrugging tot U67 er is, zodat prod
vandaag bruikbaar blijft. Beslissing bij de PO.

## Decision
PO 2026-10-08 15:40: "maakt niet uit zolang het niet de main server impact" — de VM mag fulltime renderen;
harde eis is dat de web-server en de ingest er niets van merken. Uitvoering: de rem staat nu vast in
`nix/modules/motregen.nix` (Nice 10, CPUWeight 20, CPUQuota 150 %, MemoryMax 1,5 GB). Optie 1 blijft open
voor later; geen track nu.
