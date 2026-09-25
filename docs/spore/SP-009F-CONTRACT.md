# SP-009.F — obrana, protiútok a opakované převzetí · smlouva v1

Navazuje na E `e4c340c91`. Nové CityRegistry **v6**, States **v3**, Military **v2**.
Historické formáty zůstávají čitelné. `enableDefense` výslovně aktivuje E a potom F
v live i checkpointu před rekey. Parser nemigruje. F přidá prázdné `transfers`,
plnou odolnost již zaplacené radnice `fortification:80` a prázdné `raids`;
nevymýšlí útok, poškození, platbu, jednotku nebo změnu vlastníka. Původní E `capture`
a `defense` jsou zachované, nikoli přepsané novou historií. Rozpracované E obsazování se v obou větvích explicitně přeruší (`stop`, hold 0):
nová odolnost náměstí vyžaduje nový rozkaz. Hotové E doklady se nemění.
Opakování je beze změny.

## Autority a finance

Hráč: jediná autorita `machines.fleet`, původní placená výroba/oprava doma.
Jeden nasazený původní tank podle E, nyní i do vlastního města. Běžná návštěva
jednotku nepřenáší. Náklad 0, dělo, obal ≤4, živý stroj u dílny a pevninská trasa.
Soupeř: nejvýše jeden doložený výpad na stát v tomto omezeném rozsahu. `Military.raids`
je jediná autorita jeho nově zakoupeného tanku; obsahuje původní konstrukci stráže,
identitu státní transakce, zdrojové/cílové město, původní MachineUnit s navigací,
trasu, fázi, zbývající čas, bojový čas a obsazování. Nekopíruje hráčovu flotilu.
Původní stacionární E stráže zůstávají na svých místech nebo jako vraky.

Strategické rozhodnutí při aktivním tahu 4. etapy vybere vlastní zdrojové město
a dosažitelné vlastní ztracené město držené hráčem, poté nejkratší trasu/ID.
Tento rozsah útočí pouze v reakci na doloženou ztrátu vlastního území.
Žádné město znamená porážku a odmítnutí. Jeden již zaplacený výpad znamená odmítnutí
náhrady; nedostatek 40, plný deník či chybějící trasa rovněž žádný odečet.
Platba **vehicleCost(defenseDesign()) = 40** z původní rezervy D vytvoří jednotku
společně s jedním dokladem `raid`. Žádný strategický příjem nebo zpětný vojenský nákup.
Městské pokladny nejsou zdrojem této platby. Skutečný E vstup má obě rezervy 40.

## Čas, doprava, střet

Příprava 15 s a doprava 5 s/pevninská hrana postupují jen při aktivním místním
hraní; používají stejný omezený simulační krok jako D. UI ukazuje zdroj, cíl, cenu,
trasu a fázi. Při dokončení dopravy mimo cíl jednotka čeká na místní bojiště;
žádný boj, obsazení ani příjem na dálku. Následující místní boj běží pouze při
navštíveném cíli. Pauza, editor, knihovna, skrytý tab a globál nic neposouvají.
B místní ekonomika, C zmrazení domova a D strategický čas zůstávají samostatné.

Přepravovaný tank se objeví jen na explicitním bezpečném vstupu cíle po dokončení
cesty. Dvojice vstupů je deterministicky natočená mimo původní terén a radnici; nová
výstavba jejich obaly rezervuje. Starší budovy migrace neodstraní ani nezneplatní;
pokud příjezd blokují, nabídka odmítne výpad/nasazení ještě před platbou. Obsazený vstup odloží skutečný příjezd do jeho uvolnění; tanky se nepřekryjí.
Odtud opravdu jede společným moveUnit s obalem tankRadius přes celý graf
překážek. Dělo sdílí machineShot: dosah 12, průhledná úsečka, 2×power / 1,2 s.
Priorita cíle soupeře je živý nasazený obránce, potom kontrolní bod radnice.
Kontrolní bod je viditelné náměstí placeného města, zdraví fortification 80;
poškození nepřepisuje vzhled ani účetní cenu budov. Neobnovuje se časem/cestou.
Hráčův rozkaz Útok vybírá živého útočníka/okupanta, pak původní stráž, pak kontrolní
bod; rozkaz Obrana vyhledá útočníka; bez soupeře dojede na náměstí. Obě strany používají stejný boj.
Při stejném kroku má hráčův zásah iniciativu jako E. Zničená jednotka už nestřílí.

Obsazení vyžaduje živý tank do 3 jednotek, nulovou fortification a žádnou živou
nepřátelskou jednotku v městě; 5 nepřerušených místních sekund. Nový rozkaz, odchod
nebo odpor ruší postup. Samotný čas/varování vlastnictví nikdy nepřepne.
Hráč ustupuje fyzicky ke vstupu a potom původní trasou domů, zdraví se zachová.
Soupeř při zdraví ≤20 % ustupuje ke svému vstupu a vrací se po uložené trase;
jeho přeživší tank zůstává doložený, bez nové výpravy zdarma. Při ztrátě zdrojového
města výpad rovněž ustoupí; bez platného domova zůstane vyřazený z dalších akcí.
Vítězný útočník zůstává ve městě jako tentýž okupant; lze ho skutečně zničit a město
získat zpět. Žádná obnova stráže ani nová odměna za opakované převzetí.

## Atomické vlastnictví a pokračování

`City.transfers` uchovává pořadí F změn: from/to, jednotka, raid transakce (je-li
státní), bojový čas a úplný snapshot hospodářství. Výchozí řetězec je foundingOwner,
případné přesné capture E → linie, potom všechny transfers. Žádný historický
záznam se nepřepisuje. Limit 32 F změn/město odmítá další obsazení před mutací.
Před synchronním přidáním dokladu se znovu ověří identita, aktivní bojiště, živá
jednotka, její vlastník, poškození, poloha, odpor a úplných 5 s. Současně se mění
owner a revize hospodářství. Opakované vyhodnocení pro stejného vlastníka nic nedělá.

Pokladna/jídlo, budovy a jejich vzhledy, obyvatelé/ID, ledger i místní čas pokračují
beze změny. Founder, founded, E capture a všechny staré státní transakce zůstávají.
Stát nepřestavuje zpět získané město podle původních nákupů: jeho původní deník se
ověřuje proti prvnímu odpovídajícímu snapshotu, další pokladna běží pouze lokálně B.
Hráčské příkazy vyžadují aktuálního vlastníka a kombinovanou revizi hospodářství
s počtem převzetí, i pro dosud neotevřenou ekonomiku. Zastaralé potvrzení po
ztrátě/opětovném získání proto neplatí.

Ztráta posledního města hráče nevymaže domov, prameny, flotilu ani B1; dovolí návrat,
placenou opravu/výrobu a nové dobytí či založení za původních podmínek. Nic nedostane
zdarma. Původní neřešitelný nedostatek strojů/zdrojů dál nabízí původní checkpoint.
Přechod do planetární etapy je zablokovaný, dokud existuje nedořešený výpad
nebo okupant; hráč dostane důvod v domovském panelu.
Stát bez města nezakládá ani neútočí a jeho zbytek rezervy zůstane zmrazený.

## Persistence a ověření

Striktní klíče/verze, konečná čísla, účetní rovnost rezerv, vazba každé raid na jednu
platbu a právě jeden tank, platná pevninská trasa, poloha/kolize, souvislý řetězec
vlastníků a neměnné snapshoty. Obsazení při nově dosaženém účetním limitu se odmítne a útočník ustoupí.
Checkpointové fáze a zbývající doba nesmějí být napřed vůči živé větvi.
Limity kampaně 8 MiB a 64 detailů zůstávají.
Checkpoint obnoví celou větev: jednotky, zdraví, časy, finance, transakce i vlastníky,
bez sloučení. Společné doklady tvoří shodný prefix. Rekey nemění identitu planety.
Lokální JSON není kryptografický audit proti přepsání celého souboru.

Povinné důkazy podle plánu: vítězná obrana, prohra/poslední město, reálné opakované
převzetí, finanční a prostorové regrese, historie, zmrazení a persistence, A–E/B1,
produkční vstupy bez zrychlení, 1024×640, měření a nezávislé review. Mimo rozsah
obchod/konverze, rozsáhlé armády, knihovny vozidel/lodí, moře/vesmír a SP-007.B2/D.
