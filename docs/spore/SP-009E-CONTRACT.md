# SP-009.E — vojenská cesta, smlouva v1

Výchozí D eb3c05025. CityRegistry **v5**, States **v2**, volitelný Military **v1**.
Parser historická data nemigruje. UI aktivace výslovně migruje live i checkpoint
před rekey. Migrace přidá pouze foundingOwner (doložený dosavadní vlastník), defense:null,
capture:null a prázdné vojenské nasazení. Nevymýšlí války, zdraví, nákupy nebo vlastníky.

## Autorita strojů a prostor

Původní machines.fleet je jediná autorita hráčových jednotek. Výroba/editace/cena,
blueprint, zdraví, B1 regionální výkon a původní regiony/prameny zůstávají. E je dostupná
v etapě 4 pro jeden živý pozemní stroj s dělem, bez nákladu, u dílny do 12 jednotek.
Nasazení uloží ID stroje, ID města, návratovou polohu a pevninskou BFS trasu atlasu
od pobřeží; voda není přípustná. Přeprava trvá 5 aktivních místních sekund/hrana,
bez ceny navíc (původní placený tank, žádná kopie). UI výslovně ukazuje cestovní fázi.
Při dokončení se tentýž stroj přesune na bezpečný vstup detailu; doma není vykreslen
ani simulován. Návrat vyžaduje fyzický dojezd k vstupu a stejný cestovní čas,
pak obnoví uloženou domovskou polohu, nikoli zdraví. Nový rozkaz ruší obsazování.
Boj používá původní vehicleStats, MachineUnit, moveUnit a společný dělový zásah;
nepřepisuje staré regionální podmínky. E nepoužívá archetyp jako zákaz děla.

Kolize: původní překážky + městská radnice/budovy + viditelné dekorace jako dočasný
kolizní overlay, žádná mutace generovaného World. Radius tanku konzervativně podle
konstrukce, výška podle fieldGround. Střelba vyžaduje dosah 12 a průhlednou úsečku;
útok 2×power každých 1,2 s, stejný princip jako původní dělo. Stráž je stacionární
placený tank na volném náměstí, aktivně odpovídá na nasazený nepřátelský tank v dosahu.
Není poškozováno civilní obyvatelstvo ani hospodářské budovy.

## Konečná obrana a vlastnictví

Stát v novém strategickém tahu platí jednu stráž na každé své město ze zbývající
rezervy D. Konstrukce: původní tank predator s díly scale .7; cena od vehicleCost.
Žádná další počáteční rezerva, regenerace, munice jako nová měna ani automatická obnova.
Obrana vzniká jen úspěšnou transakcí defend, uloží blueprint/pozici/zdraví/cooldown.
Zničená stráž zůstane doložený vrak, nedává odměnu. Město bez zaplacené obrany
v tomto prvním rozsahu nelze dobýt; UI vysvětlí, proč není vojenský cíl dostupný.

Po zničení stráže musí živý nasazený tank fyzicky obsadit náměstí do 3 jednotek
po 5 nepřerušených aktivních sekund. Teprve simulace atomicky vloží jediný capture
s původním vlastníkem, ID jednotky, bojovým časem a snapshotem ekonomiky a přepne owner
na linii. Capture není odměna. Zakladatel/founded a státní transakce zůstanou stejné.
Snapshot uchovává stav při převzetí pro ověření předchozích státních nákupů i po
pozdější hráčské demolici, změně vzhledu, převodu nebo stavbě. Současná pokladna,
jídlo, budovy, obyvatelé, vzhledy, ledger i místní čas pokračují beze změny.
Občané si zachovávají původní ID/doklady, nepřepisují se na nově pozvané hráčem.

Opakované vyhodnocení capture už neprovede. Stát rozhoduje jen o současných městech;
po ztrátě posledního dříve založeného města je poražen a nezakládá nové. Zbylá rezerva
zůstává ve státním záznamu, nepřevádí se hráči. Nejvýše dvě celoživotní založení/stát.
Hráčské hospodářské příkazy vždy ověřují aktuální owner; revize se při převzetí zvýší,
aby původní potvrzení nebylo znovu použitelné. E nemá AI invaze ani opětovné převzetí.

## Čas a persistence

B místní ekonomický čas a D strategický čas zůstávají. Combat elapsed postupuje jen
v aktivním místním cílovém detailu, nejvýše 1/30 s/krok. Domov C stojí s jedinou
explicitní výjimkou nasazeného stroje. Odchod zmrazí zdraví, cooldowny a dopravu;
obsazování se přeruší. Návrat pokračuje beze spawnu/léčení/offline dohánění.
Pauza/editor/knihovna/globál nic neposouvají. Globál není ústup ani léčení.

Všechna nová pole mají striktní klíče, verze, konečná čísla, limity a vzájemné vazby.
Checkpoint obnoví jednotky, finance, doklady, obranu, vlastnictví i časy jako celou
větev; nic nesčítá. Společné historické doklady a dokončená převzetí checkpointu
musí souhlasit. Rekey nemění planetu ani identitu strojů. Save limit 8 MiB zůstává.
Lokální singleplayer JSON není kryptografický audit proti přepsání celého souboru.

### Implementační upřesnění v1

Konzervativní kruhový obal zohledňuje trup včetně scale/axial/otočení a obálky všech
dílů. Tato omezená cesta odmítá obal nad 4 místní jednotky s důvodem v UI; původní
stroje se nepřestavují. Navigace používá úplný existující graf překážek. Umístění
hráčské i státní budovy kontroluje nasazený tank. Domovské strojové příkazy a přechod
etapy jsou po dobu nasazení odmítnuté; nejprve je třeba vrátit expedici.
Při shodném kroku má hráčův zásah iniciativu; zničená stráž už v témže kroku nestřílí.
Obrana nemá samostatný pancířový bonus: odolnost vychází ze skutečných dílů konstrukce.
