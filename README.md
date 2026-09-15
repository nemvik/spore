# LUMAVORA

**Změň své tělo. Změň způsob života. Sleduj, jak se tím mění svět.**

LUMAVORA je singleplayerová 3D evoluční hra pro desktopový prohlížeč. Přímo ovládáš jednoho tvora, získáváš živiny, stavíš nové generace a hledáš způsob, jak přežít v krajině ustupujícího přílivu. Jeden genom propojuje podobu organismu, animace, pohyb, potravu, obranu i symbiotické vztahy.

Hra běží lokálně bez účtu, backendu, placených API a runtime CDN. Grafika i zvuk vznikají procedurálně ze zdrojového kódu. Původ obsahu a licence knihoven uvádí [ASSET_CREDITS.md](ASSET_CREDITS.md).

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
| **Pobřeží a souš** | Přílivové sady, Jantarové terasy a Zahrada posledního deště. Hlídej vláhu, reaguj na vysychání a dokonči jednu ze tří závěrečných cest. |

Nová chuť, poznané místo a skutečná změna ekologického vztahu přinášejí DNA jednou. Další jídlo udržuje tělo a partnery, ale nezvyšuje nekonečně evoluční rozpočet. Deník popisuje konkrétní situace a jejich následky.

V mikrosvětě a útesu po vytvoření obyvatelného výstupu vyhledej severní proud označený na kompasu a použij **G**. Genom, symbionti a historie linie pokračují do další etapy. Návrhový cíl 45–90 minut zatím splněný není. Nejnovější úplný průchod v13a skončil po **9 min 6,55 s simulačního času**: pět generací, 66 jídel, žádný lov, sedm částí, jedna lucernička a obnova s příchodem divokého nosiče. Nejde o reprezentativní první lidské hraní; [report průchodu](evidence/quality/campaign-v13a/ASSESSMENT.md) odděluje fakta, hodnocení a slabiny. V14 je zachovaná jako [reprodukovatelná lokální baseline](evidence/reef-body/v14-baseline/README.md). Aktuální útes propojuje tělesné kompromisy s živou vodou; [srovnání v14–v15c](evidence/reef-body/REEF_COMPARISON.md) dokládá dva odlišné útesové průchody a jejich omezení.

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

## Ovládání

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
pnpm test:fixtures
pnpm test:climate
pnpm test:soak
pnpm test:performance
```

Produkční kontrolu spusť po `pnpm build` při běžícím `pnpm preview`: `pnpm test:production`.

`pnpm test:browser` je nyní **zrychlená regrese starých pravidel kampaně**. Přes běžný import načte neupravený stav `createGame(481516, true)` v kroku 0; neověřuje novou kampaň spouštěnou tlačítkem Nová linie ani délku prvního hraní. Také připravené scénáře fixtures, climate a performance používají stará pravidla. Produkční smoke a soak začínají současnou novou linií, ale nenahrazují dokončený běžný průchod.

Nové výstupy skriptů míří do `evidence/quality/regression/<název-skriptu>/`; historické adresáře měření se při výchozím spuštění nepřepisují. Přesné příkazy, alternativní výstupní adresáře a ověření přípravy bez GPU popisuje [regresní README](evidence/quality/regression/README.md). Důkazy současné kampaně hrané v reálném čase se vedou samostatně.

Browser skripty respektují `PLAYWRIGHT_BROWSERS_PATH`; jinak použijí existující lokální benchmark cache `/private/tmp/lumavora-browsers`, nebo standardní cache Playwrightu. Pro vlastní umístění použij stejnou proměnnou při instalaci Chromium i při testování. Soak sbírá nejméně 600 sekund skutečného aktivního hraní a trvá přibližně 11 minut. Výkon měř samostatně, bez dalších aktivních browser testů.

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
