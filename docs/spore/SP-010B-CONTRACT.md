# SP-010.B — geografický kontrakt v1

Rozšiřuje [místní adresy SP-010.A](SP-010A-CONTRACT.md). Obálka kampaně zůstává v3, `homePlanet` má novou **verzi 2**. [Generátor a dotazy](../../src/game/planet-geography.ts), [aktivace/migrace](../../src/game/home-planet.ts), [validace](../../src/game/persistence.ts). SP-010.C, SP-009 a SP-007.B2/D nejsou součástí tohoto kontraktu.

## Uložená autorita

```ts
// Identity a registry SP-010.A beze změny.
type HomePlanet = HomePlanetIdentity & (
  | { version: 1 }
  | { version: 2; geography: {
      generator: 1;
      seed: number;
      provenance: 'birth' | 'legacy-assigned';
    } }
);
interface GeographicPoint {
  longitude: number; latitude: number; altitudeMeters: number;
}
interface GeographicAddress { planetId: string; point: GeographicPoint; }
```

`seed` je původní seed kampaně, nikoli RNG nebo importní ID. Nemění se při rekey. `generator:1` přesně určuje atlas i všechny rezervované kotvy; nemá časovou, simulační ani kamerovou závislost. Výsledek se regeneruje z receptu, nikoli z původních Worlds. Neměnná cache drží maximálně osm atlasů, ne kampaně nebo detailní scény. Výstup generátoru chrání pevné SHA-256 otisky čtyř seedů. **Změna tohoto výstupu vyžaduje nový generátor a výslovnou migraci**, nikdy úpravu algoritmu pod stejným číslem.

`birth` znamená založeno s novou UI linií; `legacy-assigned` znamená nově vygenerovaný geografický kontext pro starší kampaň (včetně SP-010.A v1). Ani jedno není důkaz návštěvy, průzkumu, vlastnictví nebo cesty. Rezervovaná poloha nenulového budoucího slotu nezakládá svět. `locations` stále evidují právě existující nenulové světy. Historie SP-007.A a výsledky/účinky B1 se nemění.

## Topologie, terén a biomy

Sféra s obvodem rovníku 36 000 m a poloměrem `18000/π` m. Zeměpisná délka v kanonickém intervalu `[-180,180)`, šířka `[-90,90]`, výška v metrech nad nulovým datem; API přijímá konečné výšky do ±20 000 m. Výška není vzdálenost od středu. Délky 180 a nekanonické hodnoty se odmítnou; pro explicitní normalizaci slouží `wrapLongitude`.

Rastr 72×36, 5° na buňku, equirektangulární zobrazení. Buňka měří na rovníku 500×500 m, její východozápadní rozměr se k pólům zmenšuje. ID `row*72+column`, severní řádek první. Dotaz `geographicCell` používá konstantní hodnotu buňky (žádná falešná detailní interpolace); severní hranice včetně, jižní mimo kromě jižního pólu. `atlasNeighbours` vrací společné hrany, západ/východ se obtáčí přes šev, za pólem není další řádek. Polární klíny se stýkají v jednom bodě; tento API zatím neurčuje trajektorii nebo pohyb kamery přes pól. Na pólu různé délky vyberou příslušný klín, ne různé fyzické body.

Každá buňka má výšku (integer m), `surface=land|water`, biom, výchozí teplotu (°C), vláhu (0–100) a region. Generátor vytváří oddělené pevninské oblasti, oceán a mělké pobřeží. Výška >0 znamená pevninu, ≤0 vodu. Biomy: ocean/shelf/rainforest/grassland/desert/tundra/mountain. Souvislé regiony stejného povrchu používají `continent-<nejmenší cellId>` / `ocean-<nejmenší cellId>`; ID jsou lokální receptu konkrétní planety, nikoli vlastnictví či strojové regiony.

Teplota/vláha atlasu jsou statický geografický základ. **`GameState.planet` a `getClimate` dál vlastní původní místní klima, terraformaci a T0–T3.** Atlas je nepřepisuje ani z nich neodvozuje své biomy. Lokální patch není kopií biomu atlasu a jeho ID se nemění.

## Explicitní zasazení habitatů

Generátor rezervuje teplý západní okraj jedné pevniny a sousední vodní buňku. Pobřežní buňka má deštný les, 12 m, 24 °C / 80 %; vodní buňka mělčinu, −40 m, 24 °C / 100 %. Tyto hodnoty jsou součástí nové geografie, ne tvrzení o původním hraném klimatu.

| Původní slot / ID | Kotva | Metrů na místní jednotku | Šířka původních X/Z | Výškové datum místního Y=0 |
| --- | --- | --- | --- | --- |
| 0 / microhabitat | Uvnitř mělčiny, od jejího středu −1,5° v délce i šířce | 0,001 | 0,156 m | −0,1 m |
| 1 / reef | Střed sousední mělčiny | 0,1 | 15,6 m | −3 m |
| 2 / coast | Střed pobřežní pevninské buňky | 1 | 156 m | 12 m |

Každý habitat je **detailní vložené místo**, nikoli celý 500m čtverec. Stávající herní vzdálenosti a rychlosti ve scéně zůstávají v jejím původním měřítku; novou fyzickou projekci neaplikujeme na simulační výpočty nebo ceny. Mořské dno původního útesu může mít jinou výšku než hrubý průměr atlasu. `addressGeography` vrací původní analytický `groundHeight`, přepočtenou výšku a autoritativní uložený `World` vedle hrubého regionálního kontextu. Nepřidává novou vodní fyziku. Mezery mezi detailními místy nejsou nově hratelný terén; jejich detail/streamování a dálkové trasy patří do C.

## Místní adresy zůstávají platné

`LocationAddress` A a jeho resolver **nemění tvar, význam, ID ani meze**. X/Z ±78, Y ±1024; +X východ, +Z jih, +Y vzhůru. Nelze do něj uložit zeměpisné stupně místo místních hodnot.

Převod má pevné datové rozhraní. Pro kotvu `(lon0,lat0,alt0)`, měřítko `k` a `m=100` metrů na stupeň:

- `longitude = wrap(lon0 + x*k/(m*cos(lat0)))`
- `latitude = lat0 - z*k/m`
- `altitudeMeters = alt0 + y*k`

Jde o malý equirektangulární místní souřadnicový rámec s kosinem **kotvy**, nikoli měnící se kosinovou korekcí každého bodu. Zpětný převod je jeho algebraická inverze; tolerance 1e−7 místní jednotky slouží jen k zaokrouhlení na původní přesné hranici.

```ts
const local = locationAddress(state, position, savedLocationId);
if (!local) throw new Error('Neplatná místní adresa.');
const geography = addressGeography(state, local);
if (!geography) throw new Error('Geografie není aktivovaná.');
// geography.world === state.worlds[geography.location.worldSlot]
// geography.cell: surface, biome, elevationMeters, regionId, baseline climate
// geography.address: GeographicAddress; geography.localGround: původní terén
const back = localAddress(state, geography.address, savedLocationId);
```

Zpětný převod vyžaduje ID existující lokality; cizí planeta, neznámý/neuložený habitat nebo bod mimo jeho původní meze vrací null. Geografický bod nikdy sám nevytvoří World. SP-009 má ukládat původní místní adresu města a použít geografii jako kontext; konkrétní průchodnost, kolize, vhodnost stavby, vlastník a ekonomika patří městu. Globální navigace může používat rastr/regiony, ale ještě nemá cestovní pravidla ani kameru.

## Migrace a checkpointy

1. Parser zachová absenci i validní homePlanet v1. Kontroluje přesné klíče a verze; v1 s přidaným geografickým polem se odmítne. Aktivace při UI birth/load/import proběhne před rekey ukládacího slotu.
2. `enableHomePlanet` založí chybějící původní registr a výslovně migruje v1→v2. Existující identita/lokality/aktuální reference zůstávají. Doplní pouze recept, podle stejných pravidel i do checkpointu a se stejnou proveniencí.
3. Opakování v2 nic nemění, nepřepisuje checkpointový string, negeneruje World, nečte simulační RNG a neuděluje odměnu. Atlas vzniká až dotazem. Samotné parsování v2 rovněž nespouští generátor.
4. Přísný parser odmítá cizí seed, neznámý generátor/původ/klíče, smíšené v1/v2/absenci live vs checkpoint a rozdílný původ. Oba recepty mají shodný seed kampaně; registry checkpointu dál odpovídají jeho vlastním světům.
5. Starší checkpoint může mít méně lokalit, ale stejný atlas a rezervované kotvy. Obnova vrací svět, ekonomiku i historii společně. Opětovný vstup používá tatáž ID a kotvy. Bez checkpointu zůstává původní fallback nová linie; její nová geografie nese `birth`.

Save/load, export/import a checkpoint ukládají recept se zbytkem kampaně. Neexistuje ruční migrace nebo dodatečná síťová služba. Nový export používá homePlanet v2; aplikace před B ho nepřečte. B stále čte v1 i všechny starší kampaně.
