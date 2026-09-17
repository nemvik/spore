# SP-002 — Editor tvora, ověření a meze

Ověření z 17. září 2026 navazuje na feature baseline `8252286`, která obsahuje všech patnáct původních pracovních změn uživatele včetně SP-001. Není odvozené ze samotného `4da58b6`. Úkoly 1–8 končí na `49d99ab`; Task 9 zpřístupňuje konstrukci v produkční souši a přidává veřejný browser průchod. Přesné SHA256 testovaných zdrojů jsou v [JSON výsledku](../../evidence/sp-002/browser/results.json); dokumentační commit nemění testovanou hru.

## Co hráč dostává

Genom v2 přidává 3–15 obratlů, kloubové řetězce nohou a paží, koncové sloty, více úst a kosmetický povrch. Tvar, cena, postoj, výkon, viditelný model a terénní pohyb používají společnou anatomii. Nové ovládání je dostupné u kolébky pouze na souši (etapa 2); v mikrosvětě a útesu zůstává dosavadní editor. Genom se dědí do pozdějších etap, jejich uzamčení tělesných úprav zůstává.

První konstrukční změna převádí jen oddělený návrh. Samotný výběr nemění historii; jeden tah nebo souvislá klávesová úprava je jedna transakce. Zrušení zachová instalovaný v1. Potvrzení validuje anatomii, obsazené vybavení a rozpočet. Zkouška používá vlastní hodiny, energii a cílový kontakt bez zásahu do kampaně. Skok Q a komunikace V mají hrany vstupu a cooldown; držení klávesy nevydává opakované akce. Hlas ani gesto neslibují vztah s druhem nebo sociální odměnu.

## Konstrukční matice

Všechny tři konstrukce začínají nezměněným připraveným `tests/fixtures/saves/won-current-coast.fixture.json` (seed 481516, naučené DNA 200, alokace 222, dostupné DNA 119). Import proběhl přes běžný panel uložených her. Těla vznikla kliky, klávesovými poli a tažením skutečných madel, nikoli vložením hotového genomu. Obsazené partnerské lůžko zůstalo instalované. Nebyl potřeba navýšený rozpočet.

| Konstrukce | Celková investice těla | DNA před → po | Skutečný úbytek DNA |
| --- | ---: | ---: | ---: |
| Dvounožec s kleštěmi | 165 | 119 → 57 | 62 |
| Čtyřnožec | 186 | 119 → 36 | 83 |
| Dlouhokrký tvor | 189 | 119 → 33 | 86 |

Cena v editoru je investice celého těla. Přestavba přerozděluje také stávající investici; hodnoty 165/186/189 nejsou částky nově odečtené z dostupných 119 DNA.

![Tři UI konstrukce ve společném měřítku](../../evidence/sp-002/browser/comparison.png)

Srovnání používá skutečnou vzdálenost kamery 17, FOV 40°, yaw 0,95, pitch 0,15 a viewport 1440×900. Nativní otáčení a kolečko byly kalibrovány read-only projekčním výpisem. Jde o stejně velké, nezvětšené výřezy 800×400; shodný posuvník zoomu při automatickém přizpůsobení sám o sobě společné měřítko nedokládá. [Detail kloubu, kleští a povrchu](../../evidence/sp-002/browser/joint-surface-detail.png) byl rovněž prohlédnut jako skutečný obrázek.

Na každé stavbě browser kontroluje přímý výběr páteře, kolena a konce, u dvounožce také lokte a ruky; symetrii; změnu obratle tažením a přesné undo/redo; změnu panelu během číselné transakce; pointercancel a blur rollback; 1440×900 i 1280×720; reduced motion; zásah terče, nedosažitelný terč, chůzi, skok, hlas a cooldown. Pointercancel a window blur jsou explicitně syntetické DOM události nad skutečně probíhajícím nativním tahem; nepředstírají test fyzického přepnutí okna. Nativní ovládání krajiny je samostatné a nepoužívá DEV čas.

## Ukládání, kampaň a výkon

Každé placené UI tělo prošlo exportem, importem, refreshem a načtením se shodným celým genomem, cenou i schopnostmi. Nativní řízení používá skutečný browser čas. Trasa míjí tři strany stromu 163 (střed 15, 9; poloměr 3,2 m); výsledky počítají skutečně přijatý pohyb a vzdálenost rotované anatomické obálky od kmene, nikoli pouhou přítomnost stromu ve světě. Číselné výsledky jsou v [browser souhrnu](../../evidence/sp-002/browser/results.json). Terénní snímky všech tří těl byly skutečně prohlédnuty.

| Tělo | Skutečně přijatý pohyb | Rozsah výšky | Nejmenší odstup obálky od stromu | Vzorky trasy |
| --- | ---: | ---: | ---: | ---: |
| Dvounožec | 66,23 m | 1,57 m | 1,51 m | 46 |
| Čtyřnožec | 68,48 m | 1,53 m | 1,65 m | 43 |
| Dlouhý krk | 66,49 m | 1,55 m | 1,96 m | 39 |

Konstrukce a jejich platby byly dokončeny přes veřejné UI; finální ověření je složené ze tří navazujících spuštění s uchovanými úspěšnými scénáři. První dokončilo dvounožce/čtyřnožce a odhalilo krátkou dobu pozorování skoku; druhé dokončilo dlouhý krk, srovnání a trasu dvounožce, ale timeout pointer kliknutí na save slot; třetí dokončilo zbytek terénu, hraniční savy, hrané pokračování a benchmark. Herní zdroje se mezi nimi nezměnily. Výsledný JSON má `passed:true`, `acceptanceComplete:true`, 0 chyb a skutečné app nastavení reduced motion ověřené pro všechna tři těla. Původní samotná emulace CSS preference se za tuto kontrolu nepovažuje.


Připravené mid-jump a near-death savy jsou offline kopie placeného UI dvounožce, mění pouze výšku/vertikální rychlost/zbývající časovače nebo životní hodnoty. Následuje běžný import, skutečné přistání či smrt a tlačítko obnovy. Ověřuje se zbývající cooldown, přesný export pozastaveného hráče, zachování v2 checkpointu a schopností. Chybný import ponechal existující slot funkční; zrušení nové v2 přestavby zachovalo instalovaný historický v1.

Hraná kampaň je samostatný důkaz: doložený checkpoint útesu `earned-reef-exit.save.json` (SHA256 `6d5e9b7257980ef8214399565f342323250d32d3d358f77e33ec95e39994d11d`, seed 8675309) vznikl skutečným hraním od historického vstupu, se všemi třemi kultivovanými lokalitami. Běžný import a G převedly generaci 3 na souš s 216 dostupnými / 374 naučenými DNA (alokace 396). U kolébky vznikla přes UI v2 páteř a paže s kleštěmi: investice **246**, nový úbytek **66 DNA**, zůstatek **150**, generace 4. Cíl odchodu byl 14 m; skutečně dosažená vzdálenost 12,65 m překročila 11m dosah kolébky. Hráč se vrátil přibližně na 1 m k potvrzení druhé, kosmetické úpravy: generace 5, stále 150 DNA. Nebylo přidáno DNA, přeskočena etapa ani použit DEV čas. [Původ a průchod](../../evidence/sp-002/browser/earned.json), [aktivní save pro pokračování](../../evidence/sp-002/browser/earned-active.save.json), [prohlédnutý snímek](../../evidence/sp-002/browser/earned-returned-v2.png). Přesný hash aktuálního saveu zachovává earned.json.

Výkon se měří odděleně: shodné pobřeží, seed, počáteční tick, NPC, překážky a zdroje; v1 kontrola a offline kopie tří skutečně UI vytvořených genomů s konzistentním rozpočtem. Viewport 1280×720, low, reduced motion vypnuto, 3s zahřátí a 20s skutečných neodfiltrovaných RAF intervalů na tělo; draw calls se vzorkují každých 30 snímků. Savy tohoto benchmarku nejsou další hranou kampaní. Výsledky a modelové profily jsou v [performance.json](../../evidence/sp-002/browser/performance.json).

První matice zůstává zachována celá v [performance-first.json](../../evidence/sp-002/browser/performance-first.json). V1 měl p50/p95 **183,3/216,7 ms**, dvounožec **183,4/233,3 ms** (+7,7 % p95), čtyřnožec **183,3/200,1 ms**, dlouhý krk **350,0/416,7 ms** (**+92,3 %**). Povinný profil při překročení 20 %: v1 52 meshů / 7 893 vrcholů, dvounožec 71 / 11 921, čtyřnožec a dlouhý krk shodně 75 / 12 347; každé v2 70 kolizních vzorků, 4 končetiny a 7 obratlů. Draw calls v pořadí těl: 556–566 / 584–589 / 589–592 / 592–594. Shodná topologie čtyřnožce a dlouhého krku **nevysvětluje** rozdíl časů. Výsledek se nevyřazuje ani nenahrazuje příznivějším opakováním.

První benchmark má časovou obálku 19:26:10–19:28:22 CEST dne 17. září (vytvoření vstupů až zápis výsledku; přesný interval vzorkování každého těla je v `raw.elapsed`). Každý import obnoví stránku a tedy výchozí kameru yaw 0 / pitch 0,55 / zoom 25; benchmark kamerou nehýbe. Jsou to nastavené hodnoty doložené zmrazeným zdrojem, nikoli dodatečně změřená poloha kamery. Neběžel jiný browser/GPU test; souběžná práce byla čtení a dokumentace. Neznámá zátěž hostitele ani software renderer nejsou dostatečné k určení příčiny rozdílu.

Druhá celá matice (19:45:07–19:47:20 CEST) používá **přesně shodné čtyři GameState objekty** jako první; původní vstupy i jejich hashe jsou zachovány v [porovnání běhů](../../evidence/sp-002/browser/performance-comparison.json). Opakování bylo vyvoláno uvedenými opravami harnessu a nevysvětlenou variabilitou.

| Tělo | Druhé p50 / p95 (ms) | Změna p95 proti v1 | Vzorkované draw calls |
| --- | ---: | ---: | ---: |
| V1 kontrola | 183,3 / 233,2 | — | 565–566 |
| Dvounožec | 183,3 / 216,7 | −7,1 % | 584–586 |
| Čtyřnožec | 216,6 / 250,0 | +7,2 % | 589–595 |
| Dlouhý krk | 250,0 / 283,4 | **+21,5 %** | 590–592 |

Dlouhý krk i v opakování překročil hranici 20 %. Počty meshů, vrcholů a kolizních vzorků byly znovu profilované a zůstaly shodné; příčina časového rozdílu z těchto dat určena není. Jde o explicitní výkonnostní omezení tohoto software prostředí a bod pro další profilování na hardwarové GPU, nikoli tvrzení o stabilním nebo univerzálním FPS.



## Regrese a reprodukce

Finální izolovaná unit sada po odstranění DEV gate: **112 souborů / 2 130 testů**, vše prošlo (66,39 s). Typecheck a nový produkční build skončily s exit 0. Vite upozorňuje na chunk větší než 500 kB: hlavní JS 1 053,72 kB (gzip 316,40 kB); limit nebyl zvýšen. První celý běh měl 2 128/2 130: chybějící inicializaci nových preview objektů v historickém prototype-only renderer testu a časový limit dlouhé terénní kontroly při souběhu se software browserem. Fixture byl doplněn bez změny původních assertions. Obě sady prošly samostatně 35/35, následně celá sada; timeout nebyl zvýšen. [Finální log](../../evidence/sp-002/task-9-final-unit.log), [cílená oprava](../../evidence/sp-002/task-9-focused-fixes.log), [build](../../evidence/sp-002/task-9-build.log).

Na zmrazených finálních zdrojích prošly postupně původní browser regrese: organismový editor **5/5**, body editor **5/5**, machine editor včetně přesného odečtu **62 jantaru** a reloadu, tribe **aliance + dobytí + 12 členů**. Všechny mají 0 chyb aplikace; organism/machine také 0 externích požadavků. Znovu porovnáno 107 zdrojových souborů bez změny. [Souhrn a jednotlivé výsledky](../../evidence/sp-002/regression/root-summary.json). Body/tribe zahrnují připravené DEV kroky; poslední šestisekundový nativní tribe smoke není výkonový benchmark. Označení „historical-v2“ v původním organismovém testu znamená verzi obálky saveu, nikoli nový genom v2. Tyto starší skripty nekolektují úplný seznam varování; nový script je odděluje od chyb.

Produkční preview sloužilo právě nový build: [původní production smoke](../../evidence/sp-002/regression/production/result.json) prošel s 0 chybami / externími požadavky. Navazující [produkční v2 smoke](../../evidence/sp-002/regression/production-v2/results.json) skutečně sestavil dvounožce přes UI, ověřil akce, zaplatil investici 165 (úbytek 62 DNA), export/import/refresh/load zachoval celý genom a schopnosti a `advanceTime` nebyl dostupný. Načtené `index-BqWhIUMJ.js` a `index-BMR095Xf.css` odpovídají [manifestu nového dist](../../evidence/sp-002/regression/production-build-manifest.json). Aplikační chyby 0. Poslední úprava harnessu pouze doplnila explicitní visible/enabled assertions před klávesovým načtením slotu a zpřesnila text původu odchodu na cíl 14 m / skutečnost nad 11 m; produkční smoke prověřil finální společný helper.

Prostředí: Linux, Node 24.15.0, připnuté TypeScript 5.9.2 / Three.js 0.180.0 / Vite 7.1.5 / Vitest 3.2.4 / Playwright 1.55.0, Chromium 140.0.7339.16 (build 1187). Před dlouhými běhy bylo volných přibližně 246 GiB. Browser práce běží postupně, trace je vypnutý. Chromium zde používá SwiftShader; jeho varování o software WebGL a ReadPixels jsou oddělena od chyb aplikace. Výsledky nejsou univerzální tvrzení o FPS nebo výkonu hardwarové grafiky.

```sh
node node_modules/vitest/vitest.mjs run --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
PLAYWRIGHT_BROWSERS_PATH=/tmp/lumavora-sp002-browsers \
  LUMAVORA_URL=http://127.0.0.1:5183 node scripts/creature-editor-browser.mjs
```

Alias je `pnpm test:creature-editor`. Přímé Node příkazy byly použity kvůli místní chybě databázového wrapperu pnpm; závislosti nebyly změněny. `CREATURE_EDITOR_OUTPUT` mění výstup, `LUMAVORA_TRACE=1` zapne krátký opt-in trace. `--construction` omezuje průchod na konstrukci, `--resume-construction` pokračuje pouze od ověřeného prefixu zaplacených UI staveb, `--saved-only --phase=terrain|edge|earned|performance|comparison` umožňuje cíleně zopakovat skutečně změněnou část nad uloženými UI výstupy. Produkční `--production-smoke` sestaví a zaplatí v2 i po export/import/refresh bez `advanceTime`.

## Podstatná rozhodnutí a opravy celé dodávky

- **R1 — historie organismu:** starý characterization test zaznamenával neúčinný klik na orgán jako krok historie. Zadání změnilo smlouvu: samotný výběr není editace, redo se maže až při potvrzení transakce a zrušení tahu jej zachová. Upraveny pouze příslušné očekávané výsledky a detekce skutečného výběru; přesné draft/save/DNA a oddělená historie vozidel zůstaly. Cena případného chybného rozhodnutí: vrátit chování kliknutí a odpovídající assertion; žádná migrace saveů.
- **R2 — anatomie návrhu:** editor sdílí jeden odvozený snapshot na revizi návrhu mezi cenou, validací, schopnostmi, modelem, madly a pózou. Volitelné předané anatomy/stats argumenty zachovávají původní výchozí API a v1 aritmetiku. Proměnlivé návrhy se nikdy neregistrují v cache instalované generace; instalovaný genom má hluboce chráněnou anatomii. Cena případné opravy: přepracovat volitelné předávání anatomie a znovu změřit výkon; výchozí v1 API a aritmetika zůstávají.
- **R3 — skutečná ruka při gestu:** sdílená póza odvozuje rozsah gesta z anatomie ruky a měřítka; dlaň a kleště mají odpovídající pohyb koncových částí. Svět i zkouška přivádějí stejnou komunikační fázi. Není zde zvláštní univerzální skeleton pro náhled. Cena případné změny odpovědnosti: malá úprava společné pózy a jejího napojení, bez migrace genomu nebo saveů.
- **R4 — konzervativní trup:** nezávislé vzorkování objevilo malé mezery původních 65 sfér mezi průřezy (až přibližně 0,0069 m u dlouhého krku). Opraven byl společný producent obálky na konzervativní intervalové pokrytí, nikoli druhá soukromá kolizní reprezentace. Nejvýše 79 sfér; cena, hmota, postoj a v1 zůstaly zachovány. Cena případné opravy: po terénních a výkonových důkazech zpřesnit příliš konzervativní odstupy, bez migrace dat.
- Review opravilo limit více úst (3 na druh ve v2), příliš dlouhá odvozená ID kloubů, složený postoj s chodidlem pod terénem a automatické přizpůsobení, které potlačovalo zoom. Undo vloženého obratle/kloubu nyní vybírá nejbližší přeživší prvek a neponechá neplatný výběr.
- Self-review zkoušky opravilo překryv stavového textu vysokými orgány v 1280×720, nepovolené přetahování částí během zkoušky, zbytkovou pózu úst po návratu ke stavbě a nepatrnou zvukovou obálku při nulové hlasitosti. Hlas světa/náhledu používá jednu syntézu; načtený komunikační serial nehraje znovu starý zvuk. Opakované editace mají ověřené stabilní prostředky.
- Task 9 před změnou prokázal feature-specific RED na nezměněném serveru: nejprve platný běžný import stejného pobřeží a editor, potom chybějící `creature-open`. První konstrukční harness správně narazil na zákaz odstranění obsazeného lůžka; opravil se harness, nikoli validátor nebo DNA. Pozorování krátkého nativního skoku musí být skutečně připojeno před klávesou; samotné vytvoření asynchronního waitForFunction nezaručí instalaci. Read-only RAF záznam po čekání na jeho instalaci zachytil vzestup, sestup i přistání a jediný energetický poplatek. Doba záznamu nyní pokračuje přes celý pomalý Playwright klik i následné pozorování a explicitně končí v finally; původní pevná doba od instalace mohla skončit před akcí. Nebyla změněna herní fyzika. Pozdější pointer timeout nad viditelným tlačítkem uloženého slotu byl nahrazen běžným focus + Enter s kontrolou výsledku; neprokázal chybu aplikačního pointer handleru a timeout nebyl zvýšen. Řadič trasy byl opraven brzděním u cíle a uchováním všech vzorků místo řídkého výběru; původní selhání nedokládala vadu kolizí.

Review úkolu 9 opravilo také bezpečnost obnovení acceptance skriptu: ujetá vzdálenost ani naměřené projekce už nejsou značkou dokončení. Sdílená hranice `scripts/creature-editor-acceptance.mjs` před opakováním zruší staré dokončení a nastaví `terrainComplete` / `comparisonComplete` až po všech kontrolách, snímcích a exportech dané části. Resume i celkové přijetí vyžadují tyto explicitní značky; chyba vynuluje i uložený celkový stav. Pět nebrowserových failure-injection kontrol (`node scripts/creature-editor-acceptance-test.mjs`) prokazuje pozdní selhání terénu i finální kompozice, opakování po serializaci a zrušení dřívějšího úspěchu při novém pokusu. Původní odvozování neprošlo 5/5, oprava prošla 5/5. Nové běhy uchovávají hash hlavního skriptu i sdílené hranice. Uchované úspěšné browser důkazy zůstaly beze změny a nejsou tím zneplatněny; jejich starší formát se ale automaticky nepovyšuje na nový, takže další spuštění znovu prověří neoznačený terén a kompozici. Nebylo naslepo doplněno dokončení ani opakována hraná kampaň/výkon. [Cílený výsledek](../../evidence/sp-002/task-9-i1-green.log), [audit zachování zdrojů a saveu](../../evidence/sp-002/task-9-i1-audit.json).

Předchozí cílené počty testů se překrývají a nesčítají. Ukládání zahrnuje 11 historických v1 save fixtures, serializaci/obnovu generace a v2 dědictví pozdějších etap. Původní SP-001 numerické profily a fixtures nebyly přepsány.

## Meze a dosud neprovedené ověření

Kolize konzervativně pokrývají celý trup včetně krku a konečné boční stěny/stropy/podpory; nejde o plnou fyziku jednotlivých končetin, rukou nebo úst. Póza chodidel používá terénní oporu a omezené řešení kloubů. Zvýšená konzervativnost může omezit průchod úzkým místem.

Člověk bez instrukcí zatím netestoval rozpoznání siluet, výběr kloubu ani pochopení důvodu nedostupné schopnosti. Neproběhl subjektivní poslech. Programově ověřená syntéza a prohlédnutí snímků agentem tyto mezery nenahrazují. Safari, telefony a dlouhý soak nejsou součástí tohoto přijetí.

SP-003 (vztahy druhů), SP-004 (objevování částí), SP-005 (knihovna) a celá SP-017 zůstávají otevřené. Pro review celé větve zůstávají evidované drobnosti: hustý konstrukční markup/dispatch v main.ts, nezaceněná neplatná konstrukce ukazuje cenu 0 místo nedostupné ceny, komprimovaný zápis některých vzorců a málo specifická assertion jednoho testu neplatného postoje. Nejsou vydávány za vyřešené vedlejším refaktorem.

Starší seznamy snímků mohou odkazovat na odstraněné duplicity. [Manifest starších artefaktů](../../evidence/sp-002/artifact-manifest.json) a [manifest tří duplicitních výřezů tohoto průchodu](../../evidence/sp-002/browser/artifact-manifest.json) zachovávají cesty, hashe a důvody úklidu; aktivní save, zdroje, fixtures a finální milníky se nemažou.
