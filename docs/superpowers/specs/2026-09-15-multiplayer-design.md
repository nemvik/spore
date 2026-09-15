# Lumavora — kooperativní multiplayer bez backendu a databáze

> ⚠️ **Čti spolu s [sladěním multiplayeru a nových etap](2026-09-15-reconciliation-multiplayer-vs-eras.md).** Tenhle dokument vznikl vedle druhého návrhu a v několika bodech si s ním sahá na totéž (verze uložené hry, jméno `Command`, signatura `step`, determinismus). Při rozporu platí sladění.


**Datum:** 2026-09-15
**Stav:** návrh k implementaci
**Rozsah:** 2–4 hráči ve sdíleném světě, deterministický lockstep, WebRTC bez signalizačního serveru

---

## 1. Zadání a mantinely

Cílem je **sdílený co-op svět**: dva až čtyři hráči se pohybují v jedné instanci světa, vidí se navzájem a sdílejí ekologii. Když jeden vyžere patch nebo vyloví populaci, ostatní to pocítí. To je nejsilnější varianta multiplayeru pro tuhle hru, protože přímo staví na jejím vlastním pilíři — „svět si pamatuje tvůj vliv" z `GAME_BRIEF.md`.

Mantinely, které si návrh klade:

- **Žádná databáze.** Žádné perzistentní úložiště mimo prohlížeč.
- **Žádný stavový backend.** Ideálně žádný server vůbec; build zůstává statický a nasaditelný přes stávající `nginx.conf`.
- **Nulová změna nasazení.** `pnpm build` produkuje tentýž statický artefakt jako dnes.
- **Nerozbít singleplayer.** Jednohráčová hra zůstává plnohodnotná a je nadále výchozím režimem.

---

## 2. Co o hře víme z měření

Návrh nestojí na odhadech. Následující čísla byly naměřeny na skutečném kódu (`src/game/simulation.ts`, `src/game/random.ts`) přes dočasný Vitest probe.

### 2.1 Simulace je deterministická

| Seed | 3600 kroků (60 s hry) |
|---|---|
| 481516 | reprodukovatelné bit-přesně |
| 20260913 | reprodukovatelné bit-přesně |
| 8675309 | reprodukovatelné bit-přesně |

Ověřeno porovnáním `JSON.stringify` dvou nezávislých běhů po normalizaci pole `id` a `checkpoint`. Tato dvě pole jsou jediným zdrojem nedeterminismu v celém stavu a obsahují `Date.now()` z `createGame` (`src/game/simulation.ts:35`) — na samotný výpočet simulace nemají vliv.

Determinismus není náhoda. Je to důsledek toho, jak je hra napsaná:

- `step(s, input, dt)` (`src/game/simulation.ts:246`) je jediný vstupní bod pro posun času a mutuje prostý JSON objekt. (Stav mění i `evolve`, `tryTransition` a `recoverGeneration` — ty jsou ale vázané na akci hráče, ne na běh času, a §5.4 je převádí na příkazy.)
- Generátor náhody je seedovaný a **jeho stav žije uvnitř herního stavu** (`rng: number` v `GameState` i ve `World`, `src/game/random.ts:1`).
- V `src/game/` není jediné volání `Math.random()` ani `performance.now()`.
- Běh je už dnes na fixním kroku 1/60 přes `FixedStepClock` (`src/game/input-clock.ts`).

To je přesně ta sada vlastností, kterou deterministický lockstep vyžaduje, a hra je má, aniž by se pro multiplayer cokoli měnilo.

### 2.2 Velikost stavu

| Co | Velikost jako JSON |
|---|---|
| Celý `GameState` (t=0) | 94 632 B |
| Celý `GameState` (t=10 s) | 97 695 B |
| — z toho `world` | 21 309 B |
| — z toho `worlds[]` | 21 321 B |
| — z toho `player` | 570 B |
| — z toho `journey` | 105 B |
| Dynamická výseč (pozice, tvorové, zdroje) | 7 555 B |
| Jedna input zpráva | 112 B |

Svět je malý: 21 tvorů, 82 zdrojů, 26 překážek.

### 2.3 Rozpočet přenosu

| Model | Na hráče |
|---|---|
| Lockstep (jen vstupy, 60 Hz) | **6,6 KB/s** |
| Snapshot sync (15 Hz) | **111 KB/s** |

Lockstep je patnáctkrát levnější a navíc nepotřebuje žádnou interpolaci ani prediction vrstvu.

---

## 3. Zvolená architektura

**Deterministický lockstep s detekcí rozejití a resynchronizací od hosta.**

Všichni klienti počítají celou simulaci sami. Po síti putují **jen vstupy**. Protože stav je u všech bit-identický, sdílená ekologie funguje sama od sebe — není co synchronizovat, protože se nic nerozchází. Pro jistotu se stav periodicky kontroluje kontrolním součtem; při neshodě host rozešle plný stav a všichni se srovnají.

```
┌──────────────┐  vstupy   ┌──────────────┐
│  Klient A    │◄─────────►│  Klient B    │
│  (host)      │           │              │
│              │           │              │
│  plná        │           │  plná        │
│  simulace    │           │  simulace    │
│              │           │              │
│  tick 1204   │           │  tick 1204   │
│  stav X      │  ==       │  stav X      │
└──────────────┘           └──────────────┘
       │                          │
       └── checksum každých 60 tiků ──┘
              neshoda → host pošle plný stav
```

### 3.1 Proč ne host-authoritative

Zvažovaná alternativa byla: host počítá, ostatní posílají vstupy a renderují přijatý stav. Odolala by rozdílům mezi prohlížeči, ale:

- Patnáctkrát vyšší datový tok.
- Bez client-side prediction je ovládání pro ne-hosty gumové — každý pohyb čeká na plný round-trip.
- Prediction s rekoncilací je zhruba stejný objem práce jako celý lockstep, jen bez jeho výhod.
- Zahodila by determinismus, který hra **už má** a na kterém stojí existující testy.

Host-authoritative se tedy v tomto návrhu objevuje jen jako **záchranná brzda** (§6), ne jako hlavní cesta.

### 3.2 Známé riziko: transcendentní funkce napříč enginy

Herní logika volá `Math.sin` 47×, `Math.cos` 41×, `Math.atan2` 20× a `Math.exp` 11×. ECMAScript tyto funkce specifikuje jako *implementation-approximated* — nezaručuje bit-identický výsledek napříč enginy.

Praktický dopad:

- **Stejný prohlížeč na obou stranách:** bezpečné. Ověřeno měřením výše.
- **Chrome ↔ Firefox:** V8 i SpiderMonkey dnes používají vlastní port fdlibm, takže shoda je pravděpodobná, ale není garantovaná specifikací.
- **Safari / JavaScriptCore:** odlišná implementace, rozejití je reálné.

Proto je resync z §6 součástí návrhu od začátku, ne dodatečná vychytávka. Pokud se v testech ukáže rozejití napříč enginy jako časté, existuje záložní řešení: nahradit `Math.sin`/`Math.cos`/`Math.atan2` v `src/game/` vlastními deterministickými aproximacemi. To je práce navíc a nechávám ji mimo první implementaci — nejdřív změřit, pak řešit.

---

## 4. Změna stavu: jeden hráč → sedadla

### 4.1 Tvar dat

Dnes je v `src/game/types.ts`:

```ts
export interface GameState {
  version: 2;
  player: Player;
  // ...
}
```

Nově:

```ts
export interface GameState {
  version: 3;
  players: Player[];   // index = číslo sedadla, pevné po celou hru
  // ...
}
```

**Kritické pravidlo:** informace o tom, které sedadlo patří lokálnímu hráči, **nesmí být v `GameState`**. Kdyby byla, každý klient by měl jinou hodnotu a stavy by se okamžitě rozešly. Patří do session obalu, který se nikdy neserializuje ani neposílá:

```ts
interface Session {
  state: GameState;    // identické na všech klientech
  seat: number;        // pouze lokální
  net: Transport;
}
```

Totéž platí pro nastavení (`Settings`), stav kamery, otevřený editor a UI obecně. Všechno to je lokální a mimo synchronizovaný stav.

### 4.2 Refaktor

`s.player` má 83 výskytů ve 13 souborech: `simulation.ts`, `interactions.ts`, `journey.ts`, `encounter-ai.ts`, `symbiosis.ts`, `demography.ts`, `migration.ts`, `nursery.ts`, `persistence.ts`, `canopy-guidance.ts`, `terrace-guidance.ts`, `journey-network.ts`, `journey-evolution.ts`.

Postup je mechanický a **řízený překladačem**: funkce, které dnes berou `(s: GameState)` a sahají dovnitř na `s.player`, dostanou explicitní parametr.

```ts
// dnes
export function nearNest(s: GameState) { ... s.player.pos ... }
export function senseRange(s: GameState): number { const p = s.player; ... }

// nově
export function nearNest(s: GameState, p: Player) { ... p.pos ... }
export function senseRange(s: GameState, p: Player): number { ... }
```

Po změně typu `GameState` ukáže `pnpm typecheck` každé jednotlivé místo, které je potřeba dotknout. Žádné hledání grepem, žádné tiché přehlédnutí.

**Zvažovaná zkratka, kterou nedoporučuji:** ponechat `s.player` jako ukazatel na „právě krokovaného hráče" a přepínat ho ve smyčce. Ušetří to celý refaktor, ale zavede implicitní globální stav — funkce by tiše operovala na jiném hráči podle toho, kdy je zavolána. V kódu, kde na správnosti stojí determinismus, je to mina. Zkratku uvádím jen jako nouzový únik, pokud by se refaktor ukázal jako výrazně větší, než čísla naznačují.

### 4.3 Pořadí krokování

```ts
export function step(s: GameState, inputs: Input[], dt = 1/60) {
  for (let seat = 0; seat < s.players.length; seat++) {
    stepPlayer(s, seat, inputs[seat], dt);
  }
  stepWorld(s, dt);   // NPC, zdroje, klima — jednou za tick, ne jednou za hráče
}
```

Dvě pravidla, na kterých stojí determinismus:

1. **Hráči se krokují vždy v pořadí podle sedadla.** Nikdy podle pořadí příchodu paketů, nikdy podle iterace přes `Map`.
2. **Světová část se krokuje právě jednou za tick.** Dnes je logika NPC, regenerace zdrojů a klimatu uvnitř `step` promíchaná s hráčskou; refaktor ji musí oddělit, jinak by se svět s každým dalším hráčem krokoval rychleji.

Důsledek pravidla 1: když dva hráči ve stejném ticku sáhnou po témž zdroji, dostane ho nižší sedadlo. Je to deterministické a mírně nespravedlivé. Považuji to za přijatelné — alternativou je dělení zdroje mezi oba, což lze doplnit později, pokud se to při hraní ukáže jako problém.

### 4.4 Chování NPC vůči více hráčům

Tohle **není jen instalatéřina, je to herní design.** `encounter-ai.ts` a `npcStep` dnes míří na `s.player` jako na jediný cíl. Ve více hráčích je potřeba rozhodnout, co predátor dělá.

Navrhované chování:

- **Predátor** si vybírá nejbližšího hráče v dosahu vnímání. Při shodné vzdálenosti rozhoduje nižší sedadlo (determinismus).
- **Býložravec** prchá před nejbližší hrozbou bez ohledu na to, který hráč to je.
- **Symbiotický partner** je vázaný na konkrétní sedadlo. `Bond` už dnes žije v `Player`, takže tohle vychází zadarmo.

Dopad na obtížnost: čtyři hráči znamenají čtyřnásobný tlak na populace. Ekologická simulace na to není naladěná. Návrh nechává vyvážení na pozdější měření, ale pojmenovává ho jako očekávanou práci — ne jako překvapení.

---

## 5. Lockstep smyčka

### 5.1 Zpožděný vstup

Vstup zaznamenaný v ticku `T` se neprovede okamžitě, ale je naplánovaný na tick `T + D`, kde `D = 3` (při 60 Hz tedy 50 ms). Zpoždění dává síti čas doručit vstup všem dřív, než na něj dojde řada.

```ts
// každý tick
const myInput = latch.consume();
net.send({ kind: 'input', tick: currentTick + DELAY, seat: mySeat, input: myInput });
```

`InputLatch` z `src/game/input-clock.ts` zůstává beze změny — jen se jeho výstup místo přímého předání do `step` nejdřív pošle po síti a zařadí do fronty.

### 5.2 Fronta a stání

```ts
class LockstepDriver {
  private pending = new Map<number, (Input | undefined)[]>();

  canAdvance(tick: number): boolean {
    const row = this.pending.get(tick);
    return !!row && row.every((i) => i !== undefined);
  }
}
```

Klient smí odkrokovat tick `T` jen tehdy, má-li vstupy **všech** sedadel pro `T`. Když nemá:

- Simulace stojí. Nic se nedopočítává dopředu.
- **Render běží dál.** Kamera se hýbe, animace pokračují — obraz nezamrzne.
- Po ~200 ms se objeví nenápadná hláška „čekám na hráče *jméno*".

Tohle je cena lockstepu: nejpomalejší spojení určuje tempo všech. Na LAN je to neznatelné. Na špatném spojení je to viditelné a **záměrně viditelné** — hráč má vědět, že se čeká na někoho konkrétního, ne aby hra nevysvětlitelně škubala.

### 5.3 Odpojení hráče

Když sedadlo přestane posílat vstupy:

1. Prvních 60 tiků se opakuje jeho poslední vstup. Pokryje to krátké výpadky, aniž si toho kdokoli všimne.
2. Po vypršení se sedadlo označí jako nepřítomné, jeho vstup je natrvalo `EMPTY_INPUT` a ostatní pokračují.
3. Tvar odpojeného hráče ve světě zůstává a je vizuálně odlišený. Nemizí — jeho zmizení by byla změna stavu, na které se musí shodnout všichni.

Klíčové: rozhodnutí „sedadlo je pryč" musí padnout **deterministicky na všech klientech ve stejném ticku**, jinak se stavy rozejdou. Proto se neváže na lokální timeout, ale vyhlásí ho host jako příkaz v tikovém proudu (§5.4).

### 5.4 Příkazy, ne přímé mutace

Tohle je nejčastější zdroj chyb v lockstep hrách a stojí za to ho napsat výslovně.

Cokoli, co mění `GameState` mimo `step`, **musí projít tikovým proudem jako příkaz**. Dnes hru mutují přímo:

- `evolve(s, draft)` — potvrzení změny těla v editoru
- `tryTransition(s)` — přechod mezi etapami
- `recoverGeneration(s)` — obnova po smrti
- import save souboru

Všechny se musí přepsat na příkazy doručené na konkrétní tick:

```ts
type Command =
  | { kind: 'input'; tick: number; seat: number; input: Input }
  | { kind: 'evolve'; tick: number; seat: number; genome: Genome }
  | { kind: 'transition'; tick: number }
  | { kind: 'recover'; tick: number; seat: number }
  | { kind: 'seatLost'; tick: number; seat: number };
```

Editor se tedy lokálně otevře a hráč si v něm zkouší co chce — to je čistě lokální UI. Teprve **potvrzení** pošle `evolve` příkaz, který se provede u všech ve stejném ticku. Validace (`validateMutation`, cena v DNA) běží uvnitř simulace na všech klientech shodně, takže upravený klient si nemůže přidat adaptaci zadarmo, aniž by se okamžitě rozešel s ostatními a spustil resync.

### 5.5 Pauza

V single playeru je pauza lokální. V co-opu musí být skupinová, jinak by se stavy rozešly. Nejjednodušší varianta, kterou navrhuji: pauza je příkaz — kdokoli ji vyvolá, hra se zastaví všem, a jméno toho, kdo pauzoval, se ukáže na obrazovce. Bez hlasování, bez vyjednávání.

---

## 6. Detekce rozejití a resynchronizace

### 6.1 Kontrolní součet

Každých 60 tiků (jednou za sekundu) spočítá každý klient kontrolní součet a pošle ho ostatním:

```ts
function checksum(s: GameState): number {
  let h = 0x811c9dc5;                       // FNV-1a
  const mix = (n: number) => { h ^= n | 0; h = Math.imul(h, 0x01000193); };
  mix(s.tick); mix(s.rng); mix(s.world.rng);
  for (const p of s.players) { mix(p.pos.x * 4096); mix(p.pos.z * 4096); mix(p.health * 256); }
  for (const c of s.world.creatures) { mix(c.pos.x * 4096); mix(c.pos.z * 4096); }
  return h >>> 0;
}
```

Volba vstupů není libovolná. `world.rng` je nejcitlivější — jakákoli odchylka v logice, která sáhne na náhodu, ho posune okamžitě. Pozice hráčů a tvorů chytnou zbytek. Hashovat celých 95 KB JSONu by fungovalo taky, ale stojí to zbytečně víc a nepřidá to citlivost.

Kvantizace (`* 4096`) je tu záměrně: bez ní by hash reagoval i na rozdíl v posledním bitu mantisy, což je u čísel odvozených z `Math.sin` napříč enginy příliš přísné. Kvantizace odfiltruje šum a nechá projít skutečné rozejití.

### 6.2 Obnova

Při neshodě:

1. Klient s odlišným součtem přestane krokovat a požádá hosta o stav.
2. Host pošle celý `GameState` — 95 KB jednorázově — spolu s číslem ticku.
3. Klient stav převezme, vyhodí frontu vstupů a naváže od doručeného ticku.
4. Do logu se zapíše tick a součty obou stran. Bez toho se rozejití nedá ladit.

Host je autorita **jen v tomto okamžiku**. Za normálního provozu nemá žádné zvláštní postavení kromě přeposílání vstupů.

---

## 7. Transport: WebRTC bez signalizačního serveru

### 7.1 Rozhraní

Síťování je za jedním rozhraním, aby šlo transport vyměnit bez zásahu do herní logiky:

```ts
export interface Transport {
  readonly seat: number;
  readonly seatCount: number;
  send(msg: NetMessage): void;
  onMessage(cb: (msg: NetMessage) => void): void;
  close(): void;
}
```

Implementace:

| Implementace | Použití |
|---|---|
| `WebRtcTransport` | ostrý provoz — localhost a LAN, nulový server |
| `BroadcastChannelTransport` | vývoj a automatické testy mezi taby, nulová síť |
| `LoopbackTransport` | Vitest, dva `GameState` v jednom procesu |

### 7.2 Topologie: hvězda

Hráči se nepropojují každý s každým. Host drží spojení s každým hostem a přeposílá vstupy.

```
         ┌─────────┐
         │  HOST   │
         └────┬────┘
      ┌───────┼───────┐
      │       │       │
   ┌──▼─┐  ┌──▼─┐  ┌──▼─┐
   │ H1 │  │ H2 │  │ H3 │
   └────┘  └────┘  └────┘
```

Důvod je čistě praktický: mesh při čtyřech hráčích potřebuje 6 ručních handshaků, hvězda 3. Při ručním copy-paste signalingu je to rozdíl mezi „otravné" a „nikdo to nikdy neudělá". Navíc host už autoritou pro resync je, takže topologie odpovídá rolím.

Cena: vstup od hosta 1 k hostovi 2 jde přes dva skoky. Při zpoždění vstupu o 3 tiky se to schová.

### 7.3 Ruční handshake

WebRTC potřebuje vyměnit SDP popisy. Bez serveru to udělají hráči sami — přes chat, mail, cokoli.

```
HOST                                      HOST 2
  │                                          │
  │ createDataChannel('lumavora')            │
  │ createOffer() → setLocalDescription()    │
  │ čeká na icegatheringstate === 'complete' │
  │ komprimuje SDP → base64 → kód            │
  │                                          │
  │ ───────── kód pozvánky ────────────────► │
  │                                          │ setRemoteDescription()
  │                                          │ createAnswer()
  │                                          │ čeká na ICE gathering
  │ ◄──────── kód odpovědi ───────────────── │
  │ setRemoteDescription()                   │
  │                                          │
  │ ◄════════ datový kanál otevřen ════════► │
```

Dva technické detaily, které rozhodují o tom, jestli to bude fungovat:

**Čekat na dokončení ICE gathering.** Standardní trickle ICE průběžně doplňuje kandidáty po signalizačním kanálu — ten tu ale neexistuje. Proto se musí počkat, až `pc.iceGatheringState === 'complete'`, a teprve pak SDP serializovat. Jinak bude kód obsahovat neúplnou sadu kandidátů a spojení se nenaváže.

**Datový kanál musí být spolehlivý a řazený.** `createDataChannel('lumavora', { ordered: true })` bez `maxRetransmits`. V lockstepu nelze ztratit jediný vstup — ztracený vstup znamená, že se všichni zastaví a už nikdy nerozjedou. Tohle není místo pro nespolehlivý kanál.

**Velikost kódu k vložení.** SDP má ~2 KB. Přes vestavěný `CompressionStream('deflate-raw')` a base64 se dostane na zhruba 800 znaků. To je v pořádku vložit do chatu. Bez komprese by to bylo přes 2700 znaků, což už je nepříjemné.

### 7.4 Kde to funguje a kde ne

Tohle je hlavní slabina zvoleného transportu a patří ji říct rovnou.

| Prostředí | Funguje | Proč |
|---|---|---|
| Dva taby, jeden počítač | ✅ | host kandidáti na loopbacku |
| Stejná LAN / Wi-Fi | ✅ | host kandidáti na lokálních IP |
| Přes internet, běžný NAT | ⚠️ | potřebuje veřejný STUN server |
| Přes internet, symetrický NAT | ❌ | potřebuje TURN relay, ten je placený |

Bez nakonfigurovaných `iceServers` použije `RTCPeerConnection` jen host kandidáty — tedy lokální síťové adresy. To pro zadání „jede nám to lokálně" stačí beze zbytku a je to jediná varianta, kde je server opravdu nulový.

Pokud by později bylo potřeba hrát přes internet, je to jednořádková změna (`iceServers: [{ urls: 'stun:...' }]`), ale je to **porušení mantinelu nulové externí služby** a jako takové to má být vědomé rozhodnutí, ne tichý default.

---

## 8. Perzistence

`GameState.version` jde z 2 na 3. Save formát dostane `players` místo `player`.

Validátor v `src/game/persistence.ts` je přísný — funkce `object(value, path, keys)` kontroluje **přesný počet klíčů**, takže rozšíření stavu bez zásahu do validátoru skončí chybou „poškozený soubor". Je potřeba:

- `validatePlayer` volat v cyklu přes `players` (1–4 položky).
- Doplnit migraci v2 → v3: starý save se načte a jeho `player` se zabalí do `players: [player]`. Existující jednohráčské uložené hry **musí zůstat načitatelné** — je to explicitní požadavek zadání.
- Do `tests/persistence.test.ts` přidat případ na migraci i na odmítnutí save s prázdným nebo přeplněným `players`.

**Kdo ukládá:** host. Save je jeden soubor obsahující celou skupinu. Hosté mohou vyexportovat svou linii zvlášť pro vlastní archiv, ale autoritativní save drží host.

**Poznámka k `id`:** `createGame` generuje `line-${seed}-${Date.now()}`, což je jediné nedeterministické pole. V multiplayeru to není problém — hru zakládá host a při připojení pošle celý výchozí stav, takže hosté `id` **přebírají, negenerují**. Připojovací handshake tenhle problém řeší sám od sebe.

---

## 9. Render a UI

### 9.1 Renderer

`GameRenderer` (`src/render/renderer.ts:46`) drží dnes jeden organismus:

```ts
private player: THREE.Group | null = null;
private playerKey = '';
```

Změna na mapu podle sedadla:

```ts
private organisms = new Map<number, { group: THREE.Group; key: string }>();
```

Logika pro přestavbu modelu při změně genomu (`renderer.ts:116`) už existuje a je správná — jen se z jedné instance stane cyklus přes sedadla. `createOrganism(genome)` a `animateOrganism(group, ...)` v `src/render/organism.ts` jsou **už dnes bezstavové vůči tomu, čí organismus vykreslují**, takže render N hráčů nevyžaduje v `organism.ts` žádnou změnu. To je nejpříjemnější zjištění celého průzkumu.

### 9.2 Kamera a HUD

- Kamera sleduje lokální sedadlo. `compositionCamera` a `safeCameraPosition` (`src/game/camera.ts`) dostanou pozici lokálního hráče místo `s.player`.
- Cizí hráči mají nad sebou jmenovku a odlišný nádech přes `applyLivingFinish`.
- HUD ukazuje lokálního hráče beze změny. Vedle přibude útlý seznam ostatních — jméno, etapa, zdraví.
- `summary()` (`src/game/simulation.ts:300`) vrací dnes jednoho hráče; bude vracet pole plus index lokálního sedadla. Používají ho i diagnostické skripty v `scripts/`, takže je potřeba projít i je.

---

## 10. Přechody mezi etapami — otevřené rozhodnutí

V single playeru je etapa vlastnost hráče. V co-opu mění celý svět, včetně toho, jaké druhy a zdroje v něm jsou. Rozdílné etapy u různých hráčů ve sdíleném světě nedávají smysl.

**Navrhovaný default: skupinový přechod.** Hra přejde do další etapy, až podmínky splní **všichni**. Obrazovka přechodu ukazuje, kdo co postrádá — stejné požadavky, jaké dnes vrací `transitionRequirements`, jen po sedadlech.

Odůvodnění: drží skupinu pohromadě, dělá z přechodu společný cíl a zapadá to do kooperativního ducha — rychlejší hráč má důvod pomoct pomalejšímu.

Zvažované alternativy a proč je nedoporučuji:

- *Host rozhodne* — rychlé na implementaci, ale pomalejší hráči se ocitnou v etapě, na kterou nemají tělo, a rovnou umřou.
- *Každý svou etapu* — znamenalo by to tři paralelní světy a popřelo by to celý smysl sdíleného světa.

Tohle je jediné místo v návrhu, kde jde o skutečné herní rozhodnutí, a stojí za to ho před implementací potvrdit hraním, ne úvahou.

---

## 11. Testování

Multiplayer se dá otestovat bez sítě, což je hlavní přínos deterministického návrhu.

**Vitest — determinismus:** dvě instance `GameState`, tentýž proud vstupů, porovnání po N ticích. Tenhle test už v podstatě prošel během průzkumu (§2.1) a stane se z něj trvalý regresní test.

**Vitest — souběh:** dva hráči sáhnou po témž zdroji ve stejném ticku. Ověřuje, že rozhodne nižší sedadlo a že se zdroj neodečte dvakrát.

**Vitest — resync:** uměle se poškodí stav jednoho klienta; test ověří, že kontrolní součet rozdíl odhalí do 60 tiků a že po resyncu jsou stavy opět shodné.

**Vitest — migrace save:** v2 save se načte jako v3 s jedním hráčem.

**Playwright — dva taby:** přes `BroadcastChannelTransport` se dá odehrát skutečná dvouhráčská partie ve dvou tabech **bez jakéhokoli serveru**. Existující `scripts/browser-test.mjs` je dobrý základ k rozšíření.

**Ruční — WebRTC handshake:** copy-paste tok se automatizovat nedá rozumně. Zůstává v ručním testovacím postupu.

---

## 12. Fázování

Pořadí je zvolené tak, aby každá fáze skončila něčím ověřitelným, a aby nejrizikovější část přišla brzy.

### Fáze 0 — lockstep smyčka nasucho
`Transport` rozhraní, `LoopbackTransport`, `LockstepDriver`, zpoždění vstupu. Hra zůstává jednohráčská, jen vstup teče přes frontu místo přímo do `step`.
*Hotovo, když:* jednohráčská hra je nerozeznatelná od dneška a všechny existující testy procházejí.

### Fáze 1 — `players[]`
Refaktor stavu, rozdělení `step` na hráčskou a světovou část, renderer na mapu organismů, perzistence v3 s migrací.
*Hotovo, když:* hra jede se dvěma sedadly, kde druhé je nečinné, a jde vidět druhý organismus stojící ve světě.

**Tohle je největší a nejméně zábavná fáze.** Zabere zhruba tolik co všechny ostatní dohromady. Je to čistě mechanická práce řízená překladačem, ale je jí hodně.

### Fáze 2 — BroadcastChannel
Skutečná dvouhráčská hra mezi dvěma taby. Žádná síť, žádný handshake.
*Hotovo, když:* dva taby odehrají partii a Playwright test to projde.

Tady je poprvé vidět, jestli celý koncept sedí — a to bez toho, aby byl napsaný jediný řádek WebRTC.

### Fáze 3 — WebRTC
Peer připojení, čekání na ICE gathering, komprese SDP, obrazovka pro copy-paste, hvězdicové přeposílání.
*Hotovo, když:* dva počítače na jedné LAN odehrají partii.

### Fáze 4 — odolnost
Kontrolní součty, resync, zpracování odpojení, hláška o čekání na hráče.
*Hotovo, když:* uměle vyvolané rozejití se samo srovná a odpojení hráče hru nezastaví.

### Fáze 5 — herní doladění
Cílení NPC na více hráčů, skupinový přechod etap, vyvážení ekologického tlaku, jmenovky a seznam hráčů.
*Hotovo, když:* čtyřhráčová partie se dá dohrát a nepůsobí ani prázdně, ani nespravedlivě.

---

## 13. Shrnutí rozhodnutí

| Otázka | Rozhodnutí | Důvod |
|---|---|---|
| Typ multiplayeru | sdílený co-op svět | staví na pilíři „svět si pamatuje tvůj vliv" |
| Síťový model | deterministický lockstep | hra determinismus už má; 15× levnější než snapshoty |
| Autorita | žádná za běhu, host jen při resyncu | lockstep autoritu nepotřebuje |
| Transport | WebRTC, ruční signaling | jediná varianta s nulovým serverem |
| Topologie | hvězda přes hosta | 3 ruční handshaky místo 6 |
| Zpoždění vstupu | 3 tiky (50 ms) | schová LAN latenci i přeskok přes hosta |
| Ochrana proti rozejití | checksum á 60 tiků + full resync | krytí rizika `Math.sin` napříč enginy |
| Přechod etap | skupinově, až splní všichni | drží skupinu pohromadě *(k potvrzení hraním)* |
| Perzistence | v3, host ukládá, migrace z v2 | staré savy musí zůstat načitatelné |

---

## 14. Co tenhle návrh vědomě neřeší

- **Hra přes internet.** Vyžadovala by STUN, a při symetrickém NATu placený TURN. Mimo mantinely.
- **Ochrana proti podvádění.** Lockstep rozejití odhalí a srovná, ale neumí rozlišit podvodníka od jiného prohlížeče. Pro kooperativní hru mezi známými lidmi to nevadí.
- **Připojení do rozehrané hry.** Technicky by šlo — host pošle stav a nové sedadlo se přidá — ale přidávání hráče uprostřed je změna stavu, na které se musí shodnout všichni, a pro první verzi to není potřeba. Sedadla se určí před startem.
- **Náhrada `Math.sin` deterministickou aproximací.** Až podle toho, co ukáže měření napříč prohlížeči.
- **Vyvážení obtížnosti pro čtyři hráče.** Pojmenováno jako očekávaná práce ve fázi 5, ale konkrétní čísla se dají dělat až při hraní.
