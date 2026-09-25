# SP-009.I — omezená námořní expanze · smlouva v1

Plán před implementací, nad 907dd49fd. Nové volitelné `GameState.maritime` v1;
nový námořní konstrukční formát v2 rozšiřuje původní blueprintovou architekturu.
Původní VehicleBlueprint v1 tank/air, Machines v2, HomePlanet v3, oba generátory 1,
CityRegistry v8, States v4, Military v2 a obálka save v3 zůstávají ve svém významu.

## Plavidlo a účetnictví

Jeden expediční člun: trup 16 + kabina 8 + lodní šroub 32 = **56 jantaru**.
Pevná první konstrukce, bez knihovny či rozsáhlého editoru. Používá původní
konstrukční díly, výpočet ceny/odolnosti a renderer stroje. Jediná instance
námořního nosiče žije v maritime; není kopií pozemní fleet. Původní tanky/letouny
se nepřenášejí. Cestující je tentýž výpravový avatar linie, nikoli noví občané.
Jedna platba z machines.resource do spotřeby s before/amount/after a původním
pramenem. Nikdo nepřijímá cenu. Bez vratky, prodeje, opravy či provozní dotace.
Další použití zaplaceného člunu stojí 0; cesta nedává odměnu nebo vlastnictví.

## Pobřeží, výběr a cesta

Pobřeží = pevninská buňka B s hranově sousední vodou. Nástup je strategické
rozhraní pobřežní buňky z atlasu, nikoli nová pláž ve středu původního detailu C.
Nákup je doma ve strojové etapě s dokončeným kmenem a vlastním pramenem.
Loď začíná na domácím pobřeží. Výběr cíle nic neplatí ani nepřesouvá.
Výslovné potvrzení nástupu a vyplutí vyžaduje aktuální pobřeží shodné s kotvištěm.
BFS přes hrany, vnitřní buňky výhradně voda, nejméně jedna vodní buňka;
počáteční a cílová buňka odlišné pobřežní pevniny. Póly/šev podle původního B.
Rezervované habitaty dovolují pouze domácí pobřeží, nikdy vstup do jiné etapy.
Cíl musí mít prostor v původním limitu 64 detailů a nepřátelské město je odmítnuté.

Trasa se uloží při příkazu, 1 aktivní sekunda/hranu (strategická časová komprese,
nikoli tvrzení o fyzické rychlosti lokálního stroje). Průběh není výběr/teleport.
Na konci hráč výslovně přistane. Návrat volí novou skutečnou plavbu téhož člunu.
Přerušení na moři obrátí po již projeté části; návrat zabere právě projetý čas.
Zaplacený člun i avatar zůstanou spolu. Po přistání člun kotví na cíli; avatar
může chodit po místním detailu, měřit a založit město podle A za 60 z domova.

## Souběh, přístup a hodiny

Původní C volné výpravy se v aktivní maritime v1 omezují na pevninskou souvislost
s aktuální pevninou. Historické detaily při migraci tvoří explicitní seznam
zachovaného přístupu (bez tvrzení o námořní minulosti). Nová zámořská místa se
neodemykají navždy zdarma samotným přistáním. Návrat domů zdarma vyžaduje
stejný kontinent nebo historické přístupové místo; jinak je potřeba loď.
Během plavby jsou všechny místní vstupy/návraty/přechody/akce odmítnuté.
Hráčské nasazení blokuje každé vyplutí. Nedořešený F výpad blokuje nové výpravy,
ale dovoluje návrat avatara z jiného pobřeží přímo domů: později vzniklý výpad
nesmí odříznout hráče na zámořském cíli. Výpad pokračuje původními hodinami. Opačně
námořní cesta blokuje nové nasazení a převzetí. Žádné vojenské pasažéry.
Příkaz nese revision, zdroj, cíl a identitu prostředku; potvrzení vše přepočítá
před synchronní mutací. Dokončení/přerušení mění revision a druhý příkaz odmítne.

Na moři běží pouze námořní čas a původní strategický čas D, žádný domácí tick,
World/RNG, příjem pramenů nebo místní ekonomika. Žádná aktivní místní lokalita
se během plavby nesimuluje. Pauza/editor/knihovna/globál/skrytý tab a smrt stojí.
Save/load zachová postup; žádný wall clock/offline catch-up. Smrt nic nevrací
ani neničí zvláštní akcí: obnova nahradí celou konzistentní checkpointovou větev.

## Persistence

maritime v1 ukládá zachované historické přístupy, revision, jediný zaplacený
prostředek (konstrukce/instance/platba/kotviště) a nejvýše 128 cest s monotónním ID,
zdrojem/cílem/trasou, časem a stavem. Poslední může být aktivní. Účetní doklad
nákupu má jedinou autoritu. Všechny hodnoty konečné, přesné klíče, route ověřená
proti atlasu, konzistentní kotviště, fáze, cestující a skutečné návštěvy.

Explicitní enableMaritime nejprve H, poté prázdná námořní data v live i checkpointu
před rekey. Každá větev dostane seznam vlastních historicky existujících míst; checkpoint
nesmí získat přístupy z budoucí živé větve. Seznam
nezapisuje plavbu, loď, peníze ani návštěvu. Opakování nemění ani checkpoint string.
Parser nic nemigruje. Checkpointový deník je společný prefix; rozpracovaná cesta
nesmí předbíhat živý stav. Obnova vrátí celé finance, prostředek, fázi, světy,
vlastníky a E/F/G/H, neslučuje ani nepřidává vratku. Limit save 8 MiB zůstává.

SP-017: cena/zdroj, konkrétní plavidlo, obě pobřeží, vodní trasa, postup,
pozastavení/přerušení/výsledek, důvody odmítnutí, kamera, klávesnice, fokus a 1024×640.
Celé mateřské karty a SP-007.B2/D zůstávají otevřené.

Limit 128 cest rezervuje poslední záznam pouze pro návrat domů. Tento poslední
návrat nelze znovu obrátit; UI důvod uvede. Limity nejsou obnovitelná měna.
