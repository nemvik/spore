# Skutečný námořní obchod J

Oba soubory jsou byte-identické exporty stejného nativního browser průchodu; obsah nebyl připravován ani dodatečně upraven.

| Fixture | Původ | SHA-256 |
| --- | --- | --- |
| `native-sea-trade-campaign.save.json` | `evidence/sp-009j-sea/browser/active-campaign.save.json` | `f8115ddd92a21b7608d1727d7be4ba6bf40a199738139643c44421bf8f8c6f9b` |
| `native-sea-crossing.save.json` | `evidence/sp-009j-sea/browser/crossing-checkpoint.save.json` | `e950eeb8c7061ac03cd41c8a8d9b19a4f44c1aeb320f2573ea550dd6c142aae5` |

Vstupem byl nezměněný `tests/fixtures/saves/machines-restoration-completed.save.json`, SHA-256 `7dffc69f9d073c8046783be74ba9fde13b5ece2282eb6357dcc8a7267cc53dec`, seed 481516. Jeho historický původ zahrnoval připravené pobřeží a DEV `advanceTime`; zde doložená návaznost používá pouze běžné UI a nativní RAF v produkčním buildu `index-CiWwbMtf.js`. Nejde o souvislou kampaň od nové buňky ani důkaz celého milníku B.

Postup `scripts/sea-commerce-browser.mjs`: dvě obyčejné návštěvy 1542/1615 před prvním strategickým tahem, bez měření; návrat domů; přirozená města AI na 1470/1541; skutečný domácí příjem 173,345→350,195 za 98,274 sekundy; vlastní loď **Tyrkysová přílivnice** přes knihovnu/editor (odstín 160, vrtule 1,25), zaplacených 64 jantarů. Cíl 1541 byl navštíven běžně po souši. Následovaly tři placené náklady po 20 přes skutečnou pobřežní trasu `[1614,1613,1541]`, včetně vyložení a návratu každé dodávky. Buňka 1613 je voda, oba konce pobřeží.

Crossing export zachycuje první skutečnou cestu směrem k městu, postup 0,31473533619456356, po odečtení prvních 20. Během nativního průchodu byl importován a pokračovalo se bez další platby. Název původního souboru `crossing-checkpoint.save.json` označuje export během plavby; jeho vnitřní generační `checkpoint` je stále starší předobchodní stav.

Finální export je doma s lodí kotvící na 1614, třemi uzavřenými zpátečními cestami a městem 1541 získaným pouze obchodem: cena 144, zápočet 60, doplatek 84, civilní příjem prodejce 144. Liga tehdy přirozeně měla dvě města; prodej posledního města tímto průchodem nedokládáme. Nebyl vyvolán žádný boj ani konverze. Finální import zachoval loď, město i účetní doklady. Celý browser průchod měl 8 kontrol, žádnou JS/console chybu, tři finální snímky a 90 RAF intervalů námořní scény; část intervalu byla loď čekající v cíli. Lidský poslech není tímto důkazem ověřen.

`tests/sea-commerce-fixture.test.ts` kontroluje původní bajty, účetnictví, skutečnou geometrii trasy, parse/serialize a obnovu generačních checkpointů. Jeho pokračování z crossing exportu volá veřejné runtime metody a `step` jako **unit regresi**. Tyto rychlé jednotkové kroky nejsou vydávány za další nativní hraní ani za nové browser důkazy.

Samostatné spuštění: `pnpm exec vitest run tests/sea-commerce-fixture.test.ts --maxWorkers=1`.
