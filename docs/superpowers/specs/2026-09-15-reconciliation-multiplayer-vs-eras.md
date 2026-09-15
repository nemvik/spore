# Sladění: co-op multiplayer × nové etapy

Dva návrhy v tomhle repu si na několika místech sahají na totéž. Tenhle dokument je popisuje, rozhoduje a stanovuje pořadí prací.

- **Datum:** 2026-09-15
- **Týká se:** [`multiplayer-design`](2026-09-15-multiplayer-design.md) · [`multiplayer plán`](../plans/2026-09-15-multiplayer.md) · [`machine-era design`](2026-09-15-lumavora-machine-era-design.md) · [`machine-era roadmap`](../plans/2026-09-15-lumavora-machine-era-roadmap.md)
- **Závazné:** ano. Při rozporu s některým z těch čtyř dokumentů platí tenhle.

---

## 0. Shrnutí pro spěchající

Návrhy **nejsou v rozporu o cíli.** Oba jsou čistě aditivní a oba staví na tom, co hra už má. Kolidují o **pořadí, jména a jedno číslo verze**.

Sedm kolizí je mechanických a rozhodnutých v §1. Osmá byla skutečná herní otázka — **co je „sedadlo" v RTS etapách** — a zadavatel ji rozhodl: **každé sedadlo má vlastní kmen a vlastní flotilu** (§3). Z toho plyne rozdělení `Campaign`, které v žádném z původních návrhů není.

Zásadní rozhodnutí: **jeden společný základ, jedna verze uložené hry, žádné dva skoky.** Viz §4.

---

## 1. Ostré kolize a jejich řešení

### K1 — Obě si nárokují `GameState.version: 3`

**Nejostřejší kolize v celém repu.** Oba návrhy zvedají verzi na 3, každý s jiným, vzájemně neslučitelným tvarem:

| Návrh | Tvar verze 3 |
|---|---|
| multiplayer | `players: Player[]` **místo** `player: Player` |
| nové etapy | ponechává `player`, přidává `tribe?`, `machines?`, `planet?` |

Uložená hra zapsaná jedním by byla pro druhý poškozený soubor — a validátor v `persistence.ts` kontroluje **přesný počet klíčů**, takže by to selhalo hlasitě, ne tiše. To je jediná dobrá zpráva.

**Rozhodnutí:** verze 3 se zvedne **jednou a obsahuje obojí**:

```ts
export interface GameState {
  version: 3;
  players: Player[];   // z multiplayeru
  tribe?: TribeState;      // z etap
  machines?: MachineState;
  planet?: PlanetState;
}
```

Jedna migrace z v2, jeden přepis validátoru, jeden formát. **Dva oddělené skoky verze se nedělají** — zdvojily by práci na perzistenci, zdvojily migrační cesty a vyrobily by savy, které jdou načíst jen jednou z půlek repa.

Důsledek: sekce §8 multiplayerového specu a §5.4 specu etap se čtou **společně**, ne každá zvlášť.

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

**Rozhodnutí:** rozdělení `step` je **předpokladem obojího** a udělá se ve společném základu, dřív než kterýkoli z návrhů přidá vlastní obsah. Veškerá nová simulace z etap 3–5 patří do `stepWorld` a krokuje se jednou za tick.

**Past, kterou je potřeba pojmenovat:** tlupa v etapě 3 a flotila v etapě 4 jsou *jednotky*, ale nejsou *hráči*. Nesmí se krokovat ve smyčce přes sedadla, jinak se svět se čtyřmi hráči krokuje čtyřikrát rychleji. Patří do `stepWorld`.

### K4 — Refaktor `s.player` a nové etapy si sahají na tytéž soubory

`s.player` má **83 výskytů ve 13 souborech** (ověřeno). Sedm z nich mění i roadmapa etap: `simulation.ts`, `persistence.ts`, `encounter-ai.ts`, `journey.ts`, `navigation.ts`, `camera.ts`, `main.ts`.

Kdo jde druhý, platí víc — a kdyby šly souběžně, je z toho merge peklo.

**Rozhodnutí:** **nikdy souběžně.** Refaktor na `players[]` proběhne ve společném základu nad dnešním kódem, tedy v okamžiku, kdy je **nejmenší, jaký kdy bude.** Každý řádek nové etapy napsaný před ním přidává práci.

### K5 — Nové etapy musí dodržet pravidla determinismu, o kterých neví

Roadmapa etap o lockstepu nemluví, protože vznikla vedle. Tři pravidla pro ni platí, jakmile multiplayer existuje:

1. **Žádné iterace v nedeterministickém pořadí.** V `src/game/` je dnes 22 míst s `Map`/`Set`. Nová RTS vrstva bude chtít další. Iterovat se smí jen podle stabilního klíče — id jednotky, číslo sedadla — nikdy podle pořadí vložení do `Map`.
2. **Rozkaz měnící stav musí projít tikovým proudem jako `TickCommand`.** Výběr jednotky myší je lokální UI a po síti nejde. Vydaný rozkaz je změna stavu a jít musí.
3. **Pozor na transcendentní funkce.** `src/game/` jich má dnes **119** (`sin`, `cos`, `atan2`, `exp`) a multiplayerový spec je v §3.2 označuje za hlavní riziko rozejití napříč enginy. Steering se separací, na kterém stojí RTS vrstva, je jich přidá řádově víc než kterákoli existující část hry. **Riziko rozejití tím měřitelně roste** a rozhodnutí o vlastní deterministické aproximaci `sin`/`cos`/`atan2` se tím posouvá z „až podle měření" blíž k „nejspíš ano".

### K6 — Kontrolní součet nevidí nové řezy stavu

`checksum()` (multiplayer §6.1) hashuje `tick`, `rng`, `world.rng`, pozice hráčů a tvorů. Řezy `tribe`, `machines` a `planet` v něm nejsou.

Rozejití v kmenové ekonomice nebo v planetárním T-skóre by tedy **zůstalo neviditelné** až do chvíle, kdy se projeví někde jinde — tedy v nejhorší možnou dobu a bez stopy k příčině.

**Rozhodnutí:** každá část etap, která přidá řez stavu, **ve stejném úkolu rozšíří `checksum()`** o jeho citlivá pole: `tribe[].food`, počty členů, `machines[].resource`, vlastnictví regionů, `planet.temperature`, `planet.atmosphere`, `tScore` — a v etapách 3–4 **přes všechna sedadla**, ne jen lokální. Není to úklid na konec, je to součást definice hotového.

### K7 — Opt-in po vítězství je skupinové rozhodnutí, ne lokální

Roadmapa etap (P0, úkol 9) popisuje pokračování do kmenové éry jako volbu hráče po `campaign.won`. Multiplayer §10 rozhoduje, že **přechody mezi etapami jsou skupinové** — hra přejde, až splní všichni.

Lokální volba by v co-opu okamžitě rozešla stavy: jeden klient by pokračoval do etapy 3, druhý zůstal.

**Rozhodnutí:** opt-in je `TickCommand`, ne lokální UI. V jednohráčské hře se chová přesně jak roadmapa popisuje; v co-opu je to skupinové rozhodnutí se stejnou obrazovkou, jakou multiplayerový spec navrhuje pro ostatní přechody.

---

## 2. Co v konfliktu **není**

Pro pořádek, ať se nehledají problémy tam, kde nejsou:

- **Soubory dokumentů.** Žádné se nepřekrývají, merge do `main` proběhl bez konfliktu.
- **Renderování organismů.** `createOrganism` a `animateOrganism` jsou už dnes bezstavové vůči tomu, čí tělo kreslí. Platí to i pro stroje z `Blueprint`, protože sdílejí sestavovací logiku.
- **Editor.** Zobecnění na `Blueprint` (etapy P2) a příkaz `evolve` v tikovém proudu (multiplayer §5.4) jsou nezávislé vrstvy. Editor je lokální UI, potvrzení je příkaz — platí to pro tělo i pro stroj.
- **Transport a WebRTC.** Nové etapy se ho nedotýkají nijak.
- **Kamera.** Multiplayer chce, aby sledovala lokální sedadlo; etapy chtějí režim nad krajinou. Obojí je v `camera.ts` a nejde proti sobě.

---

## 3. Sedadlo v RTS etapách — rozhodnuto

**Otázka:** multiplayer staví na tom, že sedadlo = jedno tělo ve světě: má `Player` s pozicí a genomem, kamera ho sleduje, renderer mu drží organismus. V etapách 3 a 4 žádné jedno tělo není — hráč velí tlupě, pak flotile.

**Rozhodnutí zadavatele: varianta B — každé sedadlo má vlastní kmen a vlastní flotilu ve sdílené krajině.**

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

Sdílené zůstává to, co popisuje **svět**; po sedadlech jde to, co popisuje **linii**. Tohle je důsledek varianty B, který v žádném z původních návrhů není, a je potřeba ho podchytit už ve společném základu — ne až v P2, kdy se archetyp poprvé použije.

### 3.3 Hráčské kmeny jsou trvale spojenecké

Varianta B strukturálně umožňuje, aby hráči napadli jeden druhého. To by popřelo kooperativní zadání, proto **výchozí pravidlo: kmeny a flotily hráčů se navzájem napadnout nemohou.** Soupeření je o zdroje v krajině, ne o válku mezi sedadly. Nepřátelské jsou jen NPC kmeny a invazní druhy.

Pokud by se při hraní ukázalo, že by PvP dávalo smysl, je to samostatné rozhodnutí a samostatná práce — nikoli výchozí chování.

### 3.4 Přechody etap ve variantě B

Multiplayer §10 rozhoduje, že přechody jsou skupinové. S variantou B to znamená, že podmínku postupu musí splnit **kmen každého sedadla zvlášť**, ne skupina dohromady. Obrazovka přechodu ukazuje po sedadlech, komu co chybí — stejný princip, jaký multiplayerový spec navrhuje pro etapy 0–2.

### 3.5 Kamera a co je vidět z cizího hráče

Kamera sleduje v etapách 3–4 **vybranou vlastní jednotku**, ne tělo. Cizí sedadlo je ve světě vidět jako jeho jednotky a stavby s odlišeným nádechem a jmenovkou u chýše — nikoli jako jeden organismus, protože žádný nemá. Renderer tedy v těchto etapách nemapuje sedadlo na organismus, ale **sedadlo na skupinu jednotek**.

### 3.6 Co to zdražuje

Pro pořádek, ať je cena vidět: B byla nejdražší ze tří variant. Násobí stav etap 3–4 počtem hráčů, rozděluje `Campaign`, vyžaduje vlastnictví u jednotek i staveb a rozšiřuje kontrolní součet o řezy všech sedadel. Roadmapa etap s tím ve svém odhadu P1 a P2 nepočítala a je potřeba ji podle toho číst.

## 4. Závazné pořadí prací

```
┌─ SPOLEČNÝ ZÁKLAD ────────────────────────────────┐
│  MP fáze 0   lockstep smyčka nasucho             │
│  MP fáze 1   players[], rozdělení step,          │
│  + etapy P0  Stage 0–5, tři řezy, vstupní mapy   │
│              → JEDNA verze 3, JEDNA migrace      │
└──────────────────┬───────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
   MP fáze 2–5           etapy P1 → P2 → P3
   (BroadcastChannel,    (Kmen, Stroje,
    WebRTC, odolnost)     Terraformace)
        │                     │
        └──────────┬──────────┘
              obojí nezávisle
```

### Proč základ první a proč právě v tomhle pořadí

**Refaktor `players[]` nikdy nebude levnější než dnes.** Je to 83 výskytů ve 13 souborech nad kódem, který se od vydání hry nezměnil. Každá nová etapa přidá další soubory a další sáhnutí na hráče. Multiplayerový spec sám svou fázi 1 popisuje jako *„největší a nejméně zábavná, zabere zhruba tolik co všechny ostatní dohromady"* — a to platí o dnešním rozsahu, ne o rozsahu po třech nových etapách.

**Opačné pořadí se vyplatí jen zdánlivě.** Nové etapy by šly napsat jednohráčsky rychleji, ale pak by se musely celé retrofitovat: tři nové subsystémy převést na `players[]`, všechny rozkazy dodatečně protáhnout tikovým proudem a veškerou novou náhodu a iteraci prověřit na determinismus zpětně. To je dražší než psát je rovnou správně.

**Po základu jsou obě větve nezávislé.** Multiplayer pokračuje k transportu a odolnosti, etapy ke Kmeni. Nesahají si na stejné soubory a můžou běžet souběžně — ideálně ve vlastních `git worktree`, ne přepínáním větví v jednom adresáři.

### Co musí platit na konci společného základu

- `pnpm typecheck && pnpm test && pnpm build` prochází
- **všech 72 existujících testů prochází beze změny**
- jednohráčská hra je **nerozeznatelná od dneška**
- uložená hra verze 2 se načte a dohraje
- verze 3 obsahuje `players[]` **i** tři volitelné řezy a existuje jen jedna migrační cesta
- `checksum()` už zahrnuje řezy, i když jsou zatím prázdné
- `Campaign` je rozdělená na sdílenou a sedadlovou část (§3.2)

---

## 5. Co dělat s původními dokumenty

Nepřepisují se. Zůstávají jako doklad toho, jak se k návrhu došlo, a obsahují měření a odůvodnění, která tenhle dokument neopakuje.

Platí ale, že **při rozporu vyhrává tenhle dokument**, a to konkrétně v těchto bodech:

| Původní dokument | Co přepisuje tenhle |
|---|---|
| multiplayer §5.4 `Command` | → `TickCommand` (K2) |
| multiplayer §6.1 `checksum()` | → rozšířený o řezy stavu (K6) |
| multiplayer §8 verze 3 | → společná verze 3 s řezy (K1) |
| multiplayer §12 fáze 0–1 | → součást společného základu (§4) |
| etapy §5.4 persistence | → společná verze 3 s `players[]` (K1) |
| etapy P0 úkol 9 opt-in | → `TickCommand`, skupinové (K7) |
| etapy P1 `src/game/command.ts` | → `UnitOrder` v `unit-order.ts` (K2) |
| etapy — determinismus | → doplněna pravidla K5 |
| etapy §5.3 řezy stavu | → `tribe[]` a `machines[]` po sedadlech (§3.1) |
| etapy — `Campaign` | → rozdělená na sdílenou a sedadlovou část (§3.2) |
| etapy P1/P2 odhad rozsahu | → podhodnocený, varianta B násobí stav počtem hráčů (§3.6) |
