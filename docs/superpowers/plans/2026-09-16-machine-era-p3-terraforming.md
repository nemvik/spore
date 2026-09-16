# P3 · Terraformace · prováděcí plán

Navazuje na schválený spec a roadmapu z 2026-09-15, hratelný kmen a stroje. Pouze singleplayer. Superpowers skilly nejsou v prostředí dostupné; root vede návrh, integraci a hraní, dílčí agenti izolované moduly a review. Bez dalších dependencies, commitu či deploye.

## Ověřitelný výsledek

- Dokončená P2 má explicitní přechod do P3, dědí skutečné placené stroje, krajinu, jantar, ekologické kontakty i historii linie.
- Hráč přímo řídí jeden stroj WASD; M přepíná planetární přehled, V vybírá jiný živý stroj. Mapový přehled je čitelný a dostupný i tlačítkem. Tělesné ovládání původního organismu zůstává vypnuté.
- Teplota a vláha jsou dvě skutečné uložené osy. Vnitřní pole `atmosphere` nese odchylku vláhy kvůli kontinuitě P0; UI používá slovo vláha. Střed (0,0) je příznivý, záporná vláha je sucho. T0–T3 určuje radiální vzdálenost, ne seznam splněných tlačítek.
- Pozemní vrt doplňuje vodu, létající rozsévač ochlazuje a rozptyluje vláhu. Cena, výkon, rychlost a let zůstávají odvozené z placeného Blueprintu. Ostatní moduly mohou zkoumat a vozit život; vhodné pracovní stroje jde vyrobit ve stejném editoru u dílny. Plná flotila dovolí výslovně vyřadit vybraný stroj u dílny.
- Na každý stupeň je nutný živý potravní řetězec 2 různých producentů, 2 různých býložravců a 1 lovce. Taxon se smí použít v další lokalitě, jednotlivá populace neplní více lokalit. Klimatický stupeň omezuje počet osad.
- Život má zásobu potravy, vitalitu a návaznost na nižší trofické skupiny. Producenti používají skutečné Resources a EcologySite; kořenovou oporu odvozuje existující livingRootStrength. Chybějící či zničená živá opora nemůže stabilizovat klima. Bez stabilizace osy i T-skóre skutečně regresují.
- Získané druhy pocházejí pouze ze skutečného ekologického kontaktu. Nestačí observed/discovered ani pouhá přítomnost entity. Starý save doplní jen doloženou historii; chybějící kontakt lze získat fyzicky při expedici.
- T3 se všemi živými řetězci vydrží s vypnutými nástroji. Teprve pozorované udržení podmínek spustí finále, historii celé linie a sandbox. Uložený rozběhnutý i stabilizovaný stav je přesně obnovitelný.
- Doložit alespoň jeden skutečný průchod NEW 0→5 běžnými vstupy. Připravené scénáře a DEV zrychlení jsou oddělené důkazy, nikoli fresh ani měření lidské délky. Návrhových 20–30 minut za etapu nelze vydávat za dosažené pouhým počtem testů.

## Katalog a kompatibilita

Volitelný `journey.ecology: {version:1, contacts: EcologyContact[]}` pro nové UI kampaně. Nepřítomnost se při parse zachová, původní replay a staré checkpointy nezmění svět. Explicitní vstup P3 provede konzervativní inferenci. Záznam obsahuje `key`, původní `stage:0|1|2`, `patch:0|1|2|null`, `method:'culture'|'feeding'|'hunt'|'bond'`. Jeden záznam na key; taxonomii určuje statický katalog.

Kultury mají klíče `culture:0` až `culture:8` a explicitní živou mateřskou identitu ze SITE_STORIES (minerální/detritové mateřské kultury jsou živé, běžný minerál/detrit producentem není). Tvory rozlišuje `species:<id>`. Grazer/invasive tvoří býložravou skupinu, predators lovce; symbionti zůstanou v historickém katalogu, ale nenahrazují dvě býložravé populace.

Hooky pouze po skutečném úspěchu: odběr kultury, konzumace hráčovy výsadby/nabídky/oddenku, nakrmení predátora vlastní nabídkou, přímý lov a symbióza. Ledger nezmění RNG, DNA, pohyb ani existující fyziku. Staré pozice bezpečně dokládají carry:<id>/plantedId, hunt:<species>, bonds a úzce vymezené výsledky skutečné hostiny. Žádná univerzální inference z resolve nebo feedingHome.

P3 umí skutečný odběr existující mateřské kultury a krmení živého pobřežního tvora vhodnou odečtenou potravou; dosah a překážky platí i pro stroj. Pokud mateřská populace vyhynula, placená obnova školky vytvoří živý exemplář, ale katalog se odemkne až po skutečném krmení. Tím zůstane dokončitelná i nenásilná a historická linie.

## Stav a simulace

`PlanetPreviewState` v1 zůstává. Nový aktivní řez v2 obsahuje dvě osy, odvozené tScore, vybraný existující machine ID, nástroj on/off, tři biomy, živé populace/stabilizátory, elapsed, stabilní dobu, completed a sandbox. IDs mají vlastní monotónní čítač; kořeny odkazují do skutečného pobřežního world.resources. Žádný čtvrtý world a žádné nepodložené přemapování stage5 na nový svět.

- Přechod vyžaduje dokončené P2 i živý stroj, vyprázdní jeho rozkazy a založí checkpoint. Návrat do P2 není nutný pro další výrobu.
- Pohyb přebírá radius/swept collision pro tank a výšku letu pro air. Kamera sleduje vybraný stroj, nikoli původního hráče. Přepnutí mapy je lokální UI stav.
- Obnova klimatu a živých řetězců je deterministická při stejných vstupech. Root oddělí fyzický pohyb, nástroje a planetární ekologii do malých funkcí.
- Stabilizace je zpětná vazba z aktuálního životního řetězce na drift; ne permanentní odměna za klik. Zničená/hladová populace či klima mimo toleranci může podporu snížit. V sandboxu se pravidla nezastaví.
- Původní pobřežní organisme/huty jsou zachované. P3 nekrmí ani nezabíjí původní hráčské tělo mimo jeho řízení.

## Prezentace a UI

`src/render/planet.ts` čte skutečný stav: vegetaci a jedince, vitalitu, biomy a jejich hranice. Model strojů zůstává jediný createMachine používaný editorem i světem. Mapový pohled ukazuje bod teplota/vláha ve třech soustředných pásmech, současnou podporu, dostupné osady a konkrétní chybějící skupiny.

`src/ui/planet.ts`, `src/game/planet-copy.cs.ts`: aktuální stroj a nástroj, klima, katalog včetně původu kontaktu, zasazení poblíž vybrané lokality, přehled školky a návrat k dílně. Textové rady vysvětlují příčinu odmítnutí (dosah, potrava, klima, nosič, druh). UI nepřidává vývojové detaily.

## Ověření a pořadí

1. Dokončit P2 editor drag/symmetry/cancel a nezávisle nalezené ekonomické regrese. Zapsat skutečné browser důkazy všech tří strategií.
2. Implementovat katalog s důkazy a opt-in hooky, izolované testy; root integrace a validace starých savů.
3. Implementovat aktivní planetární stav, klima, biologii, přechod a přímé ovládání. Cílené testy regresí bez života, stability se životem, ztráty života a save determinismu.
4. Přísná persistence v2: rozsahy, unknown keys, entity reference, odvozené T, trofické role, duplicity, lineage/checkpoint. Nezávislá review migrací/validace.
5. UI a renderer, skutečné browser cykly: neudržené T, návrat k nástrojům, doplnění druhů kontaktem, 3 živé biomy, vypnutí a finále/sandbox, save/reload obou stavů.
6. Celý NEW průchod, původní editor/fixtures/historical saves, build/produkční smoke a rozšířený soak. Prohlédnout screenshoty; ověřit žádné browser errors a potřebu případných oprav.
7. Aktualizovat PROGRESS, README a BENCHMARK s oddělením faktů, připravených testů a neověřených kvalitativních cílů. Root self-review a nezávislá kontrola. Cíl nedokončovat při pouhém P2 nebo samotném základu P3.

## Dokončení · 2026-09-16

Funkční body a všechny návazné etapy dokončeny. Jedna skutečná nová linie
0→5 došla běžným ovládáním až do planetárního finále a sandboxu, bez importu,
časových zkratek a obnovy; audit šesti exportů prošel aktuálním parserem.
Finále tick57561 (15:59,35 simulace), všechny tři řetězce živé a nástroje
vypnuté. Připravené alternativní cesty, regrese, 600s soak, původní editor,
kompatibilita, 1913 testů, typecheck/build a aktuální produkční smoke prošly.
Podrobnosti, skutečné verze zdrojů a meze dokládá `BENCHMARK_REPORT.md`.
Cílová délka a první lidské hraní nejsou tímto ověřeny.
