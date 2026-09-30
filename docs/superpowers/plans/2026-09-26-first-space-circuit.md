# Milník C · první úplný vesmírný okruh

Příprava při závěrečných hraných alternativách B, 26. září 2026. Autoritou jsou nezkrácená kritéria SP-011–013, lodní část SP-005 a SP-017 v ROADMAP. Implementace naváže na uzavření skutečných civilizačních mezer; nová souvislá kampaň z narození zůstává podmínkou závěru celého goalu. Tento plán není dokladem hotové funkce.

## Výsledek a pořadí řezů

1. **C1 — vlastní loď a odlet:** vytvořit, pojmenovat, uložit/exportovat/importovat skutečnou konstrukci; zaplatit její snapshot v dosažené civilizaci; přímo řídit loď, vystoupat z domova na orbitu a do soustavy, vrátit se. Model, pohyb, energie a odolnost vycházejí ze stejného návrhu. Zvlášť doložit knihovnu, zaplacenou instanci, změnu měřítka, návrat a save za letu.
2. **C2 — cizí soustava a život:** deterministická rozšiřitelná hvězdná mapa s navigací, fyzická loď v soustavě a nad povrchem, skenování a skutečný omezený náklad živých organismů. Let domov → orbita → soustava → cizí soustava → povrch → návrat. Původní domov má tutéž identitu a uložený obsah.
3. **C3 — terraformace a kolonie:** obě osy klimatu oběma směry, tři velikosti rostlin + dva býložravci + predátor v každém pásu; živá potrava, stabilita, kolonie, produkce, vyzvednutí, místní trh a skutečná platba. Dokončit celý okruh běžným ovládáním a cíleně odlišnou druhou planetu. Odlet i load uchovají stav; hráč se může vydat znovu.

Každý řez končí cílenými testy, typecheck/build, produkčním hraním, prohlédnutými snímky, nezávislým review a malým reportem. C neuzavírá doprovod spojenců, otevřenou ekonomiku říší, vybavení D, jádro ani dobrodružství E. Ty mají navazující plány, ne zkrácená kritéria.

## Integrace a kompatibilita

- Nový volitelný verzovaný `GameState.space`, přítomný také v checkpointu. Stará data bez této vlastnosti zůstanou validní. Aktivace připraví prázdný rozvoj; nepřidá historické cesty, náklad, odznaky ani peníze. `stage` zůstává 0–5; vesmír je samostatný režim etapy 5. Jeho hrané milníky nesmějí přepisovat zmrazené dědictví B2 ani starý výsledek domácí terraformace.
- `homePlanet.id` je stabilní odkaz domovského světa. `GameState.planet` v2, `worlds[0..2]`, místní města, flotila a jejich účetnictví zůstávají domácími systémy. Cizí planetu nelze nasadit pouhou výměnou `s.world`: současná validace a terraformace jsou úmyslně pevně vázané na pobřeží a místní stroje.
- Vesmír ukládá vlastní systémová/planetární ID, verzi generátoru a pouze navštívené změněné světy. Náhodný generátor je nezávislý na domácím RNG. Neuchovávat duplicitní domácí svět. Cesty mají jednoznačný původ/cíl a uložený průběh; načtení ani pauza nesmí přidat čas, energii či produkci.
- Nový samostatný `ShipBlueprint` a `lumavora-ship` v1. Nepřidávat `ship` do starého tank/air/boat diskriminantu, jehož validátory chrání historické konstrukce. Znovu použít princip návrh → validace/statistiky → společný model editoru a hrané instance. Knihovna má stabilní ID/revize, atomický zápis, limity souboru a počtu; smazání nebo změna návrhu nemění zaplacenou loď.
- První loď se financuje skutečným domácím jantarem u dílny po civilizační bráně. Cena je předem viditelná a potvrzení ověří aktuální návrh/zdroj/polohu. Žádný import návrhu neodemkne etapu ani nevytvoří zdarma jednotku. Pozdější opravy a vybavení mají vlastní skutečné platby.
- Při vesmírném hraní stojí domácí lokální simulace, stejně jako při dosavadní planetární výpravě. Vesmírné planety používají vlastní aktivní čas; žádné offline dohánění. Před odletem se vypne domácí terraformovací nástroj. Návrat nemění původní zdraví, pozice nebo vlastní historii.
- `simulation.step`, hlavní režimy/kamera/HUD, import/load, `recoverGeneration`, validace live/checkpointu a čtený diagnostický výstup musí nový režim rozlišit před domácí navigací. Doma zůstane přístup k již naučené hře. Cesta nesmí přepínat domácí atlas uprostřed letu ani ovládat skrytý pozemní stroj.

## Život a hospodářství

- Existující `ecologyTaxon`, původní druhy/genomy/modely, role a potrava zůstávají zdrojem identity. Historická znalost `ecology.contacts` není lodním nákladem. Skenování pozná konkrétního obyvatele; sběr sníží skutečné množství zdroje a přidá konkrétní uložený vzorek do omezeného cargu. Vysazení náklad spotřebuje. Nelze neomezeně kupovat kopie známého druhu domácí funkcí `introducePlanetLife`.
- Cizí svět má zvlášť teplotu, hustotu atmosféry, klimatické T, obsazené živé sloty a stabilní pásy. Kapacita kolonie vychází z udrženého pásu; chybějící rostlina, vyhladovění nebo rozpad klimatu musí mít viditelný hospodářský následek. Tři velikosti rostlin se rozliší v katalogu, krajině i panelu. Krmení respektuje skutečnou potravu, ne pouze součet ikon.
- Lodní skener, přenos, klimatické nástroje, energie/zdraví a náklad mají čitelné dosahy a spotřebu. Nouzový návrat/obnova nesmí softlocknout kampaň ani množit náklad. Konkrétní limity a ceny doložit v příslušném řezu testem a hraním; ceny či čekání samy nenahrazují možnost rozhodování.
- Kolonie má trvalou identitu, skutečnou zaplacenou cenu, zásobu místní produkce a omezenou kapacitu. Nakládání/odkládání/prodej jsou atomické a nemnoží zásoby. Odlišné původní suroviny mají deterministické místní ceny. Save zachová platby, trasy, poškození, náklad i zásoby. Pro C musí být možné zisk z prodeje použít na následující výpravu.

## Soubory a ověření

Nové ohraničené moduly: `src/game/ship-design.ts`, `ship-library.ts`, `space-types.ts`, `space.ts`, `space-validation.ts`, následně galaxie/ekologie/kolonie podle konkrétní odpovědnosti. Vykreslení vlastní lodi a prostoru v `src/render/ship.ts`, `space.ts`; editor/knihovna a kompaktní HUD v `src/ui/ships.ts`, `space.ts` a odpovídajícím CSS. Integrace pouze v potřebných `types.ts`, `persistence.ts`, `simulation.ts`, `main.ts` a domácím HUD. Použít existující Three renderer; žádný další WebGL kontext, framework nebo produkční dependency.

Testy: determinismus/adresy, validace/importní limity a neplatné/duplicitní hodnoty, konstrukce/statistiky/náklad, nedostatek prostředků a zastaralé potvrzení, všechny přechody a návraty, checkpointy během letu, historické savey včetně starého stage5, přesné domácí snímky, obousměrné klima a tři pásy, potravní vazby a kolaps, skutečná produkce/prodej. Hraný driver pouze nativní UI/RAF; fixture regrese označit odděleně. Žádné přepsání živého stavu ani debug urychlení.

SP-017: výrazná silueta lodi sestavená z částí, animovaný pohon a nástroje, spojité čitelné přiblížení planety/orbity/soustavy, jasný směr domů, viditelné dosahy a zdroje, kompaktní rozbalovací panely při 1024×640, klávesnice i myš, skutečná zvuková odezva respektující nastavení. Prohlédnout finální snímky a měřit reprezentativní scény; poslech a porozumění člověka zůstávají výslovně čekajícím přijetím.

## Ověření referencí

[Oficiální FAQ](https://www.spore.com/comm/faq2) bylo znovu přečteno 26. září: přímé řízení vlastní lodi, spojenecký doprovod a následky minulých etap odpovídají přijatému směru. Pokus načíst odkazovaný manuál skončil timeoutem a komunitní terraformaci odpovědí 402; jejich přesná číselná pravidla proto zatím nejsou ověřenou předlohou. Návrh LUMAVORY vychází z výslovných přijatých kritérií. Před převzetím dalších přesných referenčních pravidel je znovu ověřit; nepřisuzovat Spore naše vlastní ceny či rovnice.

## C1 · provedený konkrétní řez

Nové moduly `ship-design`, `ship-library`, `space-types`, `space`, `space-validation`, společný model lodi, lodní náhled/renderer a UI jsou implementované. `space` v1 se výslovně aktivuje jako prázdná větev live i checkpointu; nemění staré B2 výsledky. Konstrukce má pevnou kabinu a až24 vlastních obalů/pohonů/ploutví/komor/skenerů s polohou, velikostí a otočením. Její objemy určují skutečnou cenu a výkon; první loď je jednorázový placený snapshot ze skutečného jantaru. Knihovna `lumavora-ship` v1 má stejné atomické/kolizní/revizní meze jako ostatní výtvory.

Povrch/orbita/soustava mají samostatnou uloženou polohu a nativní řízení WASD/Q/C. Výstup z povrchu vyžaduje výšku20, vzestupy stojí4 energie a trvají3 aktivní sekundy. Sestup vyžaduje blízkost majáku16; přistání10 a výšku8. Solární ploutve dobíjejí při zastavení a pomalý pohyb zůstane možný bez energie, takže samotný pohon nevytvoří softlock. Let používá vlastní čas, domácí simulace stojí. Měřítka se vizuálně interpolují ve stejném WebGL kontextu; glóbus používá původní geografický atlas.

Log uchovává posledních128 skutečných přechodů se souvislými pořadovými čísly. Validace kontroluje původ, cenu, energii, polohy, rozpracovaný přechod, řetězec historie a návaznost checkpointu. Pokud checkpoint již leží za letu a deník od té doby doloženě neobsahuje přistání, domácí větev musí být identická. Uložené hlášky letu patří do vesmírné větve. Obnova letového checkpointu nezasahuje do pozastaveného hráče; starý checkpoint bez vesmíru se při výslovné aktivaci doplní prázdnou větví.

První produkční native průchod již doložil vlastní Jantarovou vážku za108, změnu knihovní revize bez změny instance, celou cestu do domácí soustavy a zpět, pauzu, save/load/import/rekey a přesnou shodu domácího exportu. Finální funkční R2 a oprava Points leaku jsou doložené [reportem C1](../../spore/SP-011C1-REPORT.md), včetně neprokázaného původu starých testových timeoutů a přesných mezí globálních GPU assertionů. Následující C2 stále musí dodat cizí soustavu, skutečný svět a životní náklad; pouhá domácí soustava není splněný milník C.
