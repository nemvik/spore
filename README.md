# LUMAVORA

**Změň své tělo. Změň způsob života. Sleduj, jak se tím mění svět.**

LUMAVORA je singleplayerová 3D evoluční hra pro desktopový prohlížeč. Začínáš jako drobný tvor a provedeš jeho linii šesti etapami až k samostatně žijící planetě. Genom propojuje podobu organismu, pohyb, potravu, obranu i symbiózu; později jej dědí členové kmene. Z jeho osady vyrostou stroje a expedice obnovující klima.

Hra běží lokálně bez účtu, backendu, placených API a runtime CDN. Grafika i zvuk vznikají procedurálně ze zdrojového kódu. Původ obsahu a licence knihoven uvádí [ASSET_CREDITS.md](ASSET_CREDITS.md).

**Další vývoj směrem ke Spore:** [aktuální brief](docs/spore/BRIEF.md), [tracker 17 bodů a jejich dokončení](docs/spore/ROADMAP.md) a [audit současné implementace](docs/2026-09-17-spore-similarity-audit.md). Nový směr pokračuje za terraformaci do vesmíru a dobrodružství; níže je popsaný dosavadní hratelný rozsah.

## Spuštění

Použij Node.js 22.12 nebo novější a pnpm 11.24.0, uvedený v `package.json`. Z kořene repozitáře:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Otevři lokální adresu vypsanou Vite, obvykle [http://127.0.0.1:5173](http://127.0.0.1:5173). Instalace závislostí potřebuje připojení k registru; běžné hraní po načtení lokálních souborů externí služby nepotřebuje. Zvuk začne po interakci s rozhraním.

Produkční statický build a jeho lokální náhled:

```sh
pnpm build
pnpm preview
```

Build vznikne v `dist/`. Hru servíruj přes HTTP; neotvírej `index.html` pomocí `file://`. Tyto příkazy nic nepublikují.

## Cesta linie

| Etapa | Prostředí a úkol |
| --- | --- |
| **Mikrosvět** | Rozděl pastvu zahrady, zachyť kolonii ve víru a přenes soumrakovou kulturu do odtoku. Nové porosty mění skutečné cesty konzumentů a živé proudy. |
| **Útesy a mělčiny** | Zajisti bezpečnou pastvu mezi korály, uvolni baldachýn a vyber horní či chráněnou boční oporu. Boční živá pastva částečně čistí hluboký přítok, horní vytváří výstupní proud. Otevřený filtr chrání před plynem za cenu rychlosti a energie; vzdušné tělo nese vlastní dech, ale nechrání kulturu. Výška, kryty a vztlak mění vhodnou trasu. Pro souš potřebuješ vzdušné komory a končetiny. |
| **Pobřeží a souš** | Přílivové sady, Jantarové terasy a Zahrada posledního deště. Hlídej vláhu a dokonči obnovu, potravní řetězec nebo symbiotickou migraci. |
| **Kmen** | Řiď potomky a zděděné symbionty, dopravuj potravu, stav chýše a dílny, vybav čtyři nástroje a sjednoť tři sousední osady. |
| **Stroje** | Sestav vlastní tanky a letouny, zajisti jantar a obnovou, bojem nebo diplomacií ovládni tři regiony. |
| **Terraformace** | Přímo řiď pracovní stroje, uprav teplotu a vláhu a založ tři skutečně živé potravní řetězce. Planeta musí udržet T3 i po vypnutí nástrojů. |

Nová chuť, poznané místo a skutečná změna ekologického vztahu přinášejí DNA jednou. Další jídlo udržuje tělo a partnery, ale nezvyšuje nekonečně evoluční rozpočet. Deník popisuje konkrétní situace a jejich následky.

V mikrosvětě a útesu po vytvoření obyvatelného výstupu vyhledej severní proud označený na kompasu a použij **G**. Genom, symbionti a historie linie pokračují do další etapy. Úplný průchod všemi šesti etapami od normální Nové linie po planetární finále byl ověřen běžnými vstupy bez importu či zrychlení času: **15 min 59,35 s simulace**, pět generací, 92 jídel a žádný lov. Šlo o asistované hraní se znalostí pravidel, nikoli první lidský playtest. Návrhových 20–30 minut na etapu ani starších 45–90 minut tím není doloženo. [Aktuální report](BENCHMARK_REPORT.md) odděluje skutečný průchod, připravené scénáře a poslední izolované opravy. Historická v14 zůstává [reprodukovatelnou baseline](evidence/reef-body/v14-baseline/README.md); [srovnání v14–v15c](evidence/reef-body/REEF_COMPARISON.md) zachycuje dřívější útesové varianty.

Na souši u kolébky otevře **Tab → Upravit kostru** editor páteře, kloubových končetin, rukou, chodidel, úst a povrchu. Změny mají společný genom, cenu a schopnosti; oddělená **Zkouška** ukáže chůzi, skok, kousnutí a hlas či gesto před potvrzením. **Q** skáče a **V** komunikuje. Undo/redo zachová celou konstrukci; zrušení převodu ponechá starý genom. [Ovládání a kompatibilita](docs/body-editor/README.md#sp-002-konstrukce-suchozemského-tvora-genom-v2), [ověření SP-002](docs/spore/SP-002-REPORT.md).

V nové útesové linii drž **Mezerník** nebo tlačítko krmení pro otevření filtru; puštěním jej zavřeš a získáš zpět rychlost. V kolébce použij **Tab** a v editoru porovnej dech, pohyb a spotřebu skutečně sestaveného těla. Starší uložené linie zůstávají na svých původních pravidlech; novou smyčku má nově založená linie.

V baldachýnu může jedlou vazbu spást vhodný orgán, nebo divoký štítojem přivedený detritem či minerály. Po otevření zachytíš stoupající mateřskou řasu. Novou pastvu musí skutečně ochutnat plachtovec v bezpečí; samotná výsadba ji nedokončí.


Na terase stromy oddělují krytou západní cestu od otevřené východní strany. Detrit přesměruje žrouty; nektar přiláká i původní zvonkonoše. Korunoplaz si pamatuje místo, kde osobně snědl maso, a vrací se k němu. Pozdější průvod může využít vodu a kryt, které jsi zachoval, nebo obejít vzniklé loviště.

Na souši existují tři řešení:

- **Obnova krajiny:** přenes kultury sadů a teras, odveď žrouty a umožni původním konzumentům první bezpečnou hostinu. Potom založ poslední kulturu u svatyně.
- **Obnova potravního řetězce:** cíleně reguluj přemnožené žrouty v obou nikách a přenes poslední kulturu. Nabídnutá potrava může zapojit i místního lovce.
- **Symbiotická migrace:** přenes kulturu do severního útočiště se dvěma sytými, loajálními partnery a rosným zásobníkem. Tato cesta chrání nový domov a ponechá zbytek krajiny suchu.

Každé řešení potřebuje také skutečný příchod divokého prachokřídlíka na novou pastvu. Výhra nastane automaticky, když jsou zároveň živé požadované opory nebo připravená symbiotická linie. Světlo poslední kultury ho přitahuje; po zasazení musí dojít k porostu a najíst se. Stín zastavuje vysychání, živé prameny hojí a zásobník se sytým recyklačním partnerem sdílí tvou vodu s blízkými nosiči. Sprint může průvod ztratit, čelist zblízka plaší a toxin poškodí i nosiče. Sytý recyklační partner uklidňuje nosiče i při příchodu k právě zasazenému domovu; skutečný zásah toxinovým pulzem je stále zažene. Maso pro lovce připrav před cestou: E položí celý nesený vzorek. Pokud nezůstal žádný divoký nosič, T u jižní matky s nesenou poslední kulturou probudí klidové spory.

Žrout může skutečným jídlem ukousnout živý oddenek z přeneseného kořene. Při dalším jídle dál než 8 m od místa okusu zasadí malý vodní výhonek. Potravou tak lze přemístit omezenou část vody; původní kořen zůstane oslabený. Lov nosiče ztratí nesenou tkáň a další okus může výhonek zničit. Malá opora pomáhá cestou, sama nenahrazuje obnovený pramen pro závěr.

Naučené vztahy a DNA zůstávají i po zničení porostu, ale voda vyžaduje živé kořeny nebo skutečně uvolněný mateřský zdroj s původními konzumenty. Noví hladoví žrouti mohou oporu znovu ohrozit. Opětovné zasazení domova potřebuje nový příchod spor; neudělí podruhé DNA.

Starší uložené linie si ponechávají původní pravidla včetně kvót a ceny reprodukce; jejich průběh se nepřepisuje.

Vysychání skutečně posouvá pobřeží, snižuje vláhu pramenů, dostupnost potravy a vitalitu rostlin. Obnovené prameny udrží zelené oázy. Úspěšný lov invazních druhů stabilizuje vodní režim; migrace vytvoří vlhkou svatyni, zatímco okolní krajina dále vysychá.

Po dokončení lze prohlédnout historii linie, pokračovat v sandboxu nebo začít novou linii s jiným seedem.

### Kmen, stroje a terraformace

Po pobřežním vítězství zvol **Založit kmen**. Potomci zdědí tělo a jídelníček; každý původní symbiont se stane samostatným členem. Vyber jednotky klikem nebo rámečkem a pravým klikem jim zadej přesun, sběr, stavbu či návštěvu souseda. Shift přidává výběr nebo rozkaz do fronty. WASD posouvá kameru, pravý tah ji otáčí, kolečko přibližuje a **H** vrátí pohled domů. **Tab** zaměří výstroj, **T** používá schopnost zděděnou z pobřežního závěru.

Potravu je nutné dopravit do tábora. Chýše zvýší kapacitu až na 12 členů, dokončené dílny odemknou koš, oštěp, buben a měch. Se všemi třemi sousedy se lze spojit nebo je porazit. Tělo už nelze měnit a oštěp nedovolí filtrační linii získávat potravu lovem. Zánik posledního člena nabídne obnovu checkpointu.

Po sjednocení kmene otevři éru **Strojů**. Stejný editor skládá trup, kabinu, pohon a pracovní modul; velikost a výbava ovlivňují cenu, rychlost, odolnost a výkon skutečně vyrobeného stroje. Zaplať návrh jantarem, zabírej prameny a rozšiř flotilu nejvýše na osm strojů. Pozemní stroj zabírá prameny; letoun překoná skalní prstenec vysoké kotliny. U dílny můžeš vybraný stroj vyřadit, získat zpět 35 % ceny a uvolnit místo ve flotile; poslední živý stroj zůstává. Zděděná cesta určuje obnovu půdy, boj nebo zásobovanou diplomacii. Ovládání výběru a rozkazů navazuje na kmen.

Po zajištění tří regionů a alespoň dvou pramenů lze zahájit **Terraformaci**. WASD nyní přímo řídí vybraný stroj, **V** jej přepíná, **Mezerník** zapíná nástroj a **M** planetární přehled. Vrt doplňuje vláhu; rozsévač ochlazuje a rozptyluje vodu. Výroba dalších pracovních strojů a vyřazení s částečnou návratností jantaru jsou dostupné poblíž domovské dílny.

Katalog si pamatuje skutečně odebrané kultury, krmení, lov a symbiózu z dřívějších etap. Pouhé spatření druh nepřidá. Chybějící život lze obnovit ve školce a fyzicky nakrmit nebo odebrat přes **T**. Každá ze tří lokalit potřebuje dvě různé živé kultury, dva druhy býložravců a lovce. Kořeny vytvářejí potravu, býložravci ji spotřebovávají a živí lovce; hlad nebo ztráta kořenů ruší klimatickou oporu. Finále nastane, když se T3 udrží se všemi řetězci a vypnutými nástroji. Následuje historie linie a otevřený sandbox.

Uložené hry používají kořenovou verzi **3**; aktivní kmen, stroje a planeta mají vlastní řezy v2. Pozice verzí 1/2 zachovávají původní pravidla a do nové etapy vstupují pouze výslovnou volbou. Historický prázdný v1 náhled dovolí návrat na pobřeží nebo založení skutečného kmene; aktivní osadu nelze tímto návratem zahodit. Multiplayer je mimo rozsah.

Podrobné provedení a doložené meze jsou v [plánu rozšíření](docs/superpowers/plans/2026-09-15-lumavora-machine-era-roadmap.md) a [ověřovacím reportu](BENCHMARK_REPORT.md). Návrhová délka ani zábavnost nejsou odvozeny z počtu automatických testů.

## Ovládání

Následující tabulka platí pro první tři etapy; ovládání kmene, strojů a planety je popsané výše a v jejich nápovědě.

| Vstup | Akce |
| --- | --- |
| **WASD / šipky** | Pohyb organismu |
| **Q / C** | Stoupání / klesání pod vodou |
| **Shift** | Sprint se zvýšenou spotřebou energie |
| **Mezerník** | Krmení; s dravou čelistí také útok |
| **Levé tlačítko myši** | Vybrat konkrétní potravu či tvora pro mezerník; kliknutí do prázdna vrátí výběr nejbližšího cíle |
| **R** | Navázání vztahu s blízkým kompatibilním partnerem |
| **T** | Prozkoumání matky, převzetí kultury či běžného sousta, zasazení kultury u kořenového kruhu; vyživení zárodku po místním vyhynutí |
| **E** | Položení nesené potravy 2 m za tělem; světlý pupen ukazuje skutečné místo |
| **X** | Aktivní toxinový nebo sonarový pulz podle vybavení |
| **Tab** | Editor těla v blízkosti kolébky linie |
| **G** | Přechod u proudu; na souši vysvětlení podmínek závěru, který nastane po jejich splnění |
| **J** | Deník, niky a druhy |
| **Esc** | Pauza |
| **F** | Celá obrazovka |
| **Pravé tlačítko myši + tažení** | Otáčení kamery nebo organismu v editoru |
| **Kolečko myši** | Přiblížení a oddálení |

Nedaleký mateřský porost má vlastní malý popisek ve světě. T se u něj objeví jako připravené až při skutečném dosahu; mimo něj může T vzít obyčejnou potravu. Neúspěšné sázení výslovně oznámí, že vzorek stále neseš. Vybraný cíl myší platí pro mezerník; samostatná řádka T ukazuje aktuální péči.

Pauza zpřístupňuje nastavení kvality, citlivosti kamery, omezení pohybu, celkové hlasitosti, atmosféry, efektů a vypnutí zvuku. Primárním ovládáním je klávesnice a myš; responzivní rozhraní samo o sobě nedokládá podporu telefonu.

## Editor a první adaptace

Začni sběrem řas či detritu, vrať se do centrální kolébky a stiskni **Tab**. Kliknutí na adaptaci v levé paletě přidá část do náhledu. Část vybereš přímo na 3D těle nebo jejím štítkem. Posuvníky mění délku a šířku těla, polohu části podél osy, úhel a velikost; symetrie přidává odpovídající protějšek. Část lze odstranit a úpravy vracet i opakovat pomocí Zpět/Znovu.

[Srovnání pěti těl a ověření](docs/body-editor/README.md).

**Vlastní silueta** nabízí sedm článků od ocasu k hlavě. Klikni přímo na povrch 3D těla nebo na číslo článku. Zlatý pás a číslo označí právě upravovanou oblast i během animace; pravým tažením model otočíš. Samostatně uprav jeho šířku, výšku a ohyb nahoru či dolů. Předvolby Hruška, Ploché a Oblouk jsou výchozí tvary pro další ruční úpravy; Původní obnoví základní profil. Orgány a oči sledují povrch, proporce ovlivňují hmotnost, spotřebu, pohyb a průchodnost. Funguje Zpět/Znovu, zrušení, potvrzení i export/import. Staré uložené linie zachovávají původní tělo, dokud je neupravíš.

Před potvrzením uvidíš výsledné parametry, dostupnou potravu, cenu a případné konstrukční chyby. **Naučená DNA tvoří rozpočet celého těla, který můžeš v kolébce volně přerozdělovat.** Odstranění části uvolní její místo v tomto rozpočtu, nepřidá nové poznání. Velikost a symetrie ovlivňují cenu i výkon. Barva, vzor a jméno jsou kosmetické.

Katalog obsahuje 21 adaptací v šesti oblastech. Filtr a dravá čelist se vzájemně vylučují; nektar vyžaduje sosnu. Těžší obrana mění obratnost, sprint stojí energii a souš vyžaduje vlastní oporu i dýchání. Editor nedovolí potvrdit neplatné tělo nebo odstranit obývané partnerské lůžko. Potvrzený genom se použije přímo ve hře a založí novou generaci i bod obnovy.

## Ekologie, symbióza a ukládání

Odběr potravy vyčerpává zdroje a úrodnost niky. Lov mění místní populace; péče, reprodukce a partnerství vracejí živiny. Úrodnost ovlivňuje vegetaci a obnovu zdrojů. V nových liniích se potomci rodí u skutečně snědené potravy, která musí uživit rodiče i nové tělo. Prázdná nika sama dalšího tvora nevytvoří. Místní ztrátu konzumenta potřebného pro obnovu lze napravit u mateřského porostu za skutečnou porci jídla.

Sytý lovec přestane vybírat kořist a plašit konzumenty. Silně hladovému zvířeti nemusí jediné sousto stačit; dokončovaný výpad zůstává nebezpečný. Jemné částice mezi nabídkou a tvorem zobrazují jeho skutečný příchod za tímto jídlem, nikoli zaručený úspěch. Jde o zjednodušenou herní simulaci, nikoli biologický model.

Partnerské lůžko umožní přijmout až dva symbionty. Světelný, štítový a recyklační partner poskytují odlišnou pomoc. Přijetí stojí energii, soužití zvyšuje její průběžnou spotřebu a partner si přináší svůj skutečný hlad. Sdílené jídlo jej nasytí jen tehdy, pokud patří do jídelníčku jeho druhu, uvedeného v HUD. Hladový partner přestane pomáhat a ztrácí loajalitu; zanedbaný partner odejde.

Jednotlivé linie mají vlastní uložené pozice v `localStorage` daného prohlížeče a lokální adresy. Správa uložených her umožňuje načtení a import/export JSON; nová linie nepřepisuje ostatní. Export je přenositelná záloha. Import kontroluje verzi, genom i strukturu světů a odmítá poškozené, neslučitelné nebo příliš velké soubory. Smrt nabídne obnovení poslední generace; tím se vrátí také odpovídající stav světa. Vymazání dat prohlížeče odstraní místní pozice, proto si důležité linie exportuj.

## Ověřování a struktura projektu

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
pnpm test:era
pnpm test:tribe
pnpm test:machines
pnpm test:machine-editor
pnpm test:body-editor
pnpm test:planet
pnpm test:fixtures
pnpm test:climate
pnpm test:soak
pnpm test:performance
```

Produkční kontrolu spusť po `pnpm build` při běžícím `pnpm preview`: `pnpm test:production`.

Nutné uložené testovací vstupy jsou verzované v `tests/fixtures/saves/`; jejich původ a SHA256 uvádí přiložený manifest. Čistý checkout nepotřebuje lokální archiv `evidence/`.

`pnpm test:tribe` ověřuje oba způsoby dokončení kmene přes běžné UI z připraveného pobřeží, rozestavěné save/load a skutečný nábor 12 členů. `pnpm test:era` ověřuje historický v1 náhled ze skutečných exportů, včetně jeho zmrazení a návratu na pobřeží. `pnpm test:body-editor` vytvoří běžnými posuvníky pět výrazně odlišných těl se shodným filtrem a bičíkem, ověří přímý výběr, historii a save/load a uloží porovnání do `evidence/body-editor/browser/comparison.png` (výchozí server 5183). `pnpm test:editor` charakterizuje současný i historický editor organismu; `test:machine-editor` ověřuje skutečné úpravy a přesně zaplacený návrh stroje. `test:machines` projde všechny tři strategie, `test:planet` obnovu tří biomů, regresi klimatu, stabilní finále a save/reload. Jde o cílené připravené scénáře s DEV krokováním, nikoli úplný průchod kampaní. Rozšířené skripty používají `LUMAVORA_URL` (výchozí port 5180); nastav ji na adresu svého serveru. `pnpm test:planet-soak` přehrává uložený stabilní planetární sandbox nejméně 600 sekund skutečného času; vstup určuje `PLANET_SOAK_SOURCE`, výstup `PLANET_SOAK_OUTPUT`.

`pnpm test:browser` je nyní **zrychlená regrese starých pravidel kampaně**. Přes běžný import načte neupravený stav `createGame(481516, true)` v kroku 0; neověřuje novou kampaň spouštěnou tlačítkem Nová linie ani délku prvního hraní. Také připravené scénáře fixtures, climate a performance používají stará pravidla. Produkční smoke a soak začínají současnou novou linií, ale nenahrazují dokončený běžný průchod.

Volitelné `BROWSER_TEST_INITIAL_SAVE` umožňuje stejným skriptem dohrát skutečný historický počáteční export. Skript nejprve ověří jeho shodu po migraci, importuje původní soubor beze změny a zaznamená verzi i SHA256. Nastav také samostatné `BROWSER_TEST_OUTPUT`, aby historický vstup zůstal zachovaný.

Nové výstupy skriptů míří do `evidence/quality/regression/<název-skriptu>/`; historické adresáře měření se při výchozím spuštění nepřepisují. Přesné příkazy, alternativní výstupní adresáře a ověření přípravy bez GPU popisuje [regresní README](evidence/quality/regression/README.md). Důkazy současné kampaně hrané v reálném čase se vedou samostatně.

Browser skripty respektují `PLAYWRIGHT_BROWSERS_PATH`; jinak použijí existující lokální benchmark cache `/private/tmp/lumavora-browsers`, nebo standardní cache Playwrightu. Pro vlastní umístění použij stejnou proměnnou při instalaci Chromium i při testování. Soak sbírá nejméně 600 sekund skutečného aktivního hraní a trvá přibližně 11 minut. Výkon měř samostatně, bez dalších aktivních browser testů. Browser skripty ukládají jen vybrané snímky a malé výsledky; velký Playwright trace zapne výslovně `LUMAVORA_TRACE=1` (původní organismový soak používá `SOAK_TRACE=1`). Nepotřebné průběžné výstupy po ověření odstraň.

Pro browser testy ponech spuštěný lokální server z `pnpm dev`. Referenční seedy jsou **481516**, **20260913** a **8675309**. Shoda simulace se posuzuje při shodných vstupech a krocích; pixelová shoda mezi různými GPU se nepředpokládá. Cílené připravené scénáře jsou oddělené od průchodu novou hrou a nemají nahrazovat důkaz dosažitelné progrese.

Aktuální stav, provedená ověření, jejich prostředí a mezery patří do [BENCHMARK_REPORT.md](BENCHMARK_REPORT.md); screenshoty, trace a naměřené reporty do `evidence/`. Samotná existence testovacího příkazu neznamená, že už test úspěšně proběhl. Checkpoint pro pokračování práce je v [PROGRESS.md](PROGRESS.md).

- `src/game/`: společné typy, katalog adaptací, genom, seedovaný svět, simulace a validované ukládání.
- `src/render/`: procedurální organismus a druhy, prostředí, kamera a syntéza zvuku přes Web Audio.
- `src/ui/`: vzhled rozhraní a český UI katalog `copy.cs.ts`. Zprávy a chybové texty jsou v `src/game/content.ts` a `src/game/errors.cs.ts`.
- `tests/` a `scripts/`: pravidla, automatické scénáře a browser ověření.

Technický základ tvoří TypeScript, Vite a Three.js. Herní obsah se načítá ze stejného statického buildu; nejsou potřeba externí modely, textury, hudební soubory ani fontové služby.

## Regrese přepracovaného útesu

Z kořene repozitáře:

```sh
pnpm exec vitest run tests/reef-body.test.ts tests/reef-body-ui.test.ts tests/reef-body-presentation.test.ts tests/reef-evolution-loop.test.ts tests/reef-evolution-persistence.test.ts tests/reef-water-cache.test.ts --maxWorkers=1
pnpm exec vitest run --maxWorkers=1
pnpm build
node evidence/reef-body/measure-native.mjs
```

Poslední příkaz pouze přepočítá uchované UI exporty; sám hru nehraje. Přísnou kompatibilitu 118 uložených stavů lze znovu ověřit příkazem `node evidence/reef-body/audit-final-v15c.mjs /private/tmp/lumavora-v15c-corpus-repeat.json`. Přesné pokračování historické verze ověřuje `node evidence/reef-body/v14-baseline/verify-reproduction.mjs --compare-root . --output /private/tmp/lumavora-v14-replay-repeat.json`. Výstupní soubory těchto auditů musí být nové, aby se původní důkazy nepřepisovaly. [Finální ověření a rozsah](evidence/reef-body/v15c/verification.json).
