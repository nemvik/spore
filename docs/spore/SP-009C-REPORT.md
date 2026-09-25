# SP-009.C — editor vzhledu budov a přenositelná knihovna

**Závěrečný report v1, 25. září 2026.** Dokončeno v rozsahu [smlouvy C v1](SP-009C-CONTRACT.md) a [implementačního plánu](../superpowers/plans/2026-09-25-sp-009c-building-editor.md), v pracovním stromu nad ověřeným čistým `b550612f4`. Bez commitu, pushe, deploye, nové závislosti nebo změny lockfilu. Dodává pouze budovovou část SP-005.B; celé SP-005.B, SP-009, SP-010 a SP-017 zůstávají otevřené.

## Výsledek pro hráče

Knihovna budov je dostupná z hlavního menu, pauzy a místního města. Hráč skládá až 24 kvádrů, válců, kuželů a kupolí: mění XYZ polohu, tři rozměry, otočení kolem svislé osy a barvu. Náhled a skutečné město používají tutéž geometrii. Výběr funguje kliknutím na díl ve 3D i seznamem; kamera myší/kolečkem i tlačítky, numerické vstupy, undo/redo 40 kroků, zrušení a uložení jsou dostupné klávesnicí. Nejde jen o přebarvení nebo přepínání dekorací.

Knihovna podporuje jména, nezávislé duplikace, revize, odstranění a soubory `lumavora-building` v1. Platí konvence SP-005.A: 128 KiB na soubor, 100 místních položek, shodný import bez duplikace, konflikt ID jako nová identita, kontrola zastaralé editace, zachování dat při chybě úložiště. Neobsahuje hospodářské nákupy ani městské vlastnictví.

V rozvoji města lze vybrat návrh odpovídajícího hospodářského typu a potvrdit placenou stavbu za původní cenu B. U existující budovy lze otevřít knihovnu, upravit kopii jejího vzhledu a **výslovně potvrdit změnu vzhledu za 0 jantaru**. Uložení do knihovny samo město nemění. Příkaz obsahuje očekávanou ekonomickou revizi; opakované potvrzení neprovede další nákup. Demolice má původní vratku 0. Smazání či revize předlohy nemění již postavené instance.

## Data, prostor a čas

| Autorita | Uložená reprezentace |
| --- | --- |
| Hospodářský typ | Původní `kind`: obydlí, pěstírna, dílna, zahrada odpočinku. Výroba, kapacita, cena, údržba a vztahy okolí zůstávají B. |
| Návrh | `BuildingDesign` v1: typ a geometrické díly; žádné ekonomické parametry. |
| Výtvor | `BuildingCreation` v1: ID, revize, jméno, data a návrh; lokální knihovna. |
| Zaplacená instance | Původní ID, parcela, typ, enabled, paidAmber + `BuildingAppearance` v1: plný snapshot konkrétní revize, nebo doložený neměnný model `city-b-1`. |
| Kampaň | `CityRegistry` v3, aktivní ekonomika v2. Obálka save v3, HomePlanet v3, City.local v1 a oba generátory 1 se nemění. |

Validace kontroluje i otočené rohy, ne pouze středy dílů. Obal leží uvnitř původního kruhového radiusu s rezervou 0,08; spodní hrana dílu je nejméně 0,7 a horní nejvýše 7. Přední pás nese pevný tvarový znak typu. Vlastní model má plnou viditelnou základnu až ke kolizní hranici, spodkem přizpůsobenou terénu. Vnitřní mezery jsou části pevného exteriéru, nikoli průchody. Původní kontrola terénu, hranic, parcel, náměstí, radnice a příchodu se nemění. Dílny a zahrady nadále působí podle původních vzdáleností středů parcel. Test kontroluje všechny vrcholy výsledného modelu každého typu včetně pevných znaků.

Editor a knihovna jsou odpojený režim; ekonomika, domov, organismus a jednotky v něm stojí. Pauza, globální mapa a neaktivní města nic nedohánějí. Kosmetický příkaz mění jen vzhled a revizi příkazu; nemění místní čas, ledger, obyvatele nebo provoz. Preview sdílí původní WebGL renderer, má vlastní uvolňovanou scénu a nevytváří další kontext, RAF ani posluchače. Geometrie, materiály a výběrový obal se při změně/zavření uvolňují.

## Historické kampaně

Parser zachovává původní uložený význam a absenci nových dat. Výslovná aktivace `enableCities` migruje **live i checkpoint před importním rekey**: registr A v1 dostane neotevřenou ekonomiku `null`; ekonomika B v1 přejde na v2 a stávající budovy dostanou pouze deklaraci přesného původního vzhledu `city-b-1`. Nevznikají hráčské návrhy, knihovní položky, platby, obyvatelé, čas ani minulost. Opakování migrace je beze změny, včetně checkpointového stringu. Starší aplikace registr v3 nepřečtou.

Skutečný odehraný export B se šesti obyvateli je byte-identická verzovaná [regresní fixture](../../tests/fixtures/geography/sp-009b-economy.save.json), převzatá z `evidence/sp-009b/leisure/active-campaign.save.json`. Oba soubory mají SHA-256 `bb6520f3949acb30e7c33974169cab753b09d80ed5989d7797d0ac355688e71c`. Originál zůstal zachovaný. Původní vzhled B je numericky převzatý do sdíleného rendereru, nikoli odvozený z nového hráčského návrhu.

Checkpoint nahrazuje celou větev včetně obou rozpočtů a snapshotů; neslučuje knihovnu, nepřidává vratky a může obnovit starší vzhled téže instance. Testy zachovávají identitu, vlastníka, LocationAddress, doklad založení, obyvatele, účetnictví, původní worlds, organismus, jednotky, historii/B1 a `GameState.planet`. Nové testy zahrnují skutečné SP-010.A/B/C, SP-009.A/B, opakovanou aktivaci, rekey, storage a checkpoint. Stávající úplná sada pokrývá také jedenáct původních historických fixtures a jejich simulační paritu.

## Skutečně provedené ověření

| Kontrola | Výsledek a rozsah |
| --- | --- |
| `pnpm exec vitest run --maxWorkers=1` | **148 souborů, 2 981 / 2 981**, 147,31 s, samostatný běh bez browseru. Obsahuje opravy nezávislého review. |
| Finální dotčené testy | **222 / 222**, 5,51 s: buildings, city-economy, cities, planet-travel. Po poslední úpravě dvou hráčských textů; 54 nových building regresí. |
| Nezávislý reviewer | Samostatně **54 / 54** building testů, diff-check a kontrola opravených nálezů; bez dalšího konkrétního nálezu. |
| `pnpm typecheck`, `pnpm build` | Prošlo na finálním zdroji. Vite 159 modulů, JS `index-B7b4F3DB.js` **1 328,86 kB / gzip 413,54 kB**, CSS `index-BY2SQpGS.css` 52,92 kB. |
| Produkční okruh C | **5 / 5 skupin, 0 console/page chyb**, finální build, běžné vstupy/native RAF, 1280×720 a 1024×640. |
| Historický produkční okruh | **12 / 12, 0 chyb**, tentýž finální build: původní přechody, B1, obnova, terraformace, save/load/rekey a SP-010.A. |
| Klient develop-web-game | Adaptovaný původní klient se skutečným časem: UI import, otevření nového návrhu, vstupní/capture/error smyčka; stav i snímek zkontrolovány. |
| Vlastní kontrola | Datová migrace, snapshoty, renderer/prostor, vstupy/fokus, uvolňování, transakce a finální diff; `git diff --check` bez chyb. |

Časové limity, save limit 8 MiB a limit varování Vite 500 kB se **nezvyšovaly**. Během prvního úplného běhu omylem běžel druhý úplný testovací proces reviewera; vznikly čtyři timeouty ve staré navigaci kmene. Druhý proces byl zastaven a čistý samostatný běh výše prošel. První typecheck našel příliš úzký odvozený UUID typ parametru, opraven explicitním `string`. První browser pokus odhalil chybu testovacího driveru při hledání save ID v textovém souhrnu; driver nyní používá skutečné tlačítko slotu. Žádný z těchto neúspěšných pokusů není započten jako úspěch. Lint script v repozitáři není.

### Odehraný produkční průchod a připravené vstupy

1. Import skutečného B exportu se šesti obyvateli; návrat domů a získání dalších 80 jantaru původními prameny ve skutečném čase, poté čtyři placené převody do města.
2. Běžnými vstupy sestavena **Jantarová věž** (úzký vysoký válec s kuželem) a **Dvojitý pavilon** (široký nízký kvádr se dvěma posunutými kužely), obojí obydlí. Výběr skutečného dílu myší, poloha/rozměry/otočení/barva, kamera, Ctrl-Z/Shift-Z i tlačítka, zrušení rozpracované změny. Přesně shodná ekonomika před/po editoru.
3. Uložení, revize 2, duplikace/smazání, export a shodný i konfliktní import, odmítnutí vadného souboru; později import do prázdné knihovny a kontrola shodného návrhu.
4. Dvě nové stavby po 20 jantaru, nativní fokus potvrzení/Tab/Shift-Tab/mezerník. U původního obydlí nejprve zrušená a potom potvrzená kosmetická změna za 0; přesně shodný ledger a hospodářský výhled. Po smazání všech předloh zůstaly snapshoty budov stejné. Skutečný cyklus: šest obyvatel, příjem **8**, údržba **9**, jídlo **+6−6**, spokojenost **100**. Dvě nová obydlí přidala původní údržbu 2; vzhled ji neovlivnil.
5. Odchod/návrat, export/import kampaně s rekey, uložení/reload/načtení zachovaly budovy bez knihovny. Dva skutečné exporty před/po návrzích a cyklu ověřily také nezměněné původní systémy po dobu pobytu v městské scéně. Následovalo 20 otevření editoru a 20 návratů; nakonec UI obnova checkpointu.

**Připraveno:** již odehraná B kampaň není nová celá hra od buňky. Nové návrhy ani peníze pro stavbu nebyly vložené. Driver si čistým offline dotazem nad exportovanými daty vybral volnou parcelu; vlastní výběr, platba a stavba proběhly UI. Pouze závěrečná mrtvá checkpointová větev byla připravena offline z finálního odehraného exportu; neprohlašujeme ji za přirozenou smrt. Jednotkové testy navíc používají skutečné `makeCheckpoint` a ověřují rollback staršího vzhledu, nákupů a rozpočtů.

Historický browser používá původní fixtures, připravené přechodové podmínky 0→1/1→2, historické pobřežní vítězství a offline mrtvou větev. Podrobnosti jsou v `evidence/sp-009c/historical/PREPARED.md`. Ve všech browser scénářích **žádné zápisy do živého herního stavu/localStorage a žádné zrychlování času**. Read-only souhrn a měření WebGL bufferů slouží pouze jako důkaz. Skill klient má proto vypnutý časový shim a používá nativní čekání.

### Odezva a paměť

Chrome headless na macOS, lokální produkční build, hlavní měření 1024×640, pixelRatio 1, diagnostika rendereru `WebKit WebGL`. Časy zahrnují Playwright kliknutí a čekání na odpovídající UI; nejde o čistý GPU čas ani FPS benchmark.

| Operace | Počet | p50 | p95 | maximum |
| --- | ---: | ---: | ---: | ---: |
| Otevřít editor a počkat na 3D cíle výběru | 20 | 52,83 ms | 54,51 ms | 54,51 ms |
| Vstup/návrat do města | 22 | 30,95 ms | 31,60 ms | 32,11 ms |
| Návrat domů | 20 | 35,03 ms | 37,31 ms | 37,31 ms |

| Opakování | JS heap po GC (bytes) | Geometrie | Programy | Živé WebGL buffery |
| --- | ---: | ---: | ---: | ---: |
| 0 | 15 532 368 | 334 | 20 | 1 259 |
| 10 | 21 918 508 | 319 | 18 | 1 252 |
| 20 | 21 889 216 | 319 | 18 | 1 252 |

Po zahřátí mezi 10. a 20. opakováním geometrie, programy a buffery nerostly; heap klesl o 29 292 bytes. Úvodní růst heapu zahrnuje první další scény a jejich cache. GC je pouze diagnostika paměti, ne změna času hry. Jde o krátký 20násobný test uvolňování, nikoli důkaz libovolně dlouhého soaku nebo všech zařízení.

## Review, evidence a reprodukce

Nezávislý subagent `sp009c_review` zkontroloval dokončenou implementaci. Našel P2: JSON pole `shape:["box"]` se přes převod klíče mohlo přijmout a renderovat jako válec; opraven výslovný string guard a dvě negativní regrese. P3: pevná koule znaku zahrady přesahovala radius o 0,01; poloměr 0,21→0,19 a test všech vrcholů všech čtyř typů. Obě opravy jsou v úplné sadě i finálním browser buildu. Běžná vlastní kontrola navíc odstranila zbytečné obnovování výběrového obalu a vyčistila pozadí náhledu při scissor renderu.

Finální snímky byly skutečně otevřené a prohlédnuté: [věž 1280](../../evidence/sp-009c/browser/tower-editor-1280.png), [pavilon 1024](../../evidence/sp-009c/browser/pavilion-editor-1024.png), [město 1024](../../evidence/sp-009c/browser/city-custom-1024.png), [město po návratech 1280](../../evidence/sp-009c/browser/city-final-1280.png). Na malém rozlišení má panel vlastností vlastní scroll; kamera, potvrzení/zrušení a oddělení cen/účinků zůstávají přístupné. Prohlédnuté jsou také finální historické a skill snímky. Nejde o lidský playtest porozumění nebo zábavnosti.

Verzované důkazy: [54 regresí](../../tests/buildings.test.ts), [UI browser driver](../../scripts/buildings-browser.mjs), byte-identická B fixture a datová smlouva. Kompaktní lokální výsledky: `evidence/sp-009c/browser/results.json`, `historical/results.json`, `skill/adapter.json`, `verification/` a `cleanup.json`. Aktivní pokračování: **`evidence/sp-009c/browser/active-campaign.save.json`**; původní šestihlavý B save zůstává na svém místě. Odstraněné pracovní kopie a staré neúspěšné snímky eviduje manifest; nejsou vydávané za stále přítomnou evidenci. Trace/video nebyly zapnuté.

Úklid odstranil 28 vlastních mezivýstupů o 5 321 954 bytes včetně pracovní adaptace skill klienta, duplicitních historických exportů a neúspěšných snímků. Ponecháno přibližně 2,34 MB finální evidence plus manifesty; aktivní exporty a regresní fixture se nemažou. `.playwright-mcp/traces/` není přítomné. Disk před dlouhými běhy přibližně 21 GiB volný, po úklidu 17,16 GiB; rozdíl celého disku nelze připisovat těmto několika MB artefaktů. Druhý nezávislý audit dokumentace ověřil shodu čísel s logy, SHA B a rozsah roadmapy bez dalšího nálezu. Závěrečné hashe zdrojů/dokumentů/fixture/buildu eviduje `evidence/sp-009c/final-manifest.json`.

```sh
pnpm exec vitest run --maxWorkers=1
pnpm typecheck
pnpm build
pnpm preview --port 5211 --strictPort
# V druhém terminálu, s místně nainstalovaným Chrome:
LUMAVORA_URL=http://127.0.0.1:5211 pnpm test:buildings
LUMAVORA_URL=http://127.0.0.1:5211 HOME_PLANET_OUTPUT=evidence/sp-009c/historical pnpm test:geography
```

## Meze a přesné pokračování

Knihovna je místní, přenáší se ručně JSON souborem. Model úmyslně používá omezený pevný exteriér: otočení kolem Y, žádné interiéry, otvory pro průchod nebo libovolné kolizní modely. Rozpoznatelnost čtyř typů zajišťují pevné tvarové znaky, názvy a účinky v UI; lidské rozpoznávání bez nápovědy zatím testované není. Safari, mobil, dlouhý soak a poslech nebyly provedené. Známý velký JS bundle zůstává.

Kritéria této C jsou doložená; **vozidla/lodě v SP-005.B–D, soupeřící státy, obrana, dobývání, obchodní převzetí, konverze, námořní expanze, vesmír a SP-007.B2/D se neimplementovaly**. Celé mateřské karty se neuzavírají. Přesný další krok je **plán SP-009.D — soupeřící státy**: nejprve definovat verzovanou autoritu vlastnictví/zdrojů, vztah k CityRegistry a LocationAddress, pravidla času a samostatného rozhodování/expanze; teprve potom implementovat navazující strategii. Ruční migrace není potřeba; pro prohlédnutí výsledku stačí importovat uvedený aktivní save.

## Publikační dodatek · 25. 9. 2026

Po dokončení a ověření uživatel výslovně autorizoval commit a push této C do `main`. Před publikací souhlasilo všech 37 hashů závěrečného manifestu a vzdálený `main` odpovídal `b550612f4`. Tento dodatek a odpovídající záznam v PROGRESS jsou jediné následné úpravy; ověřený herní kód, fixture i build se nezměnily. Původní údaj „bez commitu/pushe“ výše popisuje implementační průchod před tímto navazujícím pokynem. Bez deploye.
