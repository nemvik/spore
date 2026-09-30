# SP-005.B · přenosná vozidla · report v1

26. září 2026, pracovní strom; bez commitu, pushe a deploye. [Plán a návaznosti](../superpowers/plans/2026-09-26-lumavora-completion.md). Dokončena vozidlová část knihovny B, nikoli celé civilizační nebo vesmírné milníky.

## Hratelný výsledek

Knihovna v menu a pauze dovoluje vytvořit, pojmenovat, popsat, upravovat, uložit a přenést pozemní stroj, letoun i člun. Používá původní 3D editor, díly, statistiky, animace a renderer. Náhledy a karty ukazují konstrukci, účel, cenu a revizi. Lze zachytit i existující kampanovou konstrukci.

Použití návrhu otevře placenou výrobu; uložení samotného návrhu je zdarma. Finální výroba znovu kontroluje původní peníze, kapacitu, odemčení létání a dostupnost dílny. Nová kontrola odmítá výrobu strojů během pobytu ve vzdáleném městě, aby knihovna neobešla domácí konstrukční scénu.

Samostatný soubor `lumavora-vehicle` v1 má identitu, revizi, data, popis a validovaný blueprint. Limit je 100 místních záznamů a 128 KiB/soubor. Konfliktní import dostane novou identitu; chybný import, zastaralá editace, plná knihovna a selhání úložiště zachovají původní data. Zpožděný import po zavření knihovny ztratí oprávnění zápisu. Postavené stroje mají vlastní kopie; revize ani smazání knihovny je nezmění.

Historické tanky/letouny v1 a pevný člun v2 zůstávají přesně validované. Upravitelný civilní člun používá blueprint v3: trup, kabina, pohon, jejich velikost/umístění a vzhled; bez bojového modulu. Cena i odolnost vycházejí z konstrukce, výkon pohonu mění dobu plavby. Trasy a checkpointy zachovávají původní účetní vztahy; uložený `elapsed` zůstává projetou trasovou veličinou, UI jej převádí na sekundy podle konkrétního pohonu. Stávající v2 má původní rychlost i cenu 56.

## Skutečně vykonané ověření

- `pnpm exec vitest run --maxWorkers=1`: **156 souborů / 3 375 testů**, 156,25 s. Zahrnuje původní historické savey, E–I účetnictví, přechody, import/checkpointy, 66 nových vozidlových regresí. Následné přidání byte-identické hrané fixture: **67/67** vozidlových testů, 0,97 s; celkový dostupný počet je 3 376, celý druhý běh netvrdíme.
- Před celou sadou prošlo **180/180** cílených historických konstrukčních/námořních/modelových regresí. První chybný příkaz `pnpm test -- …` ignoroval zamýšlené filtry a spustil širokou sadu souběžně s kompilací, s timeouty; byl ukončen. Následný správný sériový celý běh výše prošel bez zvýšení limitů nebo oslabení testů.
- `pnpm build` a následný `pnpm typecheck` prošly. Produkční JS `index-cwL8mAdw.js`, 1 468,25 kB / gzip 457,40 kB. Existující upozornění Vite na velký chunk trvá; žádná nová závislost ani změna lockfilu.
- `LUMAVORA_URL=http://127.0.0.1:5220 node scripts/vehicle-library-browser.mjs`: **4 skupiny, 0 browser chyb**. Tři návrhy přes UI, revize, totožný/konfliktní/chybný import, zrušení a nová linie. Nezměněný historický H vstup → skutečný domácí výdělek → vlastní člun **64**, tank **52** a letoun **56** jantaru → smazání předlohy → export/import během plavby → obrat → zámořské přistání → návrat → save/reload/load. Žádné živé zápisy ani testový čas. H je připravený výchozí vstup, ne nová souvislá kampaň.
- `VEHICLE_OUTPUT=evidence/sp-005b-vehicles/followup node scripts/vehicle-library-browser.mjs --followup`: **2 doplňkové skupiny, 0 chyb**. Zpožděné `File.text()` pro regresi opuštěné importní relace, 20 otevření editoru, placená výroba → tvorový editor → správný návrat po zrušení. Zpoždění se týká pouze načtení souboru, ne simulace.
- Původní klient skillu `develop-web-game` prošel nad produkcí; loader pouze zpřístupnil místní Playwright a Chrome, jeho nativní RAF shim neměnil simulaci. Doplňkový nový buněčný smoke nenahrazuje hlavní vozidlový průchod.
- Nezávislý testový subagent a read-only review: opraveny dvě P2 (zastaralý asynchronní import, zbylý příznak výroby při přechodu do tvorového editoru). Opravy znovu přezkoumány a ověřeny doplňkovým UI průchodem. Vlastní kontrola diffu, účetnictví, typů, vykreslení a escapování dokončena.

## Vizuál a výkon

Prohlédnuto sedm finálních snímků: knihovna 1280×720, editor člunu 1024×640 a 1280×720, zaplacená flotila, skutečná plavba 1024×640, návrat domů a doplňkový buněčný canvas. Viditelný vlastní model, pohon, cestující, trasa, cena a ovládání; nižší panely se posouvají.

Chrome headless / **ANGLE Metal, Apple M4**, 1280×720: 90 nativních editorových RAF vzorků p50/p95 **16,7/16,7 ms**. Dvacet otevření a zavření editoru p50/p95 **186,44/216,82 ms**, včetně záměrného čekání 120 ms a Playwright vstupů; nejde o izolovanou odezvu UI. Po 5 i 20 cyklech shodných **721 geometrií, 1 textura, 18 programů**, editor **26 meshů / 13 materiálů**. Domácí herní vzorek 137 RAF p50/p95 **16,7/16,8 ms**. Krátký lokální vzorek, nikoli dlouhý soak nebo obecný důkaz bez úniků; přímý GPU čas v tomto řezu neměřen.

## Evidence a pokračování

Trvalý vstup [library-campaign.save.json](../../tests/fixtures/vehicles/library-campaign.save.json) je skutečný nezměněný export se SHA-256 `7bf57ced1bdca1e306f68d8af2ff7c7c1cf06ff3490e945b200f8786b49d0450`; původ popisuje [README](../../tests/fixtures/vehicles/README.md). Aktivní kampaň, checkpoint plavby, dva malé soubory návrhu, snímky a výsledky jsou v `evidence/sp-005b-vehicles/`. `cleanup.json` eviduje odstranění vlastního chybného importního souboru a dočasných loaderů/pracovní kopie; bez trace/video, historické kampaně a fixtures nedotčené. Otisky aktuálních souborů jsou v `verified-files.json`.

**Čekající lidské přijetí:** v menu vytvořit odlišný člun, vysvětlit rozdíl „uložit návrh“/„vyrobit“, změnit pohon a odhadnout dopad na cenu/cestu, během plavby nalézt obrat, poslechnout odezvy. Automatika nedokládá lidské porozumění ani poslech. Ruční migrace není třeba.

**Další práce:** plné civilizační sjednocení a dosažitelný mírový obchod, rozmístění obrany, udržitelné hospodaření/armády a terénní nasazení, skutečné B2; poté C–E podle původního rozsahu. SP-009/SP-010/SP-007/SP-017 ani celý goal tímto reportem nejsou uzavřené.
