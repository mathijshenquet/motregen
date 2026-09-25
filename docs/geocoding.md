# Zoeken (geocoding)

De zoekbalk bevraagt twee bronnen tegelijk (`web/src/core/geocoder.ts`):

| land | dienst | URL | wat we vragen |
| --- | --- | --- | --- |
| NL | PDOK Locatieserver v3.1 | `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest` + `lookup` | `type:(woonplaats OR wijk)`, 5 rijen; middelpunt via een tweede `lookup` |
| BE | Digitaal Vlaanderen, geolocatie v4 | `https://geo.api.vlaanderen.be/geolocation/v4/Location?q=…&c=10` | alleen `basisregisters_gemeente` en `urbis_gemeente` (Brussel); straten vallen weg, deelgemeenten lossen op naar hun gemeente; middelpunt zit in het antwoord (WGS84) |

Beleid Vlaamse dienst (gecontroleerd 2026-09-25): gratis, zonder sleutel of registratie,
`access-control-allow-origin: *`, antwoorden met `cache-control: max-age=86400`. Er is geen
gepubliceerde rate-limit gevonden; de client vraagt pas na 250 ms typpauze en breekt lopende
verzoeken af. Bronvermelding staat in de About-modal. Valt deze dienst weg, dan is Nominatim met
`countrycodes=be` het terugvalplan (verplichte eigen User-Agent/Referer, max. 1 verzoek/s,
geen autocomplete-gebruik volgens hun beleid — daarom niet de eerste keus).

Samenvoegen: de bron van het land onder het kaartcentrum (land van de dichtstbijzijnde plaats
in `places.ts`) komt eerst, de andere houdt minstens twee van de zes rijen; een exacte naamtreffer
("Hasselt" bestaat in beide landen) gaat altijd bovenaan. Belgische rijen tonen `BE` als context.
Faalt één bron, dan tonen we de andere; pas als beide falen meldt de zoekbalk een storing.
