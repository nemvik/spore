# LUMAVORA — Éra kmene, strojů a planety

Návrh rozšíření kampaně o tři etapy po vzoru hry Spore: **Kmen → Stroje → Terraformace**.

- **Stav:** návrh ke schválení, nic z toho není implementováno
- **Datum:** 2026-09-15
- **Týká se:** `src/game/`, `src/render/`, `src/ui/`, `src/main.ts`, `tests/`

---

## 1. Proč tenhle dokument existuje

Hra dnes končí na souši. Po splnění jedné ze tří závěrečných cest se nastaví `campaign.won`, zobrazí se historie linie a nabídne se sandbox — tedy „hraj dál ve světě, který jsi zanechal", bez nového obsahu. Tvor je v té chvíli ekologicky úspěšný a víc se s ním dělat nedá.

Tenhle návrh přidává to, co ve Spore po úspěšném tvorovi následovalo: společnost, techniku a planetu.

### 1.1 Vědomé překročení původního zadání

`GAME_BRIEF.md` explicitně říká:

> „Kmeny, civilizace a vesmír do tohoto zadání nepatří."

**Tento návrh tu hranici vědomě boří.** Je to rozhodnutí zadavatele, ne opomenutí. Uvádí se to nahoře, aby bylo zřejmé, že původní brief byl splněn v jeho vlastním rozsahu a tohle je jeho rozšíření — ne dodatečné vysvětlení, proč se rozsah nedodržel.

Co z briefu **zůstává v platnosti** i pro nové etapy:

- návaznost stavu a zážitku mezi etapami je povinná
- nejméně tři odlišné, životaschopné strategie napříč kampaní
- editor nesmí být strom upgradů vedle statického modelu; co je v editoru, musí být ve hře
- ekologické důsledky musí být skutečnou změnou stavu, přežít uložení a načtení
- seedovaná, reprodukovatelná simulace a časování nezávislé na snímkové frekvenci
- ověření skutečným hraním, ne přepsáním stavu

---

## 2. Co hra má dnes

### 2.1 Tři etapy

`Stage = 0 | 1 | 2` (`src/game/types.ts:3`), `GameState.worlds` je trojice světů, `CHAPTERS` (`src/game/content.ts`) má tři položky.

| # | Název | Prostředí | Jádro smyčky |
|---|---|---|---|
| 0 | Mikrosvět | světelná kapka, pohyb převážně v rovině | jídlo, tři niky, dvě generace, první adaptace |
| 1 | Útesy a mělčiny | 3D voda, baldachýn, proudy | filtrace vs. čelist, vztlak, příprava plic a končetin |
| 2 | Pobřeží a souš | vysychající krajina | vláha, invazní žrouti, tři cesty k závěru |

Napříč všemi jde jeden genom: 21 adaptací v šesti kategoriích (`src/game/genome.ts`), z něj `computeStats()` odvozuje rychlost, obratnost, pancíř, vnímání, metabolismus, jídelníček i dostupné schopnosti. `Journey` v3 nese ekologické situace (`EcologySite`), symbiózu, kořenové pokrytí a paměť lovců.

### 2.2 Současný konec

Po přechodu na souš se nastaví `campaign.drought = .28` a sucho v čase roste (`src/game/simulation.ts:273`). Vítězství (`tryWin`, `simulation.ts:97`) nastane automaticky, jakmile `journeyFinale()` vrátí jednu ze tří cest:

| Cesta | Podmínka | Následek ve světě |
|---|---|---|
| `restoration` | obě pobřežní niky mají živou kořenovou oporu | sucho klesne na `.12`, úrodnost stoupne |
| `predator` | obě niky vyřešené lovem invazních žroutů | sucho zastropováno na `.4`, prameny nabité |
| `migration` | symbiotická linie do severní svatyně | vznikne trvale vlhká svatyně, okolí dál vysychá |

Pak `campaign.won = true`, modal s historií linie, a na výběr sandbox nebo nová linie s jiným seedem.

### 2.3 Co se z existujícího kódu dá znovu použít

Tohle je pro celý návrh zásadní — nové etapy nestojí na zelené louce:

| Existující | Kde | K čemu v nových etapách |
|---|---|---|
| Editor s 3D náhledem, výběrem dílu klikem, posuvníky, symetrií, undo/redo, rozpočtem a validací | `src/main.ts:100–180` | základ editoru strojů |
| Vyhýbání překážkám a řízený pohyb jednotlivce | `src/game/navigation.ts`, `obstacle-geometry.ts` | pohyb jednotek v RTS etapách |
| Záměry `forage / flee / hunt / rest / bonded` | `src/game/encounter-ai.ts` | chování členů tlupy a neutrálních tvorů |
| Vláha, sucho, opora živými kořeny | `src/game/climate.ts` | jádro terraformace |
| Volitelné řezy stavu (`canopy?`, `rootDispersal?`, `reefEvolution?`) | `src/game/journey-types.ts` | vzor pro rozšíření uložené hry |
| Validace importu, verzování, checkpointy | `src/game/persistence.ts` | rozšíření na verzi 3 |

---

## 3. Jak to řešilo Spore

Návrh nevychází z dojmu, ale z toho, co Spore skutečně dělal.

### 3.1 Ovládání se měnilo po etapách

Spore **nedržel jeden ovládací model**, měnil ho:

| Etapa | Co hráč ovládá | Editor |
|---|---|---|
| Cell | jedno tělo, přímo, v rovině | editor buňky |
| Creature | jedno tělo, přímo, 3D | editor tvora |
| **Tribal** | **ztrácí jedince** — RTS s tlupou až 12 členů, ovládání blízké Age of Mythology | editor těla mizí, nahradí ho **Tribal Outfitter** (oblečení a nástroje, ne tělo) |
| **Civilization** | **RTS nad celou planetou**, hráč velí vozidlům | **Vehicle Creator**: pozemní, námořní, letecká |
| Space | **zpět k přímému řízení jedné jednotky** (loď) | editor lodi |

### 3.2 Kmenová etapa

- druh je **tvarově zamčený**, dál se nevyvíjí
- **jídlo nahrazuje DNA jako měnu** — kupuje členy, stavby a usmiřuje cizí kmeny
- nástroje vyžadují **postavenou dílnu**, která sama stojí jídlo
- zbraně (sekera, oštěp, pochodeň) vs. sociální nástroje (roh, maracas, didgeridoo) — tedy **dobýt, nebo spřátelit**
- hráč startuje s chýší, tlupou a **dvěma schopnostmi odemčenými podle chování v předchozích etapách**
- stačí jeden živý člen, aby kmen nezanikl

### 3.3 Civilizační etapa

- tři typy strojů: **pozemní**, **námořní**, **letecké**
- **pozemní zabírají suchozemské prameny koření, námořní vodní, letecké nezabírají žádné** — zato přeletí jakýkoli terén
- letecké se odemykají až po čtvrtém dobytém městě
- každý stroj má tři staty (Health, Power, Speed) a skládá se ze **tří dílů — trup, kabina, motor** — plus jeden **modul schopnosti**: vojenský, ekonomický, nebo náboženský
- tři archetypy = tři cesty k ovládnutí planety

### 3.4 Terraformace

- planeta má **T-skóre T0–T3**; číslo udává, kolik osad planeta unese
- stav planety je **bod ve dvou osách — teplota a atmosféra**; nástroje ten bod tlačí ke středu kruhů a každý prolomený kruh zvedne T-skóre o stupeň
- **zvednuté T-skóre se musí stabilizovat živým životem, jinak se planeta pomalu vrátí zpět**
- na každý stupeň jsou potřeba tři druhy rostlin (malá, střední, velká) a tři druhy tvorů (dva býložravci, jeden masožravec)

Poslední bod je pro LUMAVORU nejcennější: **terraformace ve Spore není o strojích. Stroje jen připraví podmínky; udrží je teprve živá ekologie.** To je přesně mechanika, kterou tahle hra už má.

---

## 4. Celkový tvar rozšíření

```
03 Pobřeží a souš   přímé řízení těla              ← dnešní konec kampaně
        ↓  výslovný opt-in po vítězství
04 Kmen             RTS, tlupa, výstroj místo těla
        ↓
05 Stroje           RTS nad krajinou, editor tanků a letounů
        ↓
06 Terraformace     zpět k přímému řízení jednoho stroje + planetární mapa
                    finále: obyvatelná planeta
```

Hra tedy **mění ovládací model po etapách, stejně jako Spore** — ne proto, že by to bylo pohodlné, ale protože každá etapa je o jiném měřítku rozhodování.

---

## 5. Datový model

### 5.1 Rozšíření `Stage`

```ts
export type Stage = 0 | 1 | 2 | 3 | 4 | 5;
```

Všechna existující místa, kde se `Stage` porovnává s `2` jako „poslední etapa", se musí projít. Je jich hodně a jsou rozeseté; součástí přípravné fáze je zavést pojmenované predikáty, aby se to podruhé nestalo:

```ts
export const isOrganismStage = (s: Stage) => s <= 2;   // 0,1,2 — tvor, přímé řízení
export const isCommandStage  = (s: Stage) => s === 3 || s === 4;  // RTS
export const isPlanetStage   = (s: Stage) => s === 5;
```

### 5.2 Nové etapy nedostanou `World`

`World` je stavěný pro tvory, zdroje, niky a překážky. Cpát do něj osady, stroje a planetární klima by ho rozbilo a zároveň by to rozbilo validaci importu, která jeho tvar přesně kontroluje.

Místo toho tři **volitelné řezy stavu**, ve stylu, který kód už používá u `Journey`:

```ts
export interface GameState {
  version: 3;            // bylo 2
  // … stávající pole beze změny …
  tribe?: TribeState;      // etapa 3
  machines?: MachineState; // etapa 4
  planet?: PlanetState;    // etapa 5
}
```

**Etapa 3 běží na stejném pobřežním terénu jako etapa 2.** Žádný nový `World` se negeneruje — mění se jen měřítko kamery a přibývá vrstva jednotek. Je to levné a vypravěčsky správné: tlupa žije tam, kde tvoje linie přežila sucho.

### 5.3 Řezy stavu

```ts
interface TribeState {
  version: 1;
  food: number;                 // měna etapy
  members: TribeMember[];       // vlastní tlupa
  huts: Hut[];                  // chýše a dílny
  unlocked: ToolId[];           // nástroje odemčené postavenou dílnou
  neighbours: NeighbourTribe[]; // cizí kmeny: vztah, stav, chýše
  legacyAbility: 'restoration' | 'predator' | 'migration';
}

interface MachineState {
  version: 1;
  resource: number;             // surovina z pramenů
  blueprints: Blueprint[];      // uložené konstrukce strojů
  fleet: Machine[];             // postavené stroje ve světě
  regions: Region[];            // území, prameny, vlastník
  archetype: Archetype;
}

interface PlanetState {
  version: 1;
  temperature: number;          // osa A, normalizovaná -1..1
  atmosphere: number;           // osa B, normalizovaná -1..1
  tScore: 0 | 1 | 2 | 3;
  stabilizers: Stabilizer[];    // usazené druhy, jejich stupeň a vitalita
  settlements: Settlement[];
}
```

Všechny tři jsou **volitelné a verzované samostatně**. Uložená hra bez nich je platná — to je přesně ten mechanismus, kterým dnes fungují `canopy?`, `rootDispersal?` a `reefEvolution?`.

### 5.4 Ukládání a zpětná kompatibilita

- `SavedEnvelope.version: 2 → 3`, `GameState.version: 2 → 3`
- uložená hra verze 2 se **načte a dohraje se jako dnes**; nové řezy prostě chybí
- **pokračování do kmenové éry je výslovný opt-in po vítězství**, ne tichá migrace
- validace importu (`persistence.ts`) dostane samostatné validátory pro každý řez, ve stejném stylu jako `validateJourney()`
- checkpointy musí uložit i nové řezy; `makeCheckpoint()` a kontrola shody v `persistence.ts:388` se rozšíří

Důvod pro opt-in místo automatické migrace: repo tenhle vzor už má a stojí na něm (`journey.legacy` — „staré linie si ponechávají původní pravidla, jejich průběh se nepřepisuje"). Dohraná linie z verze 2 nemá stav, ze kterého by se dal poctivě odvodit kmen, a domýšlet ho za hráče by znamenalo vymýšlet mu historii.

---

## 6. Sdílený editor místo druhého editoru

Tohle je největší technická výhra celého návrhu.

### 6.1 Problém

Dnešní editor (`src/main.ts:100`) umí 3D náhled, výběr dílu klikem přímo na model, posuvníky polohy a velikosti, symetrii, undo/redo, rozpočet a validaci konstrukce. Je to nejcennější kus UI ve hře. Napsat pro stroje druhý takový editor by znamenalo zdvojit ho — a nutně nechat oba časem rozejít.

### 6.2 Řešení

Stroj je strukturálně **totéž co organismus**: nosič, přípojné body, díly s cenou a důsledky. Zavede se společný tvar:

```ts
interface Blueprint {
  version: 1;
  kind: 'organism' | 'vehicle';
  name: string;
  hue: number; pattern: number;
  parts: Part[];
}
```

`Genome` se stane `Blueprint` s `kind: 'organism'`. Katalog dílů a pravidla validace se liší podle `kind`; **UI editoru, historie úprav, výběr dílů, náhled i rozpočet zůstávají jedny.**

Tím se zadarmo zdědí i pravidlo, které brief vyžaduje — *„model, animace, parametry a dostupné interakce musí vycházet ze stejných dat, aby se nemohly rozcházet"* — nově i pro stroje.

### 6.3 Konstrukce stroje

Po vzoru Spore: **trup + kabina + pohon + jeden modul schopnosti**, tři staty.

| Stat | Odvozen z | Herní význam |
|---|---|---|
| odolnost | trup, pancéřové díly | kolik vydrží |
| síla | modul, pohon | účinnost zásahu, těžby nebo přesvědčování |
| rychlost | pohon vs. hmotnost | dojezd a čas přesunu |

**Tank a letoun se neliší jiným editorem, ale třídou nosiče.** Pozemní nosič má podvozek a nese těžké moduly; vzdušný nosič má nosné plochy, menší nosnost a vyšší rychlost. Stejná paleta, stejná pravidla ceny, jiné limity.

Zachovává se i zákaz nesmyslných konstrukcí: stroj bez pohonu, bez kabiny nebo s modulem, který na daný nosič nepatří, nejde potvrdit — analogicky k tomu, jak dnes editor odmítne filtr spolu s dravou čelistí.

---

## 7. Etapa 04 — Kmen

### 7.1 Zlom v ovládání

**Ztrácíš jedince, dostáváš tlupu.** Druh je od téhle chvíle tvarově zamčený a editor těla se nahradí **výstrojí** — nástroje a ozdoby, ne tělo. To je přímo Spore a je to důležité i vypravěčsky: evoluce těla skončila, začíná evoluce chování.

### 7.2 Ekonomika

**Měnou přestává být DNA a stává se jí jídlo.** Kupuje členy tlupy, chýše a dílny. Nástroj jde vyrobit až po postavení příslušné dílny, která sama stojí jídlo — to dělá z každé investice skutečnou volbu, ne odškrtnutí položky.

### 7.3 Kontinuita linie je tvrdá, ne kosmetická

Tohle je místo, kde návrh musí být nejpřísnější, protože právě tady se rozšíření nejsnáz zvrhne v nesouvisející minihru:

- **`stats.diet` z finálního genomu určuje, co tlupa vůbec umí sbírat.** Filtrační linie nemůže lovit; dravá linie nesklidí nektar. Tělo, které jsi stavěl tři etapy, dál rozhoduje.
- **Závěrečná cesta z etapy 3 dává startovní schopnost** — obdoba toho, jak Spore odemykal Consequence Abilities podle chování v předchozích fázích.
- **Symbionti přecházejí s tebou.** Partner v `player.bonds` se stane členem tlupy se svým vlastním hladem a nároky, ne pasivním bonusem.

### 7.4 Sousedé

Cizí kmeny se dají **dobýt, nebo spřátelit**. Obě cesty musí být plnohodnotné — brief požaduje, aby výhra nevyžadovala, aby se všechny linie nakonec změnily v bojovníka, a tenhle požadavek platí i pro nové etapy.

### 7.5 Podmínka postupu

Ovládnutí nebo spojenectví se všemi sousedními kmeny, při zachování vlastního kmene. Stačí jeden živý člen, aby kmen nezanikl — jinak končí generace a nabízí se obnovení z checkpointu, stejně jako dnes při smrti tvora.

---

## 8. Etapa 05 — Stroje

### 8.1 Tři archetypy navázané na tři cesty

Spore měl vojenský, ekonomický a náboženský archetyp. LUMAVORA má tři závěrečné cesty, které se namapují přímo:

| Cesta z etapy 3 | Archetyp | Jak získává regiony |
|---|---|---|
| `restoration` | zahradníci | obnovou a osídlením; stroje slabé, ale území drží samo |
| `predator` | regulátoři | silou; vojenské moduly, rychlý zábor, vyčerpaná krajina |
| `migration` | symbionti | spojenectvím a sdílením zdrojů; pomalé, odolné vůči odvetě |

Tím je splněn briefový požadavek tří odlišných životaschopných strategií i v nových etapách — a nejsou to stejné schopnosti s jinými čísly, protože každý archetyp má jiný způsob záboru.

### 8.2 Asymetrie strojů

Ze Spore se přebírá pravidlo, které té etapě dává tvar:

- **tank zabírá zdrojové prameny, letoun ne**
- **letoun zato přeletí jakýkoli terén** a odemyká se později

Bez tanků tedy nezískáš surovinu; bez letounů se nedostaneš přes terasy a rokle. Ani jeden typ nestačí sám a rozpočet nutí volit poměr. (Námořní typ se v tomhle návrhu vynechává — LUMAVORA nemá v této fázi splavnou vodní plochu a přidávat ji jen kvůli symetrii se Spore by byl obsah bez důvodu.)

### 8.3 Suroviny a regiony

Krajina se dělí na regiony; v každém je jeden nebo víc **pramenů suroviny**. Zabraný pramen dává průběžný příjem, ze kterého se staví další stroje. Regiony mají různý terén, což rozhoduje o tom, jestli je levnější tank, nebo letoun.

### 8.4 Podmínka postupu

Kontrola nad dostatkem regionů pro udržení výroby. Cesta k ní se liší podle archetypu — silou, obnovou, nebo spojenectvím.

---

## 9. Etapa 06 — Terraformace

Nejlepší etapa návrhu, protože jako jediná neběží na nové mechanice, ale na mechanice, kterou hra má od začátku.

### 9.1 Ovládání

**Zpět k přímému řízení jednoho stroje**, plus planetární mapa. Klávesa přepíná mezi děním v krajině a přehledem planety. Návrat k přímému řízení po dvou RTS etapách je záměrný oblouk — stejně jako Spore vrátil hráče k jedné jednotce ve vesmírné fázi.

### 9.2 Dvě osy a T-skóre

Stav planety je bod ve dvou osách — **teplota a vláha**. Nástroje ten bod tlačí ke středu; každý prolomený kruh zvedne **T-skóre** o stupeň (T0 → T3). T-skóre určuje, kolik osad planeta unese.

Stroje z předchozí etapy se stávají nástroji terraformace, takže konstrukce, kterou sis postavil, má důsledky i tady:

| Stroj | Terraformační role |
|---|---|
| tank | vrty, těžba, uvolnění podzemní vody |
| letoun | rozprašování, setí, ochlazování, průzkum |
| terraformér | těžké zásahy do obou os |

### 9.3 Pointa: život, ne stroje

**Zvednuté T-skóre se musí stabilizovat živým životem, jinak se planeta vrátí zpátky.** Na každý stupeň je potřeba několik druhů producentů, býložravců a lovec — a ty druhy bereš **z vlastní linie a ze světů, kterými jsi prošel**.

Mechanicky to není nic nového:

- **regrese planety** je `campaign.drought` rostoucí v čase (`simulation.ts:273`)
- **stabilizace** je `landSiteSupport()` a `livingRootStrength()` (`climate.ts:7–30`) povýšené na planetární měřítko
- **usazený druh** je `EcologySite` s vitalitou a živým zdrojem, přesně jako dnešní zasazený kořen

**Sucho, které ukončilo třetí etapu, se vrací jako protivník šesté.** Hráč, který se ve třetí etapě naučil, že voda drží jen tam, kde jsou živé kořeny, tenhle systém pochopí okamžitě — jen ve větším měřítku.

### 9.4 Finále

Planeta na T3, stabilizovaná natolik, že po vypnutí strojů neklesá. Závěr nabídne shrnutí celé linie od první kapky po planetu a možnost pokračovat v sandboxu — stejně jako dnešní závěr třetí etapy.

---

## 10. Technické základy, které musí vzniknout první

### 10.1 RTS vrstva

Největší kus nové práce. Sdílí ji etapa 3 i 4.

| Část | Stav dnes | Plán |
|---|---|---|
| kamera nad krajinou | `camera.ts` umí jen kameru za tělem | přidat režim, ne forkovat soubor (106 řádků) |
| výběr jednotek myší | jen výběr dílu v editoru (`graphics.pickPart`) | rozšířit picking rendereru na jednotky ve světě |
| rozkazy | neexistuje | fronta `Command { unit, kind, target }` |
| skupinový pohyb | `navigation.ts` umí jednotlivce s vyhýbáním překážkám | **steering + separace, ne A\*** — terén je otevřený s roztroušenými překážkami |
| chování jednotek | `encounter-ai.ts` má `forage / flee / hunt / rest / bonded` | člen tlupy = tvor s vlastníkem a rozkazem |

Volba steeringu místo A\* je záměrná a obhajitelná: světy jsou otevřené plochy s roztroušenými překážkami, geometrie vyhýbání už existuje a je otestovaná (`tests/obstacle-contact-regression.test.ts`, `tests/finite-obstacles.test.ts`). A\* by byl nový podsystém řešící problém, který hra nemá.

### 10.2 Vstupy po etapách

Levé tlačítko myši dnes vybírá cíl krmení (`FeedSelection`). V RTS etapách musí vybírat jednotky. Zavede se **vstupní mapa podle etapy** místo přibývajících podmínek v obsluze ukazatele. Totéž pro klávesy: `T`, `E` a `G` mají v nových etapách jiný význam.

### 10.3 Rozdělení renderování

`src/render/habitat.ts` má **858 řádků** a `organism.ts` **714** — obojí je už dnes na hraně. Nové etapy dostanou vlastní moduly:

- `render/settlement.ts` — chýše, dílny, tlupa
- `render/machine.ts` — stroje z `Blueprint`, sdílí sestavovací logiku s `organism.ts`
- `render/planet.ts` — planetární mapa, osy, T-skóre

Do `habitat.ts` se nic nepřidává. Pokud se ukáže, že etapa 3 potřebuje zásah do vykreslování terénu, rozdělí se `habitat.ts` **předem**, ne při té příležitosti.

### 10.4 Lokalizace

Herní texty jsou dnes centralizované (`content.ts`, `*-copy.cs.ts`, `ui/copy.cs.ts`). Nové etapy tenhle vzor dodrží: **žádné texty v logice**, každá etapa vlastní soubor kopie.

---

## 11. Ověřování

Stejná laťka jako u stávajících etap; nová funkcionalita bez důkazu se nepovažuje za hotovou.

### 11.1 Automatické testy

- **Determinismus:** stejný seed a stejný počet kroků dá stejný stav i v nových etapách. Testovací seedy zůstávají `481516`, `20260913`, `8675309`.
- **Ukládání:** round-trip každého nového řezu; import poškozeného a neúplného řezu musí být odmítnut se srozumitelnou chybou.
- **Zpětná kompatibilita:** uložená hra verze 2 se načte, dohraje a **nespustí novou éru bez opt-inu**. Tohle je regresní test, ne jednorázová kontrola.
- **Přechody:** podmínky postupu 3→4, 4→5, 5→finále, včetně neúspěšných pokusů.
- **Kontinuita linie:** genom z etapy 2 se promítá do schopností tlupy; závěrečná cesta určuje archetyp.
- **Terraformace:** zvednuté T-skóre bez stabilizace **skutečně klesá**; se stabilizací drží. Ověřit na stavu, ne na textu v HUD.
- **Ekonomika:** žádné záporné ceny, žádné nekonečné vracení surovin, žádný zisk z opakovaného stavění a rušení.

### 11.2 Browser a průchod

- ovládání každé nové etapy skutečnými vstupy, ne přepsáním stavu
- alespoň jeden úplný průchod od nové hry až po terraformaci
- soak test bez pádu a bez růstu prostředků při opakovaných akcích
- screenshoty každé nové etapy a editoru strojů

### 11.3 Co se tímhle neprokáže

Pro pořádek, ve stejném duchu jako `BENCHMARK_REPORT.md`: úspěšné testy neprokazují, že jsou nové etapy zábavné, ani že tempo sedí. To vyžaduje skutečné hraní a je to potřeba uvádět odděleně.

---

## 12. Rozdělení do částí

Rozsah zhruba **ztrojnásobí hru**. Proto se dělí na čtyři nezávisle dokončitelné části. **Každá má vlastní spec a vlastní plán**; tenhle dokument je jim společným rámcem, ne jejich náhradou.

### P0 — Základy (bez nového herního obsahu)

Rozšíření `Stage` a pojmenované predikáty, persistence verze 3 s prázdnými řezy, opt-in po vítězství, vstupní mapy po etapách, režim kamery nad krajinou, rozdělení renderovacích modulů.

*Hotovo, když:* hra se chová přesně jako dnes, všechny stávající testy procházejí, uložené hry verze 2 se načtou, a existuje prázdná etapa 3, do které se dá vstoupit a vrátit se z ní.

### P1 — Etapa Kmen

RTS vrstva (výběr, rozkazy, skupinový pohyb), výstroj místo editoru těla, ekonomika jídla, chýše a dílny, sousední kmeny, obě cesty k postupu.

*Hotovo, když:* etapa se dá dohrát oběma cestami skutečným ovládáním a genom z etapy 2 v ní prokazatelně něco mění.

### P2 — Etapa Stroje

Zobecnění editoru na `Blueprint`, třídy nosičů, tank a letoun, regiony a prameny, tři archetypy.

*Hotovo, když:* postavený stroj z editoru je tentýž stroj ve hře, všechny tři archetypy dovedou etapu do konce a asymetrie tank/letoun je vynucená, ne dekorativní.

### P3 — Etapa Terraformace

Planetární mapa, dvě osy, T-skóre, regrese, stabilizace životem z vlastní linie, finále a shrnutí.

*Hotovo, když:* nestabilizovaná planeta měřitelně klesá, stabilizovaná drží, obojí přežije uložení a načtení, a kampaň má konec.

---

## 13. Rizika

| Riziko | Závažnost | Jak se mu čelí |
|---|---|---|
| RTS vrstva je celý nový podsystém | vysoká | steering místo A\*, maximální využití `navigation.ts` a `encounter-ai.ts`; P1 se nezačne, dokud P0 nestojí |
| Zobecnění editoru se dotkne nejcennějšího existujícího kódu | vysoká | nejdřív testy současného chování editoru, teprve pak refaktor; `Genome` zůstane platným tvarem |
| Nové etapy se odtrhnou od organismu a stanou se nesouvisející minihrou | vysoká | `stats.diet` a závěrečná cesta mají tvrdé mechanické důsledky; kontinuita je testovaná, ne jen deklarovaná |
| Rozsah zahltí projekt a nechá ho v rozdělaném stavu | vysoká | čtyři samostatně dokončitelné části, každá se spustitelným výsledkem |
| Tempo: kampaň se protáhne mimo hratelnou délku | střední | každá nová etapa cílí na 20–30 minut; návrhový cíl se uvádí jako cíl, ne jako měření |
| Kolize vstupů mezi etapami zmate hráče | střední | vstupní mapa po etapách a vždy dostupné zobrazení ovládání |
| Rozrostlé renderovací soubory | střední | nové moduly; `habitat.ts` se případně dělí předem |

---

## 14. Otevřené otázky

Nebrání zahájení P0, ale je potřeba je rozhodnout před příslušnou částí:

1. **Jméno suroviny etapy 5.** Ve Spore koření; LUMAVORA potřebuje vlastní název zapadající do světa. — *před P2*
2. **Velikost tlupy.** Spore měl až 12. Kolik jich unese dnešní renderování a čitelnost? Rozhodnout měřením, ne odhadem. — *před P1*
3. **Rozsah výstroje.** Kolik nástrojů, aby volba byla skutečná a přitom se každý dal odlišit tvarem a chováním? — *před P1*
4. **Námořní stroje.** Tenhle návrh je vynechává. Pokud by etapa 5 dostala splavnou vodu, stojí za to je vrátit? — *před P2*
5. **Odkud se berou druhy pro stabilizaci.** Jen ty, se kterými linie skutečně žila, nebo i ty, které jen potkala? První je přísnější a odměňuje průzkum. — *před P3*

---

## 15. Shrnutí

Rozšíření přidává tři etapy po vzoru Spore a mění ovládací model tak, jak ho měnil Spore: tlupa a stroje se velí shora, planeta se řídí zblízka.

Drží ho pohromadě jedna věc — **terraformace není o strojích.** Stroje jen připraví podmínky; udrží je teprve živá ekologie, a to je přesně systém, na kterém tahle hra stojí od první kapky. Sucho, které ukončilo třetí etapu, se vrací jako protivník šesté, a hráč mu rozumí, protože už se s ním jednou utkal.
