# SP-007.A — datová smlouva dědictví v1

Rozšíření `GameState.lineageHistory` je volitelné uvnitř stávající kampaně v3. Typy a odvozování: [lineage-history.ts](../../src/game/lineage-history.ts). Přísná validace: [persistence.ts](../../src/game/persistence.ts). Neznámá verze nebo pole se odmítají; příští významově odlišný model potřebuje novou verzi a výslovnou migraci.

## Společná obálka

`{ version: 1, stages: StageHistory[] }`. Přesně jeden slot pro každou dosaženou etapu, v pořadí 0 až aktuální etapa; maximum šest. Klíčem výsledku je etapa, nikoli jméno těla, generace nebo ID importované kampaně.

| Pole etapy | Význam |
| --- | --- |
| `stage` | 0 buňka, 1 útes, 2 tvor, 3 kmen, 4 dnešní stroje, 5 lokální terraformace |
| `coverage` | `complete`: sledováno od vstupu; `partial`: sledováno až od načtení starého save; `unknown`: průběh nebyl sledovaný. Nejde o stav dokončení. |
| `started` | `{tick, generation}` počátku pozorování, nebo `null` pro neznámou historii. |
| `counts` | U pozorovaných etap 0–2 mapa úspěšně snědených `algae/mineral/nectar/meat/detritus` a počet úspěšných lovů připsaných hráči (včetně smečky). Jinde `null`. Nula je skutečný počet pouze v uvedeném rozsahu pozorování. |
| `facts` | Jedinečné `{key, method, source, at}` vyřešených cílů. `source=action` vzniká z herního výsledku během sledování; `source=saved` přebírá explicitní doložený výsledek starého save. |
| `closed` | `null`, nebo zmrazené `{outcome, source, at}` dokončení etapy. |
| `at` | `{tick, generation}` pro nový výsledek; `null` u starého výsledku bez známého času. Nikdy se nedoplňuje vymyšlený čas. |

Číselné hodnoty jsou konečná nezáporná celá čísla do 1 miliardy; časy/generace nepřesahují kampaň a respektují začátek/konec pozorování. Součty zaznamenaných jídel/lovů nepřesahují skutečné celoživotní počty hráče. Nevyžadujeme rovnost: stará a již uzavřená historie může mít méně záznamů. Fakta musejí odpovídat existujícím herním výsledkům.

## Zdroje výsledků

| Etapa | Fakta a uzavření |
| --- | --- |
| 0–1 | `site:<id>` → `cultivate/hunt/guide`; uzavření `passage` při skutečném přechodu. |
| 2 | Ekologická místa a `nest:<species>` → `friend/predator`; uzavření `social/predator/mixed` z SP-003, případně historické `restoration/predator/migration` ekologického finále. |
| 3 | `neighbour:garden/terrace/sanctuary` a v nové pětikmenové kampani SP-008.F také `neighbour:reed/basalt` → `allied/conquered`; dokončení `allied/conquered/mixed` vyžaduje všechny sousedy příslušného rosteru. |
| 4 | `region:gardens/terraces/highlands` → uložený `restoration/predator/migration`; uzavření podle dokončených regionů. Současná implementace volí metodu podle zděděného archetypu, **nejde o nezávisle hranou civilizační strategii**. |
| 5 | `planet:local-t3` → `stable` po skutečném dosažení T3, živé opory a 30 sekund stabilizace bez nástroje; uzavření `stable`. Záznam netvrdí návštěvy cizích planet, kolonizaci ani filozofii. |

Uzavření zmrazí počty i fakta. Pozdější sandbox či čtvrté hnízdo nemění původní výsledek. Záznam není neomezený log každého stisku; odmítnuté jídlo, zásah bez lovu a samotná instalace čelisti nepřidají porci masa ani výsledek predace.

## Obnova a staré savey

Nová UI linie aktivuje sledování od narození. Samotný parser chybějící rozšíření nedoplňuje, takže historické testové simulace a API konstruktory zůstávají stejné. UI load/import doplní chybějící rozšíření jednou: minulé etapy jako neznámé, probíhající etapu částečně, explicitní staré výsledky s původem `saved`. Stejný postup provede pro vložený checkpoint. Genom, knihovna, snapshot NPC, objevy a růst se nemigrují ani neupravují.

Obnova generace nahrazuje **svět i historii** checkpointem, nesčítá zemřelou větev. Potvrzená přestavba a přechod uloží checkpoint se společným záznamem. Při absenci checkpointu se stejně jako dosud zakládá nová linie, se zachovaným zapnutím sledování. Hotový výsledek zděděný z akcí musí být v checkpointu i živém stavu shodný; nelze změnou pouze checkpointu zrušit bonus. Obnova starého vratného náhledu kmene netvoří dokončený výsledek kmene.

## První spotřebitel: tvor → kmen

Bonus se odvozuje za běhu z nově uzavřeného výsledku tvora a alespoň tří doložených hnízd. Nevzniká měna, nový atribut jednotky ani opakovatelný grant. Účinek platí pouze pro příslušníky vlastního druhu při kontaktu se sousedním kmenem:

| Cesta | Rychlost diplomacie | Poškození sousedů |
| --- | --- | --- |
| Přátelská | ×1,15 | ×1 |
| Predátorská | ×1 | ×1,15 |
| Smíšená | ×1,075 | ×1,075 |
| Neznámá / dříve dokončený save | ×1 | ×1 |

Dary, náklady, cooldowny, nástroje a možnost zvolit obě cesty se nemění. Stávající schopnost `legacyAbility` a strojový `archetype` nadále respektují původní finále. U rozehrané staré etapy mohou doložená stará hnízda přispět k novému hranému dokončení; již hotová stará etapa bonus zpětně nezíská. Jídelníček se nyní uchovává a zobrazuje; samostatný bonus z jídla není součástí A.

Navazuje **SP-007.B1 — následky řešení kmenů**, **SP-007.B2 — civilizační expanze a její následky**, **SP-007.D — vesmírná filozofie říše**. V1 nevyplňuje chybějící budoucí data smyšlenými nulami nebo volbami.
