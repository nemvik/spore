# SP-004 — objevování a generace

Pracovní strom nad aktuálním HEAD, 23. 9. 2026. Rozsah celé karty SP-004 a související čitelnost SP-017.

## Cílový průchod a kritéria

Výprava z vlastního hnízda → průzkum viditelných kosterních pozůstatků → odemčená konstrukční část s původem → přátelství a skutečná sociální pomoc smečky → návrat do editoru → použití části v nové generaci → doprovod vlastního druhu do objeveného místa a přesun hnízda. Export/import zachová katalog, generaci, vztahy i rozpracovanou migraci.

## Rozhodnutí z průzkumu

- Navázat na existující tvorovou fázi, editor a generace. Samostatný modul `creature-discovery.ts` spravuje trvalý katalog a životní události; nejde o další měnu ani druhý genom.
- Volitelná verzovaná větev tvorové fáze se zapíná pouze pro novou UI linii. Historické kampaně a fixtures si ponechávají stávající pravidla. Formát kampaně zůstává v3; parser přesně ověřuje nová pole včetně checkpointů.
- Na souši oddělit objevení vybraných funkčních adaptací od ceny DNA. Orgány použité v předchozích etapách jsou zděděné. Základní ústa, pohyb a dýchání se nezamykají.
- Kosterní pozůstatky a první výsledky setkání přinášejí jednorázové části. Jeden alfa obyvatel má vyšší zdraví, sílu i náročnost sociálního setkání a čitelné označení; přátelství i porážka dávají odměnu.
- Reprodukce využije existující potvrzení editoru, zapíše použití objevů a ukáže novou generaci. Během migrace/setkání a po smrti není dostupná.
- Migrace je dobrovolný přesun k prozkoumanému místu po první generaci na souši. Hráč vede příslušníky vlastního druhu; hnízdo se přesune až po jejich příchodu a potvrzení. Ekologická migrace v `migration.ts` zůstává samostatnou dosavadní mechanikou.

## Postup a rozhraní

1. Katalog, pozůstatky, alfa, generace a migrace: typy + nový herní modul, integrace `creature-stage.ts`, `simulation.ts`, `journey-evolution.ts`.
2. Striktní persistence a regresní testy starých i nových kampaní; stav neúspěšných akcí se nemění.
3. UI objevů a původu v obou editorech, akce v přehledu druhu, mapa a geometrie pozůstatků/karavany/alfa. Žádná nová závislost.
4. Cílené testy → celá sada/typecheck/build → běžný browser průchod z přiznané připravené souše, nativní export/import, prohlédnutí snímků a původní skill klient.
5. Vlastní i nezávislá kontrola změn ukládání, úklid vlastních artefaktů a report; tracker zaškrtne pouze doložená kritéria.

## Hrany a meze

Opakovaný průzkum/setkání nezdvojuje odměnu. Zamčené části nelze obejít presety ani potvrzením genomu. Cancel editoru nevytváří generaci. Import odmítne neznámé části, duplicitní objevy, poškozené pozice, nesoulad generací a neplatnou migraci. Přechod ke kmeni zachová historii. Automatický browser nedokládá lidské porozumění ani vyvážení celé kampaně.
