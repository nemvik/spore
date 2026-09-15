# Lumavora co-op multiplayer — implementační plán

> ⚠️ **Čti spolu s [sladěním multiplayeru a nových etap](../specs/2026-09-15-reconciliation-multiplayer-vs-eras.md).** Tenhle dokument vznikl vedle druhého návrhu a v několika bodech si s ním sahá na totéž (verze uložené hry, jméno `Command`, signatura `step`, determinismus). Při rozporu platí sladění.


> **Pro agentní workery:** POVINNÝ SUB-SKILL: použij `superpowers:subagent-driven-development` (doporučeno) nebo `superpowers:executing-plans` a jeď úkol po úkolu. Kroky používají checkbox (`- [ ]`) syntax.

**Cíl:** Umožnit 2–4 hráčům hrát Lumavoru ve sdíleném světě přes deterministický lockstep a WebRTC, bez serveru a bez databáze.

**Architektura:** Všichni klienti počítají celou simulaci sami a po síti posílají jen vstupy. Stavy zůstávají bit-identické, takže sdílená ekologie funguje bez synchronizace. Kontrolní součet každou sekundu odhalí rozejití; host pak rozešle plný stav. Transport je WebRTC datový kanál s ručním copy-paste signalingem, takže build zůstává čistě statický.

**Tech stack:** TypeScript 5.9, Vite 7.1, Three.js 0.180, Vitest 3.2, Playwright 1.55, pnpm 11.24. Žádná nová runtime závislost.

**Spec:** `docs/superpowers/specs/2026-09-15-multiplayer-design.md` — plán z něj argumentuje, čti oba.

---

## Globální omezení

Platí pro **každý** úkol v tomto plánu:

- **Žádná nová runtime závislost.** WebRTC, `BroadcastChannel` i `CompressionStream` jsou vestavěné v prohlížeči. `package.json` `dependencies` zůstává `{ three }`.
- **Žádný server, žádná databáze.** `pnpm build` musí dál produkovat statický artefakt nasaditelný přes stávající `nginx.conf`.
- **Singleplayer se nesmí rozbít.** Je to výchozí režim a zadání hry (`GAME_BRIEF.md`) ho vyžaduje. Po každém úkolu musí projít `pnpm test` (72 testovacích souborů) i `pnpm typecheck`.
- **Staré savy musí zůstat načitatelné.** `persistence.ts` už migruje v1 → v2; v3 musí následovat stejný vzor.
- **Nic nedeterministického do `GameState`.** Žádné `Math.random()`, `Date.now()`, `performance.now()` ani iterace přes `Map`/`Set` v `src/game/`. Lokální sedadlo, nastavení, kamera a UI stav patří mimo `GameState`.
- **Hráči se krokují vždy v pořadí podle sedadla.** Nikdy podle pořadí příchodu paketů.
- **Herní texty česky a centrálně** — do `src/ui/copy.cs.ts` nebo souvisejícího `*.cs.ts`, ne napevno do logiky.

**Ověřovací příkazy** (používej je doslova):

```bash
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run — 72 souborů
pnpm build            # typecheck + vite build
pnpm test:browser     # Playwright regrese
```

---

## Struktura souborů

**Nové soubory:**

| Soubor | Odpovědnost |
|---|---|
| `src/net/transport.ts` | Rozhraní `Transport`, typ `NetMessage`. Žádná implementace. |
| `src/net/loopback.ts` | `LoopbackTransport` — dvě sedadla v jednom procesu, pro Vitest. |
| `src/net/broadcast.ts` | `BroadcastChannelTransport` — mezi taby jednoho prohlížeče. |
| `src/net/webrtc.ts` | `WebRtcTransport` — peer spojení, hvězdicové přeposílání. |
| `src/net/handshake.ts` | Serializace SDP: čekání na ICE gathering, deflate, base64. |
| `src/net/lockstep.ts` | `LockstepDriver` — fronta vstupů, zpoždění, rozhodnutí o odkrokování. |
| `src/net/checksum.ts` | `checksum(state)` a porovnávání. |
| `src/net/session.ts` | `Session` — obal držící `state` + lokální `seat` + `Transport`. |
| `src/ui/multiplayer.cs.ts` | České texty pro lobby, čekání, rozejití. |
| `src/ui/lobby.ts` | Obrazovka pro copy-paste připojení. |

**Měněné soubory:**

| Soubor | Změna |
|---|---|
| `src/game/types.ts` | `player: Player` → `players: Player[]`, `version: 2` → `3` |
| `src/game/simulation.ts` | `step` rozdělit na hráčskou a světovou část; explicitní `Player` parametry |
| `src/game/encounter-ai.ts` | Predátoři míří na nejbližšího hráče (`:158`, `:170`, `:203`, `:223-226`) |
| `src/game/persistence.ts` | Validace `players` pole, migrace v2 → v3 (vzor na `:297-326`) |
| `src/game/interactions.ts`, `journey.ts`, `symbiosis.ts`, `demography.ts`, `migration.ts`, `nursery.ts`, `canopy-guidance.ts`, `terrace-guidance.ts`, `journey-network.ts`, `journey-evolution.ts` | Explicitní `Player` parametr místo `s.player` |
| `src/render/renderer.ts:46-117` | Jeden organismus → `Map<seat, …>` |
| `src/main.ts` | Vstup přes `LockstepDriver`; editor a přechody jako příkazy |
| `scripts/browser-test.mjs` a spol. | `initial.player` → `initial.players[0]` |

---

## Fáze 0 — Lockstep smyčka nasucho

> Cíl fáze: vstup teče přes frontu místo přímo do `step`, ale hra je pořád jednohráčská a nerozeznatelná od dneška. Prokáže smyčku dřív, než se sáhne na stav.

### Úkol 1: Rozhraní transportu a loopback

**Soubory:**
- Vytvoř: `src/net/transport.ts`, `src/net/loopback.ts`
- Test: `tests/net-loopback.test.ts`

**Rozhraní — Produkuje** (na těchto jménech závisí všechny další úkoly, neměň je):

```ts
// src/net/transport.ts
import type { Input, Genome, GameState } from '../game/types';

export type NetMessage =
  | { kind: 'input';     tick: number; seat: number; input: Input }
  | { kind: 'evolve';    tick: number; seat: number; genome: Genome }
  | { kind: 'transition'; tick: number }
  | { kind: 'recover';   tick: number; seat: number }
  | { kind: 'pause';     tick: number; seat: number; paused: boolean }
  | { kind: 'seatLost';  tick: number; seat: number }
  | { kind: 'checksum';  tick: number; seat: number; hash: number }
  | { kind: 'resync';    tick: number; state: GameState };

export interface Transport {
  readonly seat: number;
  readonly seatCount: number;
  send(msg: NetMessage): void;
  onMessage(cb: (msg: NetMessage) => void): void;
  close(): void;
}
```

`LoopbackTransport` vyrábí N propojených transportů v jednom procesu:

```ts
// src/net/loopback.ts
export function createLoopbackPair(seatCount: number): Transport[];
```

- [ ] **Krok 1:** Napiš padající test v `tests/net-loopback.test.ts` — dva loopback transporty, seat 0 pošle `{kind:'input', tick:5, seat:0, input:EMPTY_INPUT}`, seat 1 ji dostane; zpráva se **nevrací odesílateli**.
- [ ] **Krok 2:** `pnpm test tests/net-loopback.test.ts` → musí selhat na chybějícím modulu.
- [ ] **Krok 3:** Implementuj `transport.ts` a `loopback.ts`.
- [ ] **Krok 4:** `pnpm test tests/net-loopback.test.ts` → projde. Pak `pnpm typecheck`.
- [ ] **Krok 5:** Commit — `feat(net): add transport interface and loopback implementation`.

### Úkol 2: LockstepDriver

**Soubory:**
- Vytvoř: `src/net/lockstep.ts`
- Test: `tests/net-lockstep.test.ts`

**Rozhraní — Konzumuje:** `Transport`, `NetMessage` z úkolu 1.
**Rozhraní — Produkuje:**

```ts
export const INPUT_DELAY_TICKS = 3;

export class LockstepDriver {
  constructor(net: Transport, seatCount: number);
  /** Zařadí lokální vstup na tick `currentTick + INPUT_DELAY_TICKS` a odešle ho. */
  submit(currentTick: number, input: Input): void;
  /** True, když jsou pro daný tick k dispozici vstupy všech sedadel. */
  canAdvance(tick: number): boolean;
  /** Vstupy indexované podle sedadla. Vyhodí chybu, když `canAdvance` je false. */
  inputsFor(tick: number): Input[];
  /** Uvolní frontu do včetně daného ticku. */
  release(tick: number): void;
  /** Sedadla, na která se čeká — pro hlášku v UI. */
  waitingOn(tick: number): number[];
}
```

- [ ] **Krok 1:** Testy: (a) se vstupy obou sedadel `canAdvance` vrací true; (b) chybí-li jedno, vrací false a `waitingOn` vrátí jeho číslo; (c) `submit` na ticku 10 zařadí vstup na tick 13; (d) `inputsFor` vrací vstupy **v pořadí podle sedadla** bez ohledu na pořadí doručení.
- [ ] **Krok 2:** `pnpm test tests/net-lockstep.test.ts` → selže.
- [ ] **Krok 3:** Implementuj. Fronta je `Map<number, (Input|undefined)[]>`; `release` maže staré ticky, aby nerostla.
- [ ] **Krok 4:** Testy projdou, `pnpm typecheck`.
- [ ] **Krok 5:** Commit — `feat(net): add lockstep input queue`.

### Úkol 3: Zapojit driver do smyčky při jednom hráči

**Soubory:**
- Modifikuj: `src/main.ts` (herní smyčka, `FixedStepClock.advance`)
- Test: `tests/net-singleplayer-loop.test.ts`

Vstup z `InputLatch` už nejde přímo do `step`, ale přes `LockstepDriver` s `LoopbackTransport` o jednom sedadle. Simulace stojí, dokud vstup nedorazí — při jednom sedadle to je vždy hned.

- [ ] **Krok 1:** Test: jednosedadlový driver, 100 tiků, výsledný `GameState` je identický s přímým voláním `step`.
- [ ] **Krok 2:** Test selže.
- [ ] **Krok 3:** Přepoj smyčku v `main.ts`.
- [ ] **Krok 4:** `pnpm test` (**všech 72 souborů**), `pnpm typecheck`, `pnpm build`, `pnpm test:browser`.
- [ ] **Krok 5:** Commit — `refactor(game): route single-player input through lockstep driver`.

**Brána fáze 0:** Jednohráčská hra je nerozeznatelná od dneška. Prvních `INPUT_DELAY_TICKS` tiků běží s prázdným vstupem — ověř, že to nezpůsobí viditelné zaškubnutí na startu.

---

## Fáze 1 — `player` → `players[]`

> **Tohle je největší fáze.** Zabere zhruba tolik co všechny ostatní dohromady. Je mechanická a řízená překladačem, ale je jí hodně. Nesnaž se ji zkrátit.

### Úkol 4: Změnit tvar stavu

**Soubory:**
- Modifikuj: `src/game/types.ts`

- [ ] **Krok 1:** V `GameState` změň `player: Player` na `players: Player[]` a `version: 2` na `version: 3`.
- [ ] **Krok 2:** Spusť `pnpm typecheck`. **Ulož výstup do souboru** — je to tvůj seznam práce pro úkoly 5–7:
  ```bash
  pnpm typecheck 2>&1 | tee /tmp/mp-refactor-errors.txt
  ```
- [ ] **Krok 3:** Zatím necommituj — strom se nepřekládá. Pokračuj úkolem 5.

### Úkol 5: Explicitní parametr `Player` v herní logice

**Soubory:**
- Modifikuj: `src/game/simulation.ts`, `interactions.ts`, `journey.ts`, `symbiosis.ts`, `demography.ts`, `migration.ts`, `nursery.ts`, `canopy-guidance.ts`, `terrace-guidance.ts`, `journey-network.ts`, `journey-evolution.ts`

Vzor — funkce, které sahaly na `s.player`, dostanou parametr:

```ts
// před
export function nearNest(s: GameState) { … s.player.pos … }           // simulation.ts:46
export function senseRange(s: GameState): number { const p = s.player; … }  // simulation.ts:302

// po
export function nearNest(s: GameState, p: Player) { … p.pos … }
export function senseRange(s: GameState, p: Player): number { … }
```

Totéž pro `evolve(s, seat, draft)`, `tryTransition(s)` (zůstává bez hráče — je skupinový, viz úkol 15), `recoverGeneration(s, seat)`, `transitionRequirements(s, p)`, `transitionStatus(s)`, `makeCheckpoint(s)`.

**Nepoužívej zkratku** s `s.player` jako ukazatelem na „právě krokovaného hráče". Spec §4.2 vysvětluje proč: zavádí to implicitní globální stav do kódu, kde na správnosti stojí determinismus.

- [ ] **Krok 1:** Projdi `/tmp/mp-refactor-errors.txt` soubor po souboru. Začni od listů závislostního stromu (`symbiosis.ts`, `nursery.ts`, `migration.ts`) a postupuj k `simulation.ts`.
- [ ] **Krok 2:** Po každém souboru `pnpm typecheck` — počet chyb musí klesat, ne přibývat na nových místech.
- [ ] **Krok 3:** Až se přeloží: `pnpm test`. Testy odkazující na `state.player` uprav na `state.players[0]`.
- [ ] **Krok 4:** `pnpm test` musí být zelené — **všech 72 souborů**.
- [ ] **Krok 5:** Commit — `refactor(game): pass Player explicitly instead of reading state.player`.

### Úkol 6: Rozdělit `step` na hráčskou a světovou část

**Soubory:**
- Modifikuj: `src/game/simulation.ts:246-299`
- Test: `tests/multiplayer-step.test.ts`

**Kritické:** dnešní `step` míchá hráčskou logiku (metabolismus, pohyb, krmení) se světovou (NPC, regenerace zdrojů, klima, `stepJourney`, `journeyFinale`). Kdyby se světová část volala jednou za hráče, svět by se se čtyřmi hráči krokoval čtyřikrát rychleji.

**Rozhraní — Produkuje:**

```ts
export function step(s: GameState, inputs: Input[], dt?: number): void;
```

```ts
export function step(s: GameState, inputs: Input[], dt = 1/60) {
  if (s.deathReason || (s.campaign.won && !s.campaign.sandbox)) return;
  dt = clamp(dt, 0, 1/30);
  s.tick++; s.world.time += dt;
  for (let seat = 0; seat < s.players.length; seat++) stepPlayer(s, seat, inputs[seat], dt);
  stepWorld(s, dt);
}
```

Co patří do `stepWorld` (jednou za tick): regenerace zdrojů, `patch.fertility` a `patch.pressure`, `stepHunters`, `npcStep`, `stepJourney`, `journeyFinale`, klima a sucho. Zbytek do `stepPlayer`.

- [ ] **Krok 1:** Test: dva hráči, 600 tiků. Ověř, že `world.time` je 10 s (ne 20) a že celkový úbytek zdrojů je vyšší než u jednoho hráče, ale ne přesně dvojnásobný (populace reagují).
- [ ] **Krok 2:** Test selže.
- [ ] **Krok 3:** Rozděl `step`.
- [ ] **Krok 4:** `pnpm test` celé. Determinismus musí držet.
- [ ] **Krok 5:** Commit — `refactor(game): split step into per-player and per-world halves`.

### Úkol 7: Determinismus a souběh o zdroje

**Soubory:**
- Test: `tests/multiplayer-determinism.test.ts`

- [ ] **Krok 1:** Tři testy:
  - **Reprodukovatelnost:** dvě instance, tentýž proud vstupů pro 2 hráče, 3600 tiků, `JSON.stringify` po normalizaci `id` a `checkpoint` se shoduje. Pro seedy 481516, 20260913, 8675309.
  - **Souběh:** dva hráči ve stejném ticku snědí tentýž zdroj. Zdroj se odečte **jednou**, dostane ho **nižší sedadlo**.
  - **Pořadí sedadel:** prohození pořadí doručení vstupů nezmění výsledný stav.
- [ ] **Krok 2:** Spusť — souběhový test pravděpodobně selže a odhalí skutečnou chybu v `feed`.
- [ ] **Krok 3:** Oprav `feed` v `simulation.ts` tak, aby kontroloval `r.amount` až v okamžiku odečtu.
- [ ] **Krok 4:** `pnpm test` celé.
- [ ] **Krok 5:** Commit — `test(game): lock down multiplayer determinism and resource contention`.

### Úkol 8: Perzistence v3

**Soubory:**
- Modifikuj: `src/game/persistence.ts:297-326`
- Test: `tests/persistence-v3.test.ts`

Vzor pro migraci už v souboru je — `version === 1` a `version === 2` větve na `:297` a `:312`. Následuj ho.

**Pozor:** funkce `object(value, path, keys)` (`:26`) kontroluje **přesný počet klíčů**. Bez úpravy seznamu na `:297` skončí každý v3 save jako „poškozený".

- [ ] **Krok 1:** Testy: (a) v2 save se načte a má `players` délky 1 se stejnými hodnotami; (b) v3 save se čtyřmi hráči projde; (c) `players: []` je odmítnuto; (d) `players` s 5 položkami je odmítnuto; (e) `saveGame`/`parseGame` round-trip je identita.
- [ ] **Krok 2:** Testy selžou.
- [ ] **Krok 3:** Uprav validátor: `player` → `players` v seznamu klíčů, validaci hráče do cyklu, migrace v2 → v3 zabalí `player` do `players: [player]`.
- [ ] **Krok 4:** `pnpm test` celé — i stávající `tests/persistence.test.ts`.
- [ ] **Krok 5:** Commit — `feat(persistence): migrate save format to v3 with players array`.

### Úkol 9: Renderovat N organismů

**Soubory:**
- Modifikuj: `src/render/renderer.ts:46-117`, `src/game/camera.ts` (volající místa)

`createOrganism(genome)` a `animateOrganism(group, …)` v `src/render/organism.ts` jsou **už dnes bezstavové vůči tomu, čí organismus kreslí** — tento soubor neměň.

```ts
// před (renderer.ts:49)
private player: THREE.Group | null = null;
private playerKey = '';

// po
private organisms = new Map<number, { group: THREE.Group; key: string }>();
```

Logika přestavby modelu při změně genomu (`:116`) je správná — jen z ní udělej cyklus přes sedadla. Zánik sedadla musí zavolat `disposeObject`, jinak teče paměť.

- [ ] **Krok 1:** Uprav `renderer.ts`. Kamera sleduje lokální sedadlo (přijde parametrem, **ne** ze stavu).
- [ ] **Krok 2:** `pnpm typecheck`, `pnpm test`, `pnpm build`.
- [ ] **Krok 3:** Ruční kontrola: `pnpm dev`, nová hra, dvě sedadla kde druhé je nečinné → druhý organismus stojí ve světě a je vidět.
- [ ] **Krok 4:** `pnpm test:browser`.
- [ ] **Krok 5:** Commit — `feat(render): render one organism per seat`.

**Brána fáze 1:** Hra běží se dvěma sedadly, druhý organismus je vidět, všech 72 testů je zelených, staré savy se načtou.

---

## Fáze 2 — Skutečný multiplayer mezi taby

> Tady se poprvé ukáže, jestli koncept funguje herně — **bez jediného řádku WebRTC.**

### Úkol 10: BroadcastChannelTransport

**Soubory:**
- Vytvoř: `src/net/broadcast.ts`
- Test: `tests/net-broadcast.test.ts`

**Rozhraní — Produkuje:**

```ts
export function createBroadcastTransport(room: string, seat: number, seatCount: number): Transport;
```

- [ ] **Krok 1:** Test na `BroadcastChannel` ve Vitestu (jsdom/node ho má; pokud ne, přeskoč test a ověř až v Playwrightu — ale to poznač do testu komentářem, ne tichým vynecháním).
- [ ] **Krok 2:** Test selže.
- [ ] **Krok 3:** Implementuj. Vlastní zprávy filtruj podle `seat`.
- [ ] **Krok 4:** Testy projdou.
- [ ] **Krok 5:** Commit — `feat(net): add BroadcastChannel transport`.

### Úkol 11: Lobby a rozdělení sedadel

**Soubory:**
- Vytvoř: `src/ui/lobby.ts`, `src/ui/multiplayer.cs.ts`, `src/net/session.ts`
- Modifikuj: `src/main.ts`

**Rozhraní — Produkuje:**

```ts
// src/net/session.ts
export interface Session {
  state: GameState;   // identický na všech klientech
  seat: number;       // POUZE lokální — nikdy neserializovat, nikdy neposílat
  net: Transport;
  driver: LockstepDriver;
}
```

Připojení: host založí hru přes `createGame`, pošle plný stav novým sedadlům. Hosté stav **přebírají, negenerují** — tím odpadá nedeterministické `id` z `createGame` (`simulation.ts:35`).

- [ ] **Krok 1:** Lobby obrazovka: „Založit hru" / „Připojit se", počet sedadel, jméno hráče. Texty do `multiplayer.cs.ts`.
- [ ] **Krok 2:** `pnpm typecheck`, `pnpm test`.
- [ ] **Krok 3:** Ruční test: dva taby, obě sedadla se hýbou, oba vidí oba organismy na stejných místech.
- [ ] **Krok 4:** `pnpm build`.
- [ ] **Krok 5:** Commit — `feat(ui): add multiplayer lobby and session wiring`.

### Úkol 12: Playwright test dvou tabů

**Soubory:**
- Vytvoř: `scripts/multiplayer-test.mjs`
- Modifikuj: `package.json` (skript `test:multiplayer`)

Vzor převezmi z `scripts/browser-test.mjs` — Vite v middleware módu plus Playwright.

- [ ] **Krok 1:** Skript otevře dva taby ve **stejném browser contextu** (jinak `BroadcastChannel` neprojde), založí hru, oba se hýbou 600 tiků.
- [ ] **Krok 2:** Ověř, že `state.tick` i pozice obou hráčů se v obou tabech shodují.
- [ ] **Krok 3:** Přidej `"test:multiplayer": "node scripts/multiplayer-test.mjs"`.
- [ ] **Krok 4:** `pnpm test:multiplayer` projde.
- [ ] **Krok 5:** Commit — `test(browser): add two-tab multiplayer regression`.

**Brána fáze 2:** Dva taby odehrají skutečnou partii. **Tady zastav a zahraj si to.** Jestli sdílený co-op svět herně nefunguje, zjistíš to teď — než se napíše WebRTC.

---

## Fáze 3 — WebRTC

### Úkol 13: Serializace handshaku

**Soubory:**
- Vytvoř: `src/net/handshake.ts`
- Test: `tests/net-handshake.test.ts`

**Rozhraní — Produkuje:**

```ts
/** Čeká na dokončení ICE gathering, pak SDP zkomprimuje a zakóduje do base64. */
export function encodeDescription(pc: RTCPeerConnection): Promise<string>;
export function decodeDescription(code: string): Promise<RTCSessionDescriptionInit>;
```

Dva detaily, na kterých to stojí (spec §7.3):

1. **Počkat na `pc.iceGatheringState === 'complete'`** před serializací. Trickle ICE tu nemá kudy téct — signalizační kanál neexistuje. Bez toho bude kód obsahovat neúplnou sadu kandidátů a spojení se nenaváže.
2. Komprese přes vestavěný `CompressionStream('deflate-raw')`. Bez ní má kód přes 2700 znaků, s ní zhruba 800.

- [ ] **Krok 1:** Test na round-trip `encode`/`decode` s vymyšleným SDP řetězcem (bez skutečného `RTCPeerConnection`) — ověř, že zakódovaný tvar je kratší než vstup a dekóduje se na identický objekt.
- [ ] **Krok 2:** Test selže.
- [ ] **Krok 3:** Implementuj.
- [ ] **Krok 4:** Testy projdou.
- [ ] **Krok 5:** Commit — `feat(net): add SDP handshake encoding`.

### Úkol 14: WebRtcTransport

**Soubory:**
- Vytvoř: `src/net/webrtc.ts`
- Modifikuj: `src/ui/lobby.ts`

Topologie je **hvězda, ne mesh** — host drží spojení s každým hostem a přeposílá vstupy. Při čtyřech hráčích to je 3 ruční handshaky místo 6.

Datový kanál **musí být spolehlivý a řazený**:

```ts
pc.createDataChannel('lumavora', { ordered: true });   // žádné maxRetransmits
```

V lockstepu nelze ztratit jediný vstup — ztracený vstup znamená, že se všichni zastaví a už nikdy nerozjedou.

`iceServers` nech **prázdné**. Použijí se jen host kandidáti, což pokrývá localhost a LAN (spec §7.4). Přidání STUN serveru by porušilo mantinel nulové externí služby a je to vědomé rozhodnutí, ne default.

- [ ] **Krok 1:** Implementuj `WebRtcTransport` na `Transport` rozhraní. Host přeposílá zprávy mezi hosty.
- [ ] **Krok 2:** Lobby: pole s kódem pozvánky, tlačítko Kopírovat, pole pro vložení odpovědi.
- [ ] **Krok 3:** `pnpm typecheck`, `pnpm test`, `pnpm build`.
- [ ] **Krok 4:** **Ruční test na dvou počítačích v jedné LAN.** Tohle se automatizovat nedá; zapiš výsledek do commit message.
- [ ] **Krok 5:** Commit — `feat(net): add WebRTC transport with manual signaling`.

**Brána fáze 3:** Dva počítače na jedné LAN odehrají partii.

---

## Fáze 4 — Odolnost

### Úkol 15: Kontrolní součet a resync

**Soubory:**
- Vytvoř: `src/net/checksum.ts`
- Modifikuj: `src/main.ts`
- Test: `tests/net-checksum.test.ts`

**Rozhraní — Produkuje:**

```ts
export const CHECKSUM_INTERVAL_TICKS = 60;
export function checksum(s: GameState): number;
```

Vstupy do hashe a proč právě ty (spec §6.1): `world.rng` je nejcitlivější — posune se okamžitě při jakékoli odchylce, která sáhne na náhodu. Pozice hráčů a tvorů chytnou zbytek. **Kvantizace `* 4096` je záměrná** — bez ní by hash reagoval na rozdíl v posledním bitu mantisy, což je u čísel z `Math.sin` napříč enginy příliš přísné.

Při neshodě: klient přestane krokovat, požádá hosta, host pošle `{kind:'resync', tick, state}`, klient stav převezme a vyhodí frontu vstupů. Tick a oba součty **zaloguj** — bez toho se rozejití nedá ladit.

- [ ] **Krok 1:** Testy: (a) shodné stavy dají shodný hash; (b) posun hráče o 0,001 hash **nezmění** (kvantizace); (c) posun o 1,0 ho změní; (d) po umělém poškození stavu klienta ho porovnání odhalí a po resyncu jsou stavy opět shodné.
- [ ] **Krok 2:** Testy selžou.
- [ ] **Krok 3:** Implementuj a zapoj do smyčky.
- [ ] **Krok 4:** `pnpm test` celé.
- [ ] **Krok 5:** Commit — `feat(net): add desync detection and host resync`.

### Úkol 16: Odpojení a čekání

**Soubory:**
- Modifikuj: `src/net/lockstep.ts`, `src/ui/multiplayer.cs.ts`, `src/main.ts`
- Test: `tests/net-disconnect.test.ts`

Chování (spec §5.3): prvních 60 tiků se opakuje poslední vstup sedadla; pak se sedadlo označí za nepřítomné a jeho vstup je natrvalo `EMPTY_INPUT`. Organismus ve světě **zůstává** a je vizuálně odlišený.

**Kritické:** rozhodnutí „sedadlo je pryč" musí padnout **deterministicky ve stejném ticku u všech**. Nesmí se vázat na lokální timeout — vyhlašuje ho host zprávou `{kind:'seatLost', tick, seat}`.

- [ ] **Krok 1:** Testy: (a) výpadek na 30 tiků se překlene opakováním vstupu a stavy zůstanou shodné; (b) po `seatLost` ostatní pokračují; (c) `seatLost` se projeví u všech ve stejném ticku.
- [ ] **Krok 2:** Testy selžou.
- [ ] **Krok 3:** Implementuj. Přidej hlášku „čekám na hráče *jméno*" po ~200 ms stání; **render mezitím běží dál**, obraz nesmí zamrznout.
- [ ] **Krok 4:** `pnpm test` celé.
- [ ] **Krok 5:** Commit — `feat(net): handle seat disconnection and stall feedback`.

**Brána fáze 4:** Uměle vyvolané rozejití se samo srovná. Odpojení hráče hru nezastaví.

---

## Fáze 5 — Herní doladění

### Úkol 17: NPC cílí na více hráčů

**Soubory:**
- Modifikuj: `src/game/encounter-ai.ts:158, 170, 203, 223-226`
- Test: `tests/multiplayer-encounter.test.ts`

Chování (spec §4.4): predátor si vybírá **nejbližšího hráče v dosahu vnímání**; při shodné vzdálenosti rozhoduje **nižší sedadlo**. Býložravec prchá před nejbližší hrozbou bez ohledu na sedadlo. Symbiotický partner zůstává vázaný na sedadlo — `Bond` už dnes žije v `Player`, takže to vychází zadarmo.

- [ ] **Krok 1:** Testy: (a) predátor jde po bližším hráči; (b) při přesné shodě vzdáleností vyhraje nižší sedadlo; (c) když bližší hráč zemře, přepne se na druhého.
- [ ] **Krok 2:** Testy selžou.
- [ ] **Krok 3:** Nahraď `s.player` výběrem nejbližšího hráče. Pomocnou funkci `nearestPlayer(s, pos): { seat: number; player: Player }` dej do `encounter-ai.ts`.
- [ ] **Krok 4:** `pnpm test` celé — hlavně `tests/encounter-ai.test.ts` a `tests/hunter-appetite.test.ts`.
- [ ] **Krok 5:** Commit — `feat(game): target nearest player in multiplayer encounters`.

### Úkol 18: Skupinový přechod mezi etapami

**Soubory:**
- Modifikuj: `src/game/simulation.ts` (`tryTransition`, `transitionRequirements`), `src/main.ts`
- Test: `tests/multiplayer-transition.test.ts`

Rozhodnutí ze spec §10: hra přejde do další etapy, **až podmínky splní všichni**. Obrazovka přechodu ukazuje po sedadlech, kdo co postrádá.

> **Tohle je jediné skutečné herní rozhodnutí v celém plánu, ne technika.** Spec ho označuje jako „k potvrzení hraním". Až bude fungovat, zahraj to ve dvou a ověř, že čekání na pomalejšího hráče není otravné. Jestli je, vrať se k tomu a řekni o tom — neřeš to potichu obcházením.

- [ ] **Krok 1:** Testy: (a) když jeden hráč nesplňuje, `tryTransition` vrátí false; (b) když splňují všichni, přejde svět i všichni hráči; (c) `transitionRequirements` vrací výsledek po sedadlech.
- [ ] **Krok 2:** Testy selžou.
- [ ] **Krok 3:** Implementuj.
- [ ] **Krok 4:** `pnpm test` celé.
- [ ] **Krok 5:** Commit — `feat(game): require all seats to meet stage transition requirements`.

### Úkol 19: Editor a pauza jako příkazy

**Soubory:**
- Modifikuj: `src/main.ts`, `src/game/simulation.ts` (`evolve`)

Spec §5.4 — nejčastější zdroj chyb v lockstep hrách, proto samostatný úkol.

Editor se otevře **lokálně** a hráč si v něm zkouší co chce; to je čistě lokální UI a nikoho neovlivňuje. Teprve **potvrzení** pošle `{kind:'evolve', tick, seat, genome}`, který se provede u všech ve stejném ticku. Validace (`validateMutation`, cena v DNA) běží uvnitř simulace na všech klientech shodně — upravený klient si tak nemůže přidat adaptaci zadarmo, aniž by se okamžitě rozešel a spustil resync.

Pauza je taky příkaz: kdokoli ji vyvolá, hra se zastaví všem a ukáže se jméno toho, kdo pauzoval. Bez hlasování.

- [ ] **Krok 1:** Test: `evolve` příkaz doručený na tick 100 se u obou klientů projeví na ticku 100 a stavy zůstanou shodné.
- [ ] **Krok 2:** Test selže.
- [ ] **Krok 3:** Přepoj editor, `recoverGeneration` a pauzu na příkazy.
- [ ] **Krok 4:** `pnpm test` celé, `pnpm test:multiplayer`.
- [ ] **Krok 5:** Commit — `feat(game): route evolve, recover and pause through the tick stream`.

### Úkol 20: Vyvážení a dokončení

**Soubory:**
- Modifikuj: `src/render/renderer.ts` (jmenovky), `src/ui/` (seznam hráčů), `README.md`
- Modifikuj: `scripts/*.mjs` — všechna místa s `initial.player` na `initial.players[0]`

Čtyři hráči znamenají čtyřnásobný tlak na populace a ekologická simulace na to není naladěná (spec §4.4). Vyvážení dělej **měřením při hraní**, ne úvahou.

- [ ] **Krok 1:** Jmenovky nad cizími hráči, odlišný nádech přes `applyLivingFinish`, útlý seznam hráčů v HUD (jméno, etapa, zdraví).
- [ ] **Krok 2:** Projdi `scripts/` a oprav zbylé odkazy na `.player`.
- [ ] **Krok 3:** Odehraj čtyřhráčovou partii. Sleduj, jestli populace nekolabují a jestli jsou zdroje k nalezení. Zapiš, co jsi naměřil.
- [ ] **Krok 4:** `pnpm build`, `pnpm test`, `pnpm test:browser`, `pnpm test:multiplayer` — všechno zelené.
- [ ] **Krok 5:** Doplň do `README.md` sekci o multiplayeru včetně **poctivého** popisu omezení: funguje na localhostu a LAN, ne přes internet. Commit — `feat: complete co-op multiplayer`.

**Brána fáze 5:** Čtyřhráčová partie se dá dohrát a nepůsobí ani prázdně, ani nespravedlivě.

---

## Co tenhle plán vědomě neřeší

Ze spec §14 — **neimplementuj to, pokud o to někdo výslovně nepožádá:**

- Hra přes internet (potřebuje STUN a při symetrickém NATu placený TURN — mimo mantinely).
- Ochrana proti podvádění nad rámec toho, co dá resync.
- Připojení do rozehrané hry. Sedadla se určí před startem.
- Náhrada `Math.sin` deterministickou aproximací. **Nejdřív změř** Chrome vs. Firefox; jestli rozejití nenastává, je to práce naslepo.

## Když se něco pokazí

- **Testy se rozejdou po úkolu 5** — refaktor něco přehlédl. Použij `superpowers:systematic-debugging`, neopravuj testy tak, aby prošly.
- **Determinismus se rozbije** — `tests/multiplayer-determinism.test.ts` z úkolu 7 je tvoje síť. Najdi první tick, kde se stavy liší, a porovnej celé `GameState` rekurzivně; první odlišné pole ukáže viníka.
- **Fáze 1 je větší, než se zdálo** — to je očekávané, ne signál ke zkratce. Spec §4.2 popisuje zkratku s ukazatelem a vysvětluje, proč ji nepoužít.
