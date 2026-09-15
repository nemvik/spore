# LUMAVORA — zadání autonomního vývoje evoluční webové hry

## Úkol a měřítko ambice

V tomto repozitáři navrhni, implementuj, spusť, skutečně otestuj a dokonči originální singleplayerovou 3D webovou evoluční hru s pracovním názvem **LUMAVORA**. Ber ji jako ambiciózní benchmark schopnosti dodat celý produkt: herní design, funkční simulaci, vizuál, animace, zvuk, ovládání, spolehlivost a ověřitelné výsledky.

Chci pocit objevování, tvoření vlastního organismu a přechodu od drobného života ke složitému tvorovi. Spore je reference tohoto zážitku, ne předloha k obkreslení. Vytvoř vlastní svět, výtvarný styl, tvory, rozhraní, názvy, pravidla a obsah. Nepřebírej cizí herní kód, modely, textury, hudbu ani značku.

Výstupem není design document, landing page, technické demo, automatická simulace bez hráče ani seznam budoucích funkcí. Výstupem je hra, kterou lze spustit, pochopit, ovládat a dohrát. Náročnost ani spotřeba tokenů nejsou důvodem zkrátit ji na první prototyp. Výpočetní kapacitu využívej na skutečné zlepšování, nikoli na rozsah reportů, zbytečné přepisy nebo opakování již prokázaného.

## Tvůrčí směr

**Hlavní příslib: „Změň své tělo. Změň způsob života. Sleduj, jak se tím mění svět.“**

Vytvoř soudržný, barevný mimozemský svět s organickými tvary, výraznými siluetami, bioluminiscencí a příjemnou atmosférou objevování. Tvorové mají být podivní, zapamatovatelní a živí, ne hororoví. Identita hry nesmí stát jen na barevném filtru.

Hráč většinu času přímo ovládá jednoho tvora. Prostředí a organismy jsou skutečně 3D; úvodní mikroskopická fáze může mít pro přehlednost pohyb převážně v rovině. Podvodní a suchozemská část mají prostor, hloubku, promyšlenou kameru a skutečné kolize.

Cíl pro tempo je přibližně 45–90 minut k prvnímu dokončení, s první smysluplnou adaptací během několika minut. To je návrhový cíl, ne údaj, který smíš uvést jako naměřený bez hraní. Další průchod má nabídnout jinou životaschopnou evoluční cestu, ne pouze jinou barvu stejného tvora.

## Tři povinné, propojené etapy

### 1. Mikrosvět

Začni jako drobný organismus. Hráč získává potravu, vyhýbá se predátorům, objevuje různé zdroje živin a získává první adaptace. Pohyb musí být příjemný ještě před první evolucí. Hrozby a potrava jsou rozlišitelné tvarem, chováním a zpětnou vazbou, ne jen barvou.

Zaveď první skutečné volby: rychlost versus energetická spotřeba, ochrana versus obratnost, specializace na potravu versus univerzálnost. Přechod dál je výsledkem hraní a reprodukce či dosažené životaschopnosti, ne tlačítko „další úroveň“ bez podmínek.

### 2. Útesy a mělčiny

Hráč se vyvine v mnohobuněčného vodního tvora. Rozvine se editor těla, průzkum, potrava, predace i neagresivní strategie. Vytvoř odlišitelné ekologické niky, úkryty, proudění nebo jiné lokální podmínky, které dávají různým tělům výhody.

Postup ke břehu vyžaduje skutečné adaptace. Suchozemský pohyb ani dýchání nesmí fungovat dříve, než k nim má tvor potřebné vlastnosti. Hráč má dopředu rozumět tomu, co mu pro přechod chybí.

### 3. Pobřeží a souš

Přechod na souš zachová identitu, zvolenou stavbu těla, relevantní adaptace a historii linie. Nesmí nahradit hráčova tvora nesouvisejícím předpřipraveným modelem. Zaveď pozemní lokomoci, nové zdroje, terénní překážky a smysluplné vztahy s dalšími druhy.

Kampaň zakonči ekologickou událostí, na kterou existuje více řešení podle evoluční strategie: například změnou přílivu a vysycháním prostředí. Výhra nesmí vyžadovat, aby se všechny linie nakonec změnily v bojovníka. Po dokončení nabídni shrnutí linie a možnost pokračovat v sandboxu nebo začít s novým seedem.

Všechny etapy používají společný model genomu a návaznou progresi. Není nutný technicky nepřerušený svět bez loadingu; návaznost herního stavu a zážitku je povinná. Kmeny, civilizace a vesmír do tohoto zadání nepatří.

## Evoluce a editor těla — hlavní test kvality

Vytvoř interaktivní 3D editor s otáčením a přiblížením organismu. Umožni upravovat základní proporce a přidávat, přesouvat, měnit či odstraňovat podporované části těla. Promysli záchytné body, symetrii, limity konstrukce, přehledný výběr a návrat změn. Hráč musí rozumět ceně a důsledkům úpravy před potvrzením.

Editor nesmí být jen strom upgradů vedle statického modelu. Tělo ve hře musí odpovídat tělu v editoru. Model, animace, parametry a dostupné interakce musí vycházet ze stejných dat, aby se nemohly rozcházet.

Zahrň nejméně 16 skutečně funkčních adaptací napříč alespoň šesti oblastmi: pohyb, získávání potravy, vnímání, obrana, metabolismus/prostředí a symbióza. Nezapočítávej barevné varianty ani několik stupňů stejného bonusu jako různé adaptace.

Příklady požadovaného typu souvislostí, nikoli povinný seznam implementace:

- Ploutve, ocas, bičík či končetiny mění způsob pohybu i odpovídající animaci.
- Tvar úst a trávicí specializace mění dostupnou potravu a chování při jejím získávání.
- Smyslové orgány mění dosah či druh informací dostupných hráči a reakce tvora.
- Pancíř zvyšuje odolnost, ale něco stojí v hmotnosti, pohybu nebo metabolismu.
- Žábry, hospodaření s vodou a podpora těla mají konkrétní význam při přechodu mezi prostředími.

Kosmetické úpravy jsou vítané, ale jasně je odliš od funkčních. Zabraň záporným cenám, neoprávněnému získání bodů, neplatným kombinacím, nefunkčnímu tělu a nekonečné ekonomice vracení upgradů.

Musí existovat nejméně tři odlišné, životaschopné strategie napříč kampaní: predátor, neagresivní konzument a symbiotický/generalistický organismus. Nesmí jít o stejné ovládání a stejné schopnosti s jinými čísly. Smrt má být srozumitelná a férová; obnovení z poslední generace nesmí poškodit uložený postup.

## Vlastní identita: propojená ekologie a symbióza

Dva charakteristické systémy mají fungovat už v dokončené základní hře:

**Svět si pamatuje tvůj vliv.** Potrava, lov a reprodukce ovlivňují lokální populace a dostupnost zdrojů. Nadměrný lov může změnit druhové složení; ochrana zdroje nebo symbiotického partnera může vytvořit výhodnou niku. Efekt musí být skutečnou změnou stavu, viditelnou ve světě i po uložení a načtení, ne jen hláškou v rozhraní.

**Evoluce prostřednictvím symbiózy.** Hráč může navázat vztah s kompatibilním organismem a získat jiný způsob přežití, například ochranu, recyklaci živin nebo orientaci ve tmě. Partner má nároky a trade-off; nesmí to být jen neomezený pasivní bonus zdarma. Symbióza má vizuální projev a ovlivňuje rozhodování při hraní.

Nemusíš simulovat skutečnou biologii ani vyvíjet strojové učení. Navrhni čitelný herní model s jasnou příčinnou souvislostí a rozumnou výpočetní náročností. Popiš jej poctivě jako herní simulaci.

Vytvoř nejméně šest rozlišitelných prostředí celkem a devět odlišitelných nehráčských druhů napříč etapami. Druhy rozlišuj tělem, pohybem, potravou či chováním, ne pouze názvem. NPC mají hledat zdroje, vyhýbat se nebezpečí a reagovat podle svých možností; nemají jen náhodně bloudit nebo automaticky pronásledovat hráče.

Generovaný svět musí být pro zadaný seed reprodukovatelný a jeho začátek hratelný. Ošetři nedostupné zdroje, trvalé uvíznutí, nekontrolovaný růst populací a náhodné zablokování progrese. Zjednodušení simulace jsou v pořádku, pokud zachovávají její skutečné důsledky.

## Vizuál, animace, zvuk a ovládání

Navrhni jednotný výtvarný jazyk pro prostředí, tvory, efekty a UI. Finální scéna nesmí působit jako rozházené základní koule a kvádry. Procedurální modelování je vítané; výsledek musí mít promyšlené proporce, spojování částí, materiály a siluety. Při kvalitativním hodnocení sleduj skutečnou běžící hru, ne jen koncept nebo screenshot menu.

Pohyb, krmení, zásah, smrt, reprodukce a evoluce potřebují čitelnou zpětnou vazbu. Animace odpovídají konstrukci organismu: nohy nepřešlapují bez vazby na pohyb, ploutve nepůsobí jako pevné dekorace a tělo se při změně směru nechová jako rigidní ikona. Kamera má být plynulá, držet hráče čitelně v záběru a neprojíždět terénem.

Vytvoř zvukové prostředí a efekty pro důležité interakce, se samostatným nastavením hlasitosti a vypnutím zvuku. Zajisti správné spuštění zvuku po interakci uživatele. Můžeš použít vlastní procedurální zvuky nebo vhodně licencované lokální soubory.

Primární platforma je desktopový prohlížeč s klávesnicí a myší. Prostorové ovládání navrhni pohodlně a konzistentně mezi etapami. Přidej jasné zobrazení ovládání, pauzu, nastavení kvality a citlivosti kamery. UI má zůstat použitelné při změně velikosti okna a na běžném notebooku. Dotykové ovládání je bonus až po dokončení desktopového základu; nevydávej responzivní menu za ověřenou mobilní hru.

Menu a vysvětlení mohou být česky; herní texty drž centrálně, aby šla snadno přidat další lokalizace. Významná informace se nesmí přenášet pouze barvou. Omezitelné otřesy kamery a záblesky jsou žádoucí.

## Technické mantinely

Preferovaný základ je **TypeScript + Vite + Three.js**, React případně pro menu a HUD. Vyber konkrétní strukturu, způsob renderování, animací, simulace a ukládání sám. Nevyvíjej univerzální engine ani infrastrukturu, kterou tato hra nepotřebuje. Jinou knihovnu zvol pouze pro konkrétní doložitelný přínos; změna nesmí zrušit požadavek skutečné 3D webové hry.

Hra je singleplayer, bez přihlašování a backendu. Běžné hraní po načtení lokálně servírovaných assetů nepotřebuje externí služby, LLM, placené API ani runtime CDN. Použij verzované lokální ukládání, obnovení po refreshi a export/import save souboru. Validuj import, ošetři nekompatibilní a poškozené soubory a zachovej možnost začít znovu bez ztráty ostatních uložených her.

Použij řízení času nezávislé na snímkové frekvenci a seedovaný zdroj náhodnosti pro simulaci. Výkonové techniky, například instancing, prostorový index, úrovně detailu či worker, přidej podle skutečných potřeb a měření. Hra se po přepnutí tabu nesmí rozpadnout kvůli obrovskému časovému kroku. Ošetři pauzu, restart, změnu okna a opakované otevření editoru.

Projekt musí obsahovat zamčené závislosti a funkční příkazy pro instalaci, vývojový server, typecheck, build, testy a browser testy. Výsledek má být servírovatelný jako statický build. Připrav jej pro nasazení, ale nikam ho sám nepublikuj.

Používej vlastní nebo doložitelně vhodně licencované assety; u převzatých ulož původ a licenci. Máš-li v aktuálním prostředí dostupné generování obrázků nebo modelů v rámci povoleného předplatného, můžeš je použít. Neodvozuj dostupnost nástroje z této věty. Chybějící externí assetová služba není důvod k zastavení — pokračuj vlastním procedurálním obsahem. Žádné nové placené služby.

## Ověřování, které dokazuje hraní

Zaveď automatické ověření důležitých pravidel a opakovatelný browser testovací postup. Doporučený základ je Vitest a Playwright; konkrétní technické provedení nechávám na tobě. Testy nesmějí nahrazovat fungující produkt ani se přizpůsobovat chybám jen proto, aby prošly.

Připrav testovací seedy **481516**, **20260913** a **8675309**. Výsledek simulace porovnávej při stejných vstupech a simulačních krocích; neslibuj pixelově identický rendering mezi různými GPU. Pro diagnostiku můžeš vytvořit read-only výpis herního stavu a oddělené testovací fixtures.

Odděl dvě věci:

1. Cílené scénáře s připraveným stavem ověřují editor, přechody, smrt, obnovu a konkrétní ekologické události.
2. Průchod od nové hry ověřuje, že se do těchto stavů hráč skutečně dostane ovládáním, sběrem zdrojů a legitimní evolucí.

Přímé přepsání stage, XP, zdraví nebo genomu není důkazem dohratelnosti. V základním průchodu používej skutečné herní vstupy a normální pravidla. Diagnostické zkratky jasně označ a neposuzuj jejich délku jako délku běžného hraní. Debug možnosti měnící stav nesmějí zůstat dostupné v normálním produkčním sestavení.

Požadované důkazy:

- Úspěšný typecheck, produkční build a relevantní automatické testy.
- Testy ceny, kompatibility a důsledků adaptací, ukládání/načítání, přechodů a seedované simulace.
- Ověření všech tří etap a alespoň jednoho úplného průchodu kampaní skutečným ovládáním; alternativní strategie ověř cílenými scénáři a transparentně označ rozsah jejich testování.
- Browser ověření nové hry, změny těla, návratu do hry, smrti/obnovy, uložení, refreshe, načtení, pauzy a změny velikosti okna.
- Nejméně deset minut souvislého hraní nebo browser soak testu bez pádu, neřešené výjimky a zjevného růstu prostředků po opakování stejných akcí.
- Skutečné screenshoty každé etapy a editoru plus záznam herního průchodu nebo browser trace s časovou osou. Showcase střih nenahrazuje důkaz průchodu.
- Ověření příčinné ekologické změny a jejího zachování po save/load; samotné změny textu v HUD nestačí.

Pokud je dostupný reálný GPU prohlížeč, cílem výkonu je přibližně 60 FPS při 1920 × 1080 na střední kvalitě. Ulož délku měření, rozlišení, kvalitu, počty aktivních objektů, prostředí, medián a p95 frame time. Při softwarovém renderování jasně napiš SwiftShader/software; z takového měření nevyvozuj FPS na mém MacBooku. Neověřený Safari nebo telefon označ jako neověřený, nikoli podporovaný testem jiného prohlížeče.

Pokud browser nebo nahrávání v prostředí chybí, pokus se zprovoznit povolenou lokální cestu. Nedostupné ověření není splněné ověření. Dodej maximum dostupných důkazů a přesný seznam mezer.

## Autonomní práce a hranice

Nejprve zjisti stav pracovního adresáře a dostupné nástroje. Stručně si stanov plán, ale nezastavuj po jeho sepsání ani po prvním vertical slice. Technická a tvůrčí rozhodnutí dělej samostatně v rámci briefu. Průběžně udržuj spustitelný stav a krátký `PROGRESS.md`, aby šlo pokračovat po přerušení.

Máš povolení v tomto projektu vytvářet a měnit soubory, instalovat běžné projektové závislosti a potřebné browser testovací komponenty v rámci oprávnění prostředí, spouštět lokální servery, generátory assetů, testy a opravovat jejich selhání. Používej současnou autentizaci Codexu; žádné přepínání účtů, obcházení limitů, nové předplatné či placené API. Nesahej do cizích projektů, produkce, osobních dat ani přihlašovacích údajů. Nedeaktivuj sandbox a neměň globální systémové nastavení.

Využij nativní subagenty, pokud jsou dostupní a práce se skutečně dá oddělit. Rozdělení odpovědností zvol sám; před souběžnými změnami slaď společná data a rozhraní. Integrace do jedné fungující hry je důležitější než počet agentů. Neinstaluj kvůli tomu další orchestrátor.

Lokální commity vlastních změn jsou povolené, nepřepisuj však existující uživatelskou historii. Bez dalšího výslovného svolení nedělej push, PR, merge, release, veřejný deploy ani změny externích trackerů.

Po první kompletní implementaci hru kriticky zhodnoť podle skutečného hraní a zobrazených scén. Zlepši největší konkrétní nedostatky v ovládání, čitelnosti, morfologii, animacích, vyvážení a vizuálu. Zopakuj relevantní ověření. Nepřidávej neomezeně nové fáze a systémy místo dokončení těch zadaných. Zábavnost a estetickou kvalitu nepovažuj za objektivně prokázané vlastním skóre.

## Dokončení a předání

Brief je pevné zadání. Neměň jeho akceptační kritéria, abys mohl označit nedokončenou implementaci za hotovou. Detailní pravidla a konkrétní hodnoty můžeš navrhnout sám, nikoli však vynechat povinnou etapu, skutečný editor nebo funkční ekologii.

Za dokončený výsledek považuj stav, kdy jsou implementovány povinné systémy, kampaň prokazatelně průchozí, hlavní testy úspěšné, vizuál a ovládání prošly skutečnou kontrolou a nejsou známé nevyřešené chyby blokující hraní, progresi nebo uložené hry. Cíl výkonu na nedostupném hardwaru zůstává neověřený a musí být tak označen. Splnění testů samo o sobě není důkazem, že je hra zábavná.

Při vyčerpání limitu nebo nezávislém blokéru zachovej poslední spustitelný stav, aktualizuj checkpoint a uveď přesný další krok. Limit není důkaz dokončení. Kvůli chybějícímu dílčímu nástroji nepřestávej pracovat na částech, které lze dokončit jinak.

Předej:

- Kompletní zdrojový kód, lokální assety a reprodukovatelné build/test příkazy.
- `README.md` se spuštěním, ovládáním, konceptem evoluce a použitými technologiemi.
- `PROGRESS.md` se stavem pro pokračování a `ASSET_CREDITS.md` s původem assetů.
- `evidence/` se screenshoty, záznamem nebo trace a reporty testů i výkonu; velké dočasné soubory a závislosti necommituj.
- `BENCHMARK_REPORT.md`, který mapuje každý povinný požadavek na implementaci a důkaz. Rozliš **splněno a ověřeno / implementováno, ale neověřeno / nesplněno**. Uveď skutečné prostředí, případné zásahy uživatele a známé problémy. Spotřebu, dobu běhu a modely uváděj pouze z dostupných dat, jinak `N/A`.

Závěrečná zpráva má obsahovat příkaz ke spuštění, co lze nyní skutečně hrát, umístění důkazů a zbývající omezení. Nevyžádej si souhlas s implementací tohoto zadání. **Začni pracovat a pokračuj až k ověřenému výsledku nebo transparentně popsanému blokéru.**
