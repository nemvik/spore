# LUMAVORA — další vývoj směrem ke Spore

Směr přijatý 17. září 2026. Tento brief a [tracker](ROADMAP.md) navazují na [audit implementace a Spore](../2026-09-17-spore-similarity-audit.md). Popisují další vývoj; nejsou tvrzením, že níže uvedené funkce už existují.

## Cíl a platnost

**Co největší podobnost se Spore v tvorbě vlastních výtvorů, herních smyčkách, návaznosti evoluce a růstu měřítka od buňky po galaxii.** Terraformace se má stát součástí vesmírné hry, po které pokračují kolonizace, obchod, vztahy říší, průzkum a cesta k jádru galaxie. Následný cíl zahrnuje také kapitána a dobrodružství podle Galactic Adventures.

Tento směr má při dalším plánování přednost před omezením na tři etapy v [původním briefu](../../GAME_BRIEF.md) a před koncem u terraformace ve [starším návrhu rozšíření](../superpowers/specs/2026-09-15-lumavora-machine-era-design.md). Starší dokumenty zůstávají záznamem dosavadního zadání a implementace. Požadavky na funkční hru, vlastní obsah, lokální provoz a ověřování zůstávají použitelné.

Referencí je **vydané Spore**, následně rozšíření Galactic Adventures. Základní sled je buňka → tvor → kmen → civilizace → vesmír. Útesová fáze LUMAVORY je existující obsah navíc; její další rozšiřování má nižší prioritu. Případné zkrácení nebo volitelnost útesu se má řešit samostatným návrhem, nikoli odstraněním během jiné práce. [Přehled původní hry](https://www.spore.com/what/spore), [Galactic Adventures](https://www.spore.com/what/ga).

## Z čeho vycházíme

Máme šest propojených etap, editor se sedmi články těla a funkčními adaptacemi, ekologii a symbiózu, kmen se třemi sousedy, editor tanků a letounů, lokální terraformaci T0–T3, ukládání a sandbox. Podrobný rozdíl mezi implementací a cílem je v [auditu](../2026-09-17-spore-similarity-audit.md).

Největší mezery jsou volnost stavby tvora, život druhů a smečky, města se soupeřícími státy, celoplanetární měřítko a kompletní vesmír. Existující systémy budeme rozšiřovat a znovu používat. Nová obrazovka, popisek etapy nebo větší počet úkolů samy o sobě tyto mezery neuzavřou.

## Pořadí a podmínky milníků

| Milník | Hratelný výsledek, kterým jej přijmeme | Body trackeru |
| --- | --- | --- |
| **0 — spolehlivý výchozí stav** | Vysvětlené dvě testové odchylky z auditu a opakovatelná kontrola jejich příčiny. | [SP-001](ROADMAP.md#sp-001) |
| **A — vlastní tvor a život druhu** | Hráč postaví odlišné tělo, opustí hnízdo, objeví část, vrátí se do editoru, získá přítele do smečky a může postupovat sociálně i bojem. Buněčný začátek učí růst a přestavbu; vlastní výtvor lze použít v další linii. | SP-002 až SP-006, první výstupy SP-007 a SP-017 |
| **B — společnost a planeta** | Aktivní kmenoví sousedé, kulturní výstroj, městská ekonomika a soupeřící státy. Hráč může sjednotit planetu vojensky, obchodem nebo nábožensky; využije pevninu, moře i vzduch. Minulé volby mají konkrétní následky. | SP-007 až SP-010; budovy a vozidla v SP-005; SP-017 |
| **C — první úplný vesmírný okruh** | Vlastní loď odletí z domova do cizí soustavy, získá život, upraví planetu, založí kolonii, prodá její produkci a vrátí se. Stav cizího světa přežije odlet i načtení hry. | První ucelené výstupy SP-011 až SP-013; lodě v SP-005; SP-017 |
| **D — otevřená galaxie** | Rozšiřitelná galaxie, různé říše, obchod, diplomacie i války, vybavení, mise a události vytvářejí důvod pokračovat. Lze dosáhnout jádra a hrát dál. | Dokončení SP-011 až SP-015 a vesmírného dědictví SP-007; SP-017 |
| **E — kapitán a dobrodružství** | Hráč vystoupí jako člen svého druhu, dokončí různé mise, rozvíjí kapitána a vytvoří přenositelnou vlastní misi. | SP-016; dokončení průřezových SP-005 a SP-017 |

Milník C ověřuje první úplnou smyčku; neuzavírá celý vesmírný rozsah. Splnění jednoho dílčího výstupu rovněž neznamená dokončení celé karty. Stav se vede pouze v trackeru, nikoli kopírováním procent sem.

## Nejbližší práce

Výchozí testové odchylky SP-001 už vysvětluje [report opravy a ověření](SP-001-REPORT.md). Aktuální stav jednotlivých bodů zůstává v trackeru.

1. Rozšířit editor podle [implementačního plánu SP-002](../superpowers/plans/2026-09-17-sp-002-creature-editor.md): datový model a kompatibilita uložených her → konstrukce a ovládání → pohyb, animace a zkoušení schopností. Doručovat po funkčních částech od editoru až po pohyb v krajině; stav podúkolů vede tracker.
2. Navázat hnízdy, setkáním s druhem a oběma způsoby interakce v [SP-003](ROADMAP.md#sp-003), potom objevováním částí a smečkou. Knihovnu výtvorů a buněčnou smyčku rozvíjet jako samostatné navazující plány v rámci A.

## Hranice a ověření

- **Tělo, model a schopnosti mají společný zdroj dat.** Rozšíření knihovny musí umožnit, aby NPC používala stejné výtvory jako hráč. Budovy, vozidla a lodě na tento princip navážou.
- **Planeta musí mít identitu a trvalý stav nezávislý na scéně.** Dnešní tři fyzické světy a mapování pozdějších etap na pobřeží vyžadují promyšlené rozšíření, včetně ukládání. Samotné zvýšení čísla etapy nestačí.
- **Dosavadní kampaně musí zůstat načitatelné.** Změny formátu, migrace a přechody do nových pravidel budou výslovnou součástí příslušných plánů; výchozím podkladem jsou [verzované fixtures](../../tests/fixtures/saves/README.md).
- **Vizuál, animace, zvuk a čitelnost patří do každého milníku.** Hráč má rozumět tělu, vztahům a další možnosti z běžného hraní. Vedle automatických kontrol je potřeba průchod přes skutečné UI a po větších milnících také lidský playtest.
- **Měřit zážitek, ne pouze délku a počet testů.** Sledujeme chuť vracet se do editoru, odlišnost strategií, srozumitelnost dalšího cíle a důvod pokračovat. Čekání a vyšší ceny nenahrazují nové možnosti. Zatím nestanovujeme procento podobnosti ani termín dokončení.
- **Místní knihovna před online funkcemi.** Zůstává singleplayer bez povinného backendu či placených služeb. Sdílení souborů výtvorů patří do rozsahu; online katalog a multiplayer nejsou podmínkou těchto milníků. Spore samo osazuje samostatnou hru sdílenými výtvory řízenými AI. [Oficiální FAQ](https://www.spore.com/comm/faq2).

## Jak z briefu pokračovat

[ROADMAP.md](ROADMAP.md) obsahuje všech 17 přijatých bodů, jejich návaznosti, výchozí kód, zdroje a podmínky dokončení. Pro další práci se vybere jedno ID a připraví se konkrétní implementační plán podle [postupu v trackeru](ROADMAP.md#planovani). Tento brief určuje směr; tracker eviduje práci; implementační plány určují přesné změny a ověření.
