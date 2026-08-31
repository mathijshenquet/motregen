# Deployrunbook

De productiehost volgt dagelijks `main`. De volledige machine, ingestbinary en
frontend komen uit dezelfde flake-closure. De 40 GB-schijf gebruikt ext4: voor
deze single-purpose host zonder snapshotbehoefte is dat de eenvoudigste layout
om te herstellen. Zram vangt tijdelijke geheugendruk op zonder een vaste
swappartitie.

## Eenmalige installatie

`nix/authorized-keys.nix` bevat de publieke sleutels van `ageq-mthq` en
Mathijs' MacBook Pro. Controleer vóór iedere installatie dat beide sleutels nog
geldig zijn. Controleer daarna op de OVH-host dat de doelschijf echt `/dev/sda`
is; pas anders `nix/disko.nix` aan. De installatie wist die hele schijf:

```sh
ssh ubuntu@57.129.47.17 'lsblk -o NAME,SIZE,TYPE,MOUNTPOINTS'
```

`nixos-anywhere` ondersteunt de tijdelijke gebruiker `ubuntu` zodra die zonder
wachtwoord `sudo` mag uitvoeren. Maak daarvoor via `sudo visudo` tijdelijk
`/etc/sudoers.d/90-nixos-anywhere` met deze ene regel:

```text
ubuntu ALL=(ALL:ALL) NOPASSWD: ALL
```

Controleer dit met `ssh ubuntu@57.129.47.17 'sudo -n true'` en installeer daarna
vanuit deze repository:

```sh
nix run github:nix-community/nixos-anywhere -- --copy-host-keys --flake .#motregen ubuntu@57.129.47.17
```

Na de installatie is root uitsluitend met de twee gecommitteerde publieke
sleutels bereikbaar. De installatie wist ook de tijdelijke Ubuntu-configuratie
en sudo-regel. De firewall staat standaard dicht en laat alleen TCP 22/80/443
en UDP 443 (HTTP/3) inkomend door.

## KNMI-secret plaatsen

`/var/lib/motregen/secrets.env` staat nooit in Git of de Nix store. Plaats het
bestand na de eerste boot met deze expliciete Bash-opdracht; de invoer verschijnt
niet in terminal of shellgeschiedenis:

```sh
bash -c 'read -rsp "KNMI Open Data API key: " key; printf "KNMI_OPEN_DATA_API_KEY=%s\n" "$key" | ssh root@57.129.47.17 "install -d -m 0755 /var/lib/motregen; install -m 0600 /dev/stdin /var/lib/motregen/secrets.env; systemctl restart motregen-ingest"'
```

Het bestand is een systemd-EnvironmentFile. Alleen
`KNMI_OPEN_DATA_API_KEY=<geregistreerde sleutel>` is verplicht. De ondersteunde
optionele ingestvariabelen zijn `MOTREGEN_RADAR_CADENCE`,
`MOTREGEN_SEAMLESS_CADENCE`, `MOTREGEN_AROME_CADENCE`,
`MOTREGEN_UV_CADENCE`, `MOTREGEN_HISTORY_HOURS`,
`MOTREGEN_NOWCAST_MINUTES`, `MOTREGEN_AROME_HOURS`, `MOTREGEN_PRUNE_AGE`,
`MOTREGEN_CACHE_AGE` en `RUST_LOG`.

## Cloudflare

Voer deze stappen uit in het Cloudflare-dashboard:

1. Voeg voor `motregen.nl` een proxied A-record toe naar `57.129.47.17` en een
   proxied AAAA-record naar `2001:41d0:701:1100::d923`; geef Caddy tijd om het
   publieke certificaat te verkrijgen.
2. Zet **SSL/TLS encryption mode** op **Full (strict)**.
3. Maak een Cache Rule met hostname `motregen.nl` en URI path dat begint met
   `/data/`; zet **Cache eligibility** op **Eligible for cache / Cache
   Everything** en laat Edge TTL de origin-`Cache-Control` volgen.

De origin zet het MIP-3-contract: het manifest is 15 seconden cachebaar met 60
seconden stale-while-revalidate; chunks zijn één jaar immutable, ondersteunen
Range en krijgen geen extra content-encoding.

## Update en controle

Een update forceren en de host daarna controleren kost elk één commando:

```sh
ssh root@57.129.47.17 'systemctl start nixos-upgrade.service'
ssh root@57.129.47.17 'systemctl --failed --no-pager; systemctl is-active motregen-ingest caddy; curl -fsS https://motregen.nl/data/manifest.json >/dev/null'
```

Normaal draait de upgrade dagelijks rond 03:15 met maximaal dertig minuten
vaste jitter. Een noodzakelijke kernelreboot gebeurt alleen tussen 03:00 en
05:00; Nix-garbage-collection draait wekelijks.
