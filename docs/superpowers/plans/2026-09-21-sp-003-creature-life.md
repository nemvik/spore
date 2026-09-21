# SP-003 — život druhu a tvorová fáze

Zadání: „udělej bod 1“ — SP-003 podle doporučeného pořadí a trackeru. Výchozí revize `063ef9cfd`. SP-002 a sloučení nápovědy jsou dokončené; lokální změna AGENTS.md patří uživateli.

## Výsledek a hranice

Nová linie na souši získá vlastní hnízdo a čtyři sousední druhy. Hráč volí sociální nebo bojová setkání podle stavby těla, získá skutečné společníky a rozvíjí inteligenci. Tři vyřešené vztahy umožní přejít do kmene přátelstvím, predací nebo smíšeně. Dosavadní ekologické řešení zůstane dostupné. Staré kampaně se nezapnou do nových pravidel automaticky.

Odemykání částí/generace SP-004, sdílené genomy cizích NPC/knihovna SP-005 a nové dědictví pozdějších etap SP-007 nejsou součástí této změny. Výsledek tvorové cesty se uloží samostatně; současné tři archetypy pozdější hry zachovají kompatibilní mapování.

## Postup

1. **SP-003.1 — hnízda a vztahy.** Volitelný verzovaný řez `creatureStage`, explicitně zapnutý při založení nové linie; deterministické založení na souši, obyvatelé ve skutečném světě, striktní validace a zachování checkpointů. Nové soubory `creature-stage-types.ts`, `creature-stage.ts`, návaznost na `types.ts`, `simulation.ts`, `persistence.ts`.
2. **SP-003.2 — setkání.** Zpěv, tanec, okouzlení, póza; kousnutí, výpad, úder, plivnutí. Dostupnost a výkon odvozené z genomu, dosah a kryt, energie a obnovy; čitelná výzva/reakce, obrana hnízda a přerušení setkání. UI ovládání myší i klávesnicí, nápověda a stavový výstup.
3. **SP-003.3 — smečka a postup.** Nábor z přátelského hnízda, kapacita podle dosažených výsledků, pohyb s kolizemi a účast v setkání. Ztráta/odchod člena, konečné odměny a tři cesty dokončení. Zachovat ekologii i přechod do kmene.
4. **SP-017 / A.** Viditelná hnízda, barva vztahů, reakce a ukazatele setkání, vlastní druh u hnízda, stručné akční ovládání, zvuková odezva.

## Přijetí

- Hnízda, vztahy a rozběhnuté setkání přežijí save/load; poškozený nový řez se odmítne, historické fixtures projdou beze změny pravidel.
- Čtyři sociální a čtyři bojové akce mají dostupnost z těla a prokazatelně odlišné účinky. Nedostatek energie, vzdálenost, překážka, cooldown a mrtvý cíl nemohou udělit odměnu.
- Výprava dvěma odlišnými těly doloží sociální, bojovou a smíšenou cestu; společník fyzicky následuje a pomáhá, opakované vyřešení neprodukuje neomezenou DNA/inteligenci.
- Nativní browser vstupy doloží průchod, import/export a čitelnost finálních snímků. Připravený vstup na souši bude označen jako připravený, nikoli jako odehraná nová kampaň.
- Cílené regrese, celá unit sada, typecheck, build; nezávislé review dat a přechodů. Výkon/artefakty zkontrolovat, ponechat pouze malou finální evidenci. Lidský playtest nelze nahradit agentovým browser průchodem.

## Rizika

Oddělit obyvatele hnízd a smečku od dosavadních dvou NPC smyček, aby nedostali dva pohyby či útoky v jednom kroku. Změny vztahů provázat i s běžným kousnutím a toxinem. Nová pole nesmějí změnit historické otisky. Ukládání musí kontrolovat vazby ID na druhy a maximální počty; žádná regenerace historického světa při importu.

## Ověření

Průběžné výsledky a konečné meze budou zapsané v `docs/spore/SP-003-REPORT.md` a `PROGRESS.md`.
