# SP-009.D — soupeřící státy, smlouva v1

Výchozí C `3dfbfc7c4`. Nový **CityRegistry v4** a volitelné **GameState.states
v1**. UI aktivace migruje nejprve C a poté v4 v live i checkpointu, před rekey.
Parser sám nemigruje. Staré registry 1–3 zůstávají historickými vstupy.
Původní hráčská města, ekonomika v2 a snapshoty C jsou beze změny.

## Čas a vznik

States v1 má `origin=birth|legacy-activation`, `activated:null|{tick,stage}`,
`clock:{version:1,turn,elapsed}`, `entries`. Migrace pouze přidá prázdná data,
žádné město, minulou platbu nebo rozhodnutí. Nová UI linie používá birth;
staré načtené kampaně legacy-activation. První aktivní místní krok po skutečném
odemčení strojové etapy aktivuje dva nezávislé státy (zahradní a řemeslná
priorita). Zaznamenaný okamžik aktivace je nynější kampanový tick a etapa.
Identita je od homePlanet.id, nikdy od importního slotu. Nejde o původní kmeny.

Strategický tah = **10 sekund aktivního místního hraní v etapě 4/5** s živým
hráčem. Jeden krok nejvýše 1/30 s. Globál, pauza, editor, knihovna, skrytý tab
nic neposouvají. Strategický turn/elapsed je samostatný od tick kampaně i
městského cycle/elapsed B. Při výpravě domov stále stojí podle C.
Neaktivní města stále nevyrábějí. Návštěva cizího města spouští pouze jeho
místní ekonomiku B. Uložení zachová zbytky času; žádné offline dohánění.

## Autority a rozpočet

Každý stát má stabilní id, profil, explicitní počáteční rezervu **400 jantaru**,
zůstatek, poslední rozhodnutí a seznam skutečných transakcí. Rezerva je jediné
nové počáteční vybavení při aktivaci této vrstvy, nikoli výnos minulých měst,
hráčský nákup nebo opakovatelná dotace. Další strategický příjem je **0**.
Státní rezervu nelze doplnit z hráčových pramenů ani z místní produkce.

První i další město stojí 60 z rezervy; otevření hospodářství je převod 80
z rezervy do nové městské pokladny. Při nedostatku na zvolený rozvoj nebo údržbu smí stát převést dalších 20
z vlastní zbývající rezervy s novým dokladem; její vyčerpání je konečné.
Stavby/pozvání platí pouze tato pokladna
za původní ceny B. Vznikne economy v3 s `opened.source=state` a odkazem na
transakci; všechny ostatní jednotky, produkce a vzhledy jsou B/C. Obyvatelé
jsou nově pozvaní občané vlastníka města, nikoli kopie hráčových jednotek.

`City.owner={kind:lineage|state,id}`. Hráčská založení zůstávají přesně A.
Státní `founded={source:state,stage,tick,paidAmber:60,transactionId,purpose:
activation|expansion}`; nejsou označena za hráčské nákupy. Rozhodnutí uchovává
turn, konkrétní volbu, důvod, výsledek a případný transactionId. Transakce
uchovává id, turn, akci/cíl, cenu a rozpočtový zdroj. Čistý výhled dostupné
možnosti není záznam provedení. Před platbou se znovu ověří aktuální podmínky;
stejný turn nelze provést dvakrát. Neúspěch nevytvoří doklad ani odečet.

Politika v1 vychází z aktuálních měst/budov/obyvatel a prostředků: založit
první město, otevřít ekonomiku, zajistit obydlí, pěstírnu/dílnu podle profilu,
pozvat až čtyři obyvatele a doplnit zbývající provoz; potom založit druhé město.
Pořadí stabilní podle identity; vyhodnocení nezávislé na simulačním RNG.
Limit dva státy, dvě města/stát, nejvýše 64 transakcí/stát, 10^7 strategických
tahů. Poslední neúspěšné rozhodnutí se nahrazuje, log neroste bez omezení.
Vyčerpání rozpočtu/parcel/registru či dosažený limit má konkrétní důvod.

## Prostor a návštěvy

První osídlení hledá pevninu na domovském kontinentu; expanze pouze sousední
pevninskou buňku některého vlastního města. Nevstupuje do vody ani rezervovaných
habitatů. Neobsazuje již existující výpravový detail (ani prázdný hráčův).
Nový detail je původní createField generator 1. Adresa prochází citySite;
budovy původním buildingSite, včetně bezpečného příchodu a hráčovy polohy.

Registr v4 výslovně dovoluje systémově osídlený detail bez hráčské návštěvy;
nenavštívený detail zůstává neaktivní, s původní polohou, nulovým časem
a bez měření či místní výroby. Jediným dokladem původu je příslušné státní založení/transakce. `visits`
zůstávají výhradně skutečné hráčské návštěvy a průzkum se nevymýšlí. Přísný
parser dovolí nenavštívený detail pouze s tímto dokladem. Generátory 1,
HomePlanet v3, LocationAddress, původní worlds a GameState.planet se nemění.
Jedno město na detail, společný limit 64; žádné přepsání světa nebo vlastnictví.

UI zpřístupní úplné zaznamenané informace o státech (bez předstírané mlhy
války), barvu i jméno vlastníka, města, rezervu/místní pokladny, rozhodnutí a
ceny. Návštěvník má čtecí přehled; všechny hráčské hospodářské příkazy včetně
vzhledů, demolice a převodů jsou proti státnímu městu odmítnuté.

## Persistence a kompatibilita

Opakovaná migrace nemění data ani checkpointový string. Checkpoint je celá
větev: žádné slučování rezerv, měst, transakcí, obyvatel nebo příjmů. Může
předcházet aktivaci; obnova vrátí prázdný systém a jeho budoucí aktivaci,
nikoli další rezervu do původní větve. Doklady společné historie musí souhlasit.
Striktní klíče/verze, konečná čísla, ID, účetní součty, vazby vlastníků,
transakcí a adres. Lokální save není kryptografický audit proti přepsání celku.
Save limit 8 MiB nezměněn. Render drží jen aktivní detail a uvolňuje jeho
geometrii/materialy/instance; státy nevytvářejí trvalé vzdálené GPU scény.

Historické fixtures včetně skutečného pokračování C zůstávají byte-identické.
Nezasahuje do jednotek, organismu, knihovny budov, historie/B1, původního
postupu ani SP-007.B2/D. Dobývání, obchodní převzetí, konverze, obrana, lodě,
moře a vesmír nejsou implementovány; celé mateřské karty zůstávají otevřené.

## Navazující SP-009.E · 25. 9. 2026

[Smlouva E v1](SP-009E-CONTRACT.md) výslovně migruje na registry měst v5/států v2.
`foundingOwner` zachovává doložený původ; `owner` se smí změnit jen skutečným
vojenským výsledkem s uloženým dokladem. Obrana je nový budoucí nákup z původní
konečné rezervy. Staré transakce se kontrolují proti původním městům a snapshotu
hospodářství při převzetí; pozdější hráčská správa je nepřepisuje. Zde popsaná v4/v1
zůstává historickým vstupem bez domyšlené války. Poražený stát nezakládá další města.

## Navazující SP-009.G

[Smlouva G v1](SP-009G-CONTRACT.md) explicitně zavádí CityRegistry v7 / States v4,
obchodní variantu společné historie a oddělený civilní účet skutečné kupní ceny.
Původní rezervní rozpočet, doklady a omezení výpadu F zůstávají; příjem nezakládá
novou armádu ani zpětný obchod. Migrace live/checkpoint před rekey nevytváří minulost.
