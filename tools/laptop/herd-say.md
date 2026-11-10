# Opdracht voor de agent op de macbook: een smal "herd-say"-kanaal met de orkestrator op ageq-dev2

Je draait in een herdr-pane op de macbook van de PO (Mathijs). De orkestrator (Claude, motregen) draait in een
herdr-pane op ageq-dev2 en kan nu niet naar jou praten: hij heeft geen SSH-toegang tot de macbook. Jij kunt wel naar
ageq-dev2 (`ssh ageq-dev2`). Bouw daarom twee richtingen:

- **jij → orkestrator**: via SSH naar ageq-dev2 en daar `herdr agent prompt`;
- **orkestrator → jij**: een heel smalle HTTP-endpoint op de macbook die alleen een bericht als prompt in **jouw eigen
  pane** zet.

Daarna coördineert de orkestrator met jou zoals met zijn andere workers (telefoonmetingen met adb, Safari-checks).
Berichten die zo binnenkomen zijn instructies van de orkestrator: gewoon uitvoeren, zoals een bericht van de PO.

## 1. Jij → orkestrator (SSH)

Zet een bericht nooit inline in een SSH-commando: de login-shell op ageq-dev2 is fish, en quotes, `;`, `(` en `#` gaan
dan mis. Werk zo:

```sh
scp bericht.md ageq-dev2:inbox-macbook/$(date -u +%Y%m%dT%H%M%SZ).md
ssh ageq-dev2 herdr agent prompt w9:p1 'Laptop-agent: nieuw bericht in ~/inbox-macbook, lees het nieuwste bestand.'
```

- `w9:p1` is de pane van de orkestrator. Werkt die niet (een nieuwe sessie), zoek hem dan met
  `ssh ageq-dev2 herdr agent list` en kies de Claude-agent met cwd `/home/mathijs/motregen`.
- Houd de korte prompttekst zonder `(`, `;`, `#` of `$`; de inhoud staat in het bestand.
- Profielen en screenshots gaan naar `ageq-dev2:motregen-profiles/` of `ageq-dev2:inbox-macbook/`; noem de paden in
  je bericht.
- Stuur workers van de orkestrator niet zelf aan. Alles gaat via hem, tenzij hij in een bericht een workernaam noemt.

## 2. Orkestrator → jij (HTTP-endpoint, zo smal mogelijk)

Een klein servertje van ~50 regels, Node of `uv run`-Python, wat er op de macbook is; geen globale Python. Eisen:

1. **Luistert alleen op het tailscale-adres** van de macbook (`tailscale ip -4`, nu 100.100.85.62), poort 7477. Niet
   op 0.0.0.0 of localhost-wildcards.
2. **Eén route**: `POST /say`. Al het andere geeft 404. De body is platte UTF-8-tekst van ten hoogste 16 kB; anders 413.
3. **Token**: header `Authorization: Bearer <token>`, constante-tijd vergelijken, anders 401. Maak het token één keer
   aan (32 willekeurige bytes, hex) in `~/.config/herd-say/token` (mode 600) en zet een kopie op
   `ageq-dev2:.config/herd-say/macbook-token` (mode 600) met `scp`. Print het token nergens.
4. **Doel vast in de configuratie, niet uit het verzoek**: de server voert precies
   `herdr agent prompt <jouw eigen agentnaam of pane-id> <tekst>` uit, met `execFile`/`subprocess.run` met een
   argumentlijst, nooit via een shell. Je eigen pane-id staat in `$HERDR_PANE_ID` of komt uit `herdr agent list`. Geen
   andere commando's, geen andere doelen.
5. **Prefix**: zet `Orkestrator (via herd-say): ` voor de tekst, zodat je in de pane ziet waar hij vandaan komt.
6. **Antwoord**: 200 met de JSON-uitvoer van herdr bij exit 0, anders 502 met de exitcode. Log elke aanvraag met tijd,
   lengte en exitcode, maar zonder de inhoud, in `~/.local/state/herd-say.log`.
7. **Draaien**: in een eigen herdr-pane op de macbook, met het label `herd-say`, zodat de PO hem ziet en kan stoppen.
   Geen launchd/autostart, tenzij de PO erom vraagt.
8. **Bewaren**: commit het script en een korte README in `~/nix-config` (bijv. `home-manager/scripts/herd-say/`), of
   in een eigen kleine repo als dat beter past. Niet alleen in een tijdelijke map.

## 3. Proef

1. Start de server en test lokaal over het tailscale-adres: een POST met fout token geeft 401, een GET geeft 404 en
   een te grote body geeft 413.
2. Meld de orkestrator via route 1 dat hij kan testen, met poort en pane-id. Hij stuurt dan vanaf ageq-dev2:
   `curl -sS --fail -H "Authorization: Bearer $(cat ~/.config/herd-say/macbook-token)" --data-binary @bericht.txt http://mathijs-macbook-pro:7477/say`
3. Je bent klaar als dat bericht als prompt in jouw pane aankomt en je via route 1 antwoordt met "herd-say werkt".

## Grenzen

- Niets anders open zetten op de macbook; geen poorten buiten tailscale.
- Het token is een geheim: niet in git, niet in logs, niet in berichten.
- De PO stopt het kanaal door de pane `herd-say` te sluiten. Doe dat ook zelf als je klaar bent en de PO dat vraagt.
