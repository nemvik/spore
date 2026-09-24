# SP-010.C — globální navigace a trvalé výpravy

Plán před implementací, 24. 9. 2026, čistý HEAD `eed840c65`.

## Rozhodnutí a rozhraní

- Zachovat obálku kampaně v3, původní tři `worlds`, jejich entity/RNG a všechny systémy etap. Výslovně rozšířit `homePlanet` na v3: recept B se nezmění, nový verzovaný navigační stav vlastní vzdálené detailní světy, navštívená místa, místní průzkum, aktivní režim a kameru atlasu.
- `worlds` jsou původní habitaty; `world` je alias právě aktivního detailního světa podle `currentLocationId`. Výběr atlasové buňky mění jen výběr, skutečný vstup mění aktivní geografii, nikdy `stage`. Původní registr slotů zůstane; vzdálené lokality mají samostatný registr s ID planety a buňky.
- Výpravy od etapy tvora (2), pouze na pevninské atlasové buňky mimo původní habitat. Voda vyžaduje budoucí námořní cestování. Nejde o přesun do předchozí etapy. Tvor startuje z původního hnízda bez ekologického nákladu; kmen/stroje/terraformace z přehledu základny bez přenesení jednotek. Historický již nehratelný organismový náklad pozdějších etap zůstává zachovaný a neblokuje. Smrt vstup odmítá. Návrat je vždy dostupný, žádná cena, odměna, léčení ani přestavba.
- Během globálního přehledu stojí simulace. Během výpravy stojí veškeré původní dění včetně hráčových potřeb, cooldownů, smečky, kmenů, strojů a terraformace; žádné dohánění času. Původní hráčův stav zůstává uložený, jeho výpravová poloha je samostatná. Každý vzdálený detail drží poslední bezpečnou polohu. Návrat pokračuje přesně z původního stavu.
- Detaily vytvářet až při prvním vstupu z odděleného hashe seed+cell+detailGenerator=1. Pevnina, lokální výškový datum a vizuální biom čtou B. Žádný simulační RNG ani závislost na pořadí. Místní interakce: fyzicky navštívit tři terénní stanoviště a provést měření; trvalé odkrytí místních údajů a dokončený průzkum bez ekonomické/progresní odměny.
- Přehled: ovladatelná atlasová kamera (posun/zoom), výběr buňky, aktuální poloha, důvod nedostupnosti, vstup a návrat. Místní UI: cíle měření, vzdálenost, pokrok, potvrzení. Samostatná klávesa N, pauza a persistence režimu; přechod vyčistí vstupy.
- SP-009: konkrétní `LocationAddress` i pro uložené vzdálené světy, geografický převod a čisté rozhraní výběru adresovatelných měst dodaných budoucím modelem. Produkce nevytváří demonstrační města ani vlastnictví.
- Parser zachovává historickou absenci/v1/v2. UI výslovně aktivuje v3 před rekey, včetně checkpointu, bez historických návštěv. Přísná validace uloženého aliasu, ID, terénu, režimu, výběru, akcí a checkpointu. Obnova nahrazuje celý stav větve.

## Kritéria a ověření

- [x] Opakovatelný běžný okruh domov → atlas → vzdálená pevnina → fyzické měření → domov → stejné změněné místo → save/load, export/import.
- [x] Více seedů/pořadí návštěv, limity, biomy, geografické převody, bezpečné polohy, žádné odměny nebo nové entity při návratu.
- [x] Historické fixtures včetně skutečných A/B exportů: idempotentní aktivace, všechny etapy/přechody, původní svět a identita, historie/B1; lokální/globální/vzdálené checkpointy.
- [x] Produkční browser pouze běžné vstupy/native RAF, explicitní připravené vstupy; výkon/odezva/paměť opakovaných návratů, snímky 1280×720 a menší.
- [x] Relevantní regrese, celá sada, typecheck/build, vlastní diff review a nezávislé subagent review včetně oprav.
- [x] Aktualizované smlouvy, roadmapa, progress, verzovaný report a malá uklizená evidence/aktivní save.
- [ ] Integrace výběru skutečných měst zůstává otevřená do SP-009; celé SP-010 se neuzavírá.

Žádná městská ekonomika, státy, vesmír, SP-007.B2/D, nová závislost, commit, push nebo deploy. Regionální generator 1 i původní souřadnice zůstávají.

Výsledky, opravy z ověření a přesné meze: [report C v1](../../spore/SP-010C-REPORT.md). Otevřený poslední bod je integrační závazek SP-009, nikoli blokace doložené navigace.
