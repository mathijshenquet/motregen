# Installeerbare motregen.nl

motregen.nl is een Progressive Web App. De service worker bewaart alleen de
app-schil (HTML, JavaScript, CSS, lettertypen en de druppel); weerdata,
kaarttegels en het anonieme gebruiksbaken gaan altijd naar het netwerk. Een
installatie werkt daarom snel op een warme verbinding, maar pretendeert geen
offline-weerdata te hebben.

## Deelbare pagina’s

De app gebruikt `/weer/utrecht`, `/lucht/utrecht`, `/gevoel/utrecht` en
`/wind/utrecht`. `/` opent de standaardweergave; `/<modus>` gebruikt de
onthouden plaats. Plaatsnamen worden kleine slugs: spaties worden streepjes,
accenten verdwijnen en `'s-Hertogenbosch` wordt `s-hertogenbosch`. Opgeslagen
labels zoals **Thuis**, **Werk** of **Bij oma** en **Mijn locatie** komen niet in
de URL; daarvoor gebruikt de app de dichtstbijzijnde echte plaatsnaam.

De adresbalk volgt modus en plaats. Het geopende klokpaneel voegt een moment
toe als fragment, bijvoorbeeld `/weer/utrecht#t=2026-10-08T0757`, in
Amsterdamse lokale tijd. Sluiten verwijdert het tijdfragment. **Deel dit moment**
maakt een productielink met zo’n tijdfragment; openen pauzeert op dat moment en
opent de klok. Een moment buiten de beschikbare tijdlijn valt op de rand.
Terug en vooruit in de browser herstellen de modus, plaats en eventuele tijd.

Oude querylinks met `modus`, `plaats`, `lat`/`lon` en `t` blijven leesbaar.
Een geldige queryplaats of coördinaat wint boven de plaats in het pad. Caddy
stuurt eenvoudige plaatsnamen en moduslinks met een 301 door; coördinaten en
opgeslagen labels worden door de app genormaliseerd zodra de plaats bekend is,
vóór het eerste kaartbeeld. `?t=` verhuist naar `#t=`. Het fragment gaat niet
naar de server of diens cache. `dev`, `perf` en `tg` blijven queryparameters.

Elke padpagina krijgt een titel, sociale titel, canonical zonder tijd of query
en een plaatsnaam in de HTML-alinea voor browsers zonder JavaScript. De build
maakt `/sitemap.xml` uit de Nederlandse plaatsen in `places.ts`, voor alle
vier modi; `robots.txt` verwijst ernaar. Caddy verwerkt hiervoor het
gegenereerde `routes.caddy` en `route.html`; Vite dev/preview gebruikt dezelfde
paginagegevens. De service worker gebruikt `/index.html` als navigatiefallback
en sluit data, Telegram, het baken en infrastructuurbestanden daarvan uit.

## Installeren

1. **Android Chrome:** open `motregen.nl`, tik op het browsermenu en kies
   **App installeren** of **Toevoegen aan startscherm**.
2. **macOS Safari 17 of nieuwer:** open de site in Safari en kies **File → Add
   to Dock**. De app opent daarna zelfstandig vanuit de Dock.
3. **Chrome op desktop:** open `motregen.nl` en kies het installatie-icoon in
   de adresbalk, of kies **Install motregen.nl** in het ⋮-menu.

De appnaam en het korte label zijn beide `motregen.nl`. De iconen worden bij de
webbuild uit `web/public/droplet.svg` gemaakt, met 192 px, 512 px en een
maskable 512 px-variant; de Apple-touch-icon komt uit dezelfde bron.

## Nieuwe versie

Elke deploy krijgt door de build een nieuwe service-worker- en app-schilversie.
`/sw.js` en `/manifest.webmanifest` hebben daarom `Cache-Control: no-cache`,
ook vóór Cloudflare. Als een open installatie een nieuwe worker ziet, verschijnt
de kleine melding **Nieuwe versie — herlaad**. Na die knop gebruikt de pagina de
nieuwe app-schil. Data onder `/data/` en kaarttegels worden nooit door de worker
opgeslagen en blijven bij een vernieuwde ingest direct actueel.

## Controle

Lighthouse 13.5 heeft geen aparte PWA-categorie meer, dus het kan geen
installability-score draaien. De gerichte Playwright-test `presets.spec.ts`
controleert daarom in een preview-build dat de service worker gereed is én dat
het manifest de standalone-weergave, beide `motregen.nl`-namen en de
192/512/maskable iconen bevat.
