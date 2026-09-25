# SP-010.C — navigace a vzdálené lokality v1

Navazuje na skutečnou SP-010.B / `eed840c65`, [smlouvu B](SP-010B-CONTRACT.md) a [místní adresy A](SP-010A-CONTRACT.md). Obálka kampaně zůstává v3; explicitní aktivace `enablePlanetTravel` migruje `homePlanet` v2 → **v3**. Parser podporuje absenci, v1, v2 i v3, sám navigaci historickým kampaním nedoplňuje. Starší aplikace nové v3 exporty nepřečtou.

## Autorita a aktivní svět

Původní `homePlanet.locations` nadále registruje právě nenulové sloty `worlds[0..2]` a používá původní ID/kind/worldSlot. `navigation.fields` registruje vzdálená místa. `currentLocationId` odkazuje buď na původní habitat aktuální etapy, nebo existující vzdálenou lokalitu. Nikdy na habitat jiné etapy. **Výběr i vstup ponechávají `GameState.stage` beze změny.** Všechny původní podmínky přechodů zůstávají; evoluce/přechod jsou mimo původní místní režim odmítnuté.

`GameState.world` je alias příslušného autoritativního World podle `currentLocationId`. Serializovaná kopie musí přesně odpovídat; parser/checkpoint přes `bindActiveWorld` obnoví referenční identitu. Původní trojice se cestováním nemění ani neobsazuje vzdáleným světem. Reference kmene, NPC, smečky, strojů, historie, B1 a terraformace se validují vůči původním světům, nikoli výpravě. **`GameState.planet` zůstává výhradně původní místní terraformací.**

```ts
interface PlanetNavigation {
  version: 1;
  detailGenerator: 1;
  mode: 'local' | 'global';
  selectedCell: number; // 0..2591, výběr není návštěva
  camera: { x: number; y: number; zoom: number }; // atlas 720×360, zoom 1..8
  fields: FieldLocation[]; // nejvýše 64 uložených detailů
  visits: { locationId: string; tick: number }[]; // první skutečný vstup/návrat
  notice: string;
}
interface FieldLocation {
  id: string; // `${planetId}:field-${cellId}`
  kind: 'field';
  cellId: number;
  world: World;
  position: Vec3; // výpravová poloha, nikoli původní kampaně
  heading: number;
}
```

Aktivace založí prázdné `fields/visits`, místní režim a výběr aktuálního atlasového habitatového bodu. Provede totéž ve starém checkpointu. Opakování nemění data ani checkpointový string. Import probíhá před rekey slotu. Ani stará hotová kampaň nedostává zpětné cesty, měření nebo vlastnictví. Existující geografie/provenience, trvalá ID a místní souřadnice se nemění.

## Dostupnost a pozastavená simulace

Globální přehled N je dostupný ve všech živých etapách. Celá simulace v něm stojí, výběr/posun/zoom nespouští generování. Pevninská výprava je dostupná od etapy 2 (tvora), až po jejím skutečném dosažení. Voda vyžaduje budoucí námořní implementaci; původní atlasové kotvy používají návrat domů, nikoli alternativní vstup do jiné etapy. Mrtvý organismus nevstoupí.

Tvor zahajuje výpravu do 11 místních jednotek od vlastního hnízda, bez neseného ekologického nákladu. Kmen/stroje/terraformace zahajují výpravu z přehledu vlastní základny; řízené jednotky se nepřenášejí. Jejich historický již nehratelný organismový náklad se beze změny zachová, není blokující. Není zde cena ani odměna za přelet a žádná nová doprava nebo vojenská projekce.

Během výpravy se mění jen výpravová poloha, čas vzdáleného detailu a skutečně provedené měření. Původní hráč (`player`: tělo, poloha, rychlost, zdraví, potřeby, cooldowny, náklad, vazby), řízené jednotky, jejich příkazy, kampanový tick, všechny původní Worlds/RNG a ekonomika stojí. Bez regenerace potřeb, příjmu, dohánění času nebo odměn. Vzdálený avatar zobrazuje tentýž genom v samostatné výpravové poloze. Po návratu pokračuje původní svět přesně od uloženého stavu. Cestování neléčí ani nepřerušuje či neřeší bojové/progresní cíle.

Neaktivní vzdálené místo stojí. Opětovný vstup používá jeho poslední bezpečnou polohu a uložený World. Bez resetu, nových entit nebo grantu. Návrat domů je dostupný z každého bodu; místní pohyb je omezen X/Z ±78 a terénem. Výpravy mají vlastní průzkum tří fyzických stanovišť: E do vzdálenosti 3 místních jednotek odkryje výšku, vláhu nebo biom/teplotu atlasu a uloží `patch.discovered` spolu s `landmark.charge=1`. Opakování nic nepřipíše. Tyto znalosti nejsou příjmem DNA/jantaru, výsledkem etapy ani záznamem SP-007.A.

## Geografie a determinismus

**B `geography.generator:1` zůstává byte významově stejný**, chráněný původními otisky. Nový `navigation.detailGenerator:1` je samostatná smlouva pro nové pevninské detaily, odvozené pouze z původního seedu a atlasového cellId. Nespotřebovává simulační RNG. Uložená lokalita vzniká až při vstupu; pořadí návštěv se projeví jen pořadím registru, nikoli jejím obsahem.

Detailní povrch je vložené místo uprostřed buňky B, s jejím pevninským povrchem, biomem a výškovým datem. Reliéf se liší podle seedu/biomu a je omezen nad moře; výšky jsou kvantované na 1e−6 místní jednotky kvůli numerickým rozdílům JS prostředí. Vegetace/kameny jsou dekorace, nikoli nové kořisti nebo ekonomické zdroje. Nejde o souvislý globální mesh ani o převedení původního `groundHeight` do nového významu.

Vzdálená kotva: střed atlasové buňky, výška `elevationMeters`, `metersPerUnit=min(1,3*cos(latitude))`. Zmenšení polárních detailů udrží celý původní rozsah X/Z ±78 uvnitř jejich 5° buňky. Převod A/B zůstává stejný a původní tři kotvy jsou nedotčené. `addressGeography` vrací správný původní nebo výpravový terén a uložený World.

64 detailů omezuje velikost kampaně a náklady validace, nikoli délku kampaně či počet návratů. Při plném registru zůstanou všechny návštěvy a návrat přístupné, jen nové místo má čitelný důvod odmítnutí. Save limit 8 MiB je nezměněný. Na GPU je nejvýše původní místní scéna a jeden aktuální výpravový detail; vykresluje se pouze aktuální scéna. Před výměnou výpravového detailu se jeho geometrie/materiály uvolní. Atlas je SVG s kamerou, žádná druhá trvale běžící WebGL scéna.

## Persistence a rozhraní měst

Parser kontroluje přesná pole/verze, rozsahy, ID, povrch/kotvy, jedinečnost registrů, deterministické neměnné části World, shodu objevu a měření, bezpečnou polohu, alias a tick prvních návštěv v rozsahu 0 až aktuální tick kampaně. Historické neznámé cesty se nedoplňují. Checkpoint může být starší a mít méně míst; při obnově se stav větve **nahradí**, nesčítá. Světy, návštěvy, měření, kamera, režim i ekonomika se obnovují společně.

`locationAddress`, `resolveLocationAddress`, `geographicAddress`, `localAddress`, `addressGeography` nyní přijímají i uložená field ID. Tvar a meze původních adres jsou beze změny. Resolver vrací diskriminovaný `PlanetLocation | FieldLocation`: původní místo má `worldSlot`, vzdálené `kind:'field'` a `cellId`.

`AddressSelection = {id,name,address:LocationAddress}` a `selectAddress(state, choices, id)` jsou konkrétní rozhraní SP-009. Spotřebitel předá skutečný seznam měst. Funkce odmítne chybějící nebo duplicitní ID výběru a neplatnou či cizí adresu, vrátí uloženou místní/geografickou adresu a World a nastaví výběr/kameru atlasu. Nevytvoří město, vlastnictví ani cestu a nezmění aktivní místo. Vhodnost stavby a pravidla města musí dodat SP-009. **V původní C byl produkční seznam prázdný. [SP-009.A](SP-009A-CONTRACT.md) nyní dodává skutečný `CityRegistry` a napojuje jej přes `selectCity` na toto API.** Město má samostatnou jednorázovou platbu, vlastnictví, adresu, rozvržení a kolize; nic z toho nemění generator 1/detailGenerator 1 nebo generovaný World. Založení je explicitní placená akce během výpravy, zatímco průběžná simulace domova i ostatních měst dál stojí. [Ověření integrace](SP-009A-REPORT.md).

## Navazující SP-009.B — 25. 9. 2026

[Smlouva městské ekonomiky B v1](SP-009B-CONTRACT.md) přidává oddělený 10s městský cyklus pouze během aktivního místního hraní. Původní systémy, čas/RNG, jednotky, B1 a `GameState.planet` jsou při výpravě nadále zmrazené podle C. Výslovný hráčský převod 80/20 jantaru z původní zásoby do místní pokladny je nová placená akce; není pasivním příjmem ani odměnou za cestování. Globální přehled, domov a neaktivní města místní ekonomiku neposouvají, návrat nedohání čas. HomePlanet v3, atlas/detail generátory 1, adresy a význam Worlds zůstávají. [Ověření pauzy, persistence a návratů B](SP-009B-REPORT.md).


## Navazující SP-009.D — 25. 9. 2026

[Smlouva D v1](SP-009D-CONTRACT.md) zavádí CityRegistry v4, States v1,
samostatný strategický čas a doložená státní osídlení bez vymyšlených
hráčských návštěv. Místní produkce B, zmrazení domova C, identity, adresy,
generátory a snapshoty vzhledů se nemění. Historická migrace nejprve
přidá pouze prázdná pravidla live i checkpointu; nové osídlení vzniká
při skutečném pokračování hry se zaznamenaným původem a cenou.
