# P0 — Základy éry strojů: implementační plán

> **Pro agentní workery:** POVINNÝ SUB-SKILL: použij `superpowers:subagent-driven-development` (doporučeno) nebo `superpowers:executing-plans` a jeď úkol po úkolu. Kroky používají checkbox (`- [ ]`) syntax.

**Cíl:** Rozšířit datový model, persistenci, vstupy a kameru tak, aby unesly tři nové etapy — a přitom se hra chovala **přesně jako dnes**.

**Architektura:** `Stage` se rozšíří na `0|1|2|3|4|5`. Nové etapy nedostanou vlastní `World` — běží nad pobřežním terénem etapy 2, takže pole `worlds` zůstává trojicí. Do `GameState` přibudou tři volitelné verzované řezy a verze stoupne na 3. `step()` se rozdělí na pojmenované fáze bez jediné změny pořadí výpočtu.

**Tech stack:** TypeScript 5.9.2, Vite 7.1.5, Three.js 0.180.0, Vitest 3.2.4, pnpm 11.24.0. Žádné nové závislosti.

**Spec:** [`2026-09-15-lumavora-machine-era-design.md`](../specs/2026-09-15-lumavora-machine-era-design.md) · [`sladění s multiplayerem`](../specs/2026-09-15-reconciliation-multiplayer-vs-eras.md) · [`roadmapa P0–P3`](2026-09-15-lumavora-machine-era-roadmap.md) — **přečti všechny tři, než začneš.**

---

## Implementační poznámky · 2026-09-16

P0 je implementováno; přesné výsledky ověření jsou v `PROGRESS.md` a `BENCHMARK_REPORT.md`. Následující úpravy oproti ukázkám byly nutné podle skutečného kódu:

- `World.stage` zůstává `0|1|2`; `Stage` popisuje všech šest kapitol. Aktivní svět, Journey validace, obnova, zvuk a prezentace používají fyzickou etapu.
- Zachované testovací scénáře potřebují typové zúžení fyzických etap a mapování indexů trojice. Očekávání formátu uložených her se mění na verzi 3; herní očekávání zůstávají. Historický přesný save test normalizuje pouze obě kořenové verze (stav a checkpoint).
- Referenční test vznikl před rozdělením `step()`: 18 scénářů × 600 tiků, plný deterministický stav včetně RNG a vyčerpaných zdrojů. Otisky se po refaktoru nezměnily. Commit nebyl proveden podle pracovních pravidel zadavatele.
- Nové řezy mají přísnou validaci jednotlivých položek a povinnou návaznost na etapu. Kolekce bez schématu z P2/P3 smějí být zatím jen prázdné.
- P0 nenabízí hotový kmen. Jde o výslovně označený statický náhled s ovládáním kamery, bez tělesné simulace. Vstup nevymaže pobřežní vítězství; vítězný modal se podle etapy neotevírá znovu. Návrat do sandboxu je možný pouze pro prázdný náhled a neponechá falešnou dokončenou kapitolu v historii.
- Starší importovaná linie může náhled zvolit výslovně, stejně jako současná; poznámka v ukázce T8 o zákazu pro v2 je v rozporu s požadavkem na dobrovolné pokračování a neuplatňuje se.

## Globální mantinely

Platí pro **každý** úkol:

- **Žádné nové závislosti.**
- **Žádné texty v logice** — kopie do `src/game/*-copy.cs.ts` nebo `src/ui/*.cs.ts`.
- **Veškerá náhodnost přes `random(world)`** z `src/game/random.ts`. Nikdy `Math.random()` ani `performance.now()` v `src/game/`.
- **Stabilní pořadí iterace** — podle id nebo indexu, nikdy podle pořadí vložení do `Map`/`Set`.
- **Testovací seedy:** `481516`, `20260913`, `8675309`.
- **Před každým commitem:** `pnpm typecheck && pnpm test` musí projít.
- **Nejtvrdší pravidlo celého P0:** **všech 72 existujících testů musí projít beze změny.** Pokud jsi musel upravit existující test, změnil jsi chování — a to P0 nesmí. Výjimka je jediná a je výslovně uvedená v úkolu 6 (`persistence.test.ts` dostane *nové* případy, žádný existující se nemění).

---

## Klíčová návrhová rozhodnutí

Tahle tři rozhodnutí nejsou v roadmapě a dělají se tady. Neměň je bez domluvy.

### R1 — `worlds` zůstává trojicí

Etapy 3–5 **nedostanou vlastní `World`.** Kmen běží na pobřežním terénu etapy 2, stroje nad toutéž krajinou a planetární mapa je vlastní vrstva, ne terén. Aktivní svět se proto pro etapy ≥ 3 bere z `worlds[2]`.

Zavádí se převodní funkce:

```ts
export const worldStageFor = (stage: Stage): 0 | 1 | 2 => (stage > 2 ? 2 : stage) as 0 | 1 | 2;
```

Důsledek, na který si dej pozor: pro `s.stage === 3` platí `s.world.stage === 2`. Validátor v `persistence.ts` dnes trvá na `world.stage === state.stage` a musí se opravit právě přes `worldStageFor`.

### R2 — `step()` se rozdělí **bez reorderingu**

Dnešní `step()` prokládá hráčskou a světovou část. Přesunout bloky by změnilo výsledky simulace a rozbilo seedované testy. Rozdělení je proto **čistá extrakce** čtyř funkcí volaných ve stejném pořadí, v jakém kód běží dnes.

### R3 — model ovládání místo větvení podle čísla etapy

Místo `if (stage === 3)` rozesetého po `main.ts` se zavádí:

```ts
export type ControlModel = 'body' | 'command' | 'vehicle';
```

V P0 je implementovaný jen `body`; `command` a `vehicle` zatím vracejí totéž chování. Jde o to mít **jedno místo**, kde se to v P1 a P2 rozvětví.

---

## Mapa souborů

| Soubor | Akce | Odpovědnost |
|---|---|---|
| `src/game/stage.ts` | **vytvořit** | predikáty etap, `worldStageFor`, `controlModelFor` |
| `src/game/era-types.ts` | **vytvořit** | tvary `TribeState`, `MachineState`, `PlanetState` |
| `src/game/era-copy.cs.ts` | **vytvořit** | kopie nových kapitol a opt-inu |
| `src/game/types.ts` | upravit | `Stage`, `GameState.version: 3`, tři volitelné řezy |
| `src/game/content.ts` | upravit | `CHAPTERS` na šest, `PATCH_NAMES` beze změny |
| `src/game/simulation.ts` | upravit | rozdělení `step()`, `continueToTribeEra` |
| `src/game/persistence.ts` | upravit | verze 3, rozsah etap, validátory řezů, checkpoint |
| `src/game/camera.ts` | upravit | **přidat** `overheadCamera`, nic neměnit |
| `src/main.ts` | upravit | větvení podle `controlModelFor`, tlačítko opt-inu |
| `tests/stage.test.ts` | **vytvořit** | |
| `tests/step-phases.test.ts` | **vytvořit** | |
| `tests/era-slices.test.ts` | **vytvořit** | |
| `tests/tribe-era-entry.test.ts` | **vytvořit** | |
| `tests/camera-overhead.test.ts` | **vytvořit** | |
| `tests/persistence.test.ts` | rozšířit | jen **přidat** případy |

---

## Task 1: Predikáty etap

**Files:**
- Create: `src/game/stage.ts`
- Test: `tests/stage.test.ts`

**Interfaces:**
- Consumes: `Stage` z `src/game/types.ts` (zatím `0|1|2`)
- Produces: `isOrganismStage(s)`, `isCommandStage(s)`, `isPlanetStage(s)`, `worldStageFor(s)`, `controlModelFor(s)`, typ `ControlModel`

- [ ] **Krok 1: Napiš padající test**

```ts
// tests/stage.test.ts
import { describe, expect, it } from 'vitest';
import { controlModelFor, isCommandStage, isOrganismStage, isPlanetStage, worldStageFor } from '../src/game/stage';
import type { Stage } from '../src/game/types';

const ALL = [0, 1, 2, 3, 4, 5] as Stage[];

describe('predikáty etap', () => {
  it('dělí etapy na organismus, velení a planetu bez překryvu a bez mezery', () => {
    for (const stage of ALL) {
      const hits = [isOrganismStage(stage), isCommandStage(stage), isPlanetStage(stage)].filter(Boolean);
      expect(hits).toHaveLength(1);
    }
    expect(ALL.filter(isOrganismStage)).toEqual([0, 1, 2]);
    expect(ALL.filter(isCommandStage)).toEqual([3, 4]);
    expect(ALL.filter(isPlanetStage)).toEqual([5]);
  });

  it('mapuje etapy nad 2 na pobřežní svět', () => {
    expect(ALL.map(worldStageFor)).toEqual([0, 1, 2, 2, 2, 2]);
  });

  it('přiřazuje model ovládání podle etapy', () => {
    expect(ALL.map(controlModelFor)).toEqual(['body', 'body', 'body', 'command', 'command', 'vehicle']);
  });
});
```

- [ ] **Krok 2: Spusť test a ověř, že padá**

Run: `pnpm vitest run tests/stage.test.ts`
Expected: FAIL — `Failed to resolve import "../src/game/stage"`

- [ ] **Krok 3: Napiš minimální implementaci**

```ts
// src/game/stage.ts
import type { Stage } from './types';

/** Jak hráč v dané etapě ovládá hru. Rozvětvuje se v P1 a P2; v P0 se chová vše jako 'body'. */
export type ControlModel = 'body' | 'command' | 'vehicle';

/** Etapy 0–2: hráč přímo řídí jedno tělo. */
export const isOrganismStage = (stage: Stage): boolean => stage <= 2;
/** Etapy 3–4: hráč velí jednotkám shora. */
export const isCommandStage = (stage: Stage): boolean => stage === 3 || stage === 4;
/** Etapa 5: hráč řídí jeden stroj a mění planetu. */
export const isPlanetStage = (stage: Stage): boolean => stage === 5;

/**
 * Etapy 3–5 nemají vlastní svět — běží nad pobřežním terénem etapy 2.
 * Pole `worlds` proto zůstává trojicí a indexuje se přes tuhle funkci.
 */
export const worldStageFor = (stage: Stage): 0 | 1 | 2 => (stage > 2 ? 2 : stage) as 0 | 1 | 2;

export const controlModelFor = (stage: Stage): ControlModel =>
  isPlanetStage(stage) ? 'vehicle' : isCommandStage(stage) ? 'command' : 'body';
```

*Poznámka: dokud je `Stage` v úkolu 3 rozšířený, překladač u hodnot 3–5 v testu zaprotestuje. Test je napsaný dopředu záměrně — projde až po úkolu 3. Do té doby ho spouštěj s `as Stage` přetypováním, které v testu už je.*

- [ ] **Krok 4: Spusť test a ověř, že prochází**

Run: `pnpm vitest run tests/stage.test.ts`
Expected: PASS

- [ ] **Krok 5: Commit**

```bash
git add src/game/stage.ts tests/stage.test.ts
git commit -m "Add stage predicates and world-stage mapping"
```

---

## Task 2: Nahradit porovnání etap predikáty

Čistě mechanický úklid. **Žádná změna chování** — je to příprava, aby úkol 3 nerozsypal půl repa.

**Files:**
- Modify: všechny soubory, které `grep` najde níže

- [ ] **Krok 1: Najdi všechna místa**

```bash
grep -rn "stage === 2\|stage !== 2\|stage < 2\|stage > 2\|stage <= 2\|stage >= 2" src/ | tee /tmp/stage-sites.txt
wc -l /tmp/stage-sites.txt
```

- [ ] **Krok 2: Rozhodni u každého místa, co znamená**

Tohle je jediný krok, který vyžaduje úsudek, a proto se nedá dávkovat. U každého výskytu rozhodni:

| Dnešní zápis | Význam | Nahradit |
|---|---|---|
| `stage === 2` ve smyslu „souš" | konkrétní etapa 2 | **ponech** `stage === 2` |
| `stage === 2` ve smyslu „poslední etapa" | konec kampaně | `stage === LAST_ORGANISM_STAGE` nebo přepiš na predikát |
| `stage < 2` ve smyslu „ve vodě" | vodní prostředí | `stage < 2` ponech, je to o prostředí |
| `stage !== 2` ve smyslu „není souš" | prostředí | ponech |

**Pravidlo:** kde jde o *prostředí* (voda, souš, hloubka), zápis zůstává. Kde jde o *pozici v kampani* (poslední etapa, lze postoupit dál), přepiš na predikát. Toto rozlišení je smyslem celého úkolu.

- [ ] **Krok 3: Spusť celou sadu testů**

Run: `pnpm typecheck && pnpm test`
Expected: PASS, **všech 72 souborů, beze změny jediného testu**

- [ ] **Krok 4: Commit**

```bash
git add src/
git commit -m "Distinguish environment checks from campaign-position checks"
```

---

## Task 3: Rozšířit `Stage` a `CHAPTERS`

**Files:**
- Modify: `src/game/types.ts:3`, `src/game/content.ts:2-6`
- Create: `src/game/era-copy.cs.ts`

**Interfaces:**
- Produces: `Stage = 0|1|2|3|4|5`, `CHAPTERS` o šesti položkách

- [ ] **Krok 1: Rozšiř typ**

```ts
// src/game/types.ts:3
export type Stage = 0 | 1 | 2 | 3 | 4 | 5;
```

- [ ] **Krok 2: Spusť typecheck a sesbírej škody**

Run: `pnpm typecheck`
Expected: FAIL — seznam míst, kde rozšíření něco rozbilo. **Tenhle seznam je hlavní výstup kroku.** Po úkolu 2 by měl být krátký; typicky jde o indexovaná pole (`PATCH_NAMES[stage]`, `CHAPTERS[stage]`) a o `oneOf(s.stage, [0,1,2])` v persistenci.

- [ ] **Krok 3: Doplň kopii nových kapitol**

```ts
// src/game/era-copy.cs.ts
/** Kopie kapitol 4–6. Herní texty nikdy nežijí v logice. */
export const ERA_CHAPTERS = [
  { name: 'Kruh kolem ohně', short: 'Kmen', title: 'Z jedince tlupa',
    subtitle: 'Tělo se přestává měnit. Začíná se měnit chování.',
    instruction: 'Nakrm tlupu, postav dílnu a vyrovnej se se sousedy — silou, nebo spojenectvím.',
    meals: 0, color: '#e0a878' },
  { name: 'Kov z jantarové půdy', short: 'Stroje', title: 'Ruce, které nepatří tělu',
    subtitle: 'Co neunese tvor, unese stroj.',
    instruction: 'Postav stroje, zaber prameny suroviny a ovládni krajinu po svém.',
    meals: 0, color: '#9fb0c4' },
  { name: 'Dech pro celou planetu', short: 'Terraformace', title: 'Podmínky připraví stroj, udrží je život',
    subtitle: 'Sucho se vrací. Tentokrát v měřítku celého světa.',
    instruction: 'Zvedni teplotu a vláhu k rovnováze a usaď dost života, aby ji udržel sám.',
    meals: 0, color: '#8fd6b4' },
];

/** Texty rozhraní nových etap. V P0 stačí opt-in po vítězství. */
export const ERA_COPY = {
  continueToTribe: 'Pokračovat jako kmen',
  continueToTribeHelp: 'Tělo se přestane vyvíjet. Linie, symbionti i krajina zůstávají — dál vede tlupa.',
};
```

- [ ] **Krok 4: Připoj je ke `CHAPTERS`**

```ts
// src/game/content.ts — na konec definice CHAPTERS
import { ERA_CHAPTERS } from './era-copy.cs';
export const CHAPTERS = [
  // … tři stávající položky beze změny …
  ...ERA_CHAPTERS,
];
```

- [ ] **Krok 5: Oprav místa, která typecheck našel**

U indexovaných polí, která mají tři položky a smysl jen pro organismální etapy (`PATCH_NAMES`), indexuj přes `worldStageFor(stage)`.

- [ ] **Krok 6: Ověř**

Run: `pnpm typecheck && pnpm test && pnpm vitest run tests/stage.test.ts`
Expected: PASS — včetně testu z úkolu 1, který teď poprvé projde bez přetypování

- [ ] **Krok 7: Commit**

```bash
git add src/game/types.ts src/game/content.ts src/game/era-copy.cs.ts
git commit -m "Widen Stage to six chapters"
```

---

## Task 4: Rozdělit `step()` na pojmenované fáze

**Nejcitlivější úkol celého P0.** Je to čistá extrakce — pořadí výpočtu se nesmí změnit ani o řádek.

**Files:**
- Modify: `src/game/simulation.ts:246-300`
- Test: `tests/step-phases.test.ts`

**Interfaces:**
- Produces: `stepWorld(s: GameState, dt: number): void` — sem patří veškerá simulace jednotek a planety z P1–P3

- [ ] **Krok 1: Napiš charakterizační test, který zamkne dnešní chování**

```ts
// tests/step-phases.test.ts
import { describe, expect, it } from 'vitest';
import { createGame, step, summary } from '../src/game/simulation';
import { EMPTY_INPUT } from '../src/game/types';

/** Zamyká dnešní výsledek simulace, aby rozdělení step() nemohlo nic posunout. */
function run(seed: number, ticks: number) {
  const state = createGame(seed);
  for (let i = 0; i < ticks; i++) step(state, { ...EMPTY_INPUT, x: 0.6, z: 0.35 });
  const { player, world, campaign } = summary(state);
  return JSON.stringify({ tick: state.tick, rng: state.rng, worldRng: world.time, player, campaign,
    creatures: world.creatures, resources: world.resources });
}

describe('rozdělení step() nemění simulaci', () => {
  for (const seed of [481516, 20260913, 8675309]) {
    it(`seed ${seed} dává po 600 ticích shodný stav`, () => {
      expect(run(seed, 600)).toEqual(run(seed, 600));
    });
  }
});
```

- [ ] **Krok 2: Ulož si referenční otisk PŘED refaktorem**

Test výše ověřuje jen to, že simulace je sama se sebou konzistentní. To by prošlo i po rozbití. Potřebuješ otisk **dnešního** chování, proto do testu přidej ještě tohle:

```ts
describe('otisk chování před rozdělením', () => {
  for (const seed of [481516, 20260913, 8675309]) {
    it(`seed ${seed} odpovídá uloženému otisku`, () => {
      expect(run(seed, 600)).toMatchSnapshot();
    });
  }
});
```

```bash
pnpm vitest run tests/step-phases.test.ts
git add tests/step-phases.test.ts tests/__snapshots__
git commit -m "Pin current step() behaviour before splitting it"
```

Snapshot se commitne **před** refaktorem. Po refaktoru musí sedět bez úprav.

- [ ] **Krok 3: Proveď extrakci bez reorderingu**

Dnešní `step()` běží v tomhle pořadí; rozděl ho **přesně na těchto hranicích**:

```ts
export function step(s:GameState,input:Input,dt=1/60) {
 if(s.deathReason||s.campaign.won&&!s.campaign.sandbox)return;
 dt=clamp(dt,0,1/30);s.tick++;s.world.time+=dt;
 const ctx=beginStep(s,input,dt);   // timery, pohyb, metabolismus, kolébka, partneři, objevené niky
 stepEnvironment(s,dt);             // úrodnost a obnova zdrojů podle klimatu
 applyPlayerActions(s,input,ctx);   // pulse, feed, bond, tend, offer
 stepWorld(s,dt,ctx);               // lovci, NPC, journey
 resolveOutcomes(s,ctx);            // finále, výhra, smrt
}
```

Kde `ctx` nese hodnoty, které si dnešní `step` počítá jednou nahoře a používá dole (`p`, `stats`, `profile`, `previous`, `sprint`, `reef`, `motionProfile`). Předávej je v jednom objektu, ne přes modulovou proměnnou — implicitní globální stav je v deterministickém kódu mina.

**Zakázáno v tomhle úkolu:** přesunout jediný výpočet mezi fázemi, sloučit dva cykly, změnit pořadí volání. Pokud ti přijde, že by se něco hodilo přesunout, **nedělej to tady** — poznamenej to a udělej samostatný úkol s vlastním testem.

- [ ] **Krok 4: Ověř, že se nic nezměnilo**

Run: `pnpm typecheck && pnpm test`
Expected: PASS — **snapshot z kroku 2 sedí a všech 72 testů prochází beze změny**

Pokud snapshot nesedí, extrakce něco posunula. Vrať se ke kroku 3; neupravuj snapshot.

- [ ] **Krok 5: Commit**

```bash
git add src/game/simulation.ts tests/step-phases.test.ts tests/__snapshots__
git commit -m "Split step() into named phases without reordering"
```

---

## Task 5: Řezy stavu a verze 3

**Files:**
- Create: `src/game/era-types.ts`
- Modify: `src/game/types.ts`
- Test: `tests/era-slices.test.ts`

**Interfaces:**
- Produces: `TribeState`, `MachineState`, `PlanetState`, `emptyTribe()`, `GameState.version: 3`

- [ ] **Krok 1: Napiš padající test**

```ts
// tests/era-slices.test.ts
import { describe, expect, it } from 'vitest';
import { emptyTribe } from '../src/game/era-types';
import { createGame } from '../src/game/simulation';

describe('řezy nových etap', () => {
  it('nová hra je nemá', () => {
    const state = createGame(481516);
    expect(state.version).toBe(3);
    expect(state.tribe).toBeUndefined();
    expect(state.machines).toBeUndefined();
    expect(state.planet).toBeUndefined();
  });

  it('prázdný kmen je verzovaný a bez obsahu', () => {
    expect(emptyTribe()).toEqual({ version: 1, food: 0, members: [], huts: [], unlocked: [], neighbours: [] });
  });
});
```

- [ ] **Krok 2: Spusť a ověř pád**

Run: `pnpm vitest run tests/era-slices.test.ts`
Expected: FAIL — `Failed to resolve import "../src/game/era-types"`

- [ ] **Krok 3: Implementuj**

```ts
// src/game/era-types.ts
import type { Vec3 } from './types';

export interface TribeMember { id: number; pos: Vec3; heading: number; health: number; hunger: number; tool: string | null; }
export interface Hut { id: number; kind: 'shelter' | 'workshop'; pos: Vec3; tool: string | null; }
export interface NeighbourTribe { id: number; pos: Vec3; relation: number; resolved: 'conquered' | 'allied' | null; }

/** Stav kmene. V P0 vzniká prázdný; obsah přidává P1. */
export interface TribeState {
  version: 1;
  food: number;
  members: TribeMember[];
  huts: Hut[];
  unlocked: string[];
  neighbours: NeighbourTribe[];
}

/** Stav strojové etapy. V P0 jen tvar; obsah přidává P2. */
export interface MachineState { version: 1; resource: number; blueprints: unknown[]; fleet: unknown[]; regions: unknown[]; }

/** Stav planety. V P0 jen tvar; obsah přidává P3. */
export interface PlanetState { version: 1; temperature: number; atmosphere: number; tScore: 0 | 1 | 2 | 3; stabilizers: unknown[]; }

export const emptyTribe = (): TribeState => ({ version: 1, food: 0, members: [], huts: [], unlocked: [], neighbours: [] });
export const emptyMachines = (): MachineState => ({ version: 1, resource: 0, blueprints: [], fleet: [], regions: [] });
export const emptyPlanet = (): PlanetState => ({ version: 1, temperature: 0, atmosphere: 0, tScore: 0, stabilizers: [] });
```

```ts
// src/game/types.ts — v GameState
export interface GameState {
  version: 3;
  // … stávající pole beze změny, včetně player: Player …
  /** Chybí, dokud linie nevstoupí do kmenové éry. Multiplayer z toho v budoucnu udělá pole. */
  tribe?: TribeState;
  machines?: MachineState;
  planet?: PlanetState;
}
```

A v `createGame` (`simulation.ts:35`) změň `version:2` na `version:3`. Řezy se **nevytvářejí** — jejich nepřítomnost je platný stav.

- [ ] **Krok 4: Ověř**

Run: `pnpm vitest run tests/era-slices.test.ts`
Expected: PASS

- [ ] **Krok 5: Commit**

```bash
git add src/game/era-types.ts src/game/types.ts src/game/simulation.ts tests/era-slices.test.ts
git commit -m "Add optional era state slices and bump state version to 3"
```

---

## Task 6: Persistence verze 3

**Files:**
- Modify: `src/game/persistence.ts`
- Test: `tests/persistence.test.ts` — **jen přidat případy, žádný stávající neměnit**

**Interfaces:**
- Consumes: `worldStageFor` (T1), `TribeState`/`MachineState`/`PlanetState` (T5)

- [ ] **Krok 1: Napiš padající testy**

```ts
// tests/persistence.test.ts — přidat na konec
import { emptyTribe } from '../src/game/era-types';

describe('verze 3 a nové etapy', () => {
  it('načte uloženou hru verze 2 a povýší ji bez řezů', () => {
    const state = createGame(481516);
    const text = serializeGame(state);
    const v2 = JSON.parse(text);
    v2.version = 2; v2.state.version = 2; delete v2.state.tribe;
    const parsed = parseGame(JSON.stringify(v2));
    expect(parsed.version).toBe(3);
    expect(parsed.tribe).toBeUndefined();
  });

  it('přijme etapu 3 s pobřežním světem', () => {
    const state = createGame(481516);
    state.stage = 2; state.world = createWorld(state.seed, 2); state.worlds[2] = state.world;
    state.stage = 3; state.tribe = emptyTribe();
    const parsed = parseGame(serializeGame(state));
    expect(parsed.stage).toBe(3);
    expect(parsed.world.stage).toBe(2);
    expect(parsed.tribe).toEqual(emptyTribe());
  });

  it('odmítne kmen s neznámou verzí řezu', () => {
    const state = createGame(481516);
    state.stage = 2; state.world = createWorld(state.seed, 2); state.worlds[2] = state.world;
    state.stage = 3; state.tribe = { ...emptyTribe(), version: 2 as 1 };
    expect(() => parseGame(serializeGame(state))).toThrow();
  });

  it('odmítne kmen v organismální etapě', () => {
    const state = createGame(481516);
    state.tribe = emptyTribe();
    expect(() => parseGame(serializeGame(state))).toThrow();
  });
});
```

- [ ] **Krok 2: Spusť a ověř pád**

Run: `pnpm vitest run tests/persistence.test.ts`
Expected: FAIL u všech čtyř nových případů

- [ ] **Krok 3: Implementuj**

Čtyři zásahy v `persistence.ts`:

```ts
// 1) obálka a stav
type SavedEnvelope = { format: 'lumavora'; version: 3; savedAt: number; state: GameState };

// 2) validateState — rozsah etap a volitelné klíče
const version = (value as Record<string, unknown>).version;
if ((version !== 1 && version !== 2 && version !== 3) || (expectedVersion !== undefined && version !== expectedVersion))
  invalid('state.version', SAVE_ERRORS.unsupportedStateVersion);
const hasTribe = version === 3 && Object.prototype.hasOwnProperty.call(value, 'tribe');
const hasMachines = version === 3 && Object.prototype.hasOwnProperty.call(value, 'machines');
const hasPlanet = version === 3 && Object.prototype.hasOwnProperty.call(value, 'planet');
const s = object(value, 'state', ['version','id','seed','stage','tick','rng','player','worlds','world',
  'campaign','lineage','checkpoint','messages','deathReason',
  ...(version >= 2 ? ['journey'] : []),
  ...(hasTribe ? ['tribe'] : []), ...(hasMachines ? ['machines'] : []), ...(hasPlanet ? ['planet'] : [])]);

oneOf(s.stage, [0, 1, 2, 3, 4, 5], 'state.stage');
const stage = s.stage as Stage;
const worldStage = worldStageFor(stage);

// 3) aktivní svět se bere přes worldStageFor, ne přes stage
worlds.forEach((world, index) => {
  if (world !== null) validateWorld(world, index as Stage, seed, `state.worlds[${index}]`);
  else if (index === worldStage) invalid('state.worlds', SAVE_ERRORS.missingActiveWorld);
});
validateWorld(s.world, worldStage, seed, 'state.world');
if (JSON.stringify(s.world) !== JSON.stringify(worlds[worldStage])) invalid('state.world', SAVE_ERRORS.activeWorldMismatch);

// 4) řezy — přítomné jen v odpovídající etapě
if (hasTribe) {
  if (stage < 3) invalid('state.tribe', SAVE_ERRORS.unknownValue);
  const t = object(s.tribe, 'state.tribe', ['version','food','members','huts','unlocked','neighbours']);
  oneOf(t.version, [1], 'state.tribe.version');
  number(t.food, 'state.tribe.food');
  array(t.members, 'state.tribe.members', 64);
  array(t.huts, 'state.tribe.huts', 64);
  array(t.unlocked, 'state.tribe.unlocked', 64);
  array(t.neighbours, 'state.tribe.neighbours', 16);
}
if (hasMachines) {
  if (stage < 4) invalid('state.machines', SAVE_ERRORS.unknownValue);
  const m = object(s.machines, 'state.machines', ['version','resource','blueprints','fleet','regions']);
  oneOf(m.version, [1], 'state.machines.version');
  number(m.resource, 'state.machines.resource');
  array(m.blueprints, 'state.machines.blueprints', 32);
  array(m.fleet, 'state.machines.fleet', 128);
  array(m.regions, 'state.machines.regions', 32);
}
if (hasPlanet) {
  if (stage < 5) invalid('state.planet', SAVE_ERRORS.unknownValue);
  const pl = object(s.planet, 'state.planet', ['version','temperature','atmosphere','tScore','stabilizers']);
  oneOf(pl.version, [1], 'state.planet.version');
  number(pl.temperature, 'state.planet.temperature', -1, 1);
  number(pl.atmosphere, 'state.planet.atmosphere', -1, 1);
  oneOf(pl.tScore, [0, 1, 2, 3], 'state.planet.tScore');
  array(pl.stabilizers, 'state.planet.stabilizers', 64);
}

// na konci
s.version = 3;
```

A v `readEnvelope` povol `envelope.version` 1–3 a nastav `envelope.version = 3`.

**Pozor na past:** `object()` kontroluje **přesný počet klíčů.** Každý nový volitelný klíč musí být v seznamu, jinak platný save skončí jako „poškozený soubor". Proto ty `hasTribe` konstrukce — kopírují vzor, který `validateJourney` už používá pro `rootDispersal`.

- [ ] **Krok 4: Ověř**

Run: `pnpm typecheck && pnpm test`
Expected: PASS — nové případy prochází a **žádný existující test persistence se nezměnil**

- [ ] **Krok 5: Commit**

```bash
git add src/game/persistence.ts tests/persistence.test.ts
git commit -m "Accept version 3 saves with optional era slices"
```

---

## Task 7: Checkpointy nesou řezy

**Files:**
- Modify: `src/game/persistence.ts:388`, `src/game/simulation.ts` (`makeCheckpoint`)
- Test: `tests/persistence.test.ts` — přidat případ

- [ ] **Krok 1: Napiš padající test**

```ts
it('checkpoint z kmenové éry se nedá obnovit do organismální etapy', () => {
  const state = createGame(481516);
  state.stage = 2; state.world = createWorld(state.seed, 2); state.worlds[2] = state.world;
  state.stage = 3; state.tribe = emptyTribe(); makeCheckpoint(state);
  const parsed = parseGame(serializeGame(state));
  expect(JSON.parse(parsed.checkpoint!).tribe).toEqual(emptyTribe());
});
```

- [ ] **Krok 2: Spusť a ověř pád**

Run: `pnpm vitest run tests/persistence.test.ts -t checkpoint`
Expected: FAIL

- [ ] **Krok 3: Implementuj**

`makeCheckpoint` serializuje celý stav, takže řezy se vezmou samy. Doplnit je potřeba **kontrolu shody** u obnovy, vedle stávající kontroly `journey.version`:

```ts
// persistence.ts, v bloku if (s.checkpoint !== null)
if (restored.stage > stage) invalid('checkpoint', SAVE_ERRORS.checkpointMismatch);
if (!!restored.tribe !== hasTribe || !!restored.machines !== hasMachines || !!restored.planet !== hasPlanet)
  invalid('checkpoint', SAVE_ERRORS.checkpointMismatch);
```

Smysl: checkpoint musí patřit do téže éry jako stav, který ho nese. Obnova do etapy, která ještě neexistovala, je poškozený soubor, ne tichý downgrade.

- [ ] **Krok 4: Ověř**

Run: `pnpm typecheck && pnpm test`
Expected: PASS

- [ ] **Krok 5: Commit**

```bash
git add src/game/persistence.ts tests/persistence.test.ts
git commit -m "Keep checkpoints within their own era"
```

---

## Task 8: Vstup do kmenové éry

**Files:**
- Modify: `src/game/simulation.ts`, `src/game/era-copy.cs.ts`, `src/main.ts:130`
- Test: `tests/tribe-era-entry.test.ts`

**Interfaces:**
- Produces: `continueToTribeEra(s: GameState): boolean`

Tohle je to **hrdlo pro akci měnící stav** ze sladění §4.3: přechod je volatelná funkce v `src/game/`, ne kód v obsluze kliknutí. Díky tomu z ní půjde v budoucnu udělat skupinové rozhodnutí změnou na jednom místě.

- [ ] **Krok 1: Napiš padající test**

```ts
// tests/tribe-era-entry.test.ts
import { describe, expect, it } from 'vitest';
import { continueToTribeEra, createGame, makeCheckpoint } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import type { GameState } from '../src/game/types';

function wonOnLand(): GameState {
  const state = createGame(481516);
  state.stage = 2; state.world = createWorld(state.seed, 2); state.worlds[2] = state.world;
  state.campaign.won = true; state.campaign.finale = 'restoration';
  makeCheckpoint(state);
  return state;
}

describe('vstup do kmenové éry', () => {
  it('je odmítnut, dokud kampaň není dohraná', () => {
    const state = createGame(481516);
    expect(continueToTribeEra(state)).toBe(false);
    expect(state.stage).toBe(0);
  });

  it('po vítězství přenese linii do etapy 3 nad pobřežním terénem', () => {
    const state = wonOnLand();
    const world = state.world;
    expect(continueToTribeEra(state)).toBe(true);
    expect(state.stage).toBe(3);
    expect(state.world).toBe(world);
    expect(state.tribe).toBeDefined();
    expect(state.player.genome.parts.length).toBeGreaterThan(0);
  });

  it('je odmítnut podruhé', () => {
    const state = wonOnLand();
    continueToTribeEra(state);
    expect(continueToTribeEra(state)).toBe(false);
  });
});
```

- [ ] **Krok 2: Spusť a ověř pád**

Run: `pnpm vitest run tests/tribe-era-entry.test.ts`
Expected: FAIL — `continueToTribeEra is not a function`

- [ ] **Krok 3: Implementuj**

```ts
// src/game/simulation.ts
/**
 * Výslovný opt-in po vítězství. Kampaň verze 2 ho nikdy nenabídne; nová linie
 * po něm pokračuje se stejným tělem, stejnou historií a stejným terénem.
 */
export function continueToTribeEra(s:GameState):boolean {
 if(s.stage!==2||!s.campaign.won||s.tribe||s.player.health<=0||s.deathReason)return false;
 s.stage=3;s.tribe=emptyTribe();
 s.lineage.push({generation:s.player.generation,stage:3,time:s.tick/60,name:s.player.genome.name,
  parts:s.player.genome.parts.map(p=>p.kind),event:CHAPTERS[3].title});
 s.messages=[];announce(s,CHAPTERS[3].title);makeCheckpoint(s);return true;
}
```

Svět se **nemění** — `s.world` zůstává pobřežní. Genom, symbionti i historie linie pokračují beze změny; právě to je smysl opt-inu.

V `main.ts` přidej do vítězného modalu (`won()`, řádek 130) tlačítko vedle `sandbox` a `menu`:

```ts
${button('continue-era', ERA_COPY.continueToTribe)}
```

a v `action()` obsluhu, která zavolá `continueToTribeEra(state)`, při úspěchu `persistState()` a `switchMode('game')`.

- [ ] **Krok 4: Ověř**

Run: `pnpm typecheck && pnpm test`
Expected: PASS

- [ ] **Krok 5: Commit**

```bash
git add src/game/simulation.ts src/game/era-copy.cs.ts src/main.ts tests/tribe-era-entry.test.ts
git commit -m "Offer an explicit opt-in into the tribe era after victory"
```

---

## Task 9: Kamera nad krajinou

**Files:**
- Modify: `src/game/camera.ts` — **jen přidat funkci, stávající neměnit**
- Test: `tests/camera-overhead.test.ts`

- [ ] **Krok 1: Napiš padající test**

```ts
// tests/camera-overhead.test.ts
import { describe, expect, it } from 'vitest';
import { overheadCamera } from '../src/game/camera';
import { createWorld } from '../src/game/world';
import { groundHeight } from '../src/game/random';

describe('kamera nad krajinou', () => {
  const world = createWorld(481516, 2);
  const focus = { x: 0, y: groundHeight(0, 0, 2) + 1, z: 0 };

  it('drží oko nad terénem i při plném přiblížení', () => {
    for (const zoom of [18, 34, 60]) {
      const eye = overheadCamera(focus, 0.4, zoom, world);
      expect(eye.y).toBeGreaterThan(groundHeight(eye.x, eye.z, 2) + 2);
    }
  });

  it('je stabilní: stejný vstup dá stejný výsledek', () => {
    expect(overheadCamera(focus, 0.4, 34, world)).toEqual(overheadCamera(focus, 0.4, 34, world));
  });

  it('se vzdáleností stoupá', () => {
    expect(overheadCamera(focus, 0, 60, world).y).toBeGreaterThan(overheadCamera(focus, 0, 18, world).y);
  });
});
```

- [ ] **Krok 2: Spusť a ověř pád**

Run: `pnpm vitest run tests/camera-overhead.test.ts`
Expected: FAIL — `overheadCamera is not exported`

- [ ] **Krok 3: Implementuj**

```ts
// src/game/camera.ts — přidat na konec, nic výše neměnit
/**
 * Velitelský pohled pro etapy 3–4: pevný sklon, výška podle vzdálenosti.
 * Na rozdíl od orbitální kamery neuhýbá překážkám — dívá se přes ně shora.
 */
export function overheadCamera(focus:Vec3,yaw:number,zoom:number,world:World):Vec3 {
 const pitch=1.02;
 const eye={
  x:focus.x+Math.sin(yaw)*zoom*Math.cos(pitch),
  y:focus.y+Math.max(12,zoom*Math.sin(pitch)),
  z:focus.z+Math.cos(yaw)*zoom*Math.cos(pitch),
 };
 eye.y=Math.max(eye.y,groundHeight(eye.x,eye.z,world.stage)+6);
 return eye;
}
```

- [ ] **Krok 4: Ověř**

Run: `pnpm vitest run tests/camera-overhead.test.ts && pnpm test`
Expected: PASS — a **žádný stávající kamerový test se nezměnil**

- [ ] **Krok 5: Commit**

```bash
git add src/game/camera.ts tests/camera-overhead.test.ts
git commit -m "Add an overhead camera for the command stages"
```

---

## Task 10: Model ovládání ve vstupech

**Files:**
- Modify: `src/main.ts:200-210` (obsluha kláves a ukazatele), volba kamery v `render`

- [ ] **Krok 1: Zaveď větvení na jednom místě**

```ts
// src/main.ts
import { controlModelFor } from './game/stage';
const control = () => controlModelFor(state.stage);
```

- [ ] **Krok 2: Větvi výběr myší**

V `finishPointer` (řádek 211) dnes levé kliknutí vybírá cíl krmení. Rozvětvi:

```ts
if(wasMoving&&mode==='game'&&pointerButton===0&&pointerTravel<6&&e.type==='pointerup'){
  if(control()==='body'){selectionWorld=state.world;feedSelection=graphics.pickWorld(state,e.clientX,e.clientY);updateHud();}
  // 'command' a 'vehicle' dostanou výběr jednotek v P1; zatím bez akce.
}
```

- [ ] **Krok 3: Větvi kameru**

Tam, kde se dnes volá `compositionCamera`, přepni podle modelu na `overheadCamera` pro `'command'`.

- [ ] **Krok 4: Ověř ručně i testy**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: PASS

Ručně: `pnpm dev`, projdi etapu 0 — **výběr cíle myší, krmení, editor a kamera se musí chovat identicky jako před P0.**

- [ ] **Krok 5: Commit**

```bash
git add src/main.ts
git commit -m "Branch input and camera on the stage's control model"
```

---

## Task 11: Uzavření P0

**Files:**
- Modify: `PROGRESS.md`, `README.md`

- [ ] **Krok 1: Spusť plné ověření**

```bash
pnpm typecheck && pnpm test && pnpm build
pnpm exec playwright install chromium
pnpm test:browser && pnpm test:fixtures && pnpm test:soak && pnpm test:production
```

Expected: vše PASS

- [ ] **Krok 2: Ověř zpětnou kompatibilitu ručně**

1. Otevři hru, odehraj pár minut, ulož.
2. V `localStorage` najdi záznam, ručně mu přepiš `version` na 2 a odeber `tribe`.
3. Načti hru. **Musí se načíst a dohrát.**

- [ ] **Krok 3: Ověř definici hotového**

- [ ] `pnpm typecheck && pnpm test && pnpm build` prochází
- [ ] všech 72 původních testů prochází **beze změny**
- [ ] jednohráčská hra je nerozeznatelná od stavu před P0
- [ ] uložená hra verze 2 se načte a dohraje
- [ ] po vítězství se nabídne vstup do etapy 3, jde do ní vstoupit a stav se uloží
- [ ] žádný řez se nevytváří dřív, než je potřeba

- [ ] **Krok 4: Aktualizuj dokumentaci**

Do `PROGRESS.md` zapiš stav P0 a další krok (P1). Do `README.md` doplň, že po dokončení kampaně lze pokračovat do kmenové éry, která je zatím prázdná.

- [ ] **Krok 5: Commit**

```bash
git add PROGRESS.md README.md
git commit -m "Record P0 completion and the next step"
```

---

## Co P0 vědomě nedělá

Ať to nikdo nepřidává ze setrvačnosti:

- **žádné `players[]`, sedadla ani kontrolní součty** — multiplayer je odložený a volitelný
- **žádné dělení `Campaign`** — až s multiplayerem
- **žádný obsah etap 3–5** — kmen je prázdný, stroje a planeta mají jen tvar
- **žádný refaktor `render/habitat.ts`** — až ho P1 skutečně bude potřebovat
- **žádné přesuny výpočtů v `step()`** — jen extrakce
