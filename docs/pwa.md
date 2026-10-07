# Installeerbare motregen.nl

motregen.nl is een Progressive Web App. De service worker bewaart alleen de
app-schil (HTML, JavaScript, CSS, lettertypen en de druppel); weerdata,
kaarttegels en het anonieme gebruiksbaken gaan altijd naar het netwerk. Een
installatie werkt daarom snel op een warme verbinding, maar pretendeert geen
offline-weerdata te hebben.

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
