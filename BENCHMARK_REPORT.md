# LUMAVORA · benchmark report

> Úklid 2026-09-16 na žádost uživatele odstranil 10,33 GiB zastaralých traces a nepoužívaných screenshotů. Historické výsledky zůstávají platným záznamem tehdejšího ověření, ale některé odkazované velké soubory už nejsou uchované. Přesný seznam je v `evidence/cleanup-2026-09-16.json`; finální reporty, uložené hry a vybrané snímky zachovány.

## Rozšíření P1–P3 · dokončeno a ověřeno · 2026-09-16

Kmen, Stroje a Terraformace tvoří hratelné pokračování se všemi přechody, planetárním finále a sandboxem. Multiplayer zůstal mimo rozsah. Níže uvedené P0 a původní benchmarky jsou historické výsledky.

| Oblast | Doložený výsledek |
| --- | --- |
| Kmen | [Obě cesty](evidence/era-p1/browser-verified/results.json): diplomacie i boj, skutečný sběr a doprava, výstavba a čtyři nástroje, klik/rámeček/skupinové rozkazy, 12 členů, save/import během stavby i po dokončení. Připravený pobřežní vstup, DEV čas. |
| Stroje | [Tři strategie](evidence/era-p2/browser-final/results.json): obnova, regulace a diplomacie; přesný placený návrh, příjem ze dvou pramenů, tank i letoun, tři regiony, fyzická horská bariéra a save/reload. Základem je odehraná P1 pozice; alternativní pobřežní závěry jsou přiznané fixtures. |
| Editor | Původní charakterizace [před](evidence/era-p2/editor-before/result.json)/[po](evidence/era-p2/editor-after/result.json) 5/5; [strojový editor](evidence/era-p2/machine-editor/result.json) ověřil výběr a tah na modelu, symetrii, undo/redo, neplatný trup, cancel, platbu 62 jantaru a přesné načtení návrhu. |
| Terraformace | [Připravený P3 průchod](evidence/era-p3/browser-final/result.json): reálné odběry a krmení, regrese T1→T0 bez stabilizace, tři živé řetězce, vypnuté nástroje, finále a 120 s stabilního sandboxu, export/reload. Neupravený export odehraného P2 scénáře; DEV krokování. |
| Úplná nová kampaň | [Audit jedné linie 0→5](evidence/era-p3/fresh-expansion/lineage-audit.json): normální Nová linie, seed 8675309, skutečné klávesy/myš a nativní čas. Bez importů, zápisů do stavu, časových zkratek, smrti nebo obnovy. Finále na ticku **57561 = 15 min 59,35 s simulace**, poté přes 15 s živého sandboxu. Všech šest milníkových exportů prošlo přesným načtením a roundtripem aktuálního parseru. |
| Testy a build | **98 souborů / 1913 testů PASS**, jeden worker, 37,96 s; následně typecheck a build. Původní 18×600 tickové snapshoty shodné. [Souhrn a logy](evidence/era-p3/verification/summary.json). Známé upozornění na JS chunk přes 500 kB. |
| Kompatibilita | [118/118 historických uložených her](evidence/era-p3/verification/historical-save-corpus.json) zachovalo vstupní soubory, světy, genomy a checkpointy podle dosavadních migrací; žádný starý save automaticky nezískal katalog. Dalších 19 pozic rozšíření prošlo samostatným auditem. Od tohoto auditu se parser nezměnil; nová fresh linie byla ověřena i po poslední úpravě hry. |

### Úplný průchod a původ důkazů

Nová linie vytvořila pět generací, snědla 92 porcí, neprovedla žádný lov a přenesla získaného partnera do kmene. Sjednotila tři sousedy diplomacií, vyrobila tank a letoun, obnovila tři regiony a zajistila dva jantarové prameny. Terraformace zdědila skutečně získané kontakty; chybějícího korunoplaze hráč obnovil za jantar a fyzicky nakrmil. Každá ze tří lokalit má dvě kultury, dva býložravce a lovce. T3 vydrželo s vypnutým nástrojem, následovalo finále celé linie a sandbox. Genom i zaplacené návrhy zůstaly zachované, katalog má 16 kontaktů. [Původní browser listener](evidence/era-p3/fresh-expansion/browser-errors.json) hlásil nula chyb za všech šest etap.

Root skutečně prohlédl [Kmen](evidence/era-p3/fresh-expansion/01-tribe-completed.png), [Stroje](evidence/era-p3/fresh-expansion/02-machines-completed.png), [finále](evidence/era-p3/fresh-expansion/03-planet-finale.png) i [živou planetu](evidence/era-p3/fresh-expansion/04-living-planet.png). Ovládání je doloženo malými časovými osami; velký trace byl vypnutý a průběžné nepotřebné snímky odstraněny. Podrobnosti a přiznané opravy testovacího ovladače jsou v [záznamu průchodu](evidence/era-p3/fresh-expansion/run-summary.md).

Průchod běžel na nezměněné [zmrazené verzi zdrojů](evidence/era-p3/freeze/source-manifest.json). Sedm souborů finálního zdroje se liší pouze pozdějším vyřazováním P2 strojů, textem šesti kapitol a úklidem školkové potravy/ostatků. Tyto změny mají samostatné regrese, UI ověření vyřazení a finální produkční smoke. Celý průchod proto není vydáván za opakovaný průchod posledním buildem. Agent znal mapu a používal read-only diagnostiku; nejde o slepý první lidský playtest. Čas zahrnuje i aktivní čekání při opravě ovladače.

### Stabilita a poslední opravy

Review opravil ekonomické blokace, plnou flotilu tanků bez místa pro letoun, mrtvý první stroj při vstupu P3, návrat placeného nákladu, klima v rendereru, překrytí mapy a klávesnicový fokus. Vyřazení jednoho stroje u dílny vrací 35 % ceny a nevyužitý náklad, poslední živý stroj zůstává. Jedenáct regresí a [skutečné UI 8→7→8](evidence/era-p2/retirement/result.json) prošly včetně placeného letounu a save/importu. Osm dalších regresí ověřilo opětovné použití školkové porce bez přesunu a ochranu mateřských zdrojů/kořenů; ostatky mají původní limit 40. Vlastní i nezávislý review dokončen.

[Planetární soak prošel](evidence/era-p3/soak-warmed/result.json): **639,581 s aktivního času / 640,533 s simulace**, 25 cyklů, 12 editorů, dva refresh/load a nula browser chyb. Zahřáté geometrie 1867→1845, programy 19→19, textury 1→1; finální snímek prohlédnut. Připravený stabilní P3 save, skutečný čas, nikoli nová kampaň nebo izolovaný GPU benchmark. První pokus chybně předpokládal globální Tab při fokusu panelu; druhý narazil na pozdní upload geometrie do GPU. Kauzální kontrola prokázala +387 geometrií při novém pohledu bez nových modelů a +59 za dalšího skutečného jedince. Po zahřátí všech biomů původní limit prošel beze změny. Starší testovací timeouty při diskové tísni jsou zachované; assertions ani timeouty se nezeslabovaly.

[Aktuální produkční build](evidence/era-p3/production-cleanup-final/result.json) ověřil skutečný pohyb/jídlo, pauzu, save/refresh/load, nastavení a Web Audio. Bez časového hooku, chyb nebo externích požadavků; nezávislý agent prohlédl jediný finální snímek. JS `index-Db2Hqb7K.js`, SHA256 `8fe6d169d52e92fd39bbd8b3490530c6cabda98f4b3b8adab17c4ddaad5c87cc`. Nezměněný původní skill klient také prošel po poslední změně: tick 231, pohyb 8,93 m, dvě jídla; root prohlédl [canvas](evidence/era-p3/skill-cleanup-final/shot-0.png). Tento klient používá DEV časový shim.

### Přenositelnost před publikací

Jedenáct nezbytných uložených vstupů (2,07 MB) je nově verzováno v `tests/fixtures/saves/`, beze změny původních bytů a s manifestem původu/SHA256. Dvě jednotkové regrese a příslušné browser skripty používají tyto vstupy místo ignorovaných lokálních evidence. V odděleném exportu zdrojů bez `evidence/` prošlo všech **1913 testů**, typecheck a build; aktuální parser ověřil všech 11 fixture. Node 22, existující uzamčené závislosti sdílené symlinkem; nejde o ověření nové instalace závislostí. Herní zdroje se nezměnily. Původní snímky, traces a lokální reporty se do Gitu nepřidávají.

### Meze a reprodukce

Krátké [měření 12členné tlupy](evidence/era-p1/browser-final/twelve-members-metrics.json) při 1536×960 medium zaznamenalo 376 snímků, medián 16,7 ms / p95 16,8 ms, 784 draw calls a 179792 trojúhelníků. Není to obecná výkonová záruka. Návrhových 20–30 minut na etapu, starších 45–90 minut a lidská retence nejsou doložené; automaticky vedený celý průchod trval přibližně 16 simulačních minut. Safari a telefon nebyly ověřeny.

`LUMAVORA_URL` určuje vývojový server. `pnpm test:tribe`, `test:machines`, `test:machine-editor`, `test:machine-retirement` a `test:planet` spouštějí připravené scénáře. `test:planet-soak` používá skutečný čas a `PLANET_SOAK_SOURCE`; `test:production` po buildu používá `PRODUCTION_URL`. Browser a preview procesy závěrečného ověření byly ukončeny; finální save a potřebné zdroje zůstaly. Žádný commit, push, deploy, nová závislost ani změna lockfilu.

## Rozšíření kampaně · základy P0 · 2026-09-16

Historická fáze P0 provedla [detailní plán P0](docs/superpowers/plans/2026-09-15-machine-era-p0-foundations.md). Rozšiřuje datový model na šest etap, zachovává tři fyzické světy a připravuje ovládání i kameru dalších etap. **V tehdejší fázi P0 ještě nebyl implementován hratelný obsah P1–P3; aktuální stav je v úvodu tohoto reportu.** Po pobřežním vítězství lze výslovně vstoupit do označeného, statického náhledu kmene a vrátit se do původního sandboxu. Multiplayer se neměnil. Níže uvedené starší benchmarky jsou historie, nikoli nové měření P0.

### Implementováno a ověřeno

- `Stage` 0–5 a `WorldStage` 0–2; společné mapování fyzického prostředí, samostatné ovládací modely a kamera nad krajinou. Náhled zachovává celý genom, světy, ekologii, Journey, symbionty a pobřežní závěr.
- Formát uložené hry v3, migrace v1/v2 bez automatického přechodu do nové éry, přísná validace verzovaných řezů i checkpointů. Prázdné tvary strojů a planety nepřijímají dosud nedefinovaný obsah.
- Rozdělení simulace na pojmenované fáze při zachování pořadí výpočtů. Před refaktorem zachycené otisky všech mezikroků se shodují v **18 scénářích × 600 tiků** (tři světy, tři seedy, původní i aktuální pravidla). Staré testy upravují pouze typ fyzické etapy a očekávanou verzi migrovaného formátu, nikoli herní očekávání.
- `pnpm typecheck`, **78 testovacích souborů / 1181 testů** a `pnpm build` prošly. Build nadále upozorňuje na JavaScript chunk přes 500 kB.
- Nezávislý audit **118/118 historických uložených her**: u 31 současných Journey pozic se mění pouze verze kořenového stavu/checkpointu; u 87 starších souhlasí výsledek s dosavadní migrací a novou verzí. Vstupní soubory zůstaly beze změny. [Výsledek](evidence/era-p0/save-corpus.json).
- [Browser náhledu](evidence/era-p0/browser/era-browser-results.json): skutečný UI import připraveného pobřežního vítězství, opt-in, kamera a limity zoomu, blokace tělesných akcí, save/export/reload/import, návrat a opětovný vstup. Rozvinutý importovaný kmen nenabízí destruktivní návrat. Sedm snímků a trace; nula browser chyb a externích požadavků. Jde o přiznaný připravený stav, nikoli nový průchod aktuální kampaní.
- [Původní kampaň](evidence/era-p0/legacy-browser/result.json): browser regrese dosáhla pobřežního vítězství a sandboxu, bez browser chyb. Používá původní pravidla a zrychlené DEV krokování.
- [Historický v2 import → dohrání](evidence/era-p0/legacy-v2-browser/result.json): skutečný dříve uložený tick-0 export prošel normálním UI importem, celou kampaní starých pravidel, uložením/refresh/load a pobřežním vítězstvím → sandboxem. Pět generací, 68 jídel, jeden partner, žádné chyby. Explicitní aserce potvrzují etapu 2 a nepřítomnost všech nových řezů i po vítězství; původní vstupní soubor zůstává bitově shodný. Zdroj, SHA256 a formát v2 jsou v provenienci výsledku. DEV čas je zrychlený, nejde o první lidské hraní.
- [Produkční ověření](evidence/era-p0/production/result.json): reálný pohyb a krmení, pauza, save/refresh/load, nastavení a Web Audio; žádný `advanceTime`, browser chyba ani externí požadavek.
- Původní nezměněný klient skillu `develop-web-game` prošel (exit 0, tick 155, dvě jídla, stav i screenshot skutečné hry). Při zatíženém vývojovém serveru hlásil timeout čekání po úvodním kliknutí; následný stav i snímek potvrzují spuštěnou hru. Nepoužívá se jako důkaz délky nebo výkonu.
- Nezávislý code review zkontroloval migraci, přechod a návrat. Odhalená nekonzistence tlačítka návratu pro importovaný rozvinutý kmen je opravena sdílenou podmínkou i regresním testem.

### Závěrečné ověření

Browser fixtures prošly **7/7 scénářů**, bez browser chyb a externích požadavků. [Výsledek](evidence/era-p0/fixtures-editor-fix/scenario-results.json). První běh měl 6/7 úspěšných scénářů; fixní souřadnice drag testu mířily mimo tělo, kam editor orgán připojit nemůže. Test nyní táhne na povrch těla, původní assertion skutečné změny polohy zůstala. Původní selhání je zachováno v `evidence/era-p0/fixtures/`; produkční logika tažení se neměnila.

[Soak prošel](evidence/era-p0/soak/metrics.json): **607,026 s aktivního hraní / 674,025 s celkem**, 19 cyklů, devět otevření editoru, dva refresh/load, žádné chyby ani obnova po smrti. Bez časových zkratek, aktuální nová linie, 589,633 simulačních sekund. Ve srovnání uvnitř jedné nepřerušené stránky geometrie 438→439, textury 0→0, programy 20→20, medián JS heap 23 794 604→17 184 220 B; všechny nastavené meze růstu prošly. Běh používal SwiftShader/software, takže nejde o nový GPU benchmark ani důkaz nulového úniku paměti. Výsledný screenshot byl prohlédnut.

### Reprodukce a meze

Vývojový server tohoto běhu je `127.0.0.1:5180`, statický build `127.0.0.1:4180`. Testy používají `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/lumavora-p0-browsers` a `LUMAVORA_URL` (produkce `PRODUCTION_URL`). Nový příkaz `pnpm test:era` běží proti vývojovému serveru; `node scripts/era-browser.mjs --prepare-only` pouze připraví označený scénář. Existující `test:browser`, `test:fixtures`, `test:production` a `test:soak` zůstávají dostupné.

Historický průchod použil navíc `BROWSER_TEST_INITIAL_SAVE=evidence/quality/regression/browser-test/legacy-initial.fixture.json` a `BROWSER_TEST_OUTPUT=evidence/era-p0/legacy-v2-browser`. [Manifest 156 zdrojových/testovacích souborů](evidence/era-p0/source-manifest.json), [úplný testovací log](evidence/era-p0/unit-tests.log) a [build log](evidence/era-p0/build.log) zachycují tuto implementaci.

Vite nyní omezuje hledání vstupů na `index.html` a nesleduje historické důkazy, browser archivy ani lokální pnpm store. Původní polling těchto mnohagigabajtových adresářů přetěžoval server; zdrojové soubory zůstávají sledované. Žádná nová závislost, změna lockfilu, commit, push ani deploy.

P0 nepřidává hratelnou kmenovou ekonomiku, jednotky, stroje ani planetu a nedokládá delší kampaň či lidskou retenci. Historický cíl 45–90 minut není touto změnou splněn. Nové měření výkonu na GPU, Safari ani mobilní ovládání nebyly provedeny.

---

**Stav: funkční definice dokončení z briefu splněna a ověřena. Povinné systémy, průchod, opravy, produkční test,600s soak i výkonové měření jsou dokončené. Návrhový cíl délky45–90min zůstává nesplněný; přesné omezení je níže.**

`GAME_BRIEF.md`, `BENCHMARK_SCORECARD.md` a `RUN_CODEX.md` zůstaly beze změny. Report hodnotí doložené chování, nepřiděluje hře nezávislé estetické skóre.

## Prostředí a reprodukce

- macOS 26.6.2 (25G83), arm64; Node 22.23.1; pnpm 11.24.0.
- TypeScript 5.9.2, Vite 7.1.5, Three.js 0.180.0, Vitest 3.2.4, Playwright 1.55.0 / Chromium 140.0.7339.16.
- Vývojový server `127.0.0.1:5173`; samostatně ověřený statický build na `127.0.0.1:4173`.
- `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build` prošly. Poslední úplná sada: **127/127 testů v 9 souborech**; [JSON report](evidence/tests.json).
- Build: 24 modulů, JavaScript 647416 B / 179768 B gzip, CSS 14136 B / 3873 B gzip. Vite hlásí obvyklé upozornění na JS chunk nad 500 kB. [Build výsledek](evidence/build-result.json), [otisky zdrojů](evidence/source-manifest.json).
- Browser skripty respektují `PLAYWRIGHT_BROWSERS_PATH`; tento běh použil `/private/tmp/lumavora-browsers`. Instalace browseru do výchozí nepovolené cache selhala; povolená dočasná cesta funguje.
- macOS blokoval Chromium IPC v omezeném procesu. Automatické schválení jednotlivých lokálních testovacích procesů umožnilo běhy. Globální sandbox a systémová nastavení nebyly měněny.
- Tři nativní subagenti přispěli genomem, validací, morfologií, prostředím, testy a nezávislou kontrolou. Hlavní agent držel simulaci, architekturu, integraci a konečné ověřování. Přesné modelové varianty: **N/A**. Metrika nástroje `update_goal` při dokončení: **2105375 tokensUsed**, **5350 sekund timeUsedSeconds (1h29min10s)**; jde o čítače nástroje, nikoli nezávislý účetní výkaz. [Původ metrik](evidence/goal-metrics.json).
- Žádné placené API, účet, backend, runtime CDN, převzaté herní assety, push, PR, release ani deploy. Uživatel během vývoje neměnil herní stav a nebyl žádán o implementační rozhodnutí.

## Přesný rozsah důkazů

| Důkaz | Skutečně provedené ověření |
| --- | --- |
| [Kompletní kampaň](evidence/campaign/result.json) a [časová osa](evidence/campaign/timeline.json) | Nová hra seed 481516, skutečná klávesnice a DOM, sběr a placené evoluce, aktivita v každé nice, tři etapy, živý partner, save–refresh–load, pauza, resize, obnova tří pramenů a sandbox. Žádné přepisování genomu, etap, DNA nebo zdraví. **5 generací, 68 jídel, 0 zabití, 1 partner.** |
| [Trace kampaně](evidence/campaign/campaign.trace.zip) | Nezkrácená browser časová osa s akcemi a snímky, nikoli showcase sestřih. Krokování času v DEV je zrychlené. |
| [7 cílených scénářů](evidence/fixtures/scenario-results.json) | Editor včetně raycast výběru/tažení, proporcí, velikosti, symetrie, odstranění, undo/redo/cancel a skutečné ceny; smrt/obnova; poškozený import; kauzální ekologie; všechny tři závěry. **0 browser chyb a 0 externích požadavků.** [Provenience fixtures](evidence/fixtures/FIXTURES.md), [trace](evidence/fixtures/targeted-scenarios.trace.zip). |
| [Ekologická změna](evidence/fixtures/scenario-results.json) | Čtyři skutečná krmení: zdroj 8→4, úrodnost 1→0,972. Čtyři obnovy T: zdroj 4→5, úrodnost 0,972→1,232. Změna velikosti/vegetace viditelná ze stejné kamery; export/import zachoval přesný stav. |
| [Vyschlý pramen](evidence/climate/result.json) | Připravená suchá krajina, poté skutečné T a krmení: pramen 0→10, vláha 39,53→100, obnova zelené oázy a rostlin. Export/import zachoval klima i úrodnost. [Před](evidence/climate/01-dry-spring.png), [po](evidence/climate/02-restored-oasis.png), [po načtení](evidence/climate/03-reloaded-oasis.png), [trace](evidence/climate/climate.trace.zip). |
| [Produkční build](evidence/production/result.json) | Skutečný pohyb a krmení podle hodin, pauza, nastavení, save/refresh/load a notebookový viewport. `advanceTime` v produkci neexistuje. Žádné externí požadavky ani browser chyby. Web Audio se vytvořilo až po interakci, běželo, tvořilo efekty a mute změnil výstupní gain na nulu. Nejde o nezávislý poslechový posudek. |
| [Postup develop-web-game](evidence/first-play/shot-0.png) | Spuštěn dodaný Playwright klient, skutečné klávesy, read-only stav a screenshot běžícího canvasu; screenshot prohlédnut. |
| [Soak](evidence/soak/metrics.json) | **PASS: 622,325 s aktivního hraní / 672,487 s celkem**,21 cyklů,10 otevření a úprav editoru,2 refresh/load,0 chyb,0 úmrtí; bez `advanceTime`. SwiftShader/software, simulačně pokročilo403,217 s. Růst prostředků posouzen uvnitř jedné dlouhé životnosti stránky, ne přes refresh. |
| [Výkon](evidence/performance/performance-results.json) | PASS ve všech třech etapách: Apple M4 / ANGLE Metal,1920×1080,střední,každá scéna přes20s a1201 intervalů,medián16,7ms,p9516,7–16,8ms. Bez chyb. |

**Alternativní strategie jsou cílené připravené scénáře, nikoli dvě další nové kampaně.** Migrační scénář naváže dva skutečné partnery a udrží je 120 simulačních sekund; dravý scénář začíná s 11 předchozími invazními zabitími a provede skutečný poslední lov. Jednotkové testy navíc ověřují obranu, potravu, hlad, odchod partnera, populační důsledky a podmínky všech závěrů.

## Stabilita

Soak používal **SwiftShader/software**, nikoli výkonový profil GPU MacBooku. Mediány opakovaných srovnatelných cyklů v jedné stránce: geometrie **411→413**, textury **0→0**, shader programy **12→12**, JS heap **17,04→17,87 MB**. Garbage collection nebyl vynucen. Přípustné meze a jednotlivé vzorky jsou v [metrics.json](evidence/soak/metrics.json); tyto výsledky dokládají nepřítomnost zjevného růstu v daném běhu, nikoli matematický důkaz nulového úniku. Aktivní čas podle hodin je uveden odděleně od simulačního času, který při pomalém softwarovém renderování ovlivňuje bezpečnostní omezení dlouhých snímků.

## Výkon na skutečném GPU

Měřeno samostatně po soak, bez dalšího aktivního browser testu: **Apple M4,10 logických CPU,24 GiB RAM,arm64; Chromium140 / ANGLE Metal Renderer: Apple M4**. Každá úplná seedovaná scéna20260913 má připravený počáteční save a120s ochranu proti smrti,3s zahřátí a nejméně20s skutečného hraní klávesami W/D/S/A. Vzorky pocházejí přímo z `requestAnimationFrame`; žádný interval nebyl vynechán.1920×1080 CSS pixelů,deviceScaleFactor1,pixelRatio1,střední kvalita.

| Etapa | Doba / intervaly | Medián | p95 | Celkové FPS | NPC / zdroje / překážky | Rozsah draw calls / trojúhelníků |
| --- | --- | --- | --- | --- | --- | --- |
| Mikrosvět | 20.016s / 1201 | 16.70ms | 16.70ms | 60.00 | 21→21 / 86→86 / 27 | 34–233 / 29204–94794 |
| Útesy a mělčiny | 20.016s / 1201 | 16.70ms | 16.70ms | 60.00 | 21→19 / 83→85 / 27 | 59–432 / 40780–141356 |
| Pobřeží a souš | 20.016s / 1201 | 16.70ms | 16.80ms | 60.00 | 33→32 / 83→84 / 27 | 73–511 / 36254–129442 |

[Úplné raw vzorky, prostředí a počty](evidence/performance/performance-results.json). Počty NPC a zdrojů jsou začátek→konec; renderované počty se mění se záběrem. Jde o doložené přibližně60FPS v těchto scénách a tomto browseru, nikoli záruku pro každý genom, libovolný hardware nebo Safari. Soak se SwiftShaderem je oddělený výsledek.

## Tempo a meze hodnocení

**Návrhový cíl 45–90 minut není splněný ani doložený.** Optimalizovaná cesta podle pravidel trvala **243,083 simulačních sekund (4,05 min)** a **23,473 sekund podle hodin** při zrychleném deterministickém krokování. Je to podstatně kratší cesta než návrhový cíl. Skript zná souřadnice, ekonomiku a vhodnou evoluci; tyto údaje nejsou délka prvního lidského hraní. Neproběhl nezávislý uživatelský playtest a není tvrzeno, že automatické testy dokazují zábavnost.

Safari a telefon nebyly ověřeny. Desktop Chromium má doložené ovládání klávesnicí a myší; responzivní UI není důkazem dotykové hry. Zvuk je ověřen technicky přes Web Audio, ne nezávislým posluchačem. Save závisí na úložišti příslušného prohlížeče/originu; přenositelnou zálohou je export JSON.

## Mapa požadavků briefu

Legenda: **O — splněno a ověřeno**, **I — implementováno, příslušné ověření nedokončeno**, **N — nesplněno**. U výtvarných položek O znamená skutečné vizuální prohlédnutí hry, nikoli objektivní skóre kvality.

| Požadavek | Stav | Implementace a důkaz |
| --- | --- | --- |
| Originální singleplayer 3D hra a přímé ovládání | O | Three.js canvas, lokální procedurální obsah, skutečné klávesy v kampani i produkci. |
| Tři propojené etapy se společným genomem | O | `simulation.ts` přechody, historie světů a linie; kompletní kampaň. |
| Mikrosvět: potrava, predátoři, první adaptace a volby | O | Dieta/pohyb/obrana z genomu; browser první evoluce, testy potravy a predace. |
| Útesy: svislý pohyb, proudy, úkryty, odlišné niky | O | Q/C, kolize podle výšky, lokální proud a vliv ploutví/ocasu; browser průchod a testy. |
| Adaptace skutečně podmiňují souš | O | Plíce + končetiny v podmínkách přechodu i přežití; přechodové a validační testy. |
| Souš zachová tělo, stavbu a historii | O | Stejný `createOrganism`; sdílená anatomie pro výšku těla a nohy; screenshoty a přesné porovnání genomu. |
| Ekologický závěr s více řešeními | O | Obnova, potravní rovnováha, migrace; reálná kampaň + označené alternativní fixtures. |
| Trvalý výsledek finále, shrnutí, sandbox, nový seed | O | Klimatické důsledky, lineage/checkpoint, závěrečný UI panel; kampaň a testy všech konců. |
| Skutečný 3D editor s orbit/zoom a výběrem na modelu | O | Raycast, tažení, skutečné rotace a kolečko; cílený browser editor. |
| Proporce, přidání/přesun/velikost/odstranění částí | O | Genom `length/width/axial/angle/scale`; browser a geometrické testy. |
| Symetrie, limity konstrukce a zpětné změny | O | Oddělené párové úchyty i na švu, validační limity, undo/redo/cancel; testy anatomie a UI. |
| Cena a důsledky před potvrzením | O | Živé statistiky a trvale viditelný souhrn, placená generace, validace; browser skutečné ceny. |
| ≥16 funkčních adaptací / ≥6 oblastí | O | 21 adaptací / 6 kategorií; katalog, fenotyp a mechanické testy. |
| Stejná data pro vzhled, animaci a dostupné akce | O | Společný genom/`computeStats`, morfologie a simulace; anatomie a průchod. |
| Kosmetika odlišená od funkce | O | Samostatný oddíl barvy/vzoru; ceny a důsledky testovány. |
| Žádné záporné ceny, neplatná těla, refund smyčka | O | Transakční validace a 50% salvage proti nákupu bez výplaty DNA; cenové/regresní testy. |
| Dravá, neagresivní a symbiotická strategie | O | Odlišné diety/akce/obrana/partnerství; plný neagresivní průchod a přesně vymezené alternativní scénáře. |
| Smrt a bezpečná obnova poslední generace | O | Validovaný checkpoint, srozumitelná příčina, ochranná doba; browser smrt/obnova/refresh. |
| Svět si pamatuje odběr, lov, reprodukci a péči | O | Úrodnost, zásoby, tlak, demografie a obnovy; testy a vizuální kauzální save/import scénář. |
| Symbióza s náklady, péčí a viditelným projevem | O | Dar energie, upkeep, hlad/věrnost/odchod, druhový model a světlo/štít/recyklace; průchod a fixtures. |
| ≥6 prostředí a ≥9 odlišitelných NPC druhů | O | 9 nik, 10 druhů, odlišné siluety/role včetně vícelaločné útesové stuhy; prohlédnuté scény a katalog. |
| NPC hledají potravu, loví, vyhýbají se hrozbám | O | Deterministické forage/flee/hunt/rest; skutečné cíle a testy AI. |
| Reprodukovatelné seedy a hratelný začátek | O | 481516, 20260913, 8675309; shodné vstupy/kroky, dostupné startovní zdroje a kolize testovány. |
| Omezené populace, zbytky a dosažitelné zdroje | O | Strop 48 NPC, omezená demografie, max 40 zbytků při údržbě, garantovaná potrava; testy robustnosti. |
| Výtvarný jazyk, organické siluety a vlastní materiály | O | Procedurální uzavřené tělo, membrány/končetiny, vegetace, korály, shader půdy/vody; skutečné screenshoty prohlédnuty. |
| Pohyb/krmení/zásah/smrt/reprodukce mají feedback | O | Animace podle rychlosti a anatomie, pulzy, zprávy, obrazovky a Web Audio; browser a geometrické testy. |
| Kamera je plynulá a respektuje terén/překážky | O | Sledování, orbit, analýza překážek, spodní mez; testy kamery a prohlédnuté herní scény. |
| Zvuk, efekty, hlasitosti a mute po interakci | O | Vlastní Web Audio; produkční browser ověřil stav/nody/gain, UI nastavení. |
| Desktop ovládání, pauza, kvalita, citlivost a resize | O | WASD/Q/C/Shift, myš, nastavení; browser 1024×768 až 1920×1080. |
| Význam není pouze barvou a klidnější obraz | O | Tvary, symboly, texty, omezení efektů; regresní test růstu při vypnutém animačním čase. |
| Centrální herní texty pro lokalizaci | O | UI `copy.cs.ts`, zprávy/katalogy `content.ts`, chyby `errors.cs.ts`, katalog adaptací; 29 před/po UI ekvivalencí. |
| Verzované lokální save, více linií, import/export | O | `persistence.ts`, nezávislé klíče, atomické zápisy; testy a skutečné UI round tripy. |
| Poškozené/nekompatibilní save a selhání úložiště | O | Přísné rozsahy/vazby, verze, 8MB limit, checkpoint, izolace chyb; testy validace/quota a browser. |
| Nezávislost na FPS, seedované RNG, tab/pauza | O | Fixed 1/60, omezený accumulator, auto-pause při hidden; determinismus a pauza ověřeny. |
| Lokální statický provoz bez runtime služeb | O | Produkční browser 0 externích požadavků; vlastní geometrie i zvuk. |
| Zamčené závislosti a reprodukovatelné příkazy | O | Frozen install, typecheck, build, testy a browser skripty prošly; README. |
| Produkce bez stav měnících debug zkratek | O | DEV `advanceTime` odstraněno; produkční browser ověřil jeho nepřítomnost. |
| Kompletní průchod bez přepisování stavu | O | Nová hra a skutečné vstupy; kompletní trace a časová osa. |
| ≥10 minut skutečného hraní/soak bez chyb/růstu | O | 622,325 aktivních sekund,21 cyklů,0 chyb; počty a paměť porovnány v16 cyklech bez refreshe. |
| Screenshoty etap/editoru a trace hraní | O | `evidence/campaign/`, `evidence/fixtures/`, `evidence/climate/`; aktuální screenshoty znovu prohlédnuty. |
| Výkon 1920×1080 medium, medián/p95/provenience | O | Apple M4/Metal: tři samostatné20s vzorky,medián16,7ms,p9516,7–16,8ms; raw RAF a počty objektů uloženy. |
| README, PROGRESS, asset credits a report | O | Kompletní zdroje, příkazy, naměřené důkazy, limity a konečný checkpoint. |
| Návrhové tempo přibližně 45–90 minut | N | Optimální doložená cesta 4,05 simulační minuty; viz výslovné omezení výše. |
| Bez placených API, push a deploy | O | Pouze lokální vývoj a testy; žádné publikování. |

## Opravy podle skutečného hraní a nezávislé kontroly

- Kolize garantovaných startovních zdrojů u dvou seedů; nyní zdroje zůstávají dostupné.
- Přetečení energie recyklací a záporná energie při slabém útoku, které zneplatňovaly save.
- Cache statistik mutujícího editorového draftu, nesprávné kontrolní zdraví a obnovování autosave ticku.
- Menu měnilo skutečný simulační čas; používá oddělený náhled světa.
- Undo sliderů, nechtěné tažení orgánu přes prázdno, poskakující scroll, cena párových orgánů a skryté důsledky úprav.
- Příliš světlé materiály, nízká čitelnost hráče v kolébce a hranaté silikátové sloupy; opraveno po prohlédnutí screenshotů.
- Vysychání dříve pouze zpomalovalo regeneraci. Nyní mění pobřeží, hydrataci, zdroje, vegetaci a trvalé výsledky finále.
- Párové orgány na ose dříve sdílely jedno místo; nyní mají dvě skutečné polohy. Nohy a tělo sdílejí anatomickou oporu a skutečné vrcholy chodidel.
- Kontakt NPC/potravy se souší, původní podoba symbiontů a kamera respektující překážky.
- Omezené animace zmrazovaly ekologický růst; ten nyní používá skutečný simulační čas.
- Rozptýlené UI/simulační/validační texty jsou v českých katalozích; extrakce zachovala přesné HTML a HUD ve 29 scénářích.
- Vite watcher v tomto prostředí držel staré moduly. Polling 500 ms a restart obnovily shodu servírovaného kódu se zdrojem.

## Post-benchmark game-quality pass

### Aktuální úkol · tělesné volby útesu, v14 → v15c

**V14 je zachovaná reprodukovatelná lokální baseline; nová smyčka útesu má dva dokončené průchody odlišnými těly.** Nejde o další prodlužování kampaně. Výhody a nevýhody těla jsou doložené, ale spontánní experimentování člověka a dostatečná čitelnost bez textu zůstávají neověřené. **45–90 minut tím není splněno.** [Úplná diagnóza, předem vyslovená hypotéza a srovnání](evidence/reef-body/REEF_COMPARISON.md).

**Diagnóza z kódu a hraní před úpravou.** Agent založil čerstvou v14 linii, odehrál mikrosvět a útes pokračoval z vlastní uložené linie. Jedna vstupní sestava filtr 1,25 / žábry / párové ploutve vyřešila tři útesové vztahy a přenesla 100% kulturu bez další přestavby. Filtr přímo otevřel baldachýn a obě opory poskytovaly stejnou až 90% filtraci. Před průduchem byla navíc kontrola vyřešení obou předchozích nik. Znalost mapy a pravidel byla výhodou agenta; nejde o slepý lidský test.

**Jedna změna smyčky.** Tělo nyní určuje práci s vodou, živá pastva mění vodu v další situaci a voda ovlivňuje tělo i přenášenou kulturu. Velký otevřený filtr čistí lokálně, ale brzdí a spotřebovává energii; žábry doplňují dech v čisté vodě a přijímají hustý plyn. Vzdušné komory dávají rezervu a vztlak, ale neochrání kulturu a ztěžují sestup. Boční pastva částečně čistí hluboký přítok; horní vytváří výstupní proud. Obě potřebují skutečnou hostinu a živou rostlinu. Průduch lze zkusit i před jejich dokončením. Rozměry a umístění orgánů mění náklady souvisle; filtr ani plíce nejsou klíčem k novému povinnému zámku. Ceny, velikost mapy, rychlost zdrojů a kvóty se nezvyšovaly.

Před implementací byla hypotéza spojena s pozorovatelným kritériem: podpoří ji jiná práce s ovládáním a ekologií při stejném cíli, vyvrátí dominantní univerzál s drženým Space, povinný orgán nebo rozdíl patrný jen z textu. První připravené sondy odhalily příliš slabý rozdíl dechu a škodu způsobovanou vlastním horním proudem; obojí bylo opraveno před finálními průchody.

**Měřená fakta — nativní v15b.** Oba průchody začaly stejným běžně importovaným, transparentně připraveným v14 útesovým exportem: změněn pouze marker nové fyziologie ve stavu a checkpointu. DNA, zásoby, tělo, světy i nevyřešené cíle zůstaly. Poté pouze klávesnice, myš, skutečný editor a UI; žádné mutace nebo časové zkratky. To nejsou dvě nové fresh kampaně. [Audit původu a trace](evidence/reef-body/NATIVE_EVIDENCE_AUDIT.md).

| Endpoint: tři vyřešené útesové niky | v14 | v15b filtr | v15b vzdušný lovec |
| --- | ---: | ---: | ---: |
| Vitalita doručené kultury | 100 % | **94,64 %** | **68,41 %** |
| Generace při endpointu | 3 | 3 | 3 |
| Simulační Δ od exportu tick 8185 | 88,75 s | 100,38 s | 189,72 s |

[Exporty a přepočet](evidence/reef-body/MEASURED_COMPARISON.json). Časy zahrnují pohybové omyly, neobsahují pauzy/editor a nekončí až přechodem na souš. Baseline obnovila vlastní save o 17 tiků před referenčním exportem; nejde o přesný časově kontrolovaný experiment. Delší výsledek není důkaz kvalitnější hry.

Filtr zvolil hlubokou oporu. U plynu otevřel věnec a změnil klesající dech na růst; pro transport jej zavřel. Editor ukazuje cenu otevření **5,7 → 1,9 m/s**. Vzdušný lovec neuměl sníst vazbu, přivedl štítojema detritem a ustoupil před jeho příchodem. Vynesl kulturu přes plyn se zachovaným vlastním dechem, ale ztratil téměř třetinu její vitality. Čelist plašila konzumenty; skutečný lov a následný ústup umožnily dokončení horní pastvy. Ta ožila až po doručení prvního nákladu. Dodatečný pokus prokázal obtížný přímý sestup proudem a následný výstup bez Q; jeho ochrana prvního nákladu tím **není** doložena. Pak byl běžným editorem a G ověřen přechod na souš. [Filtr před/po](evidence/reef-body/filter-v15b/019.jpg), [vzdušný náklad](evidence/reef-body/air-v15b/038.jpg), [skutečná hostina](evidence/reef-body/air-v15b/047.jpg), [souš](evidence/reef-body/air-v15b/055-land.jpg). Trace a všechny chyby navigace jsou zachované.

**Automatizovaná regrese.** Finální v15c: **1114/1114 testů**, typecheck/build, **118/118** nezměněných uložených stavů, bitově shodný 3600tickový replay v14 včetně checkpointů. Nové testy ověřují kauzální vazby tělo/voda, skutečnou hostinu/proud, alternativu bez filtru, vyčerpání a save/recovery. Připravená 15případová sonda zároveň dokládá, že původní generalista s perfektním rychlým Q stále projde bez ztráty zdraví; žádný orgán není povinný. [Kompatibilita](evidence/reef-body/final-v15c-compatibility-verification.json), [sondy a jejich omezení](evidence/reef-body/v15b-probes/REPORT.md).

Oddělený GPU A/B v14/v15b: šest 20s vzorků na Apple M4/Metal při 1920×1080 medium, medián 16,7 ms a p95 17,6–18,6 ms, bez významné párové změny a bez zachycených browser chyb. Je to připravená scéna omezená 60Hz obnovováním, nikoli dlouhý soak nebo důkaz stejné výpočetní ceny. [Raw data a metodika](evidence/reef-body/performance-v14-v15b/README.md).

**Rozlišení verzí.** Oba průchody a GPU byly na v15b. V15c následně opravuje pouze nápovědu pro skutečně přítomné orgány a přidává čtyři regresní případy. Tato úprava prošla zvláštním [připraveným nativním UI ověřením](evidence/reef-body/v15c/ui-check/README.md) a [původním skill smoke](evidence/reef-body/v15c/skill-smoke/README.md); není vydávána za další úplný průchod. [Baseline archiv a spuštění](evidence/reef-body/v14-baseline/README.md), [finální manifest](evidence/reef-body/v15c/source-manifest.json). Staré linie si ponechávají stará pravidla; nové mají nový útes. Žádný push ani deploy.

**Subjektivní posouzení agenta.** Zlepšila se konkrétnost editorových voleb, význam místa výsadby a rozdíl ochrany těla/nákladu. Zhoršila se ovládací zátěž při sestupu, čelist komplikuje spolupráci a sdílený cooldown po jídle může stále odmítnout T během čerpání. Obraz věnce je čitelný, ale vyčištěná kapsa a význam dvou proudů stále příliš závisejí na HUD. [Obrazový posudek](evidence/reef-body/FINAL_VISUAL_REVIEW.md), [source review](evidence/reef-body/FINAL_SOURCE_REVIEW.md).

**Zbývající slabiny.** Oba běhy ponechaly jediný vstupní genom až do konce útesu; spontánní další experimentování není prokázané. Generalista zůstává životaschopný, všechny kombinace nejsou vyváženě ověřené. Chybí slepý lidský test, porozumění proudům bez vysvětlování a celá nová kampaň. Hypotéza je podpořena různými řešeními a náklady, pouze částečně obrazem; označit evoluci za hlavní zdroj zájmu každého hráče by předbíhalo důkazy. Starší kompletní kampaň v13a a její nesplněný cíl délky zůstávají níže jako historie.

**Historie před přepracováním útesu: cíl 45–90 minut zůstal nesplněný.** Poslední celá fresh kampaň v13a skončila po **9 min 6,55 s simulace**; následná v14 opravuje konkrétní potíže s rozpoznáním mateřských zdrojů, neúspěšnou péčí a hlášením zaniklého výhonku. Níže uvedené v11/v12a a starší iterace jsou historie. Původní benchmark výše se nepřepisuje.

### Předchozí měřená fakta · v13a → v14

Hlavní agent znovu dohrál od nové linie **Vela III / seed 8675309**, běžnými klávesami a myší v Chromium: **5 generací, 66 jídel, 0 lovů, 7 částí, 1 lucernička, všech 9 vztahů vyřešených, obnova krajiny**. Toxin byl použit obranně; nejde o zcela nenásilnou cestu. Žádný import, fixture, interní stavový dotaz, mutace ani časová zkratka před výhrou. Při hledání špatně čitelného terasového zdroje agent jednou přečetl souřadnice **vykresleného DOM minimapu**; tuto pomoc rozhraním výslovně odlišujeme od slepého lidského testu.

Přesný vydobytý checkpoint má **32 793 tiků / 546,55 s**. Mikrosvět 164,9333 s, útes 215,5167 s, souš 166,1 s. Běžný export až po výhře a uzavření trace přidal jeden sandbox tik; vnitřní checkpoint byl extrahován beze změny a přísně validován. **65 min 1,337 s session wall obsahuje pauzy, editor, nástroje a rozbor; není to délka lidského hraní.** Simulační čas zase neobsahuje rozhodování v pozastaveném editoru. 248 screenshotových/DOM pozorování, čtyři náhledy editoru, tři uzavřené trace a nula zachycených browser chyb. [Úplné hodnocení všech 14 oblastí](evidence/quality/campaign-v13a/ASSESSMENT.md), [měření a limity](evidence/quality/campaign-v13a/measurement.json), [hráčský log](evidence/quality/campaign-v13a/player-log-complete.json), [závěr](evidence/quality/campaign-v13a/248.jpg).

| Průchod | Způsob a výsledek | Simulační čas |
|---|---|---:|
| Původní optimalizovaný benchmark | Zrychlené kroky, dokončen | 4:03,083 |
| v6b / Neris / 20260913 | Nativní úplný, symbiotická cesta | 9:20,617 |
| v11 / Vela II / 8675309 | Nativní úplný, pozdější čelist a obnova | 8:57,000 |
| **v13a / Vela III / 8675309** | **Nativní úplný, filtr/toxin → nektar, žádný lov** | **9:06,550** |

Stejný seed v11 a v13a dovoluje porovnat konkrétní situace; odlišná anatomie, trasa a znalost operátora brání kauzálnímu výkladu rozdílu 9,55 s. Žádný údaj nedokládá 45–90 minut nebo dobrovolnou retenci člověka.

Nová linie má **přenos živých kořenů žroutem**: skutečný okus odebere mateřské tkáni část vitality, nosič ji při dalším skutečném jídle dál od původu přemístí do malého vodního výhonku. Lov nosiče tuto možnost zruší, další okus může výhonek zničit. Nejde o automatický bod postupu ani další povinnou kvótu. Ve výslovně připravené nativní scéně nový výhonek jako jediný dostupný mokrý zdroj vyléčil prachokřídlíka 76→91%; mateřská i přenesená tkáň dohromady zachovaly 100. [Kauzální připravený důkaz a omezení](evidence/quality/root-dispersal-v13/NATIVE_ASSESSMENT.md).

Ve fresh kampani vznikl výhonek skutečným jídlem u hráčovy nabídky (snímek 196), ale **do konce nepřežil**. Přesný okamžik a útočník nejsou zaznamenány. Léčba závěrečného průvodu 72→88→99% při 243–245 patří přeživšímu mateřskému sadu, nikoli dítěti. [Nezávislá kontrola výsledného stavu](evidence/quality/campaign-v13a/ROOT_DISPERSAL_REVIEW.md). Ceny, rychlost zdrojů, délka mapy a podmínky výhry se nenafukovaly.

Finální v14 prošla **1 036/1 036 testy, typecheckem a produkčním buildem**. Nezávislý audit **113/113 save** zachoval předchozích 111 bitově a nové vydobyté světy/checkpointy beze změny. JS `index-CGooEBrS.js`, SHA256 `316b79a13389ff7a3a93ff77c217a33208c190248932a7898bec7bfeedea73f4`, lokální freeze 4204. [Manifest](evidence/quality/final-clarity-v14/source-manifest.json), [testy](evidence/quality/final-clarity-v14/tests.json), [nezávislý review](evidence/quality/final-clarity-v14/INDEPENDENT_REVIEW.md). Příslušný produkční skill smoke s původním klientem skončil exit 0, bez chyby; používá vlastní časový shim a je vyloučen z důkazu délky. [Smoke a rozsah](evidence/quality/final-clarity-v14/skill-smoke/README.md).

Po fresh kampani agent nativně ověřil poslední opravy v 16 pozorováních dvou přiznaných připravených scén: označení matky 8 m od těla neslibuje odběr, T mimo dosah stále vezme běžné sousto, přiblížení umožní skutečné pozorování a kulturu; neúspěšné sázení 5,3 m výslovně ponechá vzorek a následné přiblížení jej opravdu zasadí. Opakované T během dokončované akce ukáže odmítnutí. Samostatné T zůstává viditelné vedle vybraného cíle pro mezerník. 1366×768 i 1536×960 byly prohlédnuty. **To je cílená kontrola v14, nikoli další úplná fresh kampaň.** [Nativní důkazy a přiznané chybné pokusy](evidence/quality/final-clarity-v14/README.md).

**Výkon:** v13a, Chromium 151 / Apple M4 / ANGLE Metal, 1920×1080 medium, 3 × 20 s se skutečným živým výhonkem: medián 16,7 ms, p95 18,6–18,7 ms, maxima 18,8 ms, přibližně 60 FPS, nula chyb. [Raw měření](evidence/quality/root-dispersal-v13/performance-v13a/README.md). Poslední v14 má samostatný 20,0166 s vzorek s novým označením zdroje: medián 16,7 ms, p95 18,6 ms, 59,35 FPS, ale také **jeden zachovaný 233,4 ms zásek neznámé příčiny**. Nula zachycených chyb; nejde o příslib bezchybných 60 FPS, nejhorší možnou scénu nebo dlouhý soak. [Poslední GPU důkaz](evidence/quality/final-clarity-v14/performance/README.md).

### Subjektivní syntéza a zbývající slabiny

Po vlastním hraní a nezávislých kritikách má největší hráčskou hodnotu sled skutečných následků: filtr otevře baldachýn, nabídka změní příchod konzumenta, bezpečné jídlo otevře čistý přítok; na souši funguje návrat přes vlastní obnovenou vodu. Nová přenesená tkáň přidává důvod zachovat škodícího tvora, ale v této kampani její výhoda zanikla před využitím. Konkrétní změna těla z plavce na nektarového chodce je smysluplná; neomezeně pohodlný pozdní rozpočet ji však nevynucuje.

První kontakt je aktivní, editor dává viditelný výsledek a tři etapy mění pohyb i prostředí. Přetrvává opakující se kostra tří nik, příliš snadný dech/energie na známé trase, mnohé korekce kolizí, opakované stromy a sloupy, řidší souš a obtížně čitelné malé ekologické změny mimo záběr. Poslední popisky a odmítnutí snižují frustraci, nepřidávají chybějící dobrodružství. Úplná kritika prvních 60 sekund, ovládání, vizuálu, editoru, tempa, evoluce, průzkumu, ekologie, výzvy, motivace, překvapení, replayability, rozdílů etap a celkové komerční soudržnosti je v [aktuálním posudku](evidence/quality/campaign-v13a/ASSESSMENT.md).

Další lokální zásahy do stejných devíti situací nyní mají **klesající doložený hráčský přínos**: ani nové propojení po více celých kampaních významně nerozšířilo jejich sled či délku. Tato iterace proto končí s funkčními opravami a doloženými limity; **kvalitativní cíl se neoznačuje za splněný a nejde o technický blocker**. Pro 45–90 minut chybí podstatně bohatší autorské situace a jejich návaznost, následované čerstvým lidským hraním. Grind, čekání, dražší orgány či kopie přenosů nejsou náhradou. Safari, mobilní ovládání, nezávislý poslech, nová dlouhodobá retence a nový dlouhý soak poslední revize nejsou tímto kolem ověřené.

### Historická úplná kampaň a zpětná vazba · v11 → v12a

**Měřená fakta.** Vela II, seed 8675309, byla dohrána skutečnými vstupy v Chromium na přesném freeze v11. Před koncem nebyl použit import, fixture, interní dotaz na stav, přepis stavu ani zrychlování času. Přesný vydobytý checkpoint: **32 220 tiků = 537 s**, sedm generací, 46 jídel, dva lovy, devět částí, jedna lucernička a všech devět míst vyřešených. Divoký prachokřídlík fyzicky došel k poslednímu porostu a jedl; živé prameny vybraly závěr obnovy. Mikrosvět 184,2167 s, útesy 197,5667 s, souš 155,2167 s. 256 obrazových/DOM pozorování, tři uzavřené trace a nula zachycených browser chyb. [Přesná metodika, srovnání a kritika všech 14 oblastí](evidence/quality/campaign-v11/ASSESSMENT.md), [strojové měření](evidence/quality/campaign-v11/measurement.json), [hráčský log](evidence/quality/campaign-v11/player-log-complete.json), [screenshot závěru](evidence/quality/campaign-v11/ending.png).

| Srovnávaný průchod | Výsledek | Simulační čas |
|---|---|---:|
| Původní optimalizovaný benchmark | Dokončen zrychlenými kroky | 4:03,083 |
| Předchozí úplný v6b, Neris/20260913 | Dokončen, symbiotická strategie | 9:20,617 |
| v10b, Vela/8675309 | Přerušen v útesu | 8:00,517 |
| **Nový úplný v11, Vela II/8675309** | **Dokončen, obnova a divoký nosič** | **8:57,000** |

Rozdíly seedů, tras a zkušenosti neumožňují kauzální srovnání délky. Stejný seed v10b se před opravou pozvánek nepodařilo dokončit. **91 min 9,643 s wall nové session obsahuje pauzy, editor, nástroje a analýzu; není to lidská délka hraní.** Simulační čas naopak neobsahuje rozhodování v pozastaveném editoru. Ani jedna veličina nedokládá 45–90 minut nebo dobrovolnou retenci. Běžný export vznikl po ukončení kampaně a trace, přidal dva sandbox tiky; nezměněný vnitřní checkpoint byl odděleně validován.

**Subjektivní hodnocení hlavního agenta po syntéze nezávislých kritik.** Největší přínos má návaznost rozhodnutí: otevření baldachýnu filtrem, selhání horní pastvy, přemístění do krytu, lov čelistí a následný strach konzumentů, nové sousto a ústup, skutečná bezpečná hostina a otevření živého přítoku. Na souši se vyplatila dříve obnovená terasa: zdraví doprovázeného nosiče při průchodu její vodou vzrostlo z 79 na 95 %. To jsou související hráčské situace. Opakované chyby dosahu a hledání cíle nejsou kvalitní obsah. Hra nyní působí jako soudržnější krátké ekologické dobrodružství; důkaz přesvědčivé komerční délky z toho neplyne.

**Opravy po dohrání.** Souš již neradí C/Q ani útěk mezi korály. Pokyny odpovídají vodě, stínu a kmenům. Neúspěšný útok vysvětluje kontakt skutečné čelisti; kožní kloub spojuje obě kusadla s tělem. Zastaralé chyby útoku nepřetrvávají přes nový cíl a neduplikují živý HUD, zatímco zprávy o zásahu a změnách světa zůstávají. Pravidla skusu, uložení, determinismus, ceny i rychlosti zůstávají. Připravená nativní kontrola prošla ke krytému kořeni běžným WASD/T, zobrazila správné varování při skutečném zásahu a v poslední revizi potvrdila zmizení starého hlášení s ponechanou zprávou o zranění. To jsou cílené kontroly, **nikoli další čerstvá kampaň**. [Obrazy/trace v12](evidence/quality/final-feedback-v12/), [poslední nativní výsledek](evidence/quality/final-feedback-v12a/native-result.json).

Finální freeze v12a prošel **977/977 testy a produkčním buildem včetně typechecku**. JS `index-KnlMsiwJ.js`, SHA256 `12c3e1c0cc609cd1e0c8ef13ee49ff79c6c62f2c8cdee83d396baa2a37f7a340`; stejný hash byl ověřen na lokálním HTTP serveru 4201. [Manifest](evidence/quality/final-feedback-v12a/source-manifest.json), [testy](evidence/quality/final-feedback-v12a/tests.json). Předchozí v11 a v12 zůstávají zmrazené pro reprodukci.

Nezávislý audit poslední revize prošel **109/109 uloženými stavy**. Předchozích 106 vstupů zůstalo bitově shodných, přibyly tři výslovně připravené vizuální scény. Světy, checkpointy a read-only projekce zůstávají beze změn; všechny zdrojové, testové, konfigurační a buildové hashe souhlasí s manifestem. Poslední review nenašlo další akční regresi. [Review a meze](evidence/quality/final-feedback-v12a/REVIEW.md), [výsledky auditu](evidence/quality/final-feedback-v12a/corpus-compatibility.json).

**Výkon finálního runtime.** Chromium 151.0.7922.34, Apple M4/ANGLE Metal, 1920×1080, medium: tři 20,016s vzorky mají medián 16,7 ms, p95 po etapách 18,0 / 18,3 / 17,9 ms, maxima 18,8 / 18,7 / 18,7 ms, přibližně 60 FPS a nula zachycených chyb. Servírovaný JS souhlasí s finálním manifestem. Stejné připravené scény jako v11 nemají čelist; nepokrývají tedy přímo náklad nového kloubu, který byl kontrolován v editoru a geometrických testech. Nejde o nejhorší možnou konfiguraci, dlouhodobý soak ani hráčskou kampaň. Samostatný nezměněný skill smoke skončil exit0, tick836, bez chybového souboru; jeho časový shim je z důkazů délky vyloučen. [Surová měření, screenshoty, metodika a limity](evidence/quality/final-feedback-v12a/performance/README.md).

**Zbývající slabiny a rozhodnutí o dalším rozsahu.** Kampaň je krátká, trojice nik se opakuje, dýchání je při známé trase slabým tlakem a pozdní rozpočet umožňuje pohodlnou univerzální stavbu. Záměr AI a přesný 3D dosah stále vyžadují více čtení než žádoucí. Pravidelné tvary střechy, opakované rostliny a řidší souš omezují vizuální kvalitu. Nezávislé lidské hraní ani návratnost nebyly změřeny. Po opakovaných kampaních, opravě skutečného blokování a odmítnutí málo přínosného prototypu mají další lokální prodlužovací zásahy jasně klesající hráčský přínos. Zastavuje se tento iterativní quality pass; **nikoli tvrzením, že je splněn cíl 45–90 minut**. Ten vyžaduje výrazně bohatší autorskou posloupnost situací a ověření na nových lidských hráčích. Náhradou nebudou dražší orgány, pomalejší zdroje, čekání ani další kopie přenosů.

### Přijaté opravy v11 · historie před úplným hraním

**Měřená fakta.** Zmrazené sestavení na4199 prošlo927/927testy a produkčním buildem včetně typechecku. JS `index-DwiJ5yLs.js`, SHA256 `17c50d37446977efcb5e6f4be3180845bd7d05b2b090bab8566a544e71cd427f`. [Manifest](evidence/quality/invitations-v11/source-manifest.json), [celý suite](evidence/quality/invitations-v11/tests.json). Nezávislý audit100historických save zachoval světy a checkpointy, obnovil alias aktivního světa a ověřil read-only projekce;0selhání, žádná odchylka zdrojů od manifestu. [Výsledky auditu](evidence/quality/invitations-v11/corpus-compatibility.json).

Novější kompatibilní místní nabídka v journey3 nově přebírá pozornost od starší. Po vyčerpání marker brání návratu ke staré prioritě a dovoluje příchod k živému kořeni. Původní potrava zůstává ve světě, skutečné jídlo a nebezpečí platí; journey2 se nemění. Obyčejné zdroje před kamerou používají fade s korektním obnovením a uvolněním materiálů. Zachycená regrese výběru byla nejprve reprodukována: průhledný přední krystal propouštěl klik k zadnímu. Oprava zachovává jeho identitu i neprůhledné překážky. Opraveny také tři zavádějící popisy potravy/plachtovce.

**Subjektivní hodnocení a zbývající riziko.** Změny míří na doložené selhání předchozího hraní, nikoli na rozsah. Velká kultura stále představuje více skutečných porcí a může držet konzumenta u nabídky; samotný úspěch testu není důkaz dobrého tempa. Následné nativní kontroly a úplný fresh průchod jsou dokončené a popsané výše. 45–90 minut ani dobrovolná lidská retence nejsou tímto sestavením doloženy.

### Fresh v10b odhalil neúspěšné lákání · historie před opravou

**Měřená fakta.** Nová Vela/seed8675309 byla na zmrazené4198 hrána pouze běžným ovládáním, myší a editorem. Bez importů, interních dotazů či časových zkratek. Pokus byl **přerušen v útesu, nikoli dohrán**:226obrazových/DOM pozorování,7generací,2lovy a480,5167simulačních sekund (mikrosvět194,2833s; útes286,2333s). Obyčejný následný export mátick28831 a nevyřešený baldachýn. Dva trace jsou uzavřené;0zachycených browser chyb.64,7minut wall obsahuje pauzy a analýzu. [Metodika,14oblastí kritiky a meze](evidence/quality/campaign-v10b/ASSESSMENT.md), [úplný log](evidence/quality/campaign-v10b/player-log-abandoned.json).

Tento freeze prošel906/906testy,typecheckem a buildem; JS index-BX5vLm00.js, SHA256 e12b02e7e20adb4f7e00dbe1fac6560705efe0b5746385240675fbf46fae0b25. [Přesný manifest](evidence/quality/crossing-v10/source-manifest-v10b.json). Nativní kontakt u pilíře se po opravě skutečně uvolnil při A+Q a následném W;5pozorování a uzavřený contact trace jsou v crossing-v10. Oddělený výkonový běh předchozí4197:3×20s,Chromium151/AppleM4/Metal,1920×1080medium,medián16,7ms,p9518,5/18/18ms, přibližně60FPS; mikro obsahuje133,4ms maximum.0chyb. [Výkonová metodika](evidence/quality/crossing-v10/performance/README.md). Nezávislý audit98save uchoval staré světy a checkpointy; nejde o výkon či dohrání pozdějšího kódu.

**Subjektivní hodnocení agenta.** Ostny, čelist, krunýř, filtr, žábry a komory nyní vyvolaly konkrétní přestavby podle situace. Hledání skutečných mezer, přesné hloubky pro T a zejména přivádění zahnaného plachtovce však zabralo nepřiměřenou pozornost. Po skutečném jídle se vracel k jiné potravě; opakované přenášení soust tento problém neřešilo spolehlivě. Tento delší částečný průchod nepovažuji za úspěšné rozšíření obsahu. Opaque krystal v obrazu138 navíc zcela překryl hráčův organismus.

**Zbývající slabiny a další ověření.** Zdrojová oprava nových pozvánek a fade zdrojů se ověřuje samostatně; nebyla připsána tomuto zmrazenému běhu. Nové plné fresh dohrání stále chybí, poslední dokončené je v6b.45–90min kvalitního prvního hraní zůstává nesplněno a lidská retence neověřena. Závěr se nebude odvozovat z počtu testů ani minut čekání.

### Autorská iterace v9–v10 · historie před tímto pokusem

**Měřená fakta.** Baldachýn nyní tvoří skutečnou posloupnost: jedlá vazba a konečný strop, stoupající mateřský porost, dvě výškově odlišné pastvy a čistící proud až po skutečné bezpečné hostině. Připravené nativní hraní na freeze4194 dokončilo spodní pastvu; v9c na4196 dokončilo cestu přes divokého štítojema a horní pastvu. Štítojem otevřel vazbu bez hráčova skusu v čase50,6333s. Následný běžný export má94,4s/tick5664 a skutečně vyřešenou horní pastvu. Výchozí import druhého pokusu měl39,8833s; nejde o novou kampaň ani přesné měření délky tohoto úkolu. Záznam v9c obsahuje30pozorování, screenshoty, dva uzavřené trace a0pageerrors. Od pozorování24 byl směr hledání hejna podpořen diagnózou běžného exportu; nezaměňovat tento průchod za hraní bez diagnostické pomoci. [Metodika a kritika](evidence/quality/canopy-v9/PLAYER_ASSESSMENT.md), [úplný log](evidence/quality/canopy-v9/native-ecology-complete-log.json).

Sytost predátora nyní mění lov, útěk konzumentů i bezpečnost hostiny. Rozmnožení vyžaduje skutečné jídlo místo pravidelného doplnění populace. Šest mateřských porostů opravuje místní vyhynutí za skutečnou porci; nový tvor musí fyzicky dojít k jídlu. Testy zahrnují kauzální opačné scénáře a save/load. Nativní hraní současně odhalilo skutečné zastavení klouzání na straně pilíře. Reprodukce s původními vstupy dávala0m, oprava20,0655m při A+Q po2,3s, bez průniku nad numerickou toleranci. [Původní i opravená trajektorie](evidence/quality/canopy-v9/OBSTACLE_CONTACT_DIAGNOSIS.md).

Zmrazená v10 na4197 prošla **883/883 testy, typecheckem a produkčním buildem**. JS `index-DWOIRd8z.js`, SHA256 `820554bb2613f154d52df866601ea4fd69dad1209edcc72fb4e8008dc57c8d77`; [manifest](evidence/quality/crossing-v10/source-manifest.json). Obsahuje také náhled skutečného místa E a vazbu jen na skutečně přicházejícího konzumenta, opravené navádění v baldachýnu, krytou západní a otevřenou východní cestu na terase a individuálně zapamatované místo, kde korunoplaz skutečně snědl maso. Pole paměti je nepovinné, přísně validované jen pro nové suchozemské vzpomínky; starší světy se při importu nepřestavují. Nabídka sama ani narození potomka nepřenáší tuto zkušenost.

**Subjektivní hodnocení agenta.** Otevření střechy jiným druhem a následné odvedení lovce do výšky jsou výraznější ekologické situace než samotné přenesení vzorku. V nativním hraní však příliš mnoho pozornosti spotřebovalo hledání konkrétního tvora a špatná rada pod okrajem střechy. v10 tyto nedostatky řeší; úspěšné testy její hráčský přínos samy nedokazují.

**Zbývající slabiny a neověřené body.** Dosud chybí nový celý fresh průchod po v9/v10 a jeho srovnání. Nové cesty a paměť lovců na terase potřebují nativní posouzení; samy nevysvětlují posun z9min na45–90min. Silueta střechy působí příliš pravidelně. Nezávislá lidská retence zůstává neověřená. Tato iterace není označená za splnění kvalitativního cíle.

Naměřený výsledek:6generací,75jídel,0lovů,obnova. Obrazovka závěru uvádí7min simulačního času;386.972s sledovaných řídicích úseků je pouze dolní mez, protože nezahrnuje editor a některé neodměřené prodlevy. Subjektivní hodnocení: málo nutných rozhodnutí, opakované kvóty a nejasné zaměření.45–90min zůstává návrhovým cílem, nikoli ověřeným výsledkem.

### Dokončené hraní první kvalitativní iterace (v3)

**Naměřená fakta.** Nová linie seed481516 byla dohrána v Chromium152 přes skutečné klávesy, myš a editor, bez přepisování stavu, importů, fixtures či zrychlení času. Po celou kampaň běžel zmrazený produkční build `index-CFhfvx7n.js`; jeho zdrojový manifest je v `evidence/quality/campaign-v3/source-manifest.json`. Výsledek:4generace,72jídel,0lovů,2prachokřídlíci a symbiotická migrace. Závěr stále uvádí7min simulačního času. Součet157zaznamenaných interakcí obsahuje363.252s skutečně měřených řídicích úseků (dolní mez; nezahrnuje editor a všechny prodlevy). Přibližně43min od prvního záznamu do následného souhrnu obsahuje pauzy a analýzu agenta a **není délkou lidského hraní**. Zachyceno0browser chyb.

Úplné důkazy: [log a metodika](evidence/quality/campaign-v3-run2/player-log.json), tři navazující trace `01-microworld.trace.zip`, `02-reef.trace.zip`, `03-land-and-ending.trace.zip` ve stejném adresáři; screenshoty všech etap a editorů, [skutečný závěr](evidence/quality/campaign-v3-run2/157.png) a `completed-player-export.json` exportovaný následně normálním UI. Pokus o G u břehu v logu není úspěšným přechodem; opravený popis odlišuje neúspěšný pokus od následující skutečné cesty k průchodu.

**Subjektivní hodnocení hlavního agenta.** Zachycení pohybující se kolonie ve víru a neúspěšná ochrana teras byly výraznější než původní kvóty jídel a generací. Přenosy, živé proudy, skutečné cesty konzumentů, podpůrná voda a prostorové útesy dávají světu více souvislostí. Editor dovolil pojmenovat a opakovaně rozvinout stejnou linii. To však dosud nedokazuje hru, ke které by se člověk dobrovolně vracel45–90min.

**Zbývající slabiny.** Délka se měřitelně neposunula k cíli. Několik porostů se vyřeší samotným zasazením; pozdější rozpočet umožnil univerzální13orgánové tělo. Žábry při celé zaznamenané podvodní cestě udržely100kyslíku. Na souši byla vláha většinou plná, dvojice partnerů umožnila velmi krátkou alternativu a nabídnuté jídlo neodvedlo žrouty z terasy. Kvalitativní cíl zůstává nesplněn; další iterace se soustředí na tyto příčiny, nikoli na nafouknutí cen nebo čekání.

**Výkon této konkrétní verze.** Oddělené připravené scény na Apple M4/ANGLE Metal, Chromium151.0.7922.34,1920×1080,střední kvalita:20s v každé etapě, medián16.7ms, p9517.2/17.2/17.1ms; celkově60/59.85/60FPS,0zachycených chyb. V útesu zůstává zaznamenané maximum50ms. [Metodika, surová měření a omezení](evidence/quality/current-performance/gpu-metal/SUMMARY.md). Výkonový fixture není hráčský průchod ani důkaz dlouhodobé stability paměti.

### Druhý úplný hráčský průchod (v4, lovecká cesta)

**Naměřená fakta.** Hlavní agent dohrál novou linii Neris,seed20260913, v Chromium152.0.7977.83 na zmrazeném produkčním buildu `index-C0KmxCqz.js`. Použil skutečné ovládání a editor, bez importů, fixtures, čtení interního stavu či časových zkratek. [Závěr](evidence/quality/campaign-v4/130.png):4generace,41jídel,15lovů,rovnováha potravního řetězce,7min na simulačních hodinách.130zaznamenaných interakcí obsahuje348.581s měřených řídicích úseků; jde o dolní mez, ne celou délku lidského hraní.0zachycených browser chyb. Následný normální UI export obsahuje393.067simulačních sekund včetně krátké práce po závěru.

Kompletní [metodika, srovnání a slabiny](evidence/quality/campaign-v4/ASSESSMENT.md), [hráčský log](evidence/quality/campaign-v4/player-log-completed.json), source manifest, screenshoty a tři navazující trace jsou v `evidence/quality/campaign-v4/`. Export `completed-player-export.json` vznikl normálním UI. Popisky neúspěšných pokusů neslouží jako důkaz úspěchu; rozhoduje zaznamenaný HUD a obraz.

**Subjektivní hodnocení.** Obcházení smíšené skupiny kvůli selektivnímu lovu, svislý přístup ke kořisti a průchod nad korálem přidaly skutečné rozhodování. Vír zůstává nejsilnějším fyzickým setkáním. Lov však stále téměř neohrožuje hráče a závěrečný přenos je převážně chůze.

**Zbývající slabiny.** Oba nové průchody stále ukazují7min simulačního času. Rozdílné seedy a strategie neumožňují přesné srovnání rychlosti; žádné měření neprokazuje45–90min první lidský průchod. Krátký ponor s žábrami nevyžadoval změnu těla, zásoba DNA dovolila univerzální stavbu a vláha na souši téměř neklesala. Cíl zůstává nesplněn.

**Opravy po tomto průchodu.** Pozdější samostatné evidence dokládají opravu ztráty focusu/kliknutí v editoru ([skutečné UI kroky](evidence/quality/editor-focus/REPORT.md)), rozmístění editorových ovladačů ve třech velikostech ([připravené scény](evidence/quality/editor-layout-v4/REPORT.md)) a čitelné obrysy kolizí při průhledných překážkách ([připravené scény a limity](evidence/quality/obstacle-contours/REPORT.md)). Tyto pozdější buildy nejsou vydávány za build dohraný ve v4. Živá podpora pramenů a záměrné zaměření kořisti procházejí další integrací a hraním.

### Živá opora a fyzický příchod do domova (v5b, úplný hráčský průchod)

**Naměřená fakta.** Aktuální zmrazený build `index-B1teaKua.js` / `index-BlarZXFz.css` je na lokálním portu4186; manifest je `evidence/quality/campaign-v5b/source-manifest.json`. Typecheck a produkční build prošly, stejně jako **556/556 testů** v `evidence/quality/v5b-full-tests.json`. Předchozí neúspěšný běh555/556 je zachován. Jeho jediná chyba byla zkoumána na48 600krocích konzumentů: radiální kolize prodloužila krok nejvýše o6.489µm. Test nyní připouští10µm korekce a zároveň přísně kontroluje nezvýšenou rychlost; [diagnóza](evidence/quality/hunter-tracking/movement-diagnosis.json) zachovává přesné rekonstrukce.

Historické poznání a DNA zůstávají, ale pramen se opírá o skutečně živé kořeny nebo uvolněný mateřský zdroj s původními konzumenty. Noví hladoví žrouti mohou oporu znovu ohrozit. Poslední zasazení už samo nezakončí novou kampaň: divoký prachokřídlík musí fyzicky dojít k porostu a nasytit se. Nese se jako běžný uložený NPC, používá skutečnou navigaci, strach, potravu a zdraví. Vodu může získat u živých pramenů nebo sdílením zásobníku s aktivním recyklačním partnerem; stín zastavuje vysychání. Vymřelé nosiče obnoví explicitní akce u jižní matky bez čekání na náhodné narození. Testy ověřují také příchod kolem překážky, nové zasazení bez dvojí odměny a ukládání uprostřed následování i útěku.

Lovec při přípravě zohlední předvídatelný pohyb a posledních0.3s viditelně uzamkne směr. Vlastní výpad už nezatáčí; kryt, pozdní boční úhyb, návnada a protiútok zůstávají použitelné. Záměrný výběr cíle mezerníku je doložen samostatnými [čtyřmi skutečnými browser scénáři](evidence/quality/target-selection/CHECKS.md); samotné stisknutí po smrti cíle už nezmění vybraného tvora na další jídlo či oběť.

**Naměřený úplný průchod.** Hlavní agent odehrál novou linii Neris, seed20260913, v Chromium152.0.7977.83 při1536×960, na tomto jediném zmrazeném buildu. Až do výhry používal pouze běžné klávesy, myš, editor a informace dostupné v UI; žádné importy, přepisování světa, čtení diagnostických souřadnic ani zrychlení času. Výherní checkpoint má tick28352: **472.533s / 7min52.533s simulačního času**,4generace,20jídel,21lovů,8orgánů,0navázaných partnerů a konec potravní rovnováhy. HUD doložil průvod tří divokých prachokřídlíků; dokončení vyžadovalo skutečnou hostinu alespoň jednoho z nich v novém domově. Závěrečný panel ukazuje zaokrouhlených8min. Oproti výhernímu checkpointu v4 (393.017s) jde o79.517s navíc, přibližně20.2%. Znalost hry, jiné momentální trasy a agentovy analytické pauzy omezují srovnání; nejde o nezávislé první hraní člověka.

Řídicí úseky do položky202 obsahují420.434s skutečně držených kláves a1.004s zaznamenaného pozorování bez kláves. Chybné pokusy2/3 při pauze jsou vyloučeny. Tyto součty nezahrnují celý čas editoru a prodlevy; jsou dolní mez, nikoli celkový lidský čas. Zachyceno0browser chyb. Čtyři uzavřené části trace, screenshoty a log jsou v `evidence/quality/campaign-v5b/`. Útesový trace byl předčasně rozdělen při neúspěšném pokusu o odchod; skutečná adaptace a přechod pokračují v `02b-shore-adaptation.trace.zip`.

**Oprava interpretace důkazu.** Výhra nastala při návratu k terasám na konci položky202, když žrout opustil ohrožovaný mateřský zdroj. Text HUD odebraný před screenshotem už neodpovídal následujícímu výhernímu DOM. Následný příliš široký selektor pomocného ovládání `/Pokračovat/` klikl na skutečné tlačítko `data-action="sandbox"`. Hlavní agent proto zprvu mylně hlásil chybějící konec. Trace prokazuje správně zobrazený závěr ještě před tímto kliknutím: [původní obraz z trace](evidence/quality/campaign-v5b/victory-from-trace.jpeg), přesné události v `victory-trace-extraction.json`. Položky203–215 jsou již sandbox a nejsou zahrnuté do měření kampaně. Soubory obsahující v názvu `completion-failure` zůstávají nezměněným historickým důkazem tohoto omylu; export s tick29389 vznikl až po sandboxových krocích. Nový pomocný ovladač používá přesné tlačítko pauzy a odmítá automaticky pokračovat z výhry. Herní vstup nebyl kvůli této chybné hypotéze měněn.

**Subjektivní hodnocení hlavního agenta.** Fyzický průvod, vynechání toxinu kvůli nosičům, obrana u pramene, odbočení pro vodu a návrat do znovu ohrožené niky jsou silnější než okamžité vítězství po zasazení ve v4. Souš vedla k výměně vodních částí; výsledné tělo mělo osm orgánů, což není konstrukční limit hry. Lov je díky záměrnému výběru lépe ovladatelný. Tyto konkrétní změny zvýšily hodnotu jednotlivých rozhodnutí; samotných79.5s navíc nepovažujeme za důkaz lepší zábavnosti.

**Zbývající slabiny.** Cíl45–90min je stále **nesplněný a lidsky neověřený**. Mikrosvět obsahoval příliš mnoho hledání skutečné spáry mezi kameny. Útesová cesta s žábrami měla kyslík97–100%; v souši zůstalo zdraví100% ve všech zachycených HUD. Střety jsou málo nebezpečné, opakované pronásledování žroutů může být údržba a střed krajiny je stále řídký. Tři etapy mají odlišnou fyziku a vazby, ale sdílejí snadno rozpoznatelnou tříbodovou strukturu. Nejbližší nosič se v HUD může měnit, což znesnadňuje sledování individuálního zdraví. Neexistuje důkaz dobrovolného45–90min hraní, retence ani lidské preference proti v4. Čitelnost průchodu, chybné historické kauzální texty a zobrazení živé opory se opravují až v následující revizi; nelze je zpětně přičítat tomuto průchodu.

**Výkon v5b.** Samostatné připravené scény na AppleM4/ANGLE Metal, Chromium151.0.7922.34,1920×1080,střední kvalita,DPR1:20.000/20.0166/20.000s,1200/1201/1200intervalů. Medián16.7ms ve všech etapách, p9518.605/18.6/18.6ms, maximum18.8ms; přibližně60FPS,0page/console chyb. Hash servírovaného buildu byl ověřen. [Provenience a surová měření](evidence/quality/performance-v5b/README.md). Jde o připravené scény, nikoli nejhorší případ průvodu, dlouhodobý soak nebo výkon všech počítačů. Oproti v3 je p95 vyšší o1.4–1.5ms; příčina nebyla izolovaně změřena.

### Následné opravy čitelnosti a příchodu (v5d)

**Naměřená fakta.** Zmrazený build `index-CRYJL2nr.js` na portu4188 prošel typecheckem, produkčním buildem a **579/579 testy ve37 souborech**. Nezávislá kontrola ověřila všech51 otisků zdrojů a servírovaný JavaScript. Hlavní agent provedl22 obrazových kontrol přes normální vstupy v Chromium152 při1536×960 a1280×650; zachyceno0page/console chyb. [Úplná metodika a meze](evidence/quality/final-v5d/REPORT.md), `browser-log.json`, uzavřený `browser-checks.trace.zip` a screenshoty jsou ve stejném adresáři. Tento běh obsahuje krátký nový start a poté připravené save; **není to další úplná nová kampaň**.

HUD, deník i G nyní sdílejí skutečnou připravenost průchodu: chybějící plíce/nohy i nezměněný horizontální dosah10m. Prohlížeč doložil odmítnutí v11m, přiblížení skutečným pohybem a úspěšný přechod. Na souši G vysvětluje skutečné automatické finále a deník ukazuje dvě alternativní cesty. Při zániku kořenů zůstává poznaná historie, ale zmizí živá spojnice a aktuální stav se změní. Živení recyklační partneři dále uklidňují nosiče i po zasazení; skutečný divoký tvor při připraveném testu došel, najedl se a spustil konec. Toxin nadále vyvolává útěk. Vybraný mrtvý cíl ukazuje jedinou zprávu bez duplicitního toastu. Výherní checkpoint skutečně získaný vev5b se normálně načetl i zde; pomocný ovladač jej tentokrát nezavřel.

**Subjektivní hodnocení.** Opravy odstraňují rozpory mezi příběhem, živým stavem a ovládáním. Připravený test nepotvrzuje lepší vyvážení ani delší hru. Nejnovější úplný hráčský průchod a GPU měření zůstávají výslovně v5b. Opakovaná struktura setkání, slabá výzva a nedostatečný důvod přestavovat tělo jsou závažnější než další kosmetické úpravy. Návrh přidat jen povinnou hostinu po stejném krátkém lovu byl odmítnut jako pravděpodobné pasivní čekání.

**Zbývající slabiny této revize.**45–90min není splněno; čas agentovy analýzy se nepřičítá k lidskému hraní. Textově náročný deník, opakovaná vegetace, obtížné sledování konkrétního nosiče a krátce zastaralý toast po přiblížení k průchodu zůstávají. Tehdejší diagnóza skusu byla dokončena až v následující revizi popsané níže. Klesající přínos drobného doladění není důkazem dosažení délky či lidské retence.

### Kontaktní lov a další úplná nová kampaň (v6b)

**Naměřená fakta.** Běžný skus už novým liniím neukončuje připravený výpad lovce a vyžaduje fyzický kontakt konkrétní čelisti. Poloha, velikost a párování čelistí určují kontakt; sosna nadále prodlužuje sběr potravy, nikoli útok. Toxin zůstává úmyslným prostředkem k odehnání. Původní rozsah/strach legacy linií je zachován. Oprava prošla19 cílenými testy, celkem598 testy a buildem; [nativní připravené souboje](evidence/quality/bite-contact/PLAYER_CHECKS.md) ukázaly zásah při stání, úspěšný úskok a skutečný protiútok.

Hlavní agent poté **dohrál celou novou kampaň** seed20260913 v Chromium152 pouze normálními klávesami, myší a editorem. Před závěrem nebyly použity importy, dotazy na interní stav, změny stavu ani časové zkratky. Neris:5generací,29jídel,4lovy,2sytí partneři,8instalovaných částí; symbiotický závěr. Přesný uložený checkpoint má33637tiků = **560,6167s, tedy9min20,617s**. Mikrosvět262,0333s, útes116,2333s, souš182,35s. Oproti v5b +88,0833s; jde o jinou strategii i tělo, nikoli kontrolovaný účinek jediné opravy. Původních243,0833s bylo měřeno zrychlenou automatizací a není první lidský průchod.

Ve [vyhodnocení všech14 požadovaných oblastí](evidence/quality/campaign-v6b/ASSESSMENT.md) jsou měření oddělena od úsudku. Důkazy zahrnují248 screenshotů/DOM záznamů, tři uzavřené trace etap a [skutečný závěr](evidence/quality/campaign-v6b/248.png); zachyceno0chyb. `measurement.json` obsahuje otisky a přesné časy. Teprve po zachycení výhry byl zvolen sandbox kvůli normálnímu UI exportu; tento oddělený trace a jeden dodatečný tik jsou výslovně doloženy. Celková92minutová session zahrnovala pauzy a analýzu: **není důkaz45–90min hraní**.

**Subjektivní hodnocení.** Nejlepší nová situace byla ztráta sadu, na kterou hráč odpověděl změnou strategie a získáním dvou symbiontů. Lov nyní lépe odpovídá podobě těla a dovoluje protiútok. Zúžení těla a výměna pohybových orgánů měly viditelný význam. Část delšího průchodu ale tvořily kolizní omyly a nejasný příchod nosičů; tyto sekundy nezapočítávám jako lepší obsah.

**Zbývající slabiny.** Útesovou trasu lze s žábrami vyřešit krátkým ponorem a snadným návratem horní vodou; vzorky v tomto průchodu zůstaly100%. Souš obsahuje mnoho prázdného přesunu. DNA stále dovoluje pohodlné kombinace, pronásledování jednoranových žroutů bývá údržba a struktura tří míst na etapu je předvídatelná. Skrytý populační vliv souhrnného počítadla úmrtí na obnovu žroutů zůstává předmětem návrhové kritiky; nebyl bez dalšího hraní přeladěn. Nevznikl důkaz dobrovolné retence, opakovaného hraní ani preference nezávislého člověka.

### Opravy odhalené posledním hraním (v7 / v7b)

**Naměřená fakta.** U skutečného stromu vedle severního domova se podařilo nezávisle reprodukovat navigační chybu: již dosažený vrchol obchvatu se znovu vybíral jako první krok nulové délky. Ze dvou fyzicky platných startů zůstal tvor900tiků na místě. Oprava odstraní takový duplicitní první krok v existující toleranci0,02m; nyní tvor skutečně obejde strom a sní kořenové sousto za194/224tiků. Dvě kontrolní trasy zůstaly stejně dlouhé. [Původní selhání, příčina a regrese](evidence/quality/final-routing/REVIEW.md) jsou zachované;5 nových testů ověřuje skutečné jídlo, kolize a deterministické pokračování uložené cesty.

Stejný připravený save v nativním Chromium na starém buildu stále čekal po8s pozorování; na opraveném po4s ukázal dosažený závěr. Srovnání není nová kampaň. Pevné překážky mikrosvěta mají obrys ve skutečné rovině pohybu a při zakrytí si ponechávají30% siluetu. Obrazové srovnání potvrdilo čitelnější hranici i průchodnost existující štěrbiny. Následný screenshot husté souše odhalil, že30% překrývajících se stromů zakrývá tělo; v7b proto ponechává v útesu/souši původních10%. [Nativní A/B, screenshoty, trace a rozsah ověření](evidence/quality/final-routing/PLAYER_CHECKS.md) jasně odlišují připravené scény od fresh průchodu. Finální v7b prošla **604/604 testy a produkčním buildem**. Save formát a genom zůstaly kompatibilní.

**Subjektivní rozhodnutí.** Odstranit zásek a zpřesnit obraz má větší hodnotu než zachovat delší čas kampaně. Další navyšování cen, čekání, povinné údržby nebo prázdných cest by zjištěný problém jen zakrylo. Přínos těchto drobných technických úprav už výrazně klesá; další zásadní posun vyžaduje silnější autorské situace a nezávislé hráčské ověření. Tento report nepřejmenovává technicky ověřenou krátkou hru na prokázaný45–90min komerční zážitek.

**Výkon přijaté v7b.** Chromium151/Apple M4/ANGLE Metal,1920×1080,střední kvalita,DPR1: tři připravené20s scény při normálním času a vstupu z klávesnice. Medián16,7ms ve všech etapách, p9518,6/18,7/18,6ms, maximum18,7/18,8/18,8ms, přibližně60FPS a0chyb. Každá scéna ověřila servírovaný `index-fJ15UMfB.js` proti SHA256344c1e386b06b668e50820957ba5323a0460a9226589208981dc5722375e24ac. [Surová data, screenshoty, metodika a omezení](evidence/quality/performance-v7b/README.md). Nejde o nový dlouhý soak, nejhorší možnou scénu ani důkaz zábavnosti; původní delší zátěžové důkazy zůstaly zachovány jako historické.

### Poslední návrhový pokus: vertikální loviště (v8, odmítnuto)

**Naměřená fakta.** Nezávislá návrhová kritika doporučila prověřit čistou horní cestu průduchem proti nižší cestě za skutečnými korály. Prototyp přesunul pouze existujícího lovce a jeho hlídku; počty tvorů, geometrie, kyslík, ceny i podmínky postupu zůstaly stejné. Root odehrál14 připravených nativních pozorování v Chromium152;0chyb, screenshoty a uzavřený trace. Stejný výstup k hladině a rovný návrat zůstaly průchozí: stará verze100%zdraví, nová jeden zásah na85%, vzorek i kyslík100%. Nižší západní manévr zachoval100%zdraví. Přímý diagonální výstup opět vyšel s jedním zásahem. [Přesné vstupy, obrázky, rozdíly a omezení](evidence/quality/reef-route-v8/PLAYER_ASSESSMENT.md).

**Subjektivní rozhodnutí hlavního agenta.** Pokus byl odmítnut i přes146 existujících a10 nových úspěšných testů. Kryt funguje fyzicky, ale snadná zkratka dál stojí jen drobnou ztrátu zdraví; nevzniká podstatná volba těla ani nový ekologický vztah. Nezávislé doporučení bylo syntetizováno a vyzkoušeno, nikoli automaticky přijato. Jeho záchrana vyšším poškozením či dosahem by přidala povinnou překážku bez doložené hráčské hodnoty.

**Předávaný stav a slabiny.** Produkce se vrátila přesně k přijaté v7b; všech84 otisků zdrojů/testů a znovu vytvořené i servírované assety se shodují s604-testovým manifestem. Experimentální kód/test je archivován odděleně. Poslední celá nová kampaň zůstává v6b9min20,617s. Výsledky ukazují nízký přínos pokračování v drobných lokálních úpravách; nepovažuji je za splnění45–90min cíle ani za důkaz, že nelze vytvořit lepší hru. Chybí zejména delší posloupnost nových rozhodnutí, silnější odlišení útesové evoluce a nezávislé první lidské hraní.

### Reprodukce původního browser ověření

Při běžícím `pnpm dev` spouštěj GPU testy postupně:

```sh
pnpm test:browser
pnpm test:fixtures
pnpm test:climate
pnpm test:soak
pnpm test:performance
```

Pro `pnpm test:production` nejprve vytvoř build a spusť `pnpm preview`. K otevření časové osy použij například `pnpm exec playwright show-trace evidence/campaign/campaign.trace.zip`. Velké trace a dočasné předchozí pokusy zůstávají lokálními důkazy; nejsou součástí automatického commitu ani deploye.
