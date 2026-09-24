# SP-010.A — domovská planeta a místní adresa v1

Tento dokument zachovává původní smlouvu **v1 (SP-010.A)**. SP-010.B ji rozšiřuje [výslovnou migrací na homePlanet v2 a geografickým kontraktem](SP-010B-CONTRACT.md); místní `LocationAddress`, ID a autorita původních světů zůstávají beze změny.

Rozšíření `GameState.homePlanet` je volitelné v kampani v3. [Typy a funkce](../../src/game/home-planet.ts), [validace](../../src/game/persistence.ts), [plán](../superpowers/plans/2026-09-24-sp-010a-home-planet.md). Každá nová UI linie a každá aktivovaná UI kampaň má identitu. Nízkourovňové historické konstruktory a parser ponechávají nepřítomné rozšíření nepřítomné.

```ts
interface HomePlanet {
  version: 1;
  id: string;
  locations: PlanetLocation[];
  currentLocationId: string;
}
interface PlanetLocation {
  id: string;
  kind: 'microhabitat' | 'reef' | 'coast';
  worldSlot: 0 | 1 | 2;
}
interface LocationAddress {
  planetId: string;
  locationId: string;
  position: { x: number; y: number; z: number };
}
```

## Identity a autorita dat

Planeta se v UI jmenuje Lumavora. Její ID vznikne jednou jako `home-${původní ID kampaně}`. Není odvozené ze seedu, těla, času migrace ani právě vykreslené scény. Opakovaná aktivace stejného historického savu dává stejný výsledek; již uložené ID se při přejmenování importního slotu nemění. Předchozí kopie starých souborů s různými ID kampaně se neslučují: jejich společný původ nelze bezpečně domyslet.

Lokality mají ID `${planet.id}:microhabitat`, `:reef`, `:coast`. Jejich druh, ID a fyzický slot jsou pevně svázané. V registru je právě jeden záznam pro každý existující nenulový `worlds[slot]`. **Existence nedokládá návštěvu.** Pobřeží připravené pro NPC knihovnu se registruje i při narození buňky; nevzniká přitom historický záznam návštěvy. Chybějící svět zůstane `null` bez geografického záznamu.

`worldSlot` je pouze vazba na současné úložiště světa, nikoli fáze vývoje. `currentLocationId` označuje lokalitu aktivního `world`; nesmí odporovat této vazbě. Etapa 0 používá mikrosvět, etapa 1 útesy, **etapy 2–5 tentýž záznam pobřeží**. Kamera nemá na identitu vliv. API umí číst jinou uloženou lokalitu bez změny aktivní scény či etapy.

Původní `World` zůstává autoritou pro terén, překážky, zdroje, tvory, patche, landmarks a NPC snapshot. `journey.sites`, hnízda druhu, kmenoví sousedé, strojové regiony a místní biomy dál mají původní ID a stav v příslušných systémech. Nezakládáme jejich druhé kopie ani nový globální význam těchto ID. Například ID patchů jsou nadále lokální danému světu.

`GameState.planet` / `PlanetState` zůstává **lokální terraformací pobřeží**: klima, T0–T3, školka, stabilizátory a živé populace. `homePlanet` neobsahuje jejich kopie, sazby, čas, ekonomiku ani dokončení. Stejně tak nepřepisuje SP-007.A historii nebo výsledky/účinky SP-007.B1.

## Spotřebitel SP-009

Budoucí město uloží `LocationAddress` jako svou adresu; nebude ukládat aktuální číslo etapy ani kameru jako geografickou vazbu. Vlastní ID města, vlastník, budovy a ekonomika patří do modelu SP-009, nikoli do tohoto registru.

```ts
// 'state' je aktivovaná GameState; position je místní bod vybraný hráčem.
const address = locationAddress(state, position);
if (!address) throw new Error('Místo nepatří existující lokalitě.');
// SP-009 uloží address k městu. Později, i při jiné aktivní scéně:
const place = resolveLocationAddress(state, address);
if (!place) throw new Error('Adresa není v této kampani dostupná.');
// place.world je přímo původní uložený World, nikoli jeho kopie.
// place.position je kopie souřadnic; změna nepřepíše uloženou adresu.
```

`locationAddress(state, position, locationId?)` standardně volí aktuální lokalitu, třetí argument dovoluje libovolnou již uloženou. `resolveLocationAddress` odmítá cizí planetu, neznámou lokalitu, chybějící svět a nekonečné/NaN souřadnice. X/Z jsou v rozsahu −78 až 78; Y −1024 až 1024 odpovídá mezím stávající persistence. +X východ, +Y vzhůru, +Z jih; **souřadnice nejsou zeměpisná šířka/délka a habitaty zatím nemají vzájemný globální transform**. Platná adresa nedokládá průchodnost, vhodnost stavby ani vlastnictví; tato pravidla musí provést spotřebitel SP-009.

## Migrace a obnova

1. `parseGame` přísně validuje přítomné rozšíření, absenci ponechá. `enableHomePlanet` se volá při UI narození/load/importu; import vždy **před** změnou ID ukládacího slotu.
2. První aktivace doplní pouze registr existujících světů. Stejnou planetární identitou doplní checkpoint podle jeho vlastních existujících světů a aktivní lokality. Nepřidá RNG krok, svět, návštěvu, kontinent, rozhodnutí, zdroje ani odměnu.
3. Přechod a nový checkpoint synchronizují registr a aktuální referenci. Save/load a export/import ukládají rozšíření spolu se zbytkem kampaně. Obnova vrátí registr, světy, ekonomiku i historii společně; větev se nesčítá. Starší organismový checkpoint může mít méně lokalit. Opakovaný vstup používá stejná ID.
4. Bez checkpointu zůstává dosavadní chování: založit novou linii. Aktivace identity se zachová, identita nové linie náleží jejímu novému ID kampaně.

Parser odmítá neznámé klíče/verze, duplicitní nebo chybějící lokality, nesprávný druh/slot/ID, rozpornou aktuální lokalitu, smíšenou přítomnost markeru mezi live/checkpointem a odlišnou planetu. Checkpoint nesmí obsahovat lokalitu odstraněnou z živé kampaně. Pořadí záznamů identitu nemění. Významově odlišný budoucí geografický model potřebuje novou verzi a výslovnou migraci; ne reinterpretaci místních souřadnic.

## Otevřený navazující rozsah

SP-010.B nyní dodává [regionální atlas a explicitní zasazení habitatů](SP-010B-CONTRACT.md); stav a důkazy uvádí [report B](SP-010B-REPORT.md). Výše uvedený popis bez globálního transformu platí pro v1; B přidává samostatný explicitní převod, nereinterpretuje místní adresu. SP-010.C doplní globální kameru, navigaci, návraty a výběr měst. SP-009.A použije tuto adresu při založení a ukládání měst; ekonomika a nezávislé strategie zůstávají SP-009. SP-007.B2 následně spotřebuje skutečné civilizační volby, SP-007.D vesmírné výsledky. Tento kontrakt nezavádí cestování ani nové navštívené světy.
