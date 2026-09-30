# C2 · cizí soustavy a přenos života

Navazuje na C1 podle nezměněných SP-011/SP-012 a společného [plánu C](2026-09-26-first-space-circuit.md). Tento dokument je implementační plán, nikoli důkaz dokončení. C1 musí mít dokončené finální ověření před integrací C2.

## Ověřitelný výsledek

Vlastní zaplacená loď běžným řízením opustí domácí soustavu, z navigace zvolí dosažitelnou cizí hvězdu, přiletí nad její odlišnou planetu, proskenuje skutečné obyvatele a odebere konkrétní živý exemplář. Zopakovaný odběr stejného ID selže. Hráč náklad vysadí na jiné navštívené planetě, znovu jej najde a odletí domů. Pauza, export/import, checkpoint během skoku i opakovaná návštěva zachovají průběh, domácí větev, skutečné populace a kapacitu.

## Smlouva a závislosti

1. **Adresy a mapa:** samostatný deterministický generátor 1 pro více pojmenovaných soustav. Stabilní namespace je `homePlanet.id`, nikoli měnitelné ID kampaně. Domovský systém ponechá adresu z C1. Mapa ukáže aktuální polohu, domov, vzdálenost, dosah a cenu; nedosažitelný skok vysvětlí. Přístup na cizí povrch je normálním sestupem. Metadata mapy jsou odvoditelná, změněné navštívené planety se ukládají jednou a nikdy neregenerují.
2. **Zpětná kompatibilita:** volitelná verzovaná expediční větev uvnitř `space` v1. Parser C1 saveů nic nevkládá; výslovná aktivace v hlavním UI připraví prázdnou větev také v checkpointu. C1 log, cena lodi, její konstrukce a domácí snapshot zůstanou původní. Rozšířená validace jednoznačně rozliší změnu měřítka od skoku mezi platnými systémovými adresami a ověří energii, uložený průběh i řetězec cest.
3. **Planeta:** samostatný uložený stav s generátorem, klimatem, aktivním časem a konkrétními organismy. Nezastupuje `worlds` ani domácí `planet` v2. Pouze aktivní povrch běží; ostatní světy a lodní náklad jsou výslovně ve stázi. To není offline simulace. Klima, plné potravní řetězce a reprodukce navážou v C3; C2 tyto otevřené části nebude označovat jako hotovou terraformaci.
4. **Organismus a původ:** jedinečné ID v namespace zdrojové planety, původ, taxon, zdraví/výživa, poloha a neměnný vlastní model. Živočich nese `CreatureCreation` odpovídající ekologické roli; jeho tělo se nepřepočítá podle cílového světa. Malá/ střední/velká rostlina používá původní kultury 7/8/6, dva býložravci `bell`/`gnaw`, predátor `crest`. `gloom` nadále představuje symbionta. Zdrojová planeta poskytne dostatek skutečných jedinců pro další C3 bez nekonečného vytváření kopií skenerem.
5. **Sken a náklad:** znalost zůstane oddělená od fyzické instance. Znalost získaná ve vesmíru se ukládá do nové větve; nezapisuje do zmrazeného domácího `journey.ecology`. Sken, odběr a vysazení vyžadují aktivní povrch, dokončený let, dosah, energii a příslušnou kapacitu. Jeden exemplář zabírá jednu jednotku. Odběr atomicky přesune původní instanci do lodi, vysazení ji spotřebuje a ponechá stejnou identitu, tělo, zdraví a výživu. Jedinečnost se kontroluje přes všechny navštívené světy a náklad. Selhání nic neodebere ani nezaplatí.
6. **Prezentace:** více odlišných barevných planet, povrch s rozpoznatelnými rostlinami a skutečnými modely tvorů, čitelný výběr cíle a dosah přenosu. Jeden aktivní detail ve stávajícím rendereru. Kompaktní navigace a náklad jsou dostupné z běžného HUD, nikoli jen diagnostikou. Animace nástrojů i zvuk respektují nastavení.

## Implementace a ověření

Readonly review před implementací zpřesnilo tyto závazky:

- Chybějící expedice zachová původní C1 validaci. Aktivace je idempotentní také při rozpracovaném C1 letu; neodstraní starší log ani checkpoint. Přítomnou nepodporovanou verzi nebo odstranění již aktivované historie proti checkpointu parser odmítne.
- Okamžité energetické platby skenu/odběru/vysazení potřebují vlastní souvislý log s cenou a časem. Existující kontrola energie při stejném čase checkpointu se rozšíří o doložený součet, neuvolní se. Test výslovně uloží ihned po odběru bez simulačního kroku.
- Identita exempláře zahrnuje neměnný původ, taxon a model. Model se uloží jednou v neměnném katalogu původní planety; náklad i cílová planeta na něj odkazují přes původ. I vyprázdněná planeta zůstane uložená. Nová knihovní revize jej nezmění; live a checkpoint mají každý vlastní kontrolu jedinečnosti.
- Nejméně dvě cizí planety budou propojené s domovem základním dosahem18 a obnovitelnou solární energií. I minimální platná C1 loď má sken8, náklad4 a solární obnovu1; C2 nevyžaduje dodatečný díl. Domov není cílem vysazení do zmrazeného ekosystému.

Hlavní vlákno vlastní smlouvy, nové herní moduly, render/UI a integraci. Nezávislý agent může vlastnit pouze nové cílené testy, druhý nativní browser driver, třetí readonly review. Nepřekrývat soubory ani spouštět těžké testy při finálním RAF měření.

Nejdříve determinismus/adresy, odmítnuté a rozpracované skoky, energie a návrat. Poté unikátní přenosy, kapacita, změněné modely, nedostatečný dosah, dvojí kliknutí, export/import a historické C1 savey. Dále odpovídající dosavadní regrese, typecheck a build. Produkční průchod používá výhradně normální UI a RAF nad přesným skutečně odehraným C1 exportem; přípravené unit fixtures se popíší odděleně. Finální snímky prohlédnout, zaznamenat výkon a opakované návraty, uklidit mezisnímky a zachovat malý výsledek i aktivní kampaň.

Po dokončení C2 aktualizovat ROADMAP, PROGRESS a report s přesnými mezemi a pokračovat C3. Celé SP-011 zůstane otevřené pro širší průzkum, vybavení a spojenecký doprovod D. Lidské porozumění a poslech se nepřisuzují automatizovanému testu.
