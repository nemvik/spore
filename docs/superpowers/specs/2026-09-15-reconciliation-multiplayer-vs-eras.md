# Sladění: co-op multiplayer × nové etapy

Dva návrhy v tomhle repu si na několika místech sahají na totéž. Tenhle dokument je popisuje, rozhoduje a stanovuje pořadí prací.

- **Datum:** 2026-09-15
- **Týká se:** [`multiplayer-design`](2026-09-15-multiplayer-design.md) · [`multiplayer plán`](../plans/2026-09-15-multiplayer.md) · [`machine-era design`](2026-09-15-lumavora-machine-era-design.md) · [`machine-era roadmap`](../plans/2026-09-15-lumavora-machine-era-roadmap.md)
- **Závazné:** ano. Při rozporu s některým z těch čtyř dokumentů platí tenhle.

---

## 0. Shrnutí pro spěchající

Návrhy **nejsou v rozporu o cíli.** Oba jsou čistě aditivní a oba staví na tom, co hra už má. Kolidují o **pořadí, jména a jedno číslo verze**.

Sedm kolizí je mechanických a rozhodnutých v §1. Osmá byla skutečná herní otázka — **co je „sedadlo" v RTS etapách** — a zadavatel ji rozhodl: **každé sedadlo má vlastní kmen a vlastní flotilu** (§3). Z toho plyne rozdělení `Campaign`, které v žádném z původních návrhů není.

Zásadní rozhodnutí zadavatele: **nejdřív se dodělají celé etapy, multiplayer přijde až potom jako nadstavba** — a to jen pokud se pro něj zadavatel rozhodne. Důvod je řízení rizika: nesahat velkým refaktorem do fungující vydané hry dřív, než vůbec existuje nový obsah. Viz §4, kde je i cena, kterou to stojí.

---

## 1. Ostré kolize a jejich řešení

### K1 — Obě si nárokují `GameState.version: 3`

**Nejostřejší kolize v celém repu.** Oba návrhy zvedají verzi na 3, každý s jiným, vzájemně neslučitelným tvarem:

| Návrh | Tvar verze 3 |
|---|---|
| multiplayer | `players: Player[]` **místo** `player: Player` |
| nové etapy | ponechává `player`, přidává `tribe?`, `machines?`, `planet?` |

Uložená hra zapsaná jedním by byla pro druhý poškozený soubor — a validátor v `persistence.ts` kontroluje **přesný počet klíčů**, takže by to selhalo hlasitě, ne tiše. To je jediná dobrá zpráva.

**Rozhodnutí:** protože se etapy dělají první a multiplayer je odložená nadstavba (§4), **rozdělí se to na dva skoky:**

```ts
// verze 3 — etapy, dělá se teď
export interface GameState {
  version: 3;
  player: Player;          // beze změny
  tribe?: TribeState;
  machines?: MachineState;
  planet?: PlanetState;
}

// verze 4 — multiplayer, až a pokud se bude dělat
export interface GameState {
  version: 4;
  players: Player[];       // player → players
  tribe?: TribeState[];    // řezy se rozpadnou po sedadlech
  machines?: MachineState[];
  planet?: PlanetState;    // planeta zůstává jedna
}
```

**Verzi 3 si tedy berou etapy a `players[]` se nedělá vůbec.** Multiplayer, pokud na něj dojde, bude verze 4 a bude muset umět migraci z v2 i z v3.

Cena tohoto rozdělení je pojmenovaná v §4.2 a zadavatel ji přijal vědomě.

### K2 — Dvě různé věci se jmenují `Command`

| Návrh | Kde | Co to je |
|---|---|---|
| multiplayer | §5.4 | zpráva v tikovém proudu: `input`, `evolve`, `transition`, `recover`, `seatLost` |
| nové etapy | `src/game/command.ts` (P1) | rozkaz jednotce: `move`, `gather`, `attack`, `socialize`, `build` |

Stejné jméno, sousední soubory, úplně jiný pojem. Kdyby to zůstalo, bude to trvalý zdroj záměny.

**Rozhodnutí:** přejmenovat obojí, ať je to jednoznačné i bez kontextu:

| Pojem | Nové jméno | Soubor |
|---|---|---|
| síťová zpráva na tick | `TickCommand` | `src/game/net/tick-command.ts` |
| rozkaz jednotce | `UnitOrder` | `src/game/unit-order.ts` |

### K3 — `step()` mění signaturu pod rukama

Dnes: `step(s: GameState, input: Input, dt)` (`simulation.ts:246`).

Multiplayer to mění na `step(s, inputs: Input[], dt)` a **rozděluje na `stepPlayer` a `stepWorld`**, kde světová část běží **právě jednou za tick**, ne jednou za hráče. Nové etapy do světové části přidávají tři nové simulace: RTS jednotky, regiony a strojovou výrobu, planetární klima.

**Rozhodnutí:** rozdělení `step` na hráčskou a světovou část se udělá **v P0**, i když se multiplayer odkládá. Nová simulace z etap 3–5 do světové části patří tak jako tak a bez rozdělení by se pletla s hráčskou. Signatura `inputs: Input[]` se zatím nemění — mění se jen vnitřní struktura.

**Past, kterou je potřeba pojmenovat:** tlupa v etapě 3 a flotila v etapě 4 jsou *jednotky*, ale nejsou *hráči*. Nesmí se krokovat ve smyčce přes sedadla, jinak se svět se čtyřmi hráči krokuje čtyřikrát rychleji. Patří do `stepWorld`.

### K4 — Refaktor `s.player` a nové etapy si sahají na tytéž soubory

`s.player` má **83 výskytů ve 13 souborech** (ověřeno). Sedm z nich mění i roadmapa etap: `simulation.ts`, `persistence.ts`, `encounter-ai.ts`, `journey.ts`, `navigation.ts`, `camera.ts`, `main.ts`.

Kdo jde druhý, platí víc — a kdyby šly souběžně, je z toho merge peklo.

**Rozhodnutí:** **nikdy souběžně.** Protože etapy jdou první (§4), refaktor na `players[]` se nedělá vůbec, dokud nebude kampaň hotová — a v té chvíli bude větší. Cena je vyčíslená v §4.2 a zadavatel ji přijal.

### K5 — Nové etapy musí dodržet pravidla determinismu, o kterých neví

Roadmapa etap o lockstepu nemluví, protože vznikla vedle. Tři pravidla pro ni platí — a **první dvě platí i bez multiplayeru**, protože seedovaná reprodukovatelnost je požadavek `GAME_BRIEF.md`:

1. **Žádné iterace v nedeterministickém pořadí.** V `src/game/` je dnes 22 míst s `Map`/`Set`. Nová RTS vrstva bude chtít další. Iterovat se smí jen podle stabilního klíče — id jednotky, číslo sedadla — nikdy podle pořadí vložení do `Map`.
2. **Akce měnící stav má mít jedno volatelné místo v `src/game/`**, ne se dít přímo v obsluze kliknutí. Teď kvůli testovatelnosti a checkpointům; až s multiplayerem se z takového místa stane `TickCommand` bez přepisování volajících.
3. **Pozor na transcendentní funkce.** `src/game/` jich má dnes **119** (`sin`, `cos`, `atan2`, `exp`) a multiplayerový spec je v §3.2 označuje za hlavní riziko rozejití napříč enginy. Steering se separací, na kterém stojí RTS vrstva, je jich přidá řádově víc než kterákoli existující část hry. **Riziko rozejití tím měřitelně roste.** Teď to nic neblokuje, ale až se bude rozhodovat o multiplayeru, bude vlastní deterministická aproximace `sin`/`cos`/`atan2` spíš nutnost než volba — a je to jeden z důvodů, proč se multiplayer odkládá jako *volitelná* nadstavba, ne jistota.

### K6 — Kontrolní součet nevidí nové řezy stavu

`checksum()` (multiplayer §6.1) hashuje `tick`, `rng`, `world.rng`, pozice hráčů a tvorů. Řezy `tribe`, `machines` a `planet` v něm nejsou.

Rozejití v kmenové ekonomice nebo v planetárním T-skóre by tedy **zůstalo neviditelné** až do chvíle, kdy se projeví někde jinde — tedy v nejhorší možnou dobu a bez stopy k příčině.

**Rozhodnutí:** `checksum()` dnes neexistuje a s odloženým multiplayerem se **teď nezavádí** — neměl by zákazníka. Až se multiplayer bude stavět, je jeho součástí rozšířit součet o citlivá pole všech řezů: `tribe[].food`, počty členů, `machines[].resource`, vlastnictví regionů, `planet.temperature`, `planet.atmosphere`, `tScore`, a v etapách 3–4 **přes všechna sedadla**. Zapsáno tady, aby se na to při stavbě multiplayeru nezapomnělo. Není to úklid na konec, je to součást definice hotového.

### K7 — Opt-in po vítězství je skupinové rozhodnutí, ne lokální

Roadmapa etap (P0, úkol 9) popisuje pokračování do kmenové éry jako volbu hráče po `campaign.won`. Multiplayer §10 rozhoduje, že **přechody mezi etapami jsou skupinové** — hra přejde, až splní všichni.

Lokální volba by v co-opu okamžitě rozešla stavy: jeden klient by pokračoval do etapy 3, druhý zůstal.

**Rozhodnutí:** teď zůstává tak, jak roadmapa popisuje — lokální volba hráče po `campaign.won`. Podmínka je jen ta z K5: ať vede přes volatelnou funkci v `src/game/`, ne přímo z obsluhy kliknutí. Až s multiplayerem se z ní stane skupinový `TickCommand`, a díky tomu hrdlu to bude změna na jednom místě.

---

## 2. Co v konfliktu **není**

Pro pořádek, ať se nehledají problémy tam, kde nejsou:

- **Soubory dokumentů.** Žádné se nepřekrývají, merge do `main` proběhl bez konfliktu.
- **Renderování organismů.** `createOrganism` a `animateOrganism` jsou už dnes bezstavové vůči tomu, čí tělo kreslí. Platí to i pro stroje z `Blueprint`, protože sdílejí sestavovací logiku.
- **Editor.** Zobecnění na `Blueprint` (etapy P2) a příkaz `evolve` v tikovém proudu (multiplayer §5.4) jsou nezávislé vrstvy. Editor je lokální UI, potvrzení je příkaz — platí to pro tělo i pro stroj.
- **Transport a WebRTC.** Nové etapy se ho nedotýkají nijak.
- **Kamera.** Multiplayer chce, aby sledovala lokální sedadlo; etapy chtějí režim nad krajinou. Obojí je v `camera.ts` a nejde proti sobě.

---

## 3. Sedadlo v RTS etapách — rozhodnuto, uplatní se až s multiplayerem

**Otázka:** multiplayer staví na tom, že sedadlo = jedno tělo ve světě: má `Player` s pozicí a genomem, kamera ho sleduje, renderer mu drží organismus. V etapách 3 a 4 žádné jedno tělo není — hráč velí tlupě, pak flotile.

**Rozhodnutí zadavatele: varianta B — každé sedadlo má vlastní kmen a vlastní flotilu ve sdílené krajině.**

> **Platnost:** rozhodnutí je zaznamenané, ale **uplatní se až ve chvíli, kdy se multiplayer bude stavět** (§4). Etapy se teď dělají jednohráčsky a `TribeState` i `MachineState` jsou jednotlivé struktury, ne pole. Tahle sekce je zadání pro budoucí nadstavbu, ne pro P1 a P2.

Zvažovány byly i varianta A (sdílená tlupa, kdokoli velí komukoli) a C (jedna tlupa s vlastníkem u každé jednotky). Zvolena je B; níže jsou její důsledky, aby je nikdo neobjevoval až v kódu.

### 3.1 Řezy stavu jsou po sedadlech, planeta ne

```ts
tribe?:    TribeState[];     // index = sedadlo
machines?: MachineState[];   // index = sedadlo
planet?:   PlanetState;      // jedna planeta, sdílená
```

Etapy 3 a 4 tedy **násobí svůj stav počtem hráčů**; etapa 5 ne, protože planeta je jedna. Uložená hra ve čtyřech hráčích poroste v etapách 3–4 zhruba čtyřnásobně proti jednomu hráči.

### 3.2 Zpětný dopad na `campaign` — nečekaný, ale nutný

Archetyp v etapě 4 (zahradníci / regulátoři / symbionti) se odvozuje ze závěrečné cesty etapy 2. Když má každé sedadlo vlastní kmen a flotilu, **má i vlastní archetyp** — a ten pochází z pole `campaign.finale`, které je dnes jedno sdílené.

`Campaign` se proto musí rozdělit na dvě části:

| Zůstává sdílené | Přechází na sedadla |
|---|---|
| `drought`, `won`, `sandbox`, `journals`, `discoveries` | `finale`, `stageMeals`, `stageKills`, `stageBonds`, `stageReproductions` |

Sdílené zůstává to, co popisuje **svět**; po sedadlech jde to, co popisuje **linii**. Tohle je důsledek varianty B, který v žádném z původních návrhů není. **Dokud je multiplayer odložený, `Campaign` se nedělí a zůstává jak je** — ale kdo bude multiplayer stavět, musí s tímhle dělením počítat, protože se dotkne i dat uložených her z etap.

### 3.3 Hráčské kmeny jsou trvale spojenecké

Varianta B strukturálně umožňuje, aby hráči napadli jeden druhého. To by popřelo kooperativní zadání, proto **výchozí pravidlo: kmeny a flotily hráčů se navzájem napadnout nemohou.** Soupeření je o zdroje v krajině, ne o válku mezi sedadly. Nepřátelské jsou jen NPC kmeny a invazní druhy.

Pokud by se při hraní ukázalo, že by PvP dávalo smysl, je to samostatné rozhodnutí a samostatná práce — nikoli výchozí chování.

### 3.4 Přechody etap ve variantě B

Multiplayer §10 rozhoduje, že přechody jsou skupinové. S variantou B to znamená, že podmínku postupu musí splnit **kmen každého sedadla zvlášť**, ne skupina dohromady. Obrazovka přechodu ukazuje po sedadlech, komu co chybí — stejný princip, jaký multiplayerový spec navrhuje pro etapy 0–2.

### 3.5 Kamera a co je vidět z cizího hráče

Kamera sleduje v etapách 3–4 **vybranou vlastní jednotku**, ne tělo. Cizí sedadlo je ve světě vidět jako jeho jednotky a stavby s odlišeným nádechem a jmenovkou u chýše — nikoli jako jeden organismus, protože žádný nemá. Renderer tedy v těchto etapách nemapuje sedadlo na organismus, ale **sedadlo na skupinu jednotek**.

### 3.6 Co to zdražuje

Pro pořádek, ať je cena vidět: B byla nejdražší ze tří variant. Násobí stav etap 3–4 počtem hráčů, rozděluje `Campaign`, vyžaduje vlastnictví u jednotek i staveb a rozšiřuje kontrolní součet o řezy všech sedadel. Roadmapa etap s tím ve svém odhadu P1 a P2 nepočítala — což teď nevadí, protože se etapy dělají jednohráčsky a odhad platí. Zdraží se to až ve chvíli, kdy na multiplayer dojde.

## 4. Závazné pořadí prací

**Rozhodnutí zadavatele: nejdřív celé etapy, multiplayer až potom — a jen pokud se pro něj rozhodne.**

```
┌─ TEĎ ────────────────────────────────────────────┐
│  etapy P0 → P1 → P2 → P3                         │
│  jednohráčsky, verze 3                           │
│  hra zůstává po celou dobu hratelná a vydatelná  │
└──────────────────┬───────────────────────────────┘
                   │  až je kampaň hotová a odehraná
                   ▼
┌─ POTOM, VOLITELNĚ ───────────────────────────────┐
│  multiplayer fáze 0 → 5                          │
│  players[], verze 4, migrace z v2 i v3           │
└──────────────────────────────────────────────────┘
```

### 4.1 Proč tak

Argument pro opačné pořadí byl **celková cena**: refaktor `s.player` je dnes 83 výskytů ve 13 souborech a každá nová etapa ho zvětší.

Argument, který zvítězil, je **riziko**: multiplayer je velký zásah do fungující, vydané hry, a dělat ho dřív, než vůbec existuje nový obsah, znamená destabilizovat to jediné, co dnes prokazatelně funguje. Etapy se navíc v návrhu ještě můžou hýbat — multiplayer postavený nad nehotovým tvarem by se přizpůsoboval něčemu, co se pod ním mění.

Riziko je bezprostřední, cena je odložená. Proto etapy první.

### 4.2 Co to stojí

Ať je cena vidět a nikdo ji později neobjevuje jako překvapení:

- **Refaktor `players[]` bude výrazně větší.** Dnes 13 souborů; po třech nových etapách k nim přibudou `tribe.ts`, `machines.ts`, `planet.ts`, `unit-order.ts`, `tribe-neighbours.ts` a tři renderovací moduly. Multiplayerový spec svou fázi 1 odhaduje na „zhruba tolik co všechny ostatní dohromady" — ten odhad platí pro dnešní rozsah, ne pro rozsah po P3.
- **Dvě migrace uložených her místo jedné.** Multiplayer bude muset umět v2 → v4 i v3 → v4.
- **`Campaign` se bude dělit dodatečně** (§3.2), tedy v kódu, který už bude stát, ne na zelené louce.
- **Tři nové subsystémy se budou převádět na sedadla zpětně**, ne psát rovnou správně.

### 4.3 Co přesto udělat teď, protože je to zadarmo

Tohle **nejsou** ústupky multiplayeru. Jsou to věci, které dávají smysl samy o sobě, a shodou okolností nechávají dveře otevřené. Patří do etap P0 a P1:

| Co | Proč to dává smysl i bez multiplayeru | Cena teď | Cena potom |
|---|---|---|---|
| **Rozdělit `step()` na hráčskou a světovou část** | RTS vrstva a planetární simulace patří do světové části tak jako tak; bez rozdělení se budou plést s hráčskou | malá | velká |
| **`UnitOrder` místo `Command`** (K2) | jednoznačné pojmenování; `Command` je v herním kódu příliš obecné | nulová | otravné přejmenování napříč |
| **Stabilní pořadí iterace přes jednotky** | seedovaná reprodukovatelnost je **požadavek `GAME_BRIEF.md`**, ne přání multiplayeru | nulová | těžko dohledatelné chyby |
| **Žádné `Math.random()` ani `performance.now()` v `src/game/`** | totéž — repo to dnes dodržuje a nemá důvod přestat | nulová | rozbitý determinismus |
| **Mutace stavu přes úzké hrdlo, ne rozsypané po UI** | snazší testování a checkpointy | malá | přepis všech akcí na příkazy |

Poslední řádek je nejdůležitější a stojí za doslovné znění: **akce, která mění `GameState`, má mít jedno volatelné místo v `src/game/`, ne se dít přímo v obsluze kliknutí v `main.ts`.** Dnes to hra většinou dodržuje (`evolve`, `tryTransition`, `recoverGeneration`) a P1 i P2 to mají dodržet taky.

Co se naopak **teď dělat nemá**: `players[]`, sedadla, dělení `Campaign`, pole `TribeState[]`, kontrolní součty, transport. Nic z toho zatím nemá zákazníka.

## 5. Co dělat s původními dokumenty

Nepřepisují se. Zůstávají jako doklad toho, jak se k návrhu došlo, a obsahují měření a odůvodnění, která tenhle dokument neopakuje.

Platí ale, že **při rozporu vyhrává tenhle dokument**, a to konkrétně v těchto bodech:

| Původní dokument | Co přepisuje tenhle |
|---|---|
| multiplayer §5.4 `Command` | → `TickCommand` (K2) |
| multiplayer §6.1 `checksum()` | → rozšířený o řezy stavu (K6) |
| multiplayer §8 verze 3 | → multiplayer bude **verze 4**, migrace z v2 i v3 (K1) |
| multiplayer §12 fáze 0–1 | → odloženo až za celou kampaň, volitelné (§4) |
| etapy §5.4 persistence | → verze 3 patří etapám, bez `players[]` (K1) |
| etapy P0 úkol 9 opt-in | → beze změny, jen přes volatelnou funkci (K7) |
| etapy P1 `src/game/command.ts` | → `UnitOrder` v `unit-order.ts` (K2) |
| etapy P0 | → doplněno rozdělení `step()` a hrdlo pro akce (K3, K5, §4.3) |
| etapy §5.3 řezy stavu | → beze změny; pole po sedadlech až s multiplayerem (§3.1) |
| etapy — `Campaign` | → beze změny; dělení až s multiplayerem (§3.2) |
| etapy P1/P2 odhad rozsahu | → platí; varianta B je zdraží až s multiplayerem (§3.6) |
