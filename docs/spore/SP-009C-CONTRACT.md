# SP-009.C — vzhled budov a knihovna, smlouva v1

Navazuje na skutečnou B `b550612f4`. Obálka kampaně v3, HomePlanet v3, oba generátory 1, City.local v1, LocationAddress, identita/vlastník/založení, obyvatelé a účetní pravidla B zůstávají.

Implementace a přijetí této v1: [závěrečný report C v1](SP-009C-REPORT.md), včetně migrací, produkčního hraní, review a mezí. Celé SP-005.B/SP-009/SP-010/SP-017 se neuzavírají.

## Verze a autorita

`CityRegistry.version=3`; aktivní `economy.version=2` vyžaduje u každé budovy `appearance`. Ostatní ekonomická pole a jednotky mají původní význam. `appearance` je buď `{version:1,source:'default',model:'city-b-1'}`, nebo `{version:1,source:'creation',creation:BuildingCreation}`. První varianta odkazuje na neměnnou procedurální podobu B danou hospodářským typem. Druhá je úplný odpojený snapshot konkrétní revize; nikdy živá reference do knihovny.

`BuildingCreation` má přesně `format:'lumavora-building', version:1, id, revision, createdAt, updatedAt, name, design`. ID 1–80 ASCII písmen/číslic/_/-, revize 1–10⁹, data jako SP-005.A, jméno 1–40 znaků bez řídicích znaků. `design={version:1,kind,parts}`; kind je house/garden/workshop/park. `part={id,shape,position,size,yaw,color}`: id jedinečné 1–40 ASCII, shape box/cylinder/cone/dome, position a size konečné XYZ, yaw stupně v [-180,180], barva #rrggbb. Návrh neobsahuje cenu, kapacitu, výrobu, parcelu ani vlastnictví.

## Geometrie

1–24 dílů. Velikost každé osy 0,2–6; spodní hrana ≥0,7, horní ≤7 místních jednotek. Každý roh horizontálního obdélníkového obalu po otočení kolem Y leží uvnitř radiusu B (obydlí 2, ostatní 2,5) s rezervou 0,08. Přední pás od Z=radius−0,55 je rezervovaný pro nezměnitelný znak typu. Konzervativní obdélníkový obal platí i pro kulaté díly. Překryv dílů je dovolen pro skládání hmot; žádná fyzika interiérů.

Plná kruhová základna je viditelná až k původní kolizní hranici a dosedá na terén. Celý objem parcely je pevný exteriér; otvory nejsou průchody. Žádné nové kolize mimo původní radius. Horní geometrie nepřesáhne obal ani průchod k náměstí, radnici, příchodu či mezi parcelami. Výběr parcely, terén/hranice a prostorové vztahy dílen/zahrad stále určuje B ze středu parcely.

## Knihovna a transakce

Místní klíče `lumavora:building:<id>`, nejvýše 100 položek, 128 KiB na soubor. Uložení návrhu zdarma, nový výtvor revize 1; uložení změny zvýší revizi o 1 po porovnání celé původní položky. Duplikace dostane nové ID/revizi 1. Shodný import nevytvoří kopii; odlišný obsah stejného ID dostane nové ID bez přepsání originálu. Vadný či příliš velký import, plné/selhané úložiště a zastaralá editace ponechají platná data. Smazání předlohy ani změna knihovny nikdy nezasáhnou kampaně.

Stavba vybírá výchozí vzhled nebo uloženou revizi stejného hospodářského typu. Cena a údržba jsou přesně B, bez kosmetického násobku. Příkaz nese odpojený snapshot a očekávanou ekonomickou revision; finální kontrola před jedním synchronním nákupem. Existující stavbě lze výslovně potvrdit jiný vzhled za **0 jantaru**; mění se pouze appearance a ekonomická revision. Typ, parcela, enabled, zaplacená cena, obyvatelé, nextId, ledger a čas se nemění. Stejný vzhled je odmítnut jako žádná změna. Demolice dál vratka 0. Editor/knihovna/pauza ekonomiku neposouvají; globál/neaktivní města bez dohánění.

## Historie a checkpoint

Parser zachová absenci i registry v1/v2 v původním formátu, v3 striktně validuje včetně snapshotů. UI `enableCities` před rekey výslovně migruje live i checkpoint: v1 → neotevřená ekonomika null; v2 s ekonomií v1 → v2 a výchozí appearance city-b-1 u existujících budov. Žádná nová budova, knihovní položka, hráčský návrh, ID, platba, čas, obyvatel nebo historie nevzniká. Opakování nic nemění včetně checkpointového stringu. Starší aplikace registry v3 nepřečtou.

Checkpoint obnovuje celou větev a oba rozpočty. Může mít starší vzhled téže instance; zachovaná identita, typ, parcela a původní cena musejí souhlasit. Žádné slučování knihovny ani zpětné platby. Současný knihovní obsah nezávisí na obnově kampaně. Save limit 8 MiB zůstává, nová dílčí omezení omezují render/validaci a přenos.


## Navazující SP-009.D — 25. 9. 2026

[Smlouva D v1](SP-009D-CONTRACT.md) zavádí CityRegistry v4, States v1,
samostatný strategický čas a doložená státní osídlení bez vymyšlených
hráčských návštěv. Místní produkce B, zmrazení domova C, identity, adresy,
generátory a snapshoty vzhledů se nemění. Historická migrace nejprve
přidá pouze prázdná pravidla live i checkpointu; nové osídlení vzniká
při skutečném pokračování hry se zaznamenaným původem a cenou.
