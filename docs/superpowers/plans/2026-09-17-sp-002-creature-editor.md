# SP-002 — Rozšíření editoru tvora · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hráč sestaví dvounožce, čtyřnožce a dlouhokrkého tvora úpravou páteře, kloubů a funkčních částí, vyzkouší jejich schopnosti a stejná těla ovládá a uloží v krajině.

**Architecture:** Zachovat přesnou větev genomu v1 a přidat diskriminovaný genom v2 pro rozšířená suchozemská těla. Čisté moduly anatomie, schopností a pohybu budou společným podkladem simulace, procedurálního modelu i editoru. Editor pracuje s odděleným návrhem a transakcemi historie; převod v1 → v2 se uskuteční v návrhu při první nové konstrukční úpravě, do kampaně až potvrzením evoluce.

**Tech Stack:** Stávající TypeScript 5.9.2, Three.js 0.180.0, Vite 7.1.5, Vitest 3.2.4 a Playwright 1.55.0; HTML/CSS rozhraní, procedurální grafika a Web Audio. Bez nové runtime závislosti.

**Spec:** [BRIEF.md](../../spore/BRIEF.md), [karta SP-002 a postup plánování](../../spore/ROADMAP.md#sp-002), [přijatý audit, bod 2](../../2026-09-17-spore-similarity-audit.md). Konkrétní limity a rozhraní níže jsou návrhová rozhodnutí tohoto plánu, nikoli již implementované vlastnosti nebo převzaté číselné parametry Spore.

## Global Constraints

- „Tělo, model a schopnosti mají společný zdroj dat.“
- „Dosavadní kampaně musí zůstat načitatelné.“
- „Vizuál, animace, zvuk a čitelnost patří do každého milníku.“
- „Místní knihovna před online funkcemi.“
- Provoz zůstává singleplayerový a lokální, bez povinného backendu, placených služeb a runtime CDN; obsah je vlastní.
- Podle README: Node.js nejméně 22.12, pnpm 11.24.0; používat připnuté závislosti.
- Podle [AGENTS.md](../../../AGENTS.md): kompaktní důkazy, žádný výchozí trace; `LUMAVORA_TRACE=1` jen pro krátkou diagnostiku, `SOAK_TRACE=1` jen pro původní organismový soak. Před dlouhým během zkontrolovat disk. Zachovat fixtures, aktivní save a cizí rozpracovanou práci; případné odstraněné vlastní historické artefakty uvést v manifestu.
- Stav práce vést v trackeru. Hotový plán neznamená hotovou implementaci; kritéria SP-002 se nyní neodškrtávají.

---

## 1. Výchozí stav a rozhodnutí

Průzkum proběhl 17. září 2026 nad `4da58b6` s necommitovanými změnami SP-001. V pracovním stromu již byly upravené `GAME_BRIEF.md`, `PROGRESS.md`, `README.md`, `src/game/obstacle-geometry.ts`, dvě kontaktní/fázové regrese a nové dokumenty/fixtures SP-001. Implementátor musí zachovat tyto změny a vycházet z jejich doloženého výsledku; izolovaná větev ze samotného `4da58b6` by opravu SP-001 neobsahovala.

| Oblast | Zjištění v současném kódu | Důsledek pro plán |
| --- | --- | --- |
| Genom | `Genome.version === 1`; volitelný `spine` má přesně sedm hodnot `width/height/bend`. Validátor kontroluje přesné klíče. | Rozšíření nesmí být nevalidovaná metadata přilepená k modelu. |
| Konstrukce | 21 adaptací, nejvýše 18 záznamů částí; `legs` má pevně vymodelované kyčle, kolena a chodidla. `filter`, `jaw` a `proboscis` mají každý limit 1. | Potřebujeme skutečné kloubové řetězce, koncové části a limity podle verze genomu. |
| Cena | Současná cesta používá `22 + totalDna − genomeCost`; legacy platí `mutationCost + 6` za generaci. | Zachovat obě ekonomiky. Změna verze nesmí přepsat získané DNA ani dorovnávat nedostatečný rozpočet. |
| Historie | `main.ts` sdílí editor organismu a vozidel; historie má 40 položek. `toGenome()` explicitně kopíruje pole. | Nová zanořená pole musí přežít převody, klonování, undo/redo i potvrzení. Vozidla odpojit od dědičnosti `Omit<Genome, ...>`. |
| Pohyb | `locomotion.ts` řeší řízení, suchozemský výkon počítá `physiology.ts`. `beginStep()` na souši nuluje vertikální rychlost a `constrain()` lepí tělo k terénu. | Skok vyžaduje změnu simulace a kolizí, nestačí animace v editoru. |
| Krmení | `functionalProfile()` vybírá jeden původ krmení; `jawContacts()` už vrací více kontaktních objemů. | Více úst musí fungovat jednotlivě; vzdálená sosna nesmí prodloužit kousnutí. |
| Ukládání | Obálky v1–v3 se normalizují na v3. Validují se DNA, aktivní genom i JSON uvnitř checkpointu. | Verzi genomu odlišit od verze celé kampaně; otestovat také obnovu generace a etapy 3–5. |
| Náhled | `idle/move/feed`, voda/souš; model vzniká z téhož genomu, ale animace používají vlastní pevné končetiny. | Rozšířit společné pózování a přidat skutečně podložené akce. |

Zvažované přístupy:

1. **Doporučeno: oddělený genom v2 a společná odvozená anatomie.** Umožní rozšíření a přesnou ochranu historického chování. Nákladem jsou explicitní větve pro v1 a aktualizace převodů.
2. Další volitelná pole v genomu v1 by znamenala méně změn typů, ale hůře by oddělila původní pravidla ceny, pohybu a validace.
3. Úplné nahrazení těla fyzikálním skeletem a plošná migrace všech saveů by rozšířily rozsah na přepis simulace; pro tři cílové stavby to není potřeba.

Referencí pro propojení stavby, povrchu a zkoušení je [oficiální Creature Creator](https://www.spore.com/creatureCreator). Manuál odkazovaný v trackeru zůstává referencí ovládání; při tomto průzkumu jeho úplné načtení přes webový nástroj překročilo limit velikosti. Níže uvedené ovládání a vzorce jsou vlastní návrh LUMAVORY.

## 2. Rozsah a hratelný průchod

Rozdělit SP-002 na tři navazující podúkoly v jednom plánu:

| ID | Dodávka | Úkoly | Co může být samostatně přijato |
| --- | --- | --- | --- |
| SP-002.1 | Model, anatomie, ceny a ukládání | 1–3 | Tři platné reprodukovatelné konstrukce; čistá rozhraní; round-trip a legacy kompatibilita. Nové ovládání zatím nezpřístupňovat. |
| SP-002.2 | Konstrukce v editoru a model | 4–5 | Tři těla vytvořená UI, výběr/tažení kloubů, ruce/chodidla/ústa, povrch, historie a přesná cenová nabídka. |
| SP-002.3 | Pohyb, schopnosti, náhled a přijetí | 6–9 | Stejná těla chodí, skáčou, koušou a komunikují podle výbavy; kompletní ověření SP-002. |

Pořadí realizace: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9**. Jednotlivé úkoly mají vlastní kontrolovatelný výsledek; uživatelsky přístupnou možnost v2 vydat teprve s průchodem úkolu 9. Do té doby ji skrýt za společný dočasný příznak `CREATURE_EDITOR_ENABLED = import.meta.env.DEV`; testy čistých modulů nejsou na příznaku závislé.

Hráč na souši otevře editor u současného hnízda. Přesune obratle, připojí nohy a ruce, upraví kolena/lokty i koncové části a rozmístí ústa. Vidí zrcadlený pár, změnu DNA a vliv na pohyb. Přepne na zkoušku, projde se, skočí a podle výbavy kousne nebo zavolá/zapózuje. Vrátí se ke stavbě, provede undo/redo, potvrdí evoluci a stejným tělem odejde do krajiny. Export/import, refresh/load a obnova generace zachovají konstrukci.

Hranice dodávky:

- Nové konstrukční ovládání se zpřístupňuje v organismové etapě **2, souš**. Mikrosvět a útes nadále používají v1; tím tento plán nepřebírá SP-006 ani nepřestavuje útes. V2 se dědí do etap 3–5, kde editor organismu zůstává zamčený podle současných pravidel.
- Komunikace je ovladatelný hlas/gesto v editoru i krajině. **Vztahy druhů, sociální souboj, odměny, nové hnízdní smyčky a smečka patří do SP-003.** UI nyní neslibuje, že zavolání získá přítele.
- Přidáváme jednu konstrukční rodinu paží a varianty koncových částí, nikoli rozsáhlý katalog ozdob. Další získávání částí patří do SP-004, knihovna a převod všech NPC na genom do SP-005.
- Páteř je jedna spojitá křivka ve středové rovině těla; obratle nelze větvit ani obrátit jejich podélné pořadí. Končetiny jsou nevětvené řetězce. Tyto meze musí jít přečíst v editoru.

## 3. Datová a funkční smlouva

### Genom a souřadnice

Nové typy uložit do `src/game/creature-body.ts`; veřejný `Genome` diskriminovat v `types.ts`. Modul s daty nepoužívá Three.js ani DOM. `LegacyGenome` zachová původní serializaci. `spine?: never` na v2 umožní přechod stávajících čtenářů; nesmí sloužit jako tichý fallback pro nové tělo.

```ts
// creature-body.ts; Vec3 se importuje pouze jako type z types.ts.
export interface CreatureSpineNode {
  id: string;
  axial: number;
  width: number;
  height: number;
  bend: number;
}
export interface LimbJoint { id: string; offset: Vec3; radius: number }
export type LimbEnd =
  | { kind: 'foot'; style: 'pad' | 'claw'; scale: number }
  | { kind: 'hand'; style: 'palm' | 'pincer'; scale: number }
  | { kind: 'none' };
export interface LimbGene { joints: LimbJoint[]; end: LimbEnd }
export interface CreatureBody {
  spine: CreatureSpineNode[];
  skin: { finish: 'smooth' | 'pebbled' | 'plated'; secondaryHue: number;
    contrast: number; patternScale: number };
}

// types.ts: původní Part se doplní o limb?: LimbGene;
// původní AdaptationId se rozšíří o 'arms'. Validace v1 je nadále odmítá.
export interface GenomeFields {
  name: string; length: number; width: number; hue: number; pattern: number;
  parts: Part[];
}
export interface LegacyGenome extends GenomeFields {
  version: 1; spine?: SpineNode[]; body?: never;
}
export interface CreatureGenome extends GenomeFields {
  version: 2; body: CreatureBody; spine?: never;
}
export type Genome = LegacyGenome | CreatureGenome;
```

- Tělo zachovává `+Y` nahoru a `+Z` k hlavě. Páteř má **3–15** obratlů, výchozí počet 7. `axial` prvního/posledního je `−0.9/+0.9`, vnitřní uzly mají mezeru nejméně `0.08`; pořadí je součást validace. `width/height` jsou `0.35–2.0`, `bend` je `−2.5–2.5`. Globální `length/width` mají dosavadní rozsahy `0.65–2.4 / 0.55–1.8`.
- Střed průřezu je `(0, bend * genome.width + 0.13 * axial², axial * 1.76 * genome.length)`. Povrch používá dosavadní radiální profil a hladkou interpolaci mezi sousedy bez překmitu; průřezy zůstávají v rovinách XY. Tím lze vytvořit vysoký krk, aniž by bylo nutné zavést libovolně složenou páteř.
- Úchyty částí jsou nadále `axial/angle`. Neodkazují na index uzlu, takže vložení/smazání obratle nerozbije odkazy. ID slouží výběru a historii; vybraná smazaná položka přejde na nejbližší zbývající uzel.
- Kyčel/rameno je implicitní počátek řetězce. `joints` obsahuje **2–4** další body včetně kotníku/zápěstí; jejich `offset` je absolutní vůči úchytu, před násobením `part.scale`. Délka každé sousední kosti je `0.2–1.5`, součet nejvýše `4.5`, poloměr kloubu `0.06–0.3`. Každá složka offsetu je v `−4.5–4.5`.
- Lokální X míří k pravé straně těla, Y nahoru, Z k hlavě. Levá instance převrací X. U zrcadleného orgánu vznikají dvě instance z jediného záznamu; zachovat `attachmentAngles()` a jeho odsazení od švu. Přepnutí symetrie je jedna editace a cena používá dosavadní faktor **1.6**, fyzicky však vznikají dva údy.
- `limb` je povinné pro v2 `legs/arms`, zakázané pro jiné části i pro v1. `legs` dovolí `foot/none`, `arms` dovolí `hand/none`. Koncové měřítko je `0.55–1.65`. Úplné odstranění končetiny odstraní i klouby a koncovou část v jedné transakci.
- Zachovat celkový limit **18** záznamů částí. V2 dovolí nejvýše 3 záznamy `legs`, 2 `arms` a celkem 3 záznamy úst (`filter/jaw/proboscis`). Zrcadlené instance nejsou další záznam. Zachovat neslučitelnost filtru a čelisti a zbývající limity adaptací. V1 má přesně své dosavadní limity.
- Povrch: `secondaryHue` je `0–360`, `contrast` je `0–1`, `patternScale` je `0.5–2`; výchozí převod použije původní hue, kontrast 0.5 a měřítko 1. U v2 může být více úst, ale bez úst není možné získávat potravu implicitním původem uprostřed těla.
- V2 v etapě 2 vyžaduje plíce a nejméně dvě fyzická chodidla s dosažitelným postojem. Neúplný návrh lze v editoru opravovat; potvrzení a import jej odmítnou s konkrétní příčinou. Zobrazení neúplného návrhu musí být bezpečné, i když nemůže chodit.
- ID odpovídají dosavadnímu regexu a délce 1–64. ID obratlů jsou unikátní v páteři, ID kloubů v příslušné končetině, ID částí v genomu. Import odmítá neznámá pole, neznámé varianty, nečíselné/nekonečné hodnoty, řídká pole a překročené počty; nic potichu neořezává.

### Cena, odvozená anatomie a schopnosti

V1 pokračuje přes původní výpočty beze změny pořadí aritmetiky. Pro v2 zavést samostatné výpočty; neukládat vypočtenou hmotnost, mesh, transformační matice ani seznam schopností.

V2 DNA, před jedním finálním `Math.ceil(total - 1e-8)`:

1. Základ těla: `12*abs(length-1) + 10*abs(width-1)`.
2. Tvar: `3*mean(abs(width-1)+abs(height-1)+abs(bend))` přes 64 rovnoměrných vzorků páteře plus `2*max(0, nodeCount-7)`.
3. Orgány: stávající katalogová cena; nová paže má základ **18 DNA**. Pro každý kloubový segment přičíst `4*(boneLength/0.6)*(radius/0.12)^2`; pro chodidlo/ruku `6*end.scale`. Součet příslušné části násobit `part.scale` a faktorem symetrie.
4. Barvy, vzor a povrch jsou kosmetické, za 0 DNA; „plátovaný“ povrch nenahrazuje funkční krunýř.

U současné cesty dál platí celková alokace `22 + totalDna`. U legacy v2 zachovat princip mutační platby: kladné rozdíly investic částí, poloviční zápočet odebraného, nenegativní cena; přestavba páteře se účtuje ze změn týchž 64 vzorků a celkových rozměrů, plus obvyklých 6 za generaci. Pro porovnání v1/v2 použít explicitně převedenou anatomii původního těla, nikoli přístup `oldSpine[i]` při změně počtu uzlů. Převod může změnit výslednou nabídku; UI ukáže skutečný návrh i cenu, rozpočet nikdy automaticky nezvýší.

Rozhraní, která úkoly níže společně používají:

```ts
// creature-body.ts
export function upgradeCreatureGenome(g: LegacyGenome): CreatureGenome;
export function sampleCreatureSection(g: CreatureGenome, axial: number): SpineNode;
export function validateCreatureStructure(value: unknown): string[];
export function creatureInvestment(g: CreatureGenome): number; // nezaokrouhlený součet

// creature-anatomy.ts
export interface BodyFrame { point: Vec3; normal: Vec3; tangent: Vec3 }
export interface ResolvedLimb {
  partId: string; side: -1 | 1; root: Vec3; points: Vec3[];
  lengths: number[]; radii: number[]; end: LimbEnd;
}
export interface ContactSphere { center: Vec3; radius: number }
export interface CreatureAnatomy {
  limbs: ResolvedLimb[]; hull: ContactSphere[];
  bounds: { min: Vec3; max: Vec3 };
  groundClearance: number; supportCount: number;
  bodyVolume: number; limbMass: number; stanceErrors: string[];
}
export function creatureAttachment(g: CreatureGenome, axial: number, angle: number): BodyFrame;
export function resolveCreatureAnatomy(g: CreatureGenome): CreatureAnatomy;
export function validateCreatureStance(g: CreatureGenome): string[];

// creature-capabilities.ts
export interface CreatureCapabilities {
  walk: { enabled: boolean; speed: number; turnRate: number; acceleration: number;
    steeringGrip: number; stride: number };
  jump: { enabled: boolean; velocity: number; energy: number; recharge: number };
  bite: { enabled: boolean; damage: number; energy: number; duration: number; recharge: number;
    contacts: { mouthOrigin: Vec3; reach: number }[] };
  communicate: { enabled: boolean; mode: 'voice' | 'gesture' | 'none';
    range: number; duration: number; recharge: number };
  reasons: Partial<Record<'walk' | 'jump' | 'bite' | 'communicate', string>>;
}
export function creatureCapabilities(g: CreatureGenome): CreatureCapabilities;
export function queryCreatureBite(
  g: CreatureGenome, position: Vec3, heading: number,
  target: { pos: Vec3; radius: number },
  blocked: (from: Vec3, to: Vec3) => boolean,
): { ready: boolean; distance: number; reason: 'mouth' | 'distance' | 'blocked' | null };
```

Rozdělit závislosti bez cyklu: `adaptation-catalog` drží popisy/ceny a nezná genomové výpočty; `body-profile` drží původní čisté vzorkování a symetrii; `creature-body` zná pouze data, tyto dva pomocné moduly a parametry; `creature-anatomy` používá tělo; `creature-capabilities` používá anatomii a `computeStats`, ale `computeStats` nesmí volat schopnosti. `physiology.locomotionProfile()` použije výsledné schopnosti pro v2. Historické pomocné funkce ve `body-shape.ts` a `anatomy.ts` přesměrují pouze v2 do nové anatomie; jejich v1 větev zůstane přesná. Nové moduly těla nesmějí zpětně importovat tyto historické fasády.

### Ukládání a akce

Obálka a `GameState` zůstávají **v3**: jejich struktura již připouští samostatně verzované subsystémy. Nový formát je explicitně označen `genome.version = 2`; nový stav akcí má vlastní `version = 1`. Starší aplikace nový genom nemusí umět načíst; požadovaná kompatibilita znamená staré savey v nové aplikaci.

```ts
// creature-actions.ts; types.ts jej importuje pouze jako type.
export interface CreatureActionState {
  version: 1;
  jumpRecharge: number;
  communicationRecharge: number;
  communicationTime: number;
  communicationSerial: number;
}
export const emptyCreatureActions = (): CreatureActionState => ({
  version: 1, jumpRecharge: 0, communicationRecharge: 0,
  communicationTime: 0, communicationSerial: 0,
});
// Player: creatureActions?: CreatureActionState
// Input: jump?: boolean; communicate?: boolean
```

- V1 žádné `creatureActions` nemá; v2 je vyžaduje. Přidání proběhne atomicky v `evolve()` při potvrzení první v2 generace a před vytvořením checkpointu. Otevření editoru, výběr ani náhled nic do hráče nepřidají.
- Import v2 vyžaduje správná pole; jejich absence není historický formát. Limity: recharge `0–1.2 / 0–2`, time `0–0.8`, serial celé číslo `0–1_000_000_000`. Při dosažení maxima serial cyklicky vrátit na 0; sleduje se změna, ne globální pořadí.
- Poloha a vertikální rychlost skoku zůstávají v `player.pos/velocity`. Neukládat odvozený `grounded`; po načtení jej určit z kolizní podpory. Uložení uprostřed skoku musí pokračovat bez dalšího odrazu a bez druhého odečtu energie.
- Checkpoint může nést starší v1 generaci než aktivní v2 hráč. Validovat oba podle jejich vlastních verzí; obnova vrátí genom a stav akcí z checkpointu. Nevyžadovat shodu jejich verzí genomu.
- Při přechodu do kmene se akční časovače v2 vynulují, konstrukce se zachová. Původní verze kmenových, strojových a planetárních dat se nemění.

## 4. Soubory a odpovědnosti

| Soubor | Změna / odpovědnost |
| --- | --- |
| `src/game/types.ts`, `src/game/blueprint.ts` | Diskriminované genomy, úplné klonování a převody; samostatný datový typ vozidla. |
| `src/game/adaptation-catalog.ts` — nový | Stávající katalog beze změny hodnot, nová paže a dotaz na povolené části podle verze/etapy; bez závislosti na výpočtech genomu. |
| `src/game/body-profile.ts` — nový | Přesunuté původní `SPINE_COUNT`, `spineAxial`, `spineIndex`, `neutralSpine`, `bodySection` a `attachmentAngles`; beze změny aritmetiky, jen typové importy. |
| `src/game/creature-body.ts` — nový | Datový model, limity, strukturální validace, převod v1, interpolace a investice v2. |
| `src/game/creature-anatomy.ts` — nový | Úchyty, kloubové řetězce, obálka těla, hmotnost a proveditelný postoj. |
| `src/game/genome.ts`, `body-shape.ts`, `anatomy.ts` | Verze katalogu, ceny/statistiky, společné veřejné vstupy v1/v2 a kontakty úst. |
| `src/game/persistence.ts`, `journey-evolution.ts`, `simulation.ts` | Validace aktuálního stavu a checkpointu, potvrzení evoluce, zachování obou ekonomik. |
| `src/game/creature-capabilities.ts` — nový | Odvozené dostupné akce, skutečné hodnoty výkonu a důvody nedostupnosti. |
| `src/game/creature-motion.ts` — nový | Póza, kinematika řetězců, podpora na terénu a kolizní pohyb v2. |
| `src/game/creature-actions.ts` — nový | Akční časovače, skok a komunikace; společný deterministický krok. |
| `src/game/physiology.ts`, `interactions.ts`, `locomotion.ts`, `input-clock.ts` | Zapojení v2 do pohybu, krmení a hran vstupů; původní řízení znovu použít. |
| `src/render/creature-body.ts` — nový | Procedurální v2 povrch, klouby, ruce a chodidla ze sdílené anatomie. |
| `src/render/creature-handles.ts` — nový | Výběr obratlů a kloubů, gizma, převod tažení do lokálních souřadnic. |
| `src/render/organism.ts`, `body-selection.ts`, `renderer.ts`, `settlement.ts`, `audio.ts` | Verze modelu, animace, náhled, kamera, potomci a zvuk komunikace. |
| `src/ui/creature-editor.ts` — nový | Ovládání kostry/částí/povrchu, stav výběru a transakce editace. |
| `src/ui/creature-preview.ts` — nový | Oddělený zkušební stav a ovládání náhledu bez změny kampaně. |
| `src/ui/creature-copy.cs.ts` — nový | České popisky, limity, cenové vysvětlení a chyby nového editoru. |
| `src/main.ts`, `src/ui/styles.css`, `src/ui/copy.cs.ts`, `src/game/errors.cs.ts` | Zapojení hotových modulů, layout, HUD a společné texty. Nové algoritmy nevkládat do monolitických handlerů. |
| `tests/fixtures/creature-bodies.ts` — nový | Tři konstrukce a malé pomocné stavby; není to důkaz získání DNA hraním. |
| `tests/creature-*.test.ts` — nové | Konkrétní testové soubory určují úkoly níže. |
| `scripts/creature-editor-browser.mjs` — nový | Běžné UI, terén, uložení, kompaktní evidence a selhání. |
| `package.json`, `docs/body-editor/README.md`, `docs/spore/SP-002-REPORT.md` | Spouštění kontroly a trvalý popis výsledku včetně omezení. Report vznikne až při realizaci. |

## 5. Implementační úkoly

### Úkol 1 — Verze genomu, konstrukční pravidla a tři testovací těla

**Files:** vytvořit `src/game/creature-body.ts`, `src/game/adaptation-catalog.ts`, `src/game/body-profile.ts`, `tests/fixtures/creature-bodies.ts`, `tests/creature-body.test.ts`; upravit `src/game/types.ts`, `src/game/genome.ts`, `src/game/body-shape.ts`, `src/game/anatomy.ts`, `src/game/blueprint.ts`, `src/game/errors.cs.ts`, `src/main.ts` (pouze doplnění glyphu paže kvůli úplnému `Record`).

**Interfaces:** vstup `LegacyGenome`, stávající katalog a `neutralSpine()`; výstup `CreatureGenome`, `upgradeCreatureGenome()`, `sampleCreatureSection()`, `validateCreatureStructure()` a `creatureBodyFixture(kind: 'biped' | 'quadruped' | 'longneck'): CreatureGenome`.

- [ ] Přidat testy diskriminace v1/v2, úplného hlubokého klonování, neplatných kloubů a nezávislosti vozidla. Základ konkrétního testu:

```ts
it('copies every nested joint through blueprint history', () => {
  const g = creatureBodyFixture('biped');
  const draft = fromGenome(g);
  const undo = cloneBlueprint(draft);
  draft.parts.find(p => p.kind === 'legs')!.limb!.joints[0].offset.y -= 0.1;
  expect(toGenome(undo)).toEqual(g);
  expect(toGenome(draft)).not.toEqual(g);
  expect(validateVehicle(initialVehicle('tank', 'restoration'))).toEqual([]);
});
it('does not upgrade a historical genome just by opening the editor', () => {
  const old = initialGenome();
  expect(toGenome(fromGenome(old))).toEqual(old);
  expect(toGenome(fromGenome(old))).not.toHaveProperty('body');
});
```

- [ ] Spustit `node node_modules/vitest/vitest.mjs run tests/creature-body.test.ts --maxWorkers=1`; očekávat selhání kvůli dosud chybějícímu v2 API.
- [ ] Zavést typy podle smlouvy a zúžit návratový typ `initialGenome()` na `LegacyGenome`. `VehicleBlueprint` definovat explicitně s `version: 1` a původními poli, nikoli přes `Omit<Genome, ...>`. `toGenome()` zachová diskriminant `version`, celé `body` i `limb`, nikdy `kind: 'organism'`.

```ts
export const toGenome = (g: OrganismBlueprint): Genome => {
  const { kind: _kind, ...genome } = g;
  return structuredClone(genome);
};
// cloneGenome musí stejným způsobem oddělit také body.skin a vektory kloubů.
```

- [ ] Vyčlenit původní `ADAPTATIONS` a `getAdaptation()` do `adaptation-catalog.ts`, z `genome.ts` je zpětně exportovat pro stávající čtenáře. `ADAPTATIONS` zůstává původních 21 položek; `CREATURE_ADAPTATIONS` přidá paži. Zavést `adaptationsForGenome(version: 1 | 2, stage: Stage): readonly Adaptation[]` s limity z §3. `getAdaptation('arms')` má cenu 18 a kategorii movement, ale v1 validátor a katalog ji nenabídnou. Přesunout původní čisté funkce uvedené v mapě souborů do `body-profile.ts` a reexportovat je z dosavadních míst; nové moduly je importují přímo, čímž nevznikne cyklus přes `genome.ts` nebo `anatomy.ts`.

- [ ] Implementovat převod pouze jako čistou funkci: sedm původních průřezů nebo `neutralSpine()`, ID `spine-0` až `spine-6`, dosavadní `spineAxial(i)`, zachovaná ID/polohy/velikosti orgánů. U nohou vytvořit dva body `(0.48, −0.34, −0.14)` a `(0.77, −1.14, 0.16)`, poloměry `0.135/0.10`, koncové chodidlo `pad`, scale 1. Převod nevytváří chybějící plíce a nenavyšuje DNA.
- [ ] Implementovat strukturální validaci z §3 v omezených smyčkách. `validateGenome(v2, stage)` nejprve kontroluje strukturu a dostupnost etapy, teprve později volá dražší anatomické kontroly. Při `stage < 2` v2 odmítnout; persistence nadále předává `worldStageFor(stage)` pro pozdější etapy. V editoru nepoužívat náhledové médium jako skutečnou odemykací etapu.
- [ ] Připravit tři kopírované fixture konstrukce s `length = width = 1`, `hue = 168`, `pattern = 0`, hladkým povrchem, plícemi, jedněmi ústy a jednou nebo dvěma zrcadlenými páry nohou. Pro dvounožce použít jednu dvojici u `axial=-0.2`, pro čtyřnožce dvojice u `−0.45/+0.4`. Dlouhokrký vychází ze čtyřnožce; poslední tři obratle mají `(width,height,bend)` postupně `(0.65,0.65,0.65)`, `(0.4,0.45,1.4)`, `(0.65,0.65,2.1)`. Jeho ústa připojit na `axial=0.9`, přední nohy pod trup na `axial=0.05`. Dvounožci připojit pár paží u `axial=0.45`, s koncovou dlaní a kratšími kostmi; tato konstrukce je základ testu gest. Upravit postoj fixtures jen na základě testu dosažitelnosti v úkolu 2, ne obejitím validace.
- [ ] Ověřit také duplicity ID, obrácené/kolabované obratle, nultou a příliš dlouhou kost, nekompatibilní koncovou část, čtvrtá ústa, 19. část, neznámou vlastnost uvnitř offsetu a číselný overflow. Přidat/remapovat pouze nové v2 testy; stávající charakterizace v1 ponechat.
- [ ] Spustit nový soubor spolu s `tests/genome.test.ts`, `tests/body-shape.test.ts`, `tests/blueprint.test.ts` a typecheck. Samostatný commit: `feat: define articulated creature genomes`.

### Úkol 2 — Jedna anatomie pro povrch, cenu, postoj a kontakty

**Files:** vytvořit `src/game/creature-anatomy.ts`, `tests/creature-anatomy.test.ts`, `tests/creature-cost.test.ts`; upravit `src/game/creature-body.ts`, `src/game/genome.ts`, `src/game/body-shape.ts`, `src/game/anatomy.ts`, `src/game/journey-evolution.ts`.

**Interfaces:** spotřebovává v2 z úkolu 1; poskytuje všechna rozhraní anatomie z §3, funkční `genomeCost/computeStats/validateGenome` pro obě verze a rozšířený `jawContacts(genome)`.

- [ ] Napsat testy souměrnosti, dosahu a nezávislé ceny. Přidat k fixture čelist výměnou za filtr; nepoužívat nepovolenou kombinaci.

```ts
it('keeps the real paired feet separate while billing one paired record', () => {
  const g = creatureBodyFixture('biped');
  const a = resolveCreatureAnatomy(g);
  const feet = a.limbs.filter(l => l.end.kind === 'foot');
  expect(feet).toHaveLength(2);
  expect(feet[0].points.at(-1)!.x).toBeCloseTo(-feet[1].points.at(-1)!.x, 8);
  expect(a.stanceErrors).toEqual([]);
  expect(a.supportCount).toBe(2);
});
it('charges larger limb tissue without changing learned DNA', () => {
  const g = creatureBodyFixture('biped'), larger = structuredClone(g);
  larger.parts.find(p => p.kind === 'legs')!.limb!.joints[0].radius += 0.05;
  expect(genomeCost(larger)).toBeGreaterThan(genomeCost(g));
  expect(computeStats(larger).mass).toBeGreaterThan(computeStats(g).mass);
});
```

- [ ] Spustit oba nové soubory; očekávat chybějící anatomii/výpočty. Implementovat interpolaci: vyhledat sousední `axial`, `t=(a-left)/(right-left)`, `blend=t*t*(3-2*t)` a stejným blendem interpolovat width/height/bend. Na koncích držet koncový průřez.
- [ ] Implementovat `creatureAttachment()` z analytické plochy. Tečnu a normálu odvodit z derivací/symetrických vzorků v osovém a úhlovém směru s pevnou epsilon `0.001`; normalizovat a určit směr ven. Výsledek musí odpovídat vrcholům renderu, nikoli neohnuté elipse. Oči, ústa a zbývajících 21 orgánů používají stejný nový úchyt.
- [ ] Sestavit řetězce z lokálních bodů; aplikovat scale a zrcadlení jednou. Tkáň končetin počítat z délek a průřezů kostí, se stejnou normalizací jako DNA: hmotnost každé kosti `0.08*(length/0.6)*(radius/0.12)^2`, konce `0.05*end.scale`, násobené scale a faktorem symetrie. Trup odvodit z integrálu 64 průřezů a normalizovat neutrální tělo na objem 1. V1 výpočet objemu a hmotnosti zůstává nedotčený.
- [ ] Vyčíslit neutrální postoj: počáteční výška je maximum dolní obálky trupu a mediánu záporných Y chodidel. Pro každou nohu určit interval dosažitelné vzdálenosti kořen–chodidlo z délek kostí (`max(0, 2*maxBone-sum)` až `sum`) a požadovaného XZ došlapu. Najít společný dosažitelný interval výšky všech podporujících nohou. Pokud průnik neexistuje nebo podpory jsou méně než dvě, vrátit `stanceErrors`, ne natahovat kosti. Chyba pojmenuje nohu a nabídne prodloužení/přesunutí úchytu. Strukturálně platný, ale nechodící draft lze dál vykreslit v klidu.
- [ ] Implementovat cenu podle §3 a ruční očekávaný součet alespoň pro jednu obyčejnou nohu a její zrcadlený pár. Ověřit jeden finální round, kosmetiku zdarma, přesný rozpočet a překročení o 1 DNA, opakované odebrání/přidání bez výdělku a legacy `+6`. Náhledová změna ceny nikdy nezapisuje do hráče.
- [ ] V `jawContacts()` pro v2 vytvořit kontakt pro každou skutečnou čelist z nového úchytu; dosavadní posun `0.41*scale` orientovat podle lokálního dopředného rámce. V2 krmení má seznam úst podle jejich diety; zvolit konkrétní dosažitelná ústa, neslučovat jejich původy průměrem. V1 `functionalProfile()` a jeho dosah zachovat.
- [ ] Spustit nové testy, `tests/jaw-attachment.test.ts`, `tests/bite-contact.test.ts`, `tests/journey-evolution.test.ts`, `tests/anatomy.test.ts`, `tests/body-shape.test.ts` a typecheck. Commit: `feat: derive creature anatomy and construction costs`.

### Úkol 3 — Potvrzení generace a kompatibilita uložených her

**Files:** vytvořit `src/game/creature-actions.ts` s typem a inicializací z §3, `tests/creature-persistence.test.ts`; upravit `src/game/types.ts`, `src/game/persistence.ts`, `src/game/simulation.ts`, `src/game/blueprint.ts`.

**Interfaces:** spotřebovává validovaný genom/ceny z úkolu 2; zachovává `parseGame(text): GameState`, `serializeGame(state): string`, `evolve(state, draft)` a `recoverGeneration(state)`; přidává `emptyCreatureActions()`.

- [ ] Napsat test načtení všech souborů z manifestu. Hash a velikost kontrolovat nad původními bajty, při dalším round-tripu porovnávat normalizovaný stav bez `savedAt`. Součást testu:

```ts
for (const entry of manifest.files) {
  it(`preserves historical construction: ${entry.file}`, () => {
    const bytes = readFileSync(`tests/fixtures/saves/${entry.file}`);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    const loaded = parseGame(bytes.toString());
    const again = parseGame(serializeGame(loaded));
    expect(again).toEqual(loaded);
    expect(again.player.genome.version).toBe(1);
    expect(again.player).not.toHaveProperty('creatureActions');
  });
}
```

- [ ] Doplnit připravený stage-2 test pro každé tělo: načíst `won-current-coast.fixture.json`, u hnízda nastavit pouze v testu dostatek naučených DNA, dopočítat platnou aktuální alokaci a zavolat běžné `evolve()`. Po save/load a `recoverGeneration()` porovnat kompletní genom, DNA, generaci a akční stav. Výslovně označit setup jako připravený test, nikoli odehranou progresi.
- [ ] Spustit `tests/creature-persistence.test.ts`; nové v2 případy musí před implementací selhat. Upravit validaci `player` a checkpointu takto:

```ts
// Až po validaci p.genome; basePlayerKeys obsahuje přesný dosavadní seznam.
const requiredKeys = genome.version === 2
  ? [...basePlayerKeys, 'creatureActions']
  : basePlayerKeys;
// object(player, 'player', requiredKeys) stále odmítá neznámé klíče.
// V2 actions ověřit podle §3; při importu je nedoplňovat výchozí hodnotou.
```

- [ ] V `evolve()` provést všechny kontroly před mutací: platná struktura a postoj, rozpočet, dostupnost u hnízda, zachování obsazené symbiózy a podmínky souše. Pak najednou změnit DNA/genom, přidat/resetovat `creatureActions` pro v2, nastavit výšku/rychlost do nového postoje a vytvořit checkpoint. Odmítnutí musí ponechat celý stav byte-identický.
- [ ] Rozšířit sadu známých ID v `lineage.parts` o paže z nového katalogu, při zachování limitu 18; jinak by save po první takové generaci odmítl vlastní historii. Ověřit vnořenou chybnou končetinu, chybějící/rozbitý akční stav, špatnou bilanci DNA, neznámou verzi, nadlimitní soubor a v2 aktivní tělo s v1 checkpointem. Nesmí se odstranit starý slot ani přepsat platná hra při chybném importu. Přidat pokračování v2 genomu do kmene a round-trip ve strojích i planetě; jejich datové verze a vozidla se nemění.
- [ ] Spustit nový soubor a `tests/persistence.test.ts`, `tests/era-persistence.test.ts`, `tests/tribe-persistence.test.ts`, `tests/machine-persistence.test.ts`, `tests/planet-persistence.test.ts`, `tests/reef-evolution-persistence.test.ts`. Commit: `feat: persist articulated creatures and preserve legacy saves`.

### Úkol 4 — Procedurální model, klouby a póza

**Files:** vytvořit `src/render/creature-body.ts`, `src/game/creature-motion.ts`, `tests/creature-presentation.test.ts`, `tests/creature-pose.test.ts`; upravit `src/render/organism.ts`, `src/render/renderer.ts`, `src/render/settlement.ts`.

**Interfaces:** používá `CreatureAnatomy`; renderovací modul poskytuje `createCreatureSurface(g: CreatureGenome): THREE.BufferGeometry` a `createCreatureLimb(limb: ResolvedLimb, materials: { skin: THREE.Material; detail: THREE.Material; sole: THREE.Material }): THREE.Group`. Koordinátorem celého modelu zůstává `createOrganism()`. Herní modul poskytuje `solveLimbPose(limb: ResolvedLimb, target: Vec3): Vec3[]` a `sampleCreaturePose(g: CreatureGenome, input: CreaturePoseInput): CreaturePose`.

```ts
export interface CreaturePoseInput {
  time: number; speed: number; airborne: boolean; feeding: number;
  communication: number; position: Vec3; heading: number;
  groundAt: (x: number, z: number) => number;
}
export interface CreaturePose {
  limbs: { partId: string; side: -1 | 1; points: Vec3[] }[];
  bodyOffset: Vec3; mouthOpen: number; gesture: number;
}
```

- [ ] Napsat test tří siluet v jednotném měřítku, skutečného počtu chodidel, uchycení orgánů a délky kostí. Konkrétní invariant solveru:

```ts
it('moves a foot without stretching its bones', () => {
  const limb = resolveCreatureAnatomy(creatureBodyFixture('biped')).limbs[0];
  const target = { ...limb.points.at(-1)!, z: limb.points.at(-1)!.z + 0.08 };
  const points = solveLimbPose(limb, target);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    expect(Math.hypot(b.x-a.x, b.y-a.y, b.z-a.z)).toBeCloseTo(limb.lengths[i-1], 5);
  }
});
```

- [ ] Spustit oba nové testy. Vytvořit mesh ze stejné vzorkované plochy jako anatomie, s UV `u=angle/(2π)`, `v=(axial+1)/2`. V2 má explicitní ústa podle částí; nevytvářet navíc historická implicitní ústa z `addBody()`. Zachovat čitelný obličej a oči přiléhající k aktuálnímu povrchu.
- [ ] Končetiny renderovat jako skupiny kostí/kloubů podle analytických bodů, s modelovanou ploskou/dlaní/prsty nebo klepetem. Přepnutí varianty mění siluetu konce, ne celý genom. Povrch používat procedurálně podle `skin`, dosavadního hue/pattern a UV; nepřidávat soubory textur ani nové materiály každý frame.
- [ ] Pro řetězce zavést FABRIK s pevným maximem **8 iterací**, tolerancí **0.001**, zachovanými délkami a deterministickým výchozím směrem z klidového řetězce. Nedosažitelný cíl clampovat na dosah; neprotahovat mesh. Dvounožec střídá strany, čtyřnožec diagonály podle podélné polohy úchytu; paže kopírují gesto a protipohyb.
- [ ] `sampleCreaturePose()` vrací klouby v lokálním prostoru tvora. Terén dotazuje po převodu do světa; ve fázi opory drží plosku na zemi, švih ji zvedá. Během letu nohy skládá. Pohyb trupu nesmí následně znovu posunout už opravené chodidlo pod terén. Zobrazení neplatného postoje používá klidový řetězec a čitelné zvýraznění příčiny.
- [ ] `createOrganism()` větvit podle verze a předat materiály do nových geometrických funkcí; `creature-body.ts` v renderu neimportuje zpět `organism.ts`. Stávající `createPart()` pro v2 používá `creatureAttachment()`, pro nohy/paže nový řetězec; již přepočtené body končetin znovu nenásobí scale. `animateOrganism()` pro v2 deleguje do nové pózy; pro v1 včetně NPC zachová současnou implementaci. Kmenoví potomci vytvoření z hráčova genomu používají stejný v2 model a postoj. Kamera editoru, portrét a radius zakrývání ve scéně vycházejí z `anatomy.bounds`, aby se dlouhý krk neořízl.
- [ ] Testovat plochý terén a svah, konečné hodnoty ve všech vrcholech, plosky v opoře nejvýše 0.03 m nad/pod cílem, stejné délky kostí a uvolnění GPU prostředků při výměně modelu. Vizuálně zkontrolovat všechny tři stavby; numerické bounds samy nedokládají rozpoznatelnost. Spustit také `tests/presentation.test.ts`, `tests/ceiling-pose.test.ts`, `tests/anatomy.test.ts`. Commit: `feat: render articulated creature bodies and poses`.

### Úkol 5 — Přímá konstrukce, symetrie a transakce historie

**Files:** vytvořit `src/ui/creature-editor.ts`, `src/ui/creature-copy.cs.ts`, `src/render/creature-handles.ts`, `tests/creature-editor.test.ts`; upravit `src/main.ts`, `src/render/renderer.ts`, `src/render/body-selection.ts`, `src/ui/styles.css`.

**Interfaces:** používá v2 model, cenovou nabídku a validaci; poskytuje výběr a návrhové transakce. Samotné vykreslení panelu nemění data.

```ts
export type CreatureSelection =
  | { kind: 'spine'; nodeId: string }
  | { kind: 'part'; partId: string }
  | { kind: 'joint'; partId: string; jointId: string }
  | { kind: 'end'; partId: string };
export interface CreatureEditState {
  draft: Genome; selection: CreatureSelection | null;
  undo: Genome[]; redo: Genome[];
  before: Genome | null;
}
export function beginCreatureEdit(s: CreatureEditState): void;
export function finishCreatureEdit(s: CreatureEditState, cancel?: boolean): void;
```

- [ ] Napsat test jedné editace pro celé tažení, žádné editace pro výběr a návratu po cancel:

```ts
it('cancels a joint drag without consuming redo or changing the draft', () => {
  const g = creatureBodyFixture('biped');
  const s: CreatureEditState = { draft: structuredClone(g), selection: null,
    undo: [], redo: [structuredClone(g)], before: null };
  beginCreatureEdit(s);
  s.draft.parts.find(p => p.kind === 'legs')!.limb!.joints[0].offset.y -= 0.1;
  finishCreatureEdit(s, true);
  expect(s.draft).toEqual(g);
  expect(s.undo).toHaveLength(0);
  expect(s.redo).toHaveLength(1);
});
```

- [ ] Spustit test a implementovat transakce. Snapshot vytvořit při zahájení, ale historii změnit až po skutečné změně a dokončení; redo vymazat až při commitu transakce. Cancel obnoví `before`. Limit je 40 položek. Undo/redo zavírá rozpracovanou transakci a vždy nahradí celý draft novým objektem, aby nezůstal starý záznam v `WeakMap` cache statistik.
- [ ] Historie organismu vlastní jediný `CreatureEditState` pro obě verze genomu; stávající organismové handlery do něj delegují, vozidlo si ponechá svou větev. Převod a první kosterní změna jsou jedna transakce se snapshotem v1: undo vrátí přesný v1 genom a jeho původní ovládání, redo kompletní v2. Neprovozovat zároveň druhý zásobník organismových `Blueprint` snapshotů. Přidat na tuto hranici samostatný test i browser krok.
- [ ] Mutable draft během tažení neposílat do runtime `WeakMap` cache. Anatomii/schopnosti editoru přepočítat při změně hodnot maximálně jednou za RAF; model invalidovat podle obsahu/revize návrhu. Po potvrzení `evolve()` instaluje nový oddělený genom, který simulace již během generace nemění. Tím se odstraní riziko zastaralých údajů i před ukončením drag transakce.
- [ ] Doplnit tři panely **Tělo / Části / Povrch** a přepnutí **Stavba / Zkouška**. Tělo ukazuje páteř, čísla a jednu aktivní oblast; Části obsahují nohy, paže, ústa a stávající orgány. Ovládání nerozmístit do dalších trvale otevřených velkých panelů. Cena, potvrzení a undo/redo jsou stále viditelné při 1280×720.
- [ ] Základní stávající editace v1 zůstává dostupná. Ve skutečné etapě 2 nabídnout „Upravit kostru“; při první konstrukční změně vytvořit v2 draft. Zrušení editoru vrací původní v1 hru beze změny. Nejprve dokončit pending posuvník, teprve pak měnit panel/model/výběr.
- [ ] Výběr prioritizovat: viditelné kloubové madlo → orgán → povrch. Obratle a klouby označit textem, obrysem a madlem; barva nesmí být jediný signál. Pravé tažení orbituje, kolečko zoomuje. Levé tažení madla používá na pointerdown uloženou rovinu a lokální rámec; pohyb kamery nesmí otočit význam os. Číselné ovladače/posuvníky jsou rovnocennou cestou ke všem úpravám, v krocích 0.05 pro rozměry a souřadnice.
- [ ] Obratle lze vložit do mezery na interpolovanou polohu a odebrat mimo krajní uzly při zachování nejméně tří. Nová stabilní ID vytvořit ze sériového čítače editoru mimo historii, s kontrolou kolize; nepoužívat simulační RNG. Řetězec lze rozdělit vložením kloubu, pokud délky splní minimum, a vnitřní kloub odstranit, pokud spojená kost nepřekročí maximum. Paže/nohy mají viditelné koncové sloty pro ruku/chodidlo; nepovolené připojení vysvětlit v místě slotu.
- [ ] Symetrii aplikovat na jediný zdrojový řetězec, zvýraznit obě instance a uvést cenu páru. Zrcadlení končetiny nesmí zdvojit záznam parts ani sériové ID. Tři ústa lze umístit a měnit jednotlivě; katalog hlídá celkový i druhový limit.
- [ ] Ošetřit `pointerup`, `pointercancel`, `lostpointercapture`, blur, změnu panelu, Escape a klik mimo tělo. `pointercancel/lostpointercapture` během aktivního gesta vrací rozpracovanou editaci; běžné ukončení nesmí transakci provést dvakrát. Pod limitem/budžetem zůstává potvrzení dostupné, jinak ukazuje konkrétní chybu. Hodnoty z importu neopravuje UI clampingem.
- [ ] Ověřit novým testem historii, limity a snapshoty. Browserem provést jednu skutečnou konstrukci a klávesové ovládání madla/posuvníků. Ověřit původní `test:body-editor`, `test:editor` a `test:machine-editor` v samostatných výstupech. Commit: `feat: edit creature spines limbs and terminal parts`.

### Úkol 6 — Výkon a dostupnost schopností ze skutečné konstrukce

**Files:** vytvořit `src/game/creature-capabilities.ts`, `tests/creature-capabilities.test.ts`; upravit `src/game/physiology.ts`, `src/game/interactions.ts`, `src/game/genome.ts`, `src/ui/creature-editor.ts`, `src/ui/creature-copy.cs.ts`.

**Interfaces:** spotřebovává anatomii a `computeStats`; poskytuje `CreatureCapabilities` z §3 a v2 větev `locomotionProfile()`. Schopnosti přijímají genom, nikoli DOM nebo aktuální výběr části.

- [ ] Napsat testy, že paže nevytvářejí chůzi, dvě dosažitelná chodidla ano, změna délky nohou mění krok a vyšší hmotnost snižuje výkon. Odstranění čelisti vypne útok, posunutí čelisti změní skutečné místo kontaktu, přidání sosny neprodlouží kousnutí.

```ts
it('uses the same walking values in physiology and the editor', () => {
  const g = creatureBodyFixture('quadruped');
  const c = creatureCapabilities(g);
  const p = locomotionProfile(g, 2, false);
  expect(p.speed).toBe(c.walk.speed);
  expect(p.turnRate).toBe(c.walk.turnRate);
  expect(c.walk.enabled).toBe(true);
  expect(c.jump.enabled).toBe(true);
});
```

- [ ] Spustit nový soubor a implementovat v2 parametry. Pro chodidla použít efektivní sílu z měřítka a symetrie (pár 1.6), klesající přírůstek `drive = (1-exp(-0.65*strength))/(1-exp(-0.65*1.6))`. `stride = clamp(meanLegLength/1.16, 0.55, 1.8)`, `load = 1+max(0,mass-1.2)*0.15`. Rychlost `clamp((3+2.15*drive)*sqrt(stride)/load, 1.6, 6.8)`, nula při neplatném postoji. Zatáčení a akceleraci převzít z dosavadního suchozemského vzorce s novou silou/postojem. Drápové chodidlo násobí grip 1.1; polštářkové násobí skokovou rychlost 1.05. Příslušný bonus vážit podílem chodidel, nepřičítat jednou za každý renderovaný prst.
- [ ] Skok má `velocity = clamp((3.8+1.2*drive)*sqrt(stride)/sqrt(load), 3, 7)` před bonusem chodidla, energii 5, recharge 1.2 s a gravitaci 16 m/s². Panel ukazuje výšku `velocity²/(2*16)` a podmínku opory. Nedostatek energie/let je momentální důvod, absence chodidel konstrukční důvod.
- [ ] Útok je existující kousnutí: jedna akce a jeden zásah vybraného cíle, i když jej protíná více čelistí. Kontakty pocházejí z `jawContacts()`, poškození z téhož v2 `computeStats()`; `bite.energy/duration/recharge` jsou **1.6 / 0.5 / 0.65** podle současného útoku. U dodatečných úst používat klesající přírůstek organOutput pro výkon; první běžná čelist je reference. `queryCreatureBite()` otočí každý kontakt do světa, přidá poloměr kořisti, ověří vzdálenost a zakrytí a vybere nejlepší dostupný kontakt. Použijí jej v2 `feedTarget()` i zkušební cíl. Při třech ústech nesmí vzniknout tři volání poškození v jednom vstupu. Potravu v2 analogicky hledat od jednotlivých úst s příslušnou dietou; bez úst vrátit důvod nedostupnosti.
- [ ] Komunikace je hlas s libovolnými ústy, jinak gesto s alespoň jednou rukou. Hlas: dosah `6 + 2*min(2, mouthStrength)`; gesto: 3 m. Doba 0.8 s, recharge 2 s, bez DNA odměn. Ruce řídí velikost viditelného gesta; dlaň otevřenou pózu a klepeto sevření. Hodnotu dosahu zobrazit jako dosah signálu, ne účinek na vztah druhu.
- [ ] Napojit panel schopností: Chůze / Skok / Kousnutí / Hlas nebo Gesto; zobrazit skutečnou hodnotu, změnu proti původnímu tělu a důvod nedostupnosti. V1 zachová původní výkon; nové údaje a náhledy nenabízet jako funkční, pokud pro danou verzi nejsou provedené ve hře.
- [ ] Spustit nový test, `tests/physiology.test.ts`, `tests/locomotion.test.ts`, `tests/bite-contact.test.ts`, `tests/target-selection.test.ts` a typecheck. Commit: `feat: derive creature abilities from body construction`.

### Úkol 7 — Chůze, skok a komunikace v krajině

**Files:** rozšířit `src/game/creature-actions.ts`, `src/game/creature-motion.ts`; vytvořit `tests/creature-actions.test.ts`, `tests/creature-terrain.test.ts`; upravit `src/game/simulation.ts`, `src/game/input-clock.ts`, `src/main.ts`, `src/render/renderer.ts`, `src/ui/copy.cs.ts`. V `src/game/obstacle-geometry.ts` lze vyčlenit/exportovat sdílený kontakt a normálu pro více koulí; nevracet zpět opravu SP-001 ani měnit aritmetiku v1 cesty.

**Interfaces:** spotřebovává schopnosti a anatomii; poskytuje společný krok použitelný také v náhledu:

```ts
export interface CreatureRuntime {
  pos: Vec3; velocity: Vec3; heading: number; energy: number;
  actions: CreatureActionState;
}
export interface CreatureCommand {
  x: number; z: number; sprint: boolean; jump: boolean; communicate: boolean;
}
export interface CreatureStepEnvironment {
  groundAt: (x: number, z: number) => number;
  obstacles: World['obstacles']; bound: number;
}
export function advanceCreature(
  g: CreatureGenome, runtime: CreatureRuntime, input: CreatureCommand,
  environment: CreatureStepEnvironment, dt: number,
): CreatureRuntime; // vrací nový stav, nevlastní svět ani simulační RNG
```

- [ ] Napsat test jednorázového odrazu, průchodu vrcholem a dopadu, zachování energie při zamítnutém odrazu a nemožnosti druhého skoku ve vzduchu. Uprostřed skoku uložit/nahrát celý připravený stav a porovnat dalších 120 ticků se stejnými vstupy s nepřerušenou větví. Obdobně zachovat zbývající komunikaci a cooldown bez opakovaného spuštění zvuku.
- [ ] Spustit nové testy. `advanceCreature()` používá dosavadní `advanceLocomotion()`, nové schopnosti a jeden pevný krok nejvýše 0.05 s. Nejprve snížit časovače, vyhodnotit podporu a hranu požadavku na skok, pak integrovat vertikální rychlost a řešit kolize. Pro odraz musí současně platit validní nohy, podpora, 5 energie a nulový recharge.

```ts
// Jádro odrazu; grounded se odvozuje od podpory těla a nulové/klesající rychlosti.
if (input.jump && grounded && caps.jump.enabled && actions.jumpRecharge === 0
    && energy >= caps.jump.energy) {
  velocity.y = caps.jump.velocity;
  energy -= caps.jump.energy;
  actions.jumpRecharge = caps.jump.recharge;
}
// Vzdušná větev: velocity.y -= 16 * dt; potom integrace a kolizní korekce.
```

- [ ] V2 na souši neprochází dosavadním vynulováním `velocity.y` ani přilepením v `constrain()`. Tělo má konzervativní soubor kontaktních koulí podél páteře; obálka zahrne celou délku a výšku trupu. Změnu posunu i heading rozdělit na podkroky nejvýše 0.1 m/0.05 rad, aby se dlouhé tělo při otočení neprotáhlo překážkou. Pro každou kouli znovu použít princip konečných válců a tečného skluzu z `obstacle-geometry.ts`; výsledná oprava je společný posun těla, nikoli nezávislé přemístění obratlů.
- [ ] Zasazení/vysazení z podpory řešit vůči nejvyšší průchozí ploše pod oporami, včetně horní plochy konečné překážky. Při nárazu vzhůru vynulovat kladnou vertikální rychlost; při dopadu zápornou. Hranice světa platí pro obálku těla. Dlouhý krk nesmí projít stropem a rotace na místě nesmí zasunout trup do skály. Končetiny pózují kinematicky; v této dodávce nejsou samostatnými tvrdými kolidery.
- [ ] `simulation.beginStep()` zkopíruje výsledek v2 kroku do hráče a dále provede současnou fyziologii/ekologii. Energie za sprint nebo pohyb se účtuje pouze na dosavadním místě; nový krok odečítá jen energii skoku. Krmení se pro v2 řídí skutečnými ústy i u legacy kampaně; v1 legacy zůstává na své historické větvi.
- [ ] Přidat **Q = skok** a **V = hlas/gesto** jen pro v2 na souši, v HUD také klikací tlačítka. Q/C ve vodě zachovat pro vertikální plavání, Space pro krmení/kousnutí a R pro současnou symbiózu. `InputLatch` zachytí hrany nových akcí; držení Q/V neopakuje akci. Blur, pause, editor a změna etapy latch vyčistí. Souběžné feed/pulse mají dosavadní pořadí; komunikace nemění jejich cooldown.
- [ ] Ověřit rovinu, svah, stěnu, roh, konečný strop, otočení dlouhého těla, dopad na zem/překážku a vstup do kmene. Testovat všechny tři fixture konstrukce, nikoli pouze neutrální tělo. Při nesplnitelném postoji potvrzení nepovolí tělo do světa.
- [ ] Spustit nové testy, `tests/input-clock.test.ts`, `tests/obstacle-contact-regression.test.ts`, `tests/step-phases.test.ts`, `tests/finite-obstacles.test.ts`, `tests/land-crossing.test.ts`, `tests/tribe-era-entry.test.ts` a typecheck. V1 otisky se nemají měnit; případnou odchylku diagnostikovat, neregenerovat reference. Commit: `feat: drive articulated creatures through terrain`.

### Úkol 8 — Izolovaná zkouška a společná vizuální/zvuková odezva

**Files:** vytvořit `src/ui/creature-preview.ts`, `tests/creature-preview.test.ts`; upravit `src/render/renderer.ts`, `src/render/organism.ts`, `src/render/audio.ts`, `src/ui/creature-editor.ts`, `src/ui/creature-copy.cs.ts`, `src/main.ts`.

**Interfaces:** spotřebovává `advanceCreature`, `creatureCapabilities`, `queryCreatureBite`, `sampleCreaturePose`; poskytuje následující samostatný stav a funkce. Náhled neobsahuje referenci na `GameState`.

```ts
export interface CreaturePreview {
  genome: CreatureGenome; runtime: CreatureRuntime;
  time: number; feeding: number; interactionRecharge: number;
}
export interface CreaturePreviewCommand extends CreatureCommand { attack: boolean }
export function createCreaturePreview(g: CreatureGenome): CreaturePreview;
export function stepCreaturePreview(
  preview: CreaturePreview, command: CreaturePreviewCommand, dt: number,
): CreaturePreview;
```

- [ ] Napsat test shodných prvních 180 kroků chůze/skoku na rovném terénu mezi preview a `advanceCreature()` v podmínkách hry. Porovnávat polohu, rychlost, časovače, energii a klouby, ne pixely. Dále porovnat snapshot kampaně/DNA/checkpointu/RNG před a po zkoušce.
- [ ] Spustit nový soubor. Náhled začíná na rovné podlaze ve výšce `groundClearance`, s nulovou rychlostí, energií 100 a prázdnými akčními časovači. Má neutrální světlo a cíl pro dosah úst; animace používá stejnou anatomii a pózu jako krajina. `walk` zadává pohyb společnému kroku, `jump/communicate` skutečnou jednorázovou akci. Při změně genomu resetovat pouze náhled, při pouhém výběru části jej zachovat.
- [ ] Přidat ovladače **Klid / Chůze / Skok / Kousnutí / Hlas nebo Gesto**. Kousnutí využívá stejné kontakty, poškození a délku krmné animace jako hra; cíl ukáže zásah jen při dosažitelném kontaktu. Nedostupná akce má viditelný důvod. Zkouška nesmí vizuálně předvádět skok chybějících chodidel ani útok filtrem.
- [ ] Ovládání oddělit od modelu vozidla a starého v1 `idle/move/feed`. V2 dočasně vypne stavební madla během pohybu; přepnutí zpět drží draft, výběr a historii. Zaměření modelu používá společné bounds včetně krku a konců nohou.
- [ ] Komunikace ve světě i náhledu používá jeden zvukový předpis podle genomu: tvar tónu podle úst, výška podle objemu těla, intenzita podle síly hlasu. Spustit jednou při změně `communicationSerial`; načtení stavu bere aktuální serial jako už viděný. Gesto bez hlasového orgánu zvuk hlasu nespouští. Zachovat mute, hlasitost a reduced motion; žádný nový náhodný zásah do RNG kampaně.
- [ ] Ověřit freeze při pause/hidden, opuštění editoru, 20 přepnutí genomu bez rostoucího počtu mesh/materialů a stale cache po undo. Prohlédnout finální siluety, detail úchytů, plosky a povrch; tato část pokrývá příslušné SP-017. Commit: `feat: preview creature abilities with shared simulation`.

### Úkol 9 — UI průchod, finální regrese a dokumentace

**Files:** vytvořit `scripts/creature-editor-browser.mjs`, `docs/spore/SP-002-REPORT.md`; upravit `package.json`, `docs/body-editor/README.md`, `README.md`, `docs/spore/ROADMAP.md`. Nový skript: `"test:creature-editor": "node scripts/creature-editor-browser.mjs"`.

**Interfaces:** spotřebovává běžné UI, read-only `render_game_to_text()` a save import/export. Nový read-only výpis smí uvést výběr madel, body pro projekci, profil schopností a historii; nesmí poskytovat zápis genomu nebo doplňování DNA.

- [ ] Vytvořit skript ve stylu `scripts/body-editor-browser.mjs`. Výchozí server `http://127.0.0.1:5183`, přepis `LUMAVORA_URL`; výstup `evidence/sp-002/browser`, přepis `CREATURE_EDITOR_OUTPUT`. Trace jen při `LUMAVORA_TRACE=1`. Nejdřív nechat nové scénáře selhat na nehotové funkci; příprava scénáře má vlastní assertion, aby nedošlo k falešnému úspěchu přes DEV zápis.
- [ ] Každé ze tří těl sestavit kliky, tažením a klávesovými posuvníky ze stejného přiznaného připraveného pobřeží. Pokud je potřeba vyšší rozpočet pro konstrukční matici, vyrobit samostatně popsaný testovací save s konzistentní alokací, importovat běžným UI a uvést jeho původ. Výsledný genom nikdy neinjektovat. Ověřit cost před potvrzením a skutečnou změnu DNA po něm.
- [ ] Na každém těle: přímý výběr těla, kolena/lokte a konce; změna symetrie; alespoň jeden zásah do obratle/kloubu a undo/redo; zkouška všech dostupných akcí; potvrzení a nejméně 20 m běžného řízení terénem se zatočením, svahem a překážkou. U čelistní varianty otestovat zásah a minutí/zakrytí, u hlasu/gesta odezvu a cooldown. Chůze má používat skutečný browser čas, nesmí být vydávána za výkonový důkaz při DEV krokování.
- [ ] Vyexportovat, znovu importovat, obnovit stránku a načíst každé tělo. Porovnat kompletní genom, cenu a schopnosti. Uprostřed skoku otestovat save/load připraveným scénářem, včetně zbývajícího cooldownu; obnovu generace otestovat přes běžnou cestu smrti/obnovy. Ověřit cancel nové v2 přestavby historického v1 saveu a import chybných dat bez poškození existujícího slotu.
- [ ] Ověřit 1440×900 a 1280×720, klávesnici, změnu panelu během editace, pointercancel, ztrátu focusu a reduced motion. Zachovat jednu srovnávací kompozici tří těl se společným měřítkem, detail kloubu/povrchu a terénní snímek; screenshot selhání jen když něco selže. Ukládat malý JSON souhrn s prostředím, seedem, výchozím saveem a výsledky. Prohlédnout skutečné snímky, nikoli jen jejich existenci.
- [ ] Vedle připravené konstrukční matice dokončit běžný průchod od nové linie nebo existujícího doloženě hraného checkpointu do souše, bez DEV zápisů, přidaného DNA a přeskočených etap. U hnízda sestavit alespoň jednu v2 stavbu ze skutečně získaného rozpočtu, odejít do krajiny a vrátit se k další úpravě. Uchovat aktivní save pro pokračování. Tím doložit dostupnost editoru a cen v kampani; tři připravené modely ji samy neprokazují.
- [ ] Po úspěchu cílených kontrol odstranit dočasný DEV příznak a zpřístupnit nové ovládání v produkční souši. Potom spustit jednou celou unit sadu, typecheck a produkční build. Na výsledném obsahu ověřit původní editor organismu, body editor, machine editor, relevantní tribe/production smoke a nový browser skript. Výsledný produkční smoke musí kontrolovat právě zpřístupněnou verzi, nikoli starší build.
- [ ] Výkon měřit samostatně na stejném prostředí/quality se stejnou scénou v1 a se třemi v2 stavbami; vykázat p50/p95 frame time a draw calls, ne univerzální tvrzení o FPS. Při zpomalení p95 nad 20 % vůči kontrolnímu tělu profilovat počet vzorků/meshů před přijetím. Dlouhý soak není výchozí požadavek této změny.
- [ ] Do trvalého reportu zapsat revizi, prostředí, výsledky tří konstrukcí, chyby a jejich opravy, save kompatibilitu, cenovou dostupnost, omezení kolizí a stav lidského playtestu. Zaznamenat, zda člověk bez instrukcí rozpoznal siluety, dokázal vybrat kloub a pochopil nedostupnou schopnost. Chybějící lidské ověření uvést jako mezeru, nikoli vymyslet výsledek. Do `docs/body-editor/README.md` přidat nový oddíl a zachovat historickou charakterizaci v1.
- [ ] Po doložené akceptaci odškrtnout příslušná kritéria SP-002.1/.2/.3 a teprve pak mateřskou kartu. SP-003, SP-004, SP-005 a celou SP-017 tím neuzavírat. Commit: `test: verify creature editor terrain and save workflows`.

## 6. Matice přijetí a návaznosti

| Kritérium SP-002 | Doklad / úkol | Co se nesmí zaměnit za splnění |
| --- | --- | --- |
| Rozpoznatelný dvounožec, čtyřnožec, dlouhokrký tvor | 1–2: konstrukce a postoj; 4–5: skutečný model/UI; 9: společná obrazová kompozice | Pouhá změna barvy, globální scale nebo model dodaný přes testovací setter. |
| Připojitelné ruce, chodidla, ústa, symetrie, limity a DNA | 1–3: smlouva a ceny; 5: konstrukce; 6: skutečný výkon; 9: placené potvrzení | Dekorativní dlaň bez funkce, skrytý doplatek, záporné DNA nebo obcházení validátoru. |
| Chůze/skok/útok/komunikace podle stejného genomu | 4, 6–8: sdílená anatomie, krok a póza; 9: UI a svět | Náhled s pevným univerzálním skeletem nebo neexistující akcí. |
| Terén, save/load, undo/redo a staré genomy | 3, 5, 7, 9 | Jen parser bez obnovy generace, jen editor bez terénu nebo nové testy se smazanými historickými referencemi. |
| Příslušná část SP-017 | 4, 5, 8, 9 | Počet testů bez prohlédnutého výsledku, čitelnosti a záznamu playtestu. |

Výstupy pro další práci: SP-003 používá `CreatureCapabilities`, kontakty úst a kloubovou pózu pro sociální/bojová setkání. SP-004 naváže katalog objevených částí na existující ID bez změny genomu. SP-005 použije serializovatelný `Genome` a čistou anatomii pro výtvory a NPC; tento plán knihovnu ani nové vztahy druhů neimplementuje.

## 7. Příkazy ověření a stav při plánování

Standardní závěrečná kontrola realizace:

```sh
pnpm exec vitest run --maxWorkers=1
pnpm typecheck
pnpm build
pnpm dev --port 5183
# Browser příkazy spouštět postupně v druhém terminálu proti uvedenému serveru.
LUMAVORA_URL=http://127.0.0.1:5183 pnpm test:creature-editor
LUMAVORA_URL=http://127.0.0.1:5183 pnpm test:body-editor
LUMAVORA_URL=http://127.0.0.1:5183 pnpm test:editor
LUMAVORA_URL=http://127.0.0.1:5183 pnpm test:machine-editor
```

Při tomto plánování místní wrapper `pnpm --version` skončil `unable to open database file`; závislosti na disku byly použitelné. Ekvivalentní unit příkaz je `node node_modules/vitest/vitest.mjs run ... --maxWorkers=1`, typecheck `node node_modules/typescript/bin/tsc --noEmit`, build po typechecku `node node_modules/vite/bin/vite.js build`. Pro browser skripty lze přímo spustit `node scripts/<název>.mjs`. Neřešit tuto vlastnost prostředí změnou připnutých verzí projektu.

**Skutečně ověřeno při tvorbě plánu, nikoli implementace SP-002:**

- Node **24.15.0**, Linux, přibližně **247 GB** volného místa před kontrolami.
- **14 souborů / 580 testů prošlo**: `genome`, `body-shape`, `body-selection`, `anatomy`, `jaw-attachment`, `bite-contact`, `locomotion`, `physiology`, `blueprint`, `persistence`, `era-persistence`, `tribe-persistence`, `machine-persistence`, `planet-persistence`. Běh 14.39 s, jeden worker.
- Samostatná read-only kontrola **11/11** položek `tests/fixtures/saves/manifest.json`: shoda velikosti/SHA256, načtení, serialize/parse se zachovaným genomem a volání obnovy přítomného checkpointu. Všechny mají genom v1. SSR nástroj vypsal sandboxové `EPERM` při pokusu otevřít pomocný WebSocket; vlastní kontrola dokončila s exit 0. Nešlo o browser test.
- Pro samotnou dokumentaci nebyl znovu spuštěn celý herní suite, build, browser ani lidský playtest. Historický výsledek SP-001 je samostatně v jeho reportu. Žádná nová schopnost SP-002 zatím není ověřena jako implementovaná.

Před realizací znovu zkontrolovat pracovní strom, skutečnou výchozí revizi a platnost cest. Při změně smlouvy upravit nejprve tuto smlouvu, související testy a všechny navazující úkoly; nepřepisovat potichu původní save fixtures nebo přesné otisky SP-001.
