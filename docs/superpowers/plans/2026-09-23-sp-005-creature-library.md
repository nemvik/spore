# SP-005.A — knihovna tvorů a společný genom NPC

Zadání 23. 9. 2026: samostatné ukládání, import/export a vlastní dřívější tvorové jako NPC. Navazuje na existující necommitnuté SP-004; zachovat jejich změny. Rozsah je část A, přenos budov/vozidel/lodí/dobrodružství čeká na příslušné editory.

## Úspěšný průchod

Uložit tělo z kampaně do samostatné knihovny, zobrazit metadata/náhled, upravit jeho kopii ve stávajícím 3D editoru, exportovat a importovat verzovaný soubor. Nová linie vybere kompatibilní dřívější tvory do ekologických rolí souše. Jejich tělo a chování vychází ze stejného genomu a přetrvají po exportu/importu kampaně bez lokální knihovny. Vadný import ani selhání úložiště nesmí změnit platná data.

## Implementace

1. `src/game/creature-library.ts`: striktní verzovaný formát, omezené velikosti, identity/revize, metadata, atomický zápis localStorage, bezpečné kolize importu a aktualizace.
2. `src/game/npc-genome.ts`: deterministický výběr podle potravy a role, platné generované náhrady, odvozené schopnosti. Volitelný katalog čtyř druhů ve `World` je snapshot nové linie; staré kampaně beze změny.
3. `world.ts`, `simulation.ts`, `persistence.ts`: vznik snapshotu, validace a checkpointy. Pouze genom je autoritativní, odvozené hodnoty se neukládají.
4. Renderer a NPC pohyb/boj/sociální reakce využijí společný model a anatomii. UI knihovny v menu a pauze, ukládání rozehraného tvora, samostatný editor bez spotřeby DNA a bez změny kampaně. Náhled a čitelnost patří do SP-017.A.
5. Jednotkové regrese formátu/kolizí/selhání, výběru a save kompatibility; cílený browser průchod přes skutečné UI, původní skill klient, celá sada a build. Vlastní a nezávislé review importních/datových hran.

## Omezení a rizika

Knihovna lokálně na zařízení; JSON lze přenést ručně. Přenos do aktivního hráčova těla není součástí zadání (neobchází DNA a objevy). Ekologická role zůstává rolí pevného slotu světa; uživatelský genom musí splňovat požadavky slotu. Neplatná či vodní těla lze uchovat v knihovně, ale nemohou osídlit souš. Browser scénář z připraveného začátku souše bude výslovně odlišen od celé odehrané kampaně.

## Výsledek

Dokončeno podle [reportu](../../spore/SP-005-REPORT.md): 39 nových regresí, 2 241 testů celkem, typecheck/build, produkční nativní UI a nezávislé review včetně oprav. Naplněny první tři podmínky SP-005 pro část A. Další typy výtvorů zůstávají pojmenované v trackeru.
