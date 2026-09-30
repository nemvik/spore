# C3b · první kolonie a návratný obchod

Navazuje na klimatické C3a1 a dokončovanou živou ekologii C3a2. Tento dokument je plán, nikoli hotové kritérium. Zůstávají všechna původní kritéria SP-013 i rozsah říší/expanze v D.

## Ověřitelný hratelný výsledek

Hráč v domácí dílně převede skutečný jantar do prázdného vesmírného účtu, přistane na vlastním stabilizovaném světě, zaplatí trvalou kolonii a počká na její skutečnou výrobu. Produkci přemístí do omezeného lodního nákladu, doveze na jiný trh, prodá za konkrétní místní cenu a použije část výnosu na další výpravu. Kolonie umí účtovaně opravit/dobít vlastní loď. Celý okruh musí přežít save/import/checkpoint a návrat domů.

## Smlouvy před implementací

- Nová volitelná verzovaná větev pod `space` začne bez prostředků a kolonií. Aktivace je explicitní pro live i checkpoint. Historické C1/C2/C3a1 savey zůstanou při pouhém parsování přesné. Převod doma strhne skutečný domácí zdroj a připíše stejnou částku; přímé placení zahraniční kolonie z domácí zmrazené pokladny není dovoleno.
- Vesmírný účet uchová kumulativní vklady, tržby a útraty plus omezené akční doklady. Zůstatek je jejich přesný rozdíl. Přeprava má skutečnou zásobu podle druhu suroviny, není nahrazena čítačem prodeje. Kapacita vychází z placené konstrukce a sdílí místa s živým nákladem.
- První kolonie stojí40 vesmírných jednotek, domácí převod probíhá po20 bez konverzního zisku. Každý stabilní pás dovolí jednu úroveň místní kapacity; produkční rychlost a sklad mají viditelný omezený strop. Vyšší úroveň nepřidává zdroje zpětně. Ceny oprav/dobití budou konkrétní před potvrzením, účinek je omezen skutečným chybějícím zdravím/energií.
- Místní surovina je deterministická podle planetární adresy. Tři původní druhy jantaru/pryskyřice mohou plnit obchodní roli koření; místní cena rozlišuje typ i cíl. Jméno, barva a cena musí být vidět před naložením i prodejem. První trh není vydáván za celou hotovou říši s diplomacií.
- Produkce musí mít vlastní vysvětlitelný účet vyrobeno→sklad→náklad→prodáno a strop. Žádný výnos z reálného času mimo spuštěnou hru. Během odletu ekologické planety i náklad zůstávají ve stázi; výroba kolonií smí pokračovat podle jejich poslední skutečné stability v běžném herním čase. Přesný zdroj tohoto hospodářského času se před implementací sjednotí s domácím a vesmírným stepem, aby se nesimuloval dvakrát.
- Ztráta stabilních pásů okamžitě omezí produkci/kapacitu. Nesmaže zaplacenou kolonii, minulou výrobu, inventář ani obchodní historii. Obnova života ji může znovu uvést do provozu.
- Všechny akce budou synchronní s čerstvou kontrolou polohy, návštěvy, vlastnictví, kapacity a peněz. Dvojí kliknutí nesmí zopakovat nákup stejné kolonie. UI ukáže důvod neproveditelnosti a opravitelné pokračování.

## Implementace a ověření

1. Datová větev/aktivace, ceny, převod a fyzický náklad s unit/save/checkpoint regresí; hlavní vlákno vlastní smlouvy.
2. Založení, výroba, sklad a servis; opakovatelná ekologická ztráta/obnova bez vymazání historie.
3. Trhy, příjem z dopravy a přehled účtu; místní model kolonie, srozumitelný HUD, zvuk skutečných transakcí.
4. Nezávislé review, typecheck/build a relevantní regrese. Native pokračování z přesného skutečného A2 exportu, výchozí domácí prostředky nepřepisovat. Doložit konkrétní platby, dopravu, návrat a další využití výdělku; varianty a lidský poslech oddělit.

Území říší, osobnosti, smlouvy, koupě soustav, války, obrana a diplomatické důsledky jsou navazující D. Tato část je neoznačí za splněné pouze existencí trhu.

## Ověřená místa integrace

Readonly audit aktuálního kódu: hospodářský krok patří do `simulation.step`. Ve vesmírné větvi až po `stepSpace`, s právě uplynulým rozdílem `space.elapsed`; doma v etapě5 po `stepPlanet` a před případným checkpointem. Produkce tak používá čerstvou stabilitu, běží i při letu, nevstupuje dvakrát do jednoho kroku a neprobíhá v menu/pauze/offline. Nezasahuje do zmrazené domácí větve během letu.

Aktuální součet zboží a živého nákladu nesmí přesáhnout konstrukční kapacitu. Historický C2/ekologický rewind si však musí ponechat plnou konstrukční kapacitu: dnešní zboží nesmí zpětně zmenšit loď, která dříve legálně nesla živé exempláře. Ekonomické naložení/prodej uloží `lifeAction = expedition.nextAction` v okamžiku akce. To určuje pozici před odpovídající biologickou akcí i při shodném čase; vlastní ekonomický serial určuje pořadí dalších ekonomických akcí na témže místě. Úplný checkpoint suffix dovolí sloučit oba proudy a ověřit všechny mezilehlé kapacity. Neúplný suffix má kumulativní meze a není vydáván za úplný replay.

První účet používá `activated.spaceAt` a `activated.planetAt`: domácí planetární etapa zvyšuje `planet.elapsed`, nikoli `machines.elapsed`. Po kroku se převezme skutečný přírůstek příslušného času. Kumulativní účinky oprav a dobíjení se ukládají vedle plateb, aby okamžitá akce zůstala porovnatelná s checkpointem. Novorozený predátor může do prvního lovu a nového ustálení krátce pozastavit výrobu; osada a zásoby zůstávají.
