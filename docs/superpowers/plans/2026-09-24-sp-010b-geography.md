# SP-010.B — implementační plán geografické návaznosti

24. 9. 2026, před implementací, čistý `main` / `93e5f4b91c787275eacd587a710a0023d161e20c`. Přečteny AGENTS, roadmapa, brief, progress, smlouva/report SP-010.A, smlouva SP-007.A a report B1. Disk 22 GiB volných.

## Skutečný výchozí stav

SP-010.A je implementovaná: volitelné homePlanet v1, registr nenulových `worlds[0..2]`, stabilní ID a LocationAddress, aktivace před importním rekey, synchronizace při přechodu/checkpointu. Etapy 2–5 používají tentýž World. `groundHeight` je původní lokální analytický terén; svět obsahuje entity, patche, překážky a RNG. `planet` je lokální terraformace. Žádná globální geografie dosud neexistuje.

## Rozhodnutí a rozhraní

- Nejmenší úplný atlas: sféra, equirektangulární rastr 72×36 (5°), sever nahoře, délka periodická. Obvod rovníku 36 km, poloměr 18000/π m. Hrubá buňka 500 m na rovníku; nejde o nový detailní World.
- Čistý verzovaný generátor kontinenty/oceány, výška v metrech, výchozí zeměpisné teplotní/vlhkostní pásy a biomy. Žádné čtení/zápis simulačního RNG. Souvislé regiony s deterministickými ID, dotaz na buňku a sousedy pro budoucí navigaci/města.
- `HomePlanet` v2 přidá kompaktní recept `{generator:1, seed, provenance:birth|legacy-assigned}`. Recept, nikoli cache či druhá kopie světa, se ukládá. Semantika generator 1 je neměnná; její změna vyžaduje migraci. Stávající v1 zůstává validní při parsování; UI aktivace výslovně povýší v1→v2 včetně checkpointu. Absence v parseru zůstává absencí.
- Habitaty mají deterministické kotvy ve společném pobřežním regionu: pobřeží na pevnině, útes a mikrosvět v přilehlé mělčině. Vazba vzniká jen pro existující svět; rezervovaná poloha v receptu není návštěva ani nová scéna.
- Místní `LocationAddress` beze změny. Explicitní převod do nové `GeographicAddress` a zpět přes kotvu, orientaci +X východ / +Z jih, metry na místní jednotku: mikrosvět 0,001; útes 0,1; pobřeží 1. Místní Y se převádí samostatně vůči výškovému datu kotvy. Zpětný převod musí ležet v původních mezích. Lokální World/groundHeight nadále autoritativní pro detail, průchodnost i stavbu; hrubý atlas je regionální kontext, ne přepsání místního terénu.
- Přehled v existujícím deníku J: společná mapa pevnin/vody/biomů, aktuální domovský region a detail habitatů s číselnými značkami i textem, souřadnice/rozměry, původ geografie, žádné vymyšlené objevy. Běžná klávesnice a návrat do hry, rozumná velikost v 1024×720. Žádná globální ovladatelná kamera/cestování.

## Pořadí realizace

1. `src/game/planet-geography.ts`: čistý generátor, omezená neměnná cache, regiony, dotazy, transformace; `home-planet.ts`: verze a explicitní aktivace/migrace.
2. `persistence.ts`: přesné verze/klíče/seed/původ a checkpointová konzistence; `simulation.ts`: pouze původ nové geografie při narození.
3. `src/ui/home-planet.ts`, CSS: čitelný atlas ze stejného API; původní HUD/přechody zachovat.
4. Trvalé regrese a produkční browser scénář, celý suite, typecheck/build. Nezávislé review dokončené změny subagentem, opravy a relevantní opakování kontrol.
5. Aktualizovat smlouvu, roadmapu, progress a verzovaný report s přesnými důkazy/mezerami; úklid pouze vlastních artefaktů.

## Kritéria dokončení a ověření

- Více seedů: determinismus po obnově cache/importu, odlišnost seedů, kontinenty i oceány, platné biomy/regiony, pobřežní vazby, sférický šev a hranice, převody adres včetně neplatných/cizích/mimo habitat.
- Všech 11 byte-identických historických fixtures: parser bez aktivace zachová staré chování, opakovaná absence/v1→v2 aktivace mění pouze homePlanet i v checkpointu; nefalšuje historii, zdroje ani svět. Přítomná poškozená data odmítnout. v1 s neznámými poli neopravovat potichu.
- Stávající testy A ověří všech šest etap (120 kroků parity), obě organismové brány, pozdější přechody/P0, ID, NPC, B1, save/load/export/import/rekey a starší checkpoint. Přidat geografickou stabilitu těchto operací a důkaz proti v1.
- Produkční browser: nová linie, pohyb, deník, atlas, běžný save/export/import/load; původní historické vstupy a přiznané připravené brány/death checkpoint, pozdější etapy. Žádné přepisy live stavu, localStorage ani zrychlování času. Prohlédnout konečné snímky i menší rozlišení, zkontrolovat chyby a odezvu otevření.
- Původní skill klient použít se skutečným časem (adaptér jen pro Chrome a vypnutí jeho časové pomůcky). Malé finální logy/snímky a aktivní save zachovat; žádné dlouhé trace. Testové limity/hashe neoslabovat.

## Hranice

B uzavře druhé kritérium SP-010 (regionální geografický základ a zasazení habitatů). SP-010.C, SP-009, SP-007.B2/D a celá SP-017 otevřené. Bez městské ekonomiky, cizích scén, streamování detailního terénu, dálkových návratů či vesmíru. Bez commitu, pushe a deploye.

## Doložení dokončení

Realizováno a ověřeno podle [reportu SP-010.B](../../spore/SP-010B-REPORT.md): 63 nových regresí, 2 759 testů celé sady, typecheck/build, 12 skupin produkčního browseru a nezávislé review. Přesný regionální rozsah a pokračování C jsou uvedené v reportu.
