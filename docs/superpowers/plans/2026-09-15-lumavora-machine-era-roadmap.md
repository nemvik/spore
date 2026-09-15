# LUMAVORA — Éra kmene, strojů a planety: souhrnný implementační plán

> ⚠️ **Čti spolu s [sladěním multiplayeru a nových etap](../specs/2026-09-15-reconciliation-multiplayer-vs-eras.md).** Tenhle dokument vznikl vedle druhého návrhu a v několika bodech si s ním sahá na totéž (verze uložené hry, jméno `Command`, signatura `step`, determinismus). Při rozporu platí sladění.


> **Pro agenty:** Tohle je **rozcestník přes čtyři části, ne prováděcí plán.** Neprovádí se přímo. Před zahájením každé části (P0–P3) napiš pro tu část detailní plán skillem `superpowers:writing-plans` a teprve ten prováděj skillem `superpowers:subagent-driven-development` nebo `superpowers:executing-plans`.

**Cíl:** Rozšířit kampaň za její současný pobřežní konec o tři etapy — Kmen, Stroje, Terraformace — po vzoru hry Spore.

**Architektura:** `Stage` se rozšíří z `0|1|2` na `0|1|2|3|4|5`. Nové etapy nedostanou `World`, ale tři volitelné verzované řezy `GameState` (`tribe?`, `machines?`, `planet?`) po vzoru stávajících `Journey.canopy?` a `rootDispersal?`. Ovládací model se mění po etapách: etapy 3 a 4 jsou RTS, etapa 5 se vrací k přímému řízení jedné jednotky. Editor se nezdvojuje — zobecní se na sdílený `Blueprint`.

**Tech stack:** TypeScript 5.9.2, Vite 7.1.5, Three.js 0.180.0, Vitest 3.2.4, Playwright 1.55.0, pnpm 11.24.0. Žádné nové závislosti.

**Spec:** [`2026-09-15-lumavora-machine-era-design.md`](../specs/2026-09-15-lumavora-machine-era-design.md) — **přečti celý, než začneš.** Tenhle plán z něj argumentuje a nenahrazuje ho.

**Pořadí prací:** etapy P0–P3 se dělají **první a jednohráčsky**. Multiplayer je odložená a volitelná nadstavba — viz [sladění §4](../specs/2026-09-15-reconciliation-multiplayer-vs-eras.md). Verzi 3 uložené hry si berou etapy.

### Číslování etap

Spec je čísluje jako kapitoly od jedničky (**04 Kmen, 05 Stroje, 06 Terraformace**), kód je indexuje od nuly. Tenhle plán a kód používají **indexy `Stage`**:

| Kapitola ve specu | `Stage` v kódu | Název |
|---|---|---|
| 01–03 | 0, 1, 2 | Mikrosvět, Útesy, Pobřeží *(existují dnes)* |
| 04 | **3** | Kmen |
| 05 | **4** | Stroje |
| 06 | **5** | Terraformace |

---

## Globální mantinely

Platí pro **každý** úkol ve všech čtyřech částech:

- **Žádné nové závislosti.** Hra běží bez backendu, účtu, placených API a runtime CDN.
- **Žádné texty v logice.** Veškerá kopie do `src/game/*-copy.cs.ts` nebo `src/ui/*.cs.ts`, ve stylu, který repo už používá.
- **Seedovaná simulace.** Veškerá náhodnost přes `random(world)` z `src/game/random.ts`. Nikdy `Math.random()` v simulaci.
- **Časování nezávislé na snímkové frekvenci.** Vždy přes `dt`, nikdy per-frame konstanty.
- **Testovací seedy:** `481516`, `20260913`, `8675309`.
- **Stabilní pořadí iterace.** Přes jednotky a sedadla se iteruje podle stabilního klíče (id, index), nikdy podle pořadí vložení do `Map`/`Set`. Seedovaná reprodukovatelnost je požadavek `GAME_BRIEF.md`.
- **Uložené hry verze 2 se musí načíst a dohrát** po každé části. Je to regresní test, ne jednorázová kontrola.
- **Významná informace se nesmí přenášet pouze barvou.**
- **Ověřovací příkazy** (musí projít před každým commitem):
  ```sh
  pnpm typecheck && pnpm test
  ```
  Před uzavřením každé části navíc: `pnpm build`, `pnpm test:browser`, `pnpm test:fixtures`, `pnpm test:soak`.
- **Debug zkratky měnící stav nesmí zůstat v produkčním sestavení.** Ověřuje `pnpm test:production`.

---

## Mapa souborů

### Existující soubory, kterých se to dotkne

| Soubor | Dnes | Zásah |
|---|---|---|
| `src/game/types.ts` | `Stage = 0|1|2`, `GameState.version: 2` | P0: rozšíření `Stage`, verze 3, tři volitelné řezy |
| `src/game/persistence.ts` | 481 ř., validace importu a checkpointů | P0: validátory nových řezů, opt-in migrace |
| `src/game/simulation.ts` | 310 ř., `tryTransition`, `tryWin`, sucho | P0: přechody pro nové etapy; P3: planetární regrese |
| `src/game/camera.ts` | 106 ř., kamera za tělem | P0: **přidat** režim nad krajinou, nesmí se forkovat |
| `src/game/navigation.ts` | 157 ř., pohyb jednotlivce s vyhýbáním | P1: základ skupinového pohybu |
| `src/game/encounter-ai.ts` | 246 ř., záměry `forage/flee/hunt/rest/bonded` | P1: chování členů tlupy |
| `src/game/genome.ts` | 249 ř., `ADAPTATIONS`, `computeStats` | P2: `Genome` → `Blueprint` s `kind: 'organism'` |
| `src/game/climate.ts` | 104 ř., sucho, vláha, opora kořeny | P3: povýšení na planetární měřítko |
| `src/main.ts` | 223 ř., HUD, editor, vstupy | P0: vstupní mapy po etapách; P2: editor nad `Blueprint` |
| `src/game/content.ts` | `CHAPTERS` má 3 položky | P0: šest kapitol |

### Nové soubory

```
src/game/stage.ts            P0  predikáty etap, jediný zdroj pravdy o tom, co která etapa je
src/game/unit-order.ts       P1  fronta rozkazů jednotkám, sdílí ji etapa 3 i 4
src/game/tribe.ts            P1  stav kmene, ekonomika jídla, dílny
src/game/tribe-neighbours.ts P1  cizí kmeny, vztahy, dobytí i spřátelení
src/game/blueprint.ts        P2  sdílený tvar konstrukce, katalogy, validace
src/game/machines.ts         P2  stroje, regiony, prameny, archetypy
src/game/planet.ts           P3  dvě osy, T-skóre, regrese, stabilizace
src/render/settlement.ts     P1  chýše, dílny, tlupa
src/render/machine.ts        P2  stroje z Blueprintu, sdílí sestavování s organism.ts
src/render/planet.ts         P3  planetární mapa, osy, T-skóre
src/game/tribe-copy.cs.ts    P1  kopie etapy 3
src/game/machine-copy.cs.ts  P2  kopie etapy 4
src/game/planet-copy.cs.ts   P3  kopie etapy 5
```

**Do `src/render/habitat.ts` (858 ř.) a `src/render/organism.ts` (714 ř.) se nic nepřidává.** Pokud si některá část vyžádá zásah do vykreslování terénu, rozdělí se `habitat.ts` **jako samostatný úkol předem**, ne mimochodem při té příležitosti.

---

## P0 — Základy

**Cíl:** Hra se chová **přesně jako dnes**, ale stojí na rozšířeném datovém modelu. Žádný nový herní obsah.

Tohle je nejdůležitější a zároveň nejnevděčnější část. Vzniká tu kostra, na kterou se všechno ostatní věší, a poznat, že je špatně, jde až v P2. Nespěchej.

### Úkoly

1. **`src/game/stage.ts` s predikáty.** `isOrganismStage`, `isCommandStage`, `isPlanetStage`. Zatím jen pro etapy 0–2, aby se predikáty daly zavést dřív, než `Stage` vůbec naroste.
2. **Nahradit porovnání `stage === 2` predikáty.** Projít celý `src/`. Je jich hodně a jsou rozeseté — `grep -rn "stage === 2\|stage !== 2\|stage < 2\|stage > 2" src/`. Čistě mechanická změna, žádná změna chování, všechny testy musí projít beze změny.
3. **Rozšířit `Stage` na `0|1|2|3|4|5`.** Typecheck vypíše všechna místa, kde rozšíření něco rozbilo — to je smysl kroku 2, aby jich bylo co nejmíň.
4. **`CHAPTERS` na šest položek.** Kapitoly 4–6 zatím s finální kopií, ale bez obsahu.
5. **Tři volitelné řezy v `GameState`** — `tribe?`, `machines?`, `planet?`, zatím prázdné verzované tvary.
6. **`GameState.version: 2 → 3`, `SavedEnvelope.version: 2 → 3`.** Uložená hra verze 2 se načte a dohraje; nové řezy chybí a to je platný stav.
7. **Validátory nových řezů v `persistence.ts`** ve stylu `validateJourney()`. Poškozený i neúplný řez musí být odmítnut se srozumitelnou chybou z `errors.cs.ts`.
8. **Rozšířit `makeCheckpoint()` a kontrolu shody** (`persistence.ts:388`) o nové řezy.
9. **Opt-in po vítězství.** Po `campaign.won` se nabídne pokračování do etapy 3. **Výslovná volba hráče, nikdy tichá migrace** — repo tenhle vzor má u `journey.legacy` a je potřeba ho dodržet.
10. **Vstupní mapy po etapách.** Dnes levé tlačítko vybírá cíl krmení (`FeedSelection`); v RTS etapách bude vybírat jednotky. Zavést mapu podle etapy místo přibývajících podmínek v obsluze ukazatele. Totéž pro `T`, `E`, `G`.
11. **Režim kamery nad krajinou** v `camera.ts`. Přidat, ne forkovat.
12. **Prázdná etapa 3**, do které se dá vstoupit a vrátit se z ní.
13. **Rozdělit `step()` na hráčskou a světovou část.** Simulace RTS jednotek a planety patří do světové části tak jako tak; bez rozdělení by se pletla s hráčskou. Signatura se zatím nemění.
14. **Hrdlo pro akce měnící stav.** Každá akce má jedno volatelné místo v `src/game/`, ne obsluhu kliknutí v `main.ts` — jak to hra dnes dělá u `evolve` a `tryTransition`. Kvůli testovatelnosti a checkpointům; shodou okolností to nechává otevřené dveře případnému multiplayeru.

> Body 13 a 14 nejsou ústupky multiplayeru — dávají smysl samy o sobě a teď jsou zadarmo. Viz sladění §4.3.

### Hotovo, když

- `pnpm typecheck && pnpm test && pnpm build` projde
- **všech 72 existujících testů prochází beze změny** — pokud jsi musel upravit existující test, změnil jsi chování a to P0 nesmí
- uložená hra verze 2 se načte, dohraje a **nespustí novou éru bez opt-inu** (nový regresní test)
- do prázdné etapy 3 se dá vstoupit, kamera se přepne, vrátit se dá zpět
- `pnpm test:browser`, `pnpm test:fixtures`, `pnpm test:soak` procházejí

---

## P1 — Etapa Kmen

**Cíl:** Hratelná RTS etapa, dokončitelná dobytím i spřátelením.

### Úkoly

1. **Fronta rozkazů** (`unit-order.ts`): `UnitOrder { unit, kind: 'move'|'gather'|'attack'|'socialize'|'build', target }`. **Ne `Command`** — to jméno si drží síťová vrstva, viz sladění K2.
2. **Výběr jednotek myší.** Rozšířit picking rendereru z dílů editoru (`graphics.pickPart`) na jednotky ve světě. Klik i tažení rámečkem.
3. **Skupinový pohyb.** **Steering a separace, ne A\*.** Terén je otevřená plocha s roztroušenými překážkami a geometrie vyhýbání už existuje a je otestovaná (`tests/obstacle-contact-regression.test.ts`, `tests/finite-obstacles.test.ts`). A\* by byl nový podsystém řešící problém, který hra nemá.
4. **Členové tlupy** jako tvorové s vlastníkem a rozkazem; chování staví na `encounter-ai.ts`.
5. **Ekonomika jídla.** Jídlo nahrazuje DNA. Kupuje členy, chýše a dílny. Žádné záporné ceny, žádný zisk z opakovaného stavění a rušení.
6. **Dílny a nástroje.** Nástroj jde vyrobit **až po postavení příslušné dílny**, která sama stojí jídlo.
7. **Výstroj místo editoru těla.** Druh je tvarově zamčený. Editor těla se v etapě 3 nahradí výstrojí.
8. **Kontinuita linie — tvrdá, ne kosmetická.** Tohle je místo, kde se rozšíření nejsnáz zvrhne v nesouvisející minihru:
   - `stats.diet` z finálního genomu určuje, **co tlupa vůbec umí sbírat**
   - závěrečná cesta z etapy 2 (`restoration`/`predator`/`migration`) dává startovní schopnost
   - symbionti z `player.bonds` přecházejí jako členové tlupy **se svým vlastním hladem**, ne jako pasivní bonus
9. **Sousední kmeny** a obě cesty k nim. Obě musí být plnohodnotné.
10. **Podmínka postupu 3→4** a zánik kmene při ztrátě posledního člena (nabídne obnovení z checkpointu, stejně jako dnešní smrt tvora).
11. **`render/settlement.ts`.**

### Hotovo, když

- etapa se dá dohrát **oběma cestami** skutečným ovládáním, ne přepsáním stavu
- genom z etapy 2 v ní **prokazatelně něco mění** (test, ne tvrzení)
- stav kmene přežije uložení, načtení i refresh
- browser test pokrývá výběr, rozkaz, stavbu a přechod

---

## P2 — Etapa Stroje

**Cíl:** Editor strojů a RTS nad krajinou, dokončitelná všemi třemi archetypy.

**Pozor:** Úkol 1 sahá na nejcennější existující kód ve hře. Nejdřív testy současného chování editoru, teprve pak refaktor.

### Úkoly

1. **Charakterizační testy stávajícího editoru** — rozpočet, validace, undo/redo, symetrie, zákaz filtru s čelistí. Píšou se **před** refaktorem a po něm musí projít beze změny.
2. **Zobecnit na `Blueprint`** (`blueprint.ts`): `{ version, kind: 'organism'|'vehicle', name, hue, pattern, parts[] }`. `Genome` se stane `Blueprint` s `kind: 'organism'` a **zůstane platným tvarem v uložených hrách**.
3. **Katalog dílů strojů**: trup, kabina, pohon, modul schopnosti. Tři staty — odolnost, síla, rychlost.
4. **Třídy nosičů.** Tank a letoun se **neliší jiným editorem, ale třídou nosiče**. Pozemní nese těžké moduly; vzdušný má menší nosnost a vyšší rychlost.
5. **Validace konstrukce.** Stroj bez pohonu, bez kabiny nebo s modulem, který na nosič nepatří, nejde potvrdit — analogicky k dnešnímu zákazu filtru s čelistí.
6. **`render/machine.ts`.** Sestavování sdílí s `organism.ts`. Platí briefové pravidlo: **stroj v editoru = stroj ve hře**.
7. **Regiony a prameny suroviny.** Zabraný pramen dává průběžný příjem.
8. **Asymetrie tank/letoun.** **Tank zabírá prameny, letoun ne; letoun přeletí jakýkoli terén a odemyká se později.** Musí být vynucená mechanicky, ne dekorativní — bez tanků není surovina, bez letounů se nedostaneš přes terasy.
9. **Tři archetypy** navázané na cestu z etapy 2: zahradníci obnovou, regulátoři silou, symbionti spojenectvím. Ne stejné schopnosti s jinými čísly — každý zabírá jinak.
10. **Podmínka postupu 4→5.**

### Hotovo, když

- **všechny tři archetypy dovedou etapu do konce** (cílené scénáře, transparentně označený rozsah testování)
- postavený stroj z editoru je **tentýž** stroj ve hře
- asymetrie tank/letoun je vynucená (test)
- charakterizační testy editoru z úkolu 1 procházejí beze změny
- `Genome` z uložené hry verze 2 se pořád načte

---

## P3 — Etapa Terraformace

**Cíl:** Planetární finále a konec kampaně.

Nejlevnější ze čtyř částí, protože jako jediná neběží na nové mechanice. Regrese planety je `campaign.drought` rostoucí v čase (`simulation.ts:273`); stabilizace je `landSiteSupport()` a `livingRootStrength()` (`climate.ts:7–30`) povýšené na planetární měřítko; usazený druh je `EcologySite` s vitalitou a živým zdrojem. **Nepiš to znovu — rozšiř to.**

### Úkoly

1. **Návrat k přímému řízení jedné jednotky** plus planetární mapa, přepínaná klávesou.
2. **Dvě osy — teplota a vláha** — a bod, který se tlačí ke středu.
3. **T-skóre T0–T3.** Každý prolomený kruh zvedne stupeň. T-skóre určuje, kolik osad planeta unese.
4. **Stroje jako nástroje terraformace.** Tank vrtá a uvolňuje podzemní vodu, letoun rozprašuje, seje a ochlazuje. Konstrukce z P2 má důsledky i tady.
5. **Regrese.** **Nestabilizované T-skóre skutečně klesá.** Ověřit na stavu, ne na textu v HUD.
6. **Stabilizace životem** z vlastní linie: producenti, býložravci, lovec. Na každý stupeň několik druhů.
7. **Finále a shrnutí celé linie** od první kapky po planetu, plus sandbox.
8. **`render/planet.ts`.**

### Hotovo, když

- nestabilizovaná planeta **měřitelně klesá**, stabilizovaná drží
- obojí **přežije uložení a načtení**
- kampaň má konec a shrnutí linie
- existuje **alespoň jeden úplný průchod od nové hry po finále skutečným ovládáním**

---

## Pořadí a závislosti

```
P0 ──→ P1 ──→ P2 ──→ P3
 │       │      │
 │       │      └─ P3 potřebuje stroje z P2 jako nástroje
 │       └─ P2 potřebuje RTS vrstvu a archetyp z P1
 └─ všechno potřebuje rozšířený Stage a persistenci
```

Pořadí je **striktně sekvenční.** Každá část končí spustitelným, dohratelným stavem — projekt se nesmí ocitnout rozdělaný mezi částmi. Po každé části aktualizuj `PROGRESS.md` a `README.md`.

---

## Rizika a jak se jim čelí

| Riziko | Kde hrozí | Obrana |
|---|---|---|
| RTS vrstva je celý nový podsystém | P1 | steering místo A\*, maximum z `navigation.ts` a `encounter-ai.ts`; P1 nezačít, dokud P0 nestojí |
| Refaktor editoru rozbije nejcennější kód | P2 | charakterizační testy **před** refaktorem; `Genome` zůstane platným tvarem |
| Nové etapy se odtrhnou od organismu | P1, P2 | `stats.diet` a závěrečná cesta mají tvrdé mechanické důsledky, **testované** |
| Projekt zůstane rozdělaný | všude | čtyři samostatně dokončitelné části, každá se spustitelným výsledkem |
| Rozrostlé renderovací soubory | P1–P3 | nové moduly; `habitat.ts` se dělí předem a jako samostatný úkol |
| Tempo mimo hratelnou délku | P1–P3 | každá etapa cílí na 20–30 min; **uvádět jako cíl, ne jako měření** |

---

## Otevřené otázky

Nebrání zahájení P0. Před příslušnou částí je **rozhodni se zadavatelem**, nedomýšlej je:

| # | Otázka | Kdy |
|---|---|---|
| 1 | Velikost tlupy — Spore měl až 12. Kolik unese renderování a čitelnost? Rozhodnout měřením. | před P1 |
| 2 | Rozsah výstroje — kolik nástrojů, aby volba byla skutečná a každý se dal odlišit tvarem a chováním? | před P1 |
| 3 | Jméno suroviny etapy 4 — ve Spore koření; LUMAVORA potřebuje vlastní název do světa. | před P2 |
| 4 | Námořní stroje — spec je vynechává. Vrátit, pokud etapa 4 dostane splavnou vodu? | před P2 |
| 5 | Odkud se berou druhy pro stabilizaci — jen ty, se kterými linie žila, nebo i potkané? | před P3 |

---

## Předání dalšímu agentovi

1. Přečti **celý spec**, nejen tenhle plán.
2. Vyber část, která je na řadě — pořadí je striktní.
3. Rozhodni otevřené otázky té části **se zadavatelem**.
4. Napiš detailní plán té části skillem `superpowers:writing-plans` do `docs/superpowers/plans/`.
5. Prováděj ho skillem `superpowers:subagent-driven-development` nebo `superpowers:executing-plans`.
6. Po dokončení aktualizuj `PROGRESS.md`, `README.md` a `BENCHMARK_REPORT.md` — v něm **odděluj splněno a ověřeno / implementováno, ale neověřeno / nesplněno**, jak to repo dělá dnes.

**Nepovažuj splněné testy za důkaz, že jsou nové etapy zábavné nebo že tempo sedí.** To vyžaduje skutečné hraní a uvádí se odděleně.
