# SP-009.J · obchodní spojení · report v1

26. září 2026, pracovní strom bez commitu/pushe/deploye. [Smlouva](SP-009J-CONTRACT.md), [plán](../superpowers/plans/2026-09-26-lumavora-completion.md). Dokončena skutečně dosažitelná obchodní návaznost přes všechna čtyři soupeřova města; celé B ani přijatá širší kritéria SP-009 se tím neuzavírají.

## Výsledek

Ve městě lze sjednat tři zkušební dodávky vlastním placeným vozidlem. Tank potřebuje souš, letoun spojitou trasu atlasu a člun dvě propojená pobřeží. Model, rychlost a náklad odpovídají vlastní konstrukci. Hráč sleduje uložený průběh, vyloží na cíli a dokončí návrat; před vyložením může obrátit. Pauza a atlas přepravu pozastaví, domov a místní ekonomika po dobu cesty stojí.

Každá dodávka vloží 20 jantaru do úschovy. Po třech skutečných zpátečních jízdách stát přijme dohodu i s vlastní rezervou a o posledním městě. Závěrečná účtenka v2 započte 60 do původní ceny; stát dostane celou cenu na civilní účet. Nedokončená zásilka vrátí 20 až doma, zrušení kontraktu vrací dokončené vklady přesně jednou. Stará pravidla a účtenky G zůstávají validní; peníze do vojenské rezervy nepřibývají.

Nový optional `commerce` v1 je explicitně aktivován prázdný v live/checkpointu. Validator kontroluje původ vlastníka v historické epoše, čas, trasy, dopravce, náklad, platební rovnice, vzájemné odkazy a prefix obnovy. Veřejné příkazy odmítají zastaralé revize. Rozjetou přepravu nelze obejít jiným použitím vozidla nebo přechodem etapy; otevřenou úschovu je potřeba vypořádat.

## Vykonané ověření

- **58 nových cílených regresí** před UI fixture; finální byte-identický hraný save přidává 59. **59/59 finálních testů prošlo** (1,78 s), včetně SHA a účetnictví hraného výsledku. Testový subagent píše pouze testy, hlavní vlákno integruje produkci.
- `pnpm exec vitest run --maxWorkers=1`: **157 souborů / 3 434 testů**, 123,29 s. Včetně historických kampaní, E–I dokladů, importu/exportu, přechodů, obnovy a obou hraných knihovních konstrukcí. Po dodání J fixture se spouští úzká relevantní sada; nově rozpracované B2 se tímto číslem neprohlašuje za ověřené.
- Samostatně původní `trade.test.ts` a `maritime.test.ts`: **122/122**.
- Typecheck a produkční build prošly. Finální J JS `index-A3Xl1hxM.js` 1 492,15 kB / gzip 464,97 kB; CSS `index-Ca62cpYh.css`. Existující upozornění na velký chunk trvá. Žádná závislost/lockfile změna.
- Produkční Chrome, nativní UI/RAF, žádný živý setter ani testový čas: nezměněný D save → **999,9 jantaru vydělaných za 555,5 skutečných sekund** → vlastní tank, letoun a člun zaplacené přes knihovnu → skutečné přepravy → čtyři převzetí pouze obchodem. Ceny **142, 140, 200, 200**, kredit vždy 60; poslední města se prodala s rezervou **40** a civilní rezervou **142/140**. Konečné státní účty **40/342** a **40/340**. Žádné vojenské převzetí, konverze nebo raid.
- Nativní přerušení/vratka, export/import/rekey uprostřed jízdy, dokončení dvanácti dodávek, export a save/reload/load zachovaly stav. **Finální běh 8 kontrolních skupin, 0 browser chyb**. Opakuje se z původního právě odehraného placeného save, bez přípravy peněz.
- První ovladač browseru nesprávně rozpoznával HTML atribut `open=""` a zavřel výběr vozidla; opraven a kompletní průchod zopakován. První vizuální kontrola vedla k odstranění překrývajících portálů, kompaktnímu hlavnímu ovládání a automatickému návratu fokusu na kontrakt. Nezávislé review našlo zapuštění tanku, opravené použitím skutečného `groundClearance`. Náklad respektuje horní mez modelu; omezený pohyb respektuje nastavení.

## Vizuál a výkon

Prohlédnuty tři finální snímky: přeprava **1024×640** s viditelným vlastním modelem/nákladem, vyložené 3/3 dodávky a vlastněné město **1280×720**. Hlavní akce jsou dostupné bez hledání pod velkou mapou; podrobnosti a sekundární kamera se posouvají. Všechny tři opravené scény byly znovu skutečně odehrány.

90 nativních RAF vzorků přepravní scény: p50/p95 **16,7/16,7 ms**, maximum **16,8 ms**. Vzorek obsahuje jízdu i čekání na vyložení; jde o krátký headless lokální test, nikoli přímý GPU timer nebo dlouhý soak. Při 20 skutečných přerušených okruzích s vrácením nákladu byly po 5 i 20 návratech po vykreslení shodné prostředky: **734 geometrií, 1 textura, 23 programů, 108 draw calls**. Předběžné odečty v prvním běhu před dalším RAF zachytily dvě různé scény; finální ovladač čeká 150 ms po návratu a nemíchá tyto stavy.

## Evidence, limity a další krok

[Hraná fixture](../../tests/fixtures/commerce/native-trade-campaign.save.json), [původ a SHA](../../tests/fixtures/commerce/README.md). Aktivní kampaň a checkpoint jsou v `evidence/sp-009j/final/`; první skutečně vydělaný a zaplacený vstup v `evidence/sp-009j/browser/`. `cleanup.json` eviduje odstraněné mezivýstupy, `verification/unit.log` celou sadu.

**Námořní obchod:** hra jej implementuje pro existující dostupný pobřežní cíl; konkrétní historická D planeta nemá vodní trasu k žádnému soupeřovu městu. Proto je nákladní člun zatím doložen jen cílenou připravenou pobřežní regresí, ne nativní dosažitelností v tomto průchodu. Skutečné avatarové plavby vlastní lodí jsou v I/knihovní evidenci. Námořní vojenské nasazení a úplné terénní civilizační kritérium zůstávají otevřené.

**Lidské přijetí čeká:** sjednat kontrakt, vysvětlit rozdíl vkladu/úschovy/doplatku, vybrat vlastní vozidlo, zrušit jednu jízdu, dokončit tři dodávky a potvrdit cenu; poslechnout odezvu a najít návrat do rozjednaného kontraktu po načtení. Automatika nedokládá lidské porozumění ani poslech. Ruční migrace není potřebná.

Dále skutečná dokončovací brána a B2 z městské historie, prostorová obrana/obnovitelné armády/terénní role, všechny cesty v nové souvislé kampani a C–E. Goal zůstává aktivní.
