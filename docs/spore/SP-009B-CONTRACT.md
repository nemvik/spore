# SP-009.B — místní ekonomika, smlouva v1

Navazuje na skutečnou A `c1b2c75b6`. Obálka kampaně v3, HomePlanet v3, atlasový generator 1, detailGenerator 1 a `City.local.version=1` zůstávají. **CityRegistry v2** přidává každému městu `economy: null | CityEconomy`. Parser stále přijímá v1 bez tohoto pole. `enableCities` výslovně migruje live i checkpoint před rekey; null znamená dosud neotevřené hospodářství, nikoli nula známých minulých obyvatel. Žádný čas, budova, obyvatel nebo příjem migrací nevzniká. Založení A a všechna stabilní ID/adresy/vlastnictví jsou nedotčené.

## Prostředky, populace a provozy

Hráč otevře hospodářství **převodem 80 jantaru** z `machines.resource` do nové místní pokladny. Není to grant ani další příjem, celkový jantar se nezmění. Potom může jedním potvrzením převést dalších 20. Stavby a provoz používají pouze místní pokladnu; produkce zůstává v tomto městě. Původní prameny vydělávají jen při hraní domova podle C/B1. B1 nepřidává městský násobek, město nepřepisuje původní sazby a nemá zpětnou odměnu.

| Akce / provoz | Jednorázová cena (jantar) | Údržba za cyklus | Kapacita / práce / účinek |
| --- | --- | --- | --- |
| Obydlí | 20 | 1 | 4 místa; nelze vypnout nebo zbourat obsazenou kapacitu |
| Pěstírna | 16 | 1 | 2 pracovníci; 6 porcí za cyklus |
| Dílna | 24 | 2 | 2 pracovníci; podlaha(8 × spokojenost / 100) jantaru za cyklus |
| Zahrada odpočinku | 18 | 1 | 1 pracovník; +15 spokojenosti obydlím do 20 místních jednotek |
| Pozvat 2 obyvatele | 8 | — | Dvě volná místa; 4 porce příjezdových zásob v ceně |
| Nouzové zásoby | 10 | — | 20 porcí, pouze pokud se vejdou do skladu |

Obyvatelé jsou **nově pozvaní civilní osadníci vlastní linie**, agregovaná hospodářská populace s trvalými lokálními ID a dokladem placeného příchodu. Nejde o přesun/kopii kmenových členů, historický sčítaný lid, narození během nepřítomnosti ani novou bojovou jednotku. Nemají vlastní autonomní fyziologii; každý spotřebuje 1 porci za cyklus. Neodcházejí/nenarodí se sami; hlad snižuje výrobu, neopakuje nábor. Nejvýše 32 obyvatel a 16 budov/město, sklad 120 porcí.

Pracovníky přiděluje skutečný počet obyvatel: nejprve pěstírny, pak dílny, pak zahrady; uvnitř druhu podle ID. Jen celé osádky. Údržbu platí všechny zapnuté stavby včetně neobsazených. Před cyklem musí být v pokladně celá částka; jinak **žádná údržba ani produkce**, lidé spotřebují dostupné jídlo, bez dluhu. Vypnutí nepotřebného provozu je zdarma. Demolice má nulovou vratku. Obnova: vypnout zbytečné provozy nebo se vrátit k vlastním pramenům, vydělat a převést 20; lze koupit potraviny. Žádné automatické dotace.

Spokojenost 0–100: základ 60; jídlo pro všechny +20, nedostatek −30; všichni zaměstnaní +10, jinak −10; zaplacená údržba 0, nezaplacená −20. Za každou obsazenou dílnu do 16 jednotek od obydlí −10 (nejvýše −30); za obsazenou zahradu do 20 +15 (nejvýše +30). Pro dílny i odpočinek se samostatně vypočte průměr účinků přes existující obydlí a zaokrouhlí na celé body; součet všech příčin se ořízne na 0–100. Bez obyvatel spokojenost 0 a žádná produkce. Výhled se odvozuje ze skutečných budov, peněz, zásob a pracovníků, poslední výsledek zůstává samostatný účetní záznam. Pěstírny nejprve vyrobí, lidé potom jedí; přebytek nad sklad propadne a je uveden ve výsledku.

## Čas, transakce a účetnictví

Cyklus = **10 sekund aktivního místního hraní**. Simulace přijímá původní omezené dt (nejvýše 1/30 s); místní `elapsed` je počet sekund rozehraného cyklu v intervalu [0, 10), `cycle` počet dokončených cyklů. Celkový odehraný hospodářský čas je `10 × cycle + elapsed`. Zbytek do příštího cyklu se ukládá. Otevření začíná přesně nulou bez použití dosavadního field.world.time. Pauza/menu/editor/skrytý tab stojí podle původních UI hodin; globální atlas, domov a jiné lokality město netickují. Žádné datum posledního přihlášení, catch-up nebo offline výnos.

Každý městský příkaz nese očekávanou `revision`; potvrzená změna ji jednou zvýší. Stejná potvrzovací událost se znovu odmítne. Kontrola kontextu, limitů, místa a peněz předchází synchronnímu odečtení/vložení. Revize se nemění samotným cyklem; změna disponibilních peněz se při potvrzení kontroluje znovu. UI předem ukáže konkrétní cenu a účinek; zavření návrhu nic neplatí. Cyklus zaúčtuje výdaje i výrobu jednou a zvýší `cycle`.

Ekonomika v1 ukládá otevření `{source:'player',tick,transferredAmber:80}`, revizi, elapsed/cycle, treasury/food, monotónní nextId, budovy `{id,kind,lot,enabled,paidAmber}`, příchody `{id,source:'invited',cycle,paidAmber:4}`, součty transfers/construction/immigration/supplies/income/upkeep/produced/consumed/discarded a poslední výsledek cyklu. Peníze jsou celočíselný jantar v místní pokladně (původní domovská zásoba může být desetinná); porce a obyvatelé celé jednotky. Platí `treasury = transfers + income − construction − immigration − supplies − upkeep`; jídlo = placené příjezdové/nouzové zásoby + produced − consumed − discarded. Součty zahrnují zbourané stavby, které nemají vratku. Není to kryptografický účetní doklad proti ručnímu přepsání celého singleplayer save.

## Prostor a obnova

Budovy používají očíslované místní parcely podle adresy (mřížka 8 jednotek, do 40 od náměstí). Jen skutečně průchozí, rovný nadvodní povrch uvnitř hranice, bez kolize s dekoracemi, stanovišti, radnicí či náměstím. Ochranný odstup závisí na skutečném těle a udržuje průchod mezi stavbami. Přímá cesta mezi náměstím a příchodem zůstává bez nových staveb. Každá parcela znovu projde kontrolou při platbě a importu. Uložená poloha hráče musí být bezpečná. Overlay nemění neměnný generovaný World, atlas, původní worlds, organismus, jednotky, historii/B1 ani `GameState.planet`.

Přísný parser kontroluje verze, přesné klíče, konečná čísla, ID, ceny, kapacity, účetní rovnosti, geometrické reference a bezpečný příchod. Checkpoint může mít méně rozvoje i neotevřenou ekonomiku stejného města; společná identita/založení/adresa/layout musejí souhlasit. Obnova nahrazuje celou větev včetně obou pokladen, populace, zásob a času. Import vytváří jiný ukládací slot se stejnou identitou linie; žádné slučování ani připisování rozdílů. Starší aplikace nové registry v2 nepřečte. Save limit zůstává 8 MiB. Účetní součty mají mez 10¹², revize/ID 10⁹ a městský čas 10⁷ cyklů (přes tři roky aktivního hraní). Při dosažení limitu se nové hospodaření zastaví; nejde o změnu původních limitů.

Celé SP-009/SP-010/SP-017 zůstávají otevřené. Vzhledový editor/knihovna, obrana/státy/převzetí/konverze/moře/vesmír ani SP-007.B2/D nejsou tímto modelem implementované.
