# LUMAVORA / Spore — tracker dalšího vývoje

Založeno 17. září 2026 podle přijatých doporučení z [auditu](../2026-09-17-spore-similarity-audit.md). Směr a milníky určuje [BRIEF.md](BRIEF.md). ID **SP-001 až SP-017 odpovídají bodům 1 až 17 auditu** a zůstávají stabilní i při změně pořadí práce.

Toto je backlog pro přípravu menších implementačních plánů. Při založení není žádné z nových rozšíření označeno za hotové a není rozpracovaná herní změna. Již existující základ je uveden zvlášť níže.

## Stav a pořadí práce

**SP-002 je doložené [reportem editoru tvora](SP-002-REPORT.md).** Model a ukládání, UI konstrukce, pohyb i zkoušení schopností jsou zpřístupněné v produkční souši; report zachovává výkonnostní omezení software rendereru a chybějící lidský playtest. SP-001 je doložené [reportem opravy](SP-001-REPORT.md). Priorita jde podle milníků 0 → A → B → C → D → E. Vizuální práce SP-017 probíhá uvnitř každého milníku. Toto pořadí nenavazuje číslováním na historické fáze P0–P3, které už mají vlastní dokončené plány.

Stav každé karty se mění v jediné tabulce:

- **K plánu:** přijatý rozsah čeká na konkrétní implementační plán.
- **Naplánováno:** existuje odkazovaný plán s úkoly, návaznostmi a ověřením.
- **Rozpracováno:** probíhá implementace; hotové dílčí výsledky mají zaškrtnutá kritéria a doložení.
- **K ověření:** implementace je připravená, zbývá požadované ověření nebo přijetí výsledku.
- **Hotovo:** všechna kritéria karty jsou splněná a v posledním sloupci je odkaz na výsledek a důkazy.
- **Blokováno:** konkrétní překážka brání pokračovat; u odkazu je uvedena příčina a potřebné odblokování.
- **Odloženo:** vědomě odložený rozsah s datem a důvodem; nepočítá se jako hotový.

Návaznosti určují potřebné výstupy při realizaci, nikoli zákaz připravit návrh dopředu. U průřezových SP-005 a SP-007 stačí pro návaznou práci uvedená část, například knihovna tvorů nebo smlouva dědictví; dokončení celého bodu v pozdějším milníku se nevyžaduje. Konkrétní plán tyto dílčí závislosti pojmenuje. Pomlčka ve sloupci plánu znamená, že nový plán ani výsledek zatím nevznikly.

| ID / bod | Milník | Stav | Návaznosti | Plán / výsledek / překážka |
| --- | --- | --- | --- | --- |
| [SP-001 · Testové odchylky](#sp-001) | 0 | Hotovo | — | [Plán](../superpowers/plans/2026-09-17-sp-001-test-discrepancies.md), [report a ověření](SP-001-REPORT.md); pracovní strom nad `4da58b6` |
| [SP-002 · Plný editor tvora](#sp-002) | A | Hotovo | SP-001 | [UI konstrukce, terén, save, hraná dostupnost a produkce](SP-002-REPORT.md) |
| [SP-003 · Život druhu a tvorová fáze](#sp-003) | A | Hotovo | SP-002 | [Hnízda, setkání, smečka a tři cesty](SP-003-REPORT.md); připravené browser průchody, meze lidského playtestu v reportu |
| [SP-004 · Objevování a generace](#sp-004) | A | Hotovo | SP-003 | [Objevy, alfa, generace a migrace](SP-004-REPORT.md); [plán](../superpowers/plans/2026-09-23-sp-004-discovery-generations.md), pracovní strom nad `5aed4ba93` |
| [SP-005 · Knihovna výtvorů a společný genom](#sp-005) | A–E | Rozpracováno | SP-002; další typy spolu s příslušnými editory | **A hotovo:** [knihovna tvorů a NPC](SP-005-REPORT.md), [plán](../superpowers/plans/2026-09-23-sp-005-creature-library.md); B–E čeká na příslušné editory |
| [SP-006 · Buněčný růst a přestavba](#sp-006) | A | Hotovo | SP-001 | [Plán](../superpowers/plans/2026-09-23-sp-006-cell-growth.md), [růst, kontakty a objevování](SP-006-REPORT.md); 2 267 testů, nová linie bez připraveného stavu, meze lidského playtestu v reportu |
| [SP-007 · Dědictví celé linie](#sp-007) | A–D | Rozpracováno | SP-003; výsledky dalších etap průběžně | **A hotovo:** [smlouva](SP-007A-CONTRACT.md), [report](SP-007A-REPORT.md), [plán](../superpowers/plans/2026-09-23-sp-007a-lineage-history.md); **B1 hotovo:** [následky kmene](SP-007B1-REPORT.md); B2/D otevřené |
| [SP-008 · Aktivní kmenová společnost](#sp-008) | B | Hotovo | SP-003, SP-007.A (smlouva dědictví) | **A–F hotovo:** [aktivní sousedé](SP-008A-REPORT.md), [kulturní výstroj](SP-008B-REPORT.md), [hudební setkání](SP-008C-REPORT.md), [domestikace](SP-008D-REPORT.md), [náčelník](SP-008E-REPORT.md), [pět sousedů a souhrn kritérií A–F](SP-008F-REPORT.md); F v pracovním stromu nad `190f55f` |
| [SP-009 · Města a civilizace](#sp-009) | B | K plánu | SP-008, SP-010.A; globální integrace s B/C | [Hotové adresní rozhraní SP-010.A](SP-010A-CONTRACT.md); navazuje A — založení a persistence měst |
| [SP-010 · Celá planeta](#sp-010) | B | Rozpracováno | SP-001 | **A hotovo:** [identita domova a lokalit](SP-010A-REPORT.md), [smlouva pro města](SP-010A-CONTRACT.md), [plán](../superpowers/plans/2026-09-24-sp-010a-home-planet.md); B/C otevřené |
| [SP-011 · Loď a vesmírné cestování](#sp-011) | C–D | K plánu | SP-009, SP-010, SP-005 (knihovna a formát) | — |
| [SP-012 · Terraformace cizích světů](#sp-012) | C–D | K plánu | SP-011, SP-005 (organismy) | — |
| [SP-013 · Kolonie, obchod a říše](#sp-013) | C–D | K plánu | SP-011, SP-012 | — |
| [SP-014 · Otevřená vesmírná hra](#sp-014) | D | K plánu | SP-013, SP-007 (vesmírné dědictví) | — |
| [SP-015 · Cesta k jádru galaxie](#sp-015) | D | K plánu | SP-014 | — |
| [SP-016 · Kapitán a dobrodružství](#sp-016) | E | K plánu | SP-003, SP-014, SP-005 (přenos obsahu) | — |
| [SP-017 · Vizuál, zvuk a ovládání](#sp-017) | A–E | K plánu | Průběžně s každou hratelnou změnou | — |

SP-010.A připravila [planetární datové rozhraní](SP-010A-CONTRACT.md) před integrací měst SP-009; návrh obou musí souhlasit, nejde o vzájemné čekání na dokončenou implementaci. Dosažení milníku C neuzavírá automaticky rozsáhlejší body SP-011 až SP-013.

## Již implementovaný základ

Následující funkce existují v auditované revizi `4da58b6`. Jejich přítomnost neznamená splnění nových karet. Poslední audit současně zaznamenal dvě nevyjasněná testová selhání; historické zelené reporty je nenahrazují.

| Existující základ | Doklad / místo, na které navázat |
| --- | --- |
| Šest etap, přechody a pokračování po finále | [Etapy](../../src/game/stage.ts), [dosavadní průchody a jejich omezení](../../BENCHMARK_REPORT.md) |
| Genom, funkční orgány, sedm článků těla, přímá editace | [Genom](../../src/game/genome.ts), [tvar těla](../../src/game/body-shape.ts), [srovnání siluet](../body-editor/README.md) |
| Ekologie, symbióza a katalog skutečných kontaktů | [Demografie](../../src/game/demography.ts), [symbióza](../../src/game/symbiosis.ts), [katalog](../../src/game/ecology-catalog.ts) |
| Kmen, nástroje, příkazy a tři sousedé | [Kmen](../../src/game/tribe.ts), [sousedé](../../src/game/tribe-neighbours.ts) |
| Konstrukce tanků a letounů, jantar a tři regiony | [Blueprint](../../src/game/blueprint.ts), [stroje](../../src/game/machines.ts) |
| Lokální T0–T3, živé řetězce, školka a sandbox | [Terraformace](../../src/game/planet.ts), [školka](../../src/game/nursery.ts) |
| Verzované kampaně, import/export a checkpointy | [Persistence](../../src/game/persistence.ts), [uložené regresní vstupy](../../tests/fixtures/saves/README.md) |

## Karty práce

Odkazy na kód jsou výchozí místa pro průzkum, nikoli příkaz vměstnat nové systémy do stávajících souborů. Každý plán musí jejich aktuální stav znovu ověřit. Nezaškrtnutá kritéria popisují cílové rozšíření.

<a id="sp-001"></a>
### SP-001 — Vysvětlit dvě testové odchylky

**Výchozí stav při auditu:** odlišný počet nehybných ticků při kontaktu s překážkou a rozdílné přesné otisky simulace; tehdy bez určené příčiny. **Výsledek:** opravena ztráta tečného pohybu kvůli zaokrouhlení souřadnic a doloženy dva matematické profily přesných otisků. **Přínos:** spolehlivý základ pro rozsáhlejší změny pohybu, světa a ukládání.

**Podklady:** [kontaktní regrese](../../tests/obstacle-contact-regression.test.ts), [otisky fází](../../tests/step-phases.test.ts), [výchozí audit](../2026-09-17-spore-similarity-audit.md), [závěrečný report](SP-001-REPORT.md).

- [x] Zapsat reprodukční příkaz, revizi a prostředí; porovnat s poslední doloženou referencí.
- [x] U obou selhání najít první rozdílný tick/pole a vysvětlit příčinu i dopad na hraní.
- [x] Opravit příčinu nebo doložit oprávněnou změnu očekávání. Žádné hromadné přegenerování hashů bez vysvětlení.
- [x] Doložit opakovatelný průchod dotčených regresí, celé sady a buildu; u změny pohybu také skutečné ovládání dotčeného místa.

<a id="sp-002"></a>
### SP-002 — Plný editor tvora

**Výchozí stav:** sedm tvarovatelných článků a 21 adaptací, přímé přesouvání částí, DNA a historie úprav. **Cíl:** výrazně odlišná těla s editovatelnou páteří, končetinami, rukama, chodidly a ústy; konstrukce ovlivňuje skutečné schopnosti.

**Rozdělení plánů:** model těla a migrace → manipulace v editoru → animace a zkoušení schopností. Navázat na [genom](../../src/game/genome.ts), [tvar těla](../../src/game/body-shape.ts), [anatomii](../../src/game/anatomy.ts), [lokomoci](../../src/game/locomotion.ts), [výběr částí](../../src/render/body-selection.ts) a [browser kontrolu editoru](../../scripts/body-editor-browser.mjs). Reference: [manuál, str. 18–21][manual].

- [x] Páteř a řetězce kloubů umožní sestavit rozpoznatelného dvounožce, čtyřnožce a dlouhokrkého tvora; nejde jen o změnu barvy či měřítka.
- [x] Ruce, chodidla, ústa a další funkční části lze připojit a upravit s čitelnou symetrií, limity a cenou DNA.
- [x] Náhled chůze, skoku, útoku a komunikace odpovídá stejnému genomu jako tvor v krajině; rozhraní ukazuje dostupné schopnosti.
- [x] Všechny tři zkušební stavby se ovládají v terénu, zachovají tvar po save/load a podporují undo/redo; staré genomy se načtou.

Podúkoly podle [implementačního plánu z 17. září](../superpowers/plans/2026-09-17-sp-002-creature-editor.md):

| Podúkol | Stav | Návaznost | Plán / výsledek |
| --- | --- | --- | --- |
| SP-002.1 — Model, anatomie, DNA a ukládání | Hotovo | SP-001 | Genom v2, společná anatomie/cena, původní v1 fixtures i aritmetika zachovány; celý finální suite 2 130/2 130. [Report](SP-002-REPORT.md). |
| SP-002.2 — Konstrukce v editoru a model | Hotovo | SP-002.1 | Tři placené UI konstrukce, přímá madla, historie, klávesnice, společné měřítko a prohlédnuté snímky; původní editorové regrese prošly. [Report](SP-002-REPORT.md). |
| SP-002.3 — Pohyb, schopnosti, náhled a přijetí | Hotovo | SP-002.2 | Nativní terén 66–69 m na tělo, akce/zkouška, save/recovery, hraný rozpočet, nový produkční v2 smoke a dva profilované benchmarky. Dlouhý krk má na SwiftShader p95 +92,3 % / +21,5 %; příčina z profilu počtů objektů neurčena. [Report a meze](SP-002-REPORT.md). |

Příprava plánu ověřila současný základ: 580 cílených testů a načtení 11 historických save fixtures. Nejde o ověření nového editoru; rozsah a prostředí zaznamenává plán. Komunikace SP-002 je společná zkouška a hlas/gesto v krajině, vztahy druhů zůstávají v SP-003. Příslušná část vizuálu, zvuku a čitelnosti SP-017 je zahrnuta v podúkolech.

<a id="sp-003"></a>
### SP-003 — Hnízda, vztahy druhů a tvorová fáze

**Výchozí stav:** souš stojí na ekologii, lovu a symbióze. **Cíl:** hlavní smyčka průzkumu, setkání, sociálního nebo bojového řešení, smečky a růstu inteligence.

**Rozdělení plánů:** hnízda a vztahy → sociální/bojová setkání → smečka a postup. Výchozí místa: [AI setkání](../../src/game/encounter-ai.ts), [interakce](../../src/game/interactions.ts), [postup linie](../../src/game/journey.ts), [obsah druhů](../../src/game/content.ts). Reference: [archetypy schopností][archetypes], [manuál, str. 32–36][manual].

- [x] Vlastní i cizí druhy mají hnízda; vztah přetrvá mezi setkáními i po načtení hry.
- [x] Zpěv, tanec, okouzlení a póza tvoří ovladatelné sociální setkání s čitelnou reakcí protivníka; schopnosti závisejí na těle.
- [x] Kousnutí, výpad, úder a plivnutí mají odlišný účinek, dosah a odezvu, včetně reakcí ostatních tvorů.
- [x] Růst inteligence a smečky vychází z hraní; členové se pohybují se skupinou a účastní se setkání.
- [x] Fázi lze dokončit přátelstvím, predací i smíšeně. Ověření zachytí dvě odlišná těla a všechny tři cesty; ekologie zůstává použitelná.

Podúkoly SP-003.1 (hnízda/vztahy a save), SP-003.2 (čtyři sociální a čtyři bojové akce) a SP-003.3 (smečka/inteligence/postup) dokončeny podle [plánu](../superpowers/plans/2026-09-21-sp-003-creature-life.md). Ověření dvou těl a všech tří cest rozlišuje šest cílených simulačních kombinací a tři běžně ovládané browser scénáře; [report](SP-003-REPORT.md) uvádí přesný původ a meze. Příslušná čitelnost/animace/zvuk SP-017 je zahrnuta, celá průřezová karta SP-017 zůstává otevřená.

<a id="sp-004"></a>
### SP-004 — Objevování částí a životní události druhu

**Výchozí stav:** rozpočet DNA a zaznamenávání ekologických zkušeností existují; chybí samostatná smyčka objevování konstrukčních částí. **Cíl:** průzkum pravidelně přináší důvod vrátit se do editoru a pečovat o vlastní druh.

**Rozdělení plánů:** objevený katalog → odměny setkání → migrace a generace. Navázat na [evoluci linie](../../src/game/journey-evolution.ts), [migraci](../../src/game/migration.ts), [genom](../../src/game/genome.ts) a [persistenci](../../src/game/persistence.ts). Reference: [manuál, str. 34–36][manual].

- [x] Objevené části jsou vedeny odděleně od utratitelného DNA a mají srozumitelný původ.
- [x] Kosterní pozůstatky, alfa jedinci a další významná setkání odemykají použitelné části; vzácní silní tvorové mění rozhodování při průzkumu.
- [x] Migrace hnízda, reprodukce a nová generace navazují na editor a zachovávají identitu druhu.
- [x] Jedna běžná výprava doloží objev části, pomoc smečky včetně sociální situace, návrat a skutečné použití odměny v editoru; události přežijí save/load.

Podúkoly SP-004.1 (katalog a původ), SP-004.2 (pozůstatky, setkání a alfa) a SP-004.3 (generace, doprovod a nové hnízdo) dokončené podle [plánu](../superpowers/plans/2026-09-23-sp-004-discovery-generations.md). [Report](SP-004-REPORT.md) dokládá 2 202 testů, dva nativně ovládané browser průchody z připravené souše, alfu a save/load; hranice lidského playtestu jsou uvedené výslovně.

<a id="sp-005"></a>
### SP-005 — Místní knihovna výtvorů a společný genom NPC

**Výchozí stav:** exportujeme celé kampaně; NPC mají převážně vlastní pevně definované modely. **Cíl:** samostatné znovupoužitelné výtvory a pestré osazování světa z téhož formátu jako hráč.

**Rozdělení plánů:** A — knihovna tvorů a NPC → B — budovy/vozidla → C/D — lodě → E — propojení s knihovnou dobrodružství SP-016. Výchozí místa: [typy genomu](../../src/game/types.ts), [validace genomu](../../src/game/genome.ts), [obsah](../../src/game/content.ts), [vykreslení organismů](../../src/render/organism.ts), [ukládání](../../src/game/persistence.ts). Reference: [Sporepedia a sdílení výtvorů][faq].

- [x] Tvor má samostatnou identitu, náhled, metadata a verzovaný soubor; jde uložit, upravit a importovat/exportovat mimo konkrétní kampaň.
- [x] NPC používají společný genom pro vzhled i schopnosti; výběr podle jídelníčku a ekologické role vytváří platné obyvatele, včetně generovaných variant.
- [x] V nové linii lze běžným hraním potkat dříve uloženého vlastního tvora; poškozený import nepoškodí knihovnu ani kampaň.
- [ ] Budovy, vozidla a kosmické lodě se stanou přenositelnými výtvory při dodání jejich editorů; knihovna umí zobrazit i dobrodružství vytvořená v SP-016.

Část **SP-005.A — tvorové** dokončena v pracovním stromu nad `5aed4ba93`: [report](SP-005-REPORT.md), [plán](../superpowers/plans/2026-09-23-sp-005-creature-library.md). Samostatný 3D editor a verzovaná knihovna, deterministické osídlení nové linie, nezávislý snapshot kampaně; 2 241 testů a produkční UI průchod z připravené souše. Mateřská karta zůstává rozpracovaná pro **SP-005.B — budovy/vozidla**, **SP-005.C/D — lodě** a **SP-005.E — dobrodružství**.

<a id="sp-006"></a>
### SP-006 — Buněčná smyčka růstu a přestavby

**Výchozí stav:** mikrosvět nabízí potravu, lov, orgány a ekologické úkoly. **Cíl:** rychle čitelná smyčka „sním → vyrostu → objevím část → přestavím se“ se změnami měřítka.

**Rozdělení plánů:** růst a kamera → potravní role a kontakty orgánů → odměny a tempo úvodu. Navázat na [simulaci](../../src/game/simulation.ts), [interakce](../../src/game/interactions.ts), [kameru](../../src/game/camera.ts) a [kontaktní testy kousnutí](../../tests/bite-contact.test.ts). Katalog odměn sjednotit se smlouvou SP-004. Reference: [manuál, str. 30–31][manual].

- [x] Několik růstových skoků mění velikost těla i záběr kamery bez ztráty orientace.
- [x] Změna měřítka skutečně mění dostupnou potravu a hrozby; alespoň jeden dřívější predátor se může stát kořistí.
- [x] Kontakt úst, ostnů a obranných orgánů je čitelný a funkčně odlišný; průzkum přináší nové části.
- [x] Nová linie přirozeně projde celou smyčkou až do editoru; ekologické úkoly ji nepřekrývají. Zaznamenat skutečný průchod a porozumění úvodu.

Dokončeno nad `a5250214b`: [report](SP-006-REPORT.md), [plán](../superpowers/plans/2026-09-23-sp-006-cell-growth.md). Produkční nová linie běžným ovládáním: tři růsty, tři objevy a jejich použití, generace 5, toxin, útěk/ulovení/snědení dřívějšího predátora a UI save/load; 6/6 kontrol, 0 browser chyb. SP-005 regrese 5/5; typecheck/build a 2 267 testů prošly. Porozumění doloženo následováním viditelných pokynů automatizovaným hráčem; lidské porozumění, zábavnost a dlouhodobé vyvážení zůstávají výslovně neověřené v rámci SP-017.

<a id="sp-007"></a>
### SP-007 — Dědictví a filozofie celé linie

**Výchozí stav:** dědí se tělo a historie, ale archetyp strojů vychází z pobřežního závěru. **Cíl:** každá etapa ovlivní následující možnosti a pozdější filozofii říše.

**Rozdělení plánů:** A — smlouva a záznam výsledků → B — následky kmene/civilizace → D — filozofie říše. Navázat na [evoluci](../../src/game/journey-evolution.ts), [typy etap](../../src/game/era-types.ts), [kmen](../../src/game/tribe.ts), [stroje](../../src/game/machines.ts) a [migrace uložených her](../../src/game/persistence.ts). Reference: [FAQ o důsledcích etap][faq].

- [ ] Výsledky zaznamenávají jídelníček, sociální/bojovou cestu tvora, řešení kmenů a způsob civilizační expanze.
- [x] Mírové a násilné sjednocení kmene mají různé následky i při stejném pobřežním závěru. B1 dokládá také smíšenou cestu, historickou trojici a novou pětici.
- [ ] Bonusy a vesmírná filozofie vznikají z doložené historie; hráč v přehledu rozumí jejich původu a účinku.
- [x] Dvě rozdílné historie vedou k prokazatelně odlišným možnostem. Staré kampaně mají vysvětlené výchozí hodnoty bez smyšlených minulých událostí. Doloženo v A skutečným účinkem v kmeni.

| Část | Stav | Rozsah / doložení |
| --- | --- | --- |
| **SP-007.A — smlouva a záznam výsledků linie** | Hotovo | [Smlouva v1](SP-007A-CONTRACT.md), skutečná potrava/lov a výsledky existujících etap, přehled dědictví, vyvážený důsledek tvora v kmeni. [Report](SP-007A-REPORT.md): 2 291 testů, dvě hrané historie ze stejné připravené souše a nová buňka bez fixture. |
| **SP-007.B1 — následky řešení kmenů** | Hotovo | [Plán](../superpowers/plans/2026-09-24-sp-007b1-tribal-inheritance.md), [report](SP-007B1-REPORT.md): allied +20 % příjmu, conquered +20 % regionálního výkonu, mixed obojí +10 %. Tři/pět sousedů, historické savey bez zpětných grantů, 2 643 testů, tři produkční UI cesty a finální replay. |
| **SP-007.B2 — civilizační expanze a její následky** | K plánu | Skutečně volené způsoby expanze SP-009 a jejich dědictví. Dnešní region.method pouze eviduje existující zděděný archetyp. |
| **SP-007.D — vesmírná filozofie říše** | K plánu | Odvození filozofie a vesmírných schopností z doložené historie; navazuje na SP-011–014. |

A ani B1 nezavírají celou SP-007: kmenové následky jsou hotové, samostatně volená civilizační expanze, její dědictví B2 a vesmírná filozofie D zbývají. Neznámý jídelníček starých saveů se neodvozuje z těla. Připravené vstupy, obnova checkpointu a meze lidského playtestu jsou výslovně rozlišené v reportu.

<a id="sp-008"></a>
### SP-008 — Kmen jako aktivní společnost

**Výchozí stav:** vlastní členové sbírají, staví a bojují; tři sousedé mají vztah, zdraví a místní odvetu. **Cíl:** samostatně jednající sousední tlupy a širší společenská hra.

**Rozdělení:** A aktivní sousedé → B kulturní výstroj → C rozšířená hudební setkání → D domestikace → E náčelník → F pět sousedů. Navázat na [kmen](../../src/game/tribe.ts), [sousedy](../../src/game/tribe-neighbours.ts), [divoké tvory](../../src/game/tribe-wildlife.ts), [příkazy](../../src/game/unit-order.ts) a [browser scénáře kmene](../../scripts/tribe-browser.mjs). Reference: [kmenový průchod Spore][tribal].

- [x] **SP-008.A, tři současní sousedé:** skutečné jednotky, sběr, spotřeba a obnova; samostatná varovaná výprava za jídlem a obrana domova.
- [x] **SP-008.C:** hudební setkání vyžaduje volbu nástrojů a skutečných hráčů; vhodná/nevhodná sestava, správné/chybné rozhodnutí, přerušení a save/load mají doložené odlišné výsledky.
- [x] **SP-008.B:** kulturní editor, dvě odlišné placené sestavy, společný náhled/vykreslení/účinky, pracovní nástroje a kompatibilní save/load.
- [x] **SP-008.D:** skutečného divokého zvonkonoše lze získat, dovést domů, krmit a zadat mu fyzický sběr; cena, kapacita, zanedbání, přerušení, uvolnění a save/load mají doložené účinky.
- [x] **SP-008.E:** explicitně zvolený původní člen, viditelný znak a ovladatelný Smírčí sněm; skutečný kontakt, cena, účinek, přerušení, předání a save/load. [Důkazy a meze](SP-008E-REPORT.md).
- [x] **SP-008.F:** pět skutečných společností; rozmístění podle těl/výstroje, fyzické cesty a návraty na pěti seedech, společné konečné hospodaření a dostupné zdroje. [Důkazy a meze](SP-008F-REPORT.md).
- [x] **SP-008.A/F:** fázi lze dokončit diplomacií i bojem; A doložila původní tři a skutečné výpravy, F rozšířila obě cesty na pět, včetně save/import/load, jednorázových odměn a zákazu předčasného dokončení po třech výsledcích.


| Část | Stav | Rozsah a návaznost |
| --- | --- | --- |
| **SP-008.A — aktivní sousední kmeny** | Hotovo | Tři společnosti, fyzický sběr/doručení, placená spotřeba/obnova, obrana a varovaná výprava; smír, ústup, boj, obě cesty a kompatibilní save. [Plán](../superpowers/plans/2026-09-23-sp-008a-active-neighbours.md), [report](SP-008A-REPORT.md). |
| **SP-008.B — kulturní výstroj** | Hotovo | Čtyři části, tři barvy, knihovna kampaně s revizemi, samostatný i kampaňový přenos, checkpointy a historické savey. Sběr, diplomacie, boj, ochrana a cena pomalejšího pohybu; zachované tělo/nástroje/A/historie. Produkční UI 6/6, 2 364 regresí (podmínky běhu v reportu). [Plán](../superpowers/plans/2026-09-24-sp-008b-cultural-outfits.md), [report](SP-008B-REPORT.md); pracovní strom nad `18346fb`. |
| **SP-008.C — rozšířená hudební setkání** | Hotovo | Buben/píšťala/chřestidlo, skutečný hostitel, tři požadavky a hráčovy odpovědi, cena/selhání/ukončení; oděv a dědictví jednou, kompatibilní save/import/checkpointy. Produkční UI 9/9, sedm prohlédnutých finálních snímků, 2 417 regresí s výslovně upravenými parametry běhu. [Plán](../superpowers/plans/2026-09-24-sp-008c-musical-encounters.md), [report a meze](SP-008C-REPORT.md). |
| **SP-008.D — domestikace** | Hotovo | Původní divoký zvonkonoš, placené získání/doprovod/péče, skutečný sběr a náklad, zanedbání a bezpečné ztráty. Přísné save/import/checkpointy a historická kompatibilita; bez nového civilizačního bonusu. Produkční UI 8 skupin kontrol + 7 ve finálním replayi, osm prohlédnutých snímků 1280×720; 2 470 testů, typecheck/build. [Plán](../superpowers/plans/2026-09-24-sp-008d-domestication.md), [report, parametry a meze](SP-008D-REPORT.md). |
| **SP-008.E — náčelník** | Hotovo | Volba původního potomka bez změny těla/výstroje, placený kontaktní Smírčí sněm, globální cooldown a bezpečné přerušení/nástupnictví. Přísné save/import/checkpointy. Produkční UI 7/7, šest prohlédnutých snímků (pět 1280×720); 2 528 testů, typecheck/build. [Plán](../superpowers/plans/2026-09-24-sp-008e-chief.md), [report, parametry a meze](SP-008E-REPORT.md). |
| **SP-008.F — pět sousedů** | Hotovo | Pět odlišných společností, fyzické rozmístění a cesty, konečná ekonomika, omezený souběh výprav, přesné dokončení a historické savey. 63 nových regresí, celkem 2 591 testů, typecheck/build. Celé diplomatické UI 10/10 na předchozím buildu; finální bojové UI 9/9 a diplomatický replay 3/3, osm prohlédnutých snímků. [Plán](../superpowers/plans/2026-09-24-sp-008f-five-neighbours.md), [report, parametry a meze](SP-008F-REPORT.md); pracovní strom nad `190f55f`. |

A–F zachovávají tělo, jídelníček, pracovní nástroje, boj a jednorázové výsledky. C přidává aktivní hudební požadavky a nástroje vedle oddělené kulturní výstroje; chochol a dědictví se uplatní jednou na skutečně odpovídající hráče. D odlišuje původní zvíře od člena vlastního druhu a symbionta; pracuje se skutečnou faunou, zdroji, kontaktem a zásobami. E přidává výslovně volenou roli původního člena a placený kontaktní sněm bez pasivního bonusu; předání i load zachovávají společný odpočinek. F rozšiřuje tuto společenskou hru na pět skutečných sousedů a uzavírá zbývající kritéria SP-008; [souhrn důkazů napříč A–F](SP-008F-REPORT.md#doložení-kritérií-napříč-af) výslovně odlišuje původní průchody od nových regresí a replaye. **Navazující následky kmene pro stroje jsou doložené dokončenou [SP-007.B1](SP-007B1-REPORT.md)**; A–F nemění strojový archetyp podle nových výsledků. B přebírá z SP-005 jen potřebnou identitu/revize, oddělený návrh a přenos. Příslušná čitelnost, geometrie a odezva byly ověřovány uvnitř A–F, ale celá SP-017 zůstává otevřená, zejména lidský playtest a poslech. Připravené browser vstupy, odehrané akce a meze automatického ověření jsou oddělené v reportech.

<a id="sp-009"></a>
### SP-009 — Plná civilizace s městy

**Výchozí stav:** vlastní tanky/letouny a tři regiony s jantarovým příjmem. **Cíl:** města a soupeřící státy, které mají ekonomiku a samy expandují.

**Rozdělení plánů:** městská ekonomika a rozmístění → editor budov → soupeřící státy → tři způsoby převzetí → námořní expanze. Navázat na [stroje](../../src/game/machines.ts), [konstrukce](../../src/game/blueprint.ts), [osadu](../../src/render/settlement.ts) a [strojový editor](../../scripts/machine-editor-browser.mjs); umístění měst využije SP-010. Reference: [manuál, str. 27–29 a 40–45][manual], [archetypy budov a vozidel][archetypes].

- [ ] Města mají obyvatele, produkci, náklady a spokojenost; rozmístění domů, továren, zábavy a obrany mění jejich výsledky.
- [ ] Hráč navrhuje vzhled budov a ukládá je do knihovny; konstrukční vzhled a hospodářské účinky jsou srozumitelné.
- [ ] Soupeřící státy spravují vlastní zdroje, vozidla, obranu a územní rozhodování; mohou zahájit expanzi bez hráčova útoku.
- [ ] Vojenské dobytí, obchodní převzetí a náboženská konverze jsou rozdílné hratelné systémy s možností dokončit fázi každou cestou.
- [ ] Pozemní, námořní a letecké stroje využívají odpovídající terén a zdroje; stav všech měst a států přežije uložení.

<a id="sp-010"></a>
### SP-010 — Celoplanetární měřítko

**Výchozí stav:** tři fyzické světy; pozdější etapy používají pobřeží. **Cíl:** planeta jako trvalý svět s kontinenty, moři, biomy a místy, ke kterým se lze vracet.

**Rozdělení plánů:** identita planety/lokalit a migrace → generování a návaznost terénu → globální kamera a integrace měst. Nejprve definovat datové rozhraní pro SP-009. Navázat na [svět](../../src/game/world.ts), [typy](../../src/game/types.ts), [mapování etap](../../src/game/stage.ts), [kameru](../../src/game/camera.ts) a [persistenci](../../src/game/persistence.ts). Měřítko referenční civilizace a vesmíru: [manuál][manual].

- [x] Identita planety a jejích lokalit je oddělená od aktuálně vykreslené scény a čísla etapy. **SP-010.A:** trvalá ID tří existujících habitatů, zapojená UI aktivace/přechody/save/checkpointy, místní adresy pro SP-009; [report a meze](SP-010A-REPORT.md).
- [ ] Kontinenty, oceány a biomy tvoří použitelný svět; lokální výchozí místo je jeho rozpoznatelnou součástí.
- [ ] Kamera přechází od místního dění ke globálnímu přehledu s čitelnou navigací a výběrem měst.
- [ ] Návrat mezi vzdálenými místy i save/load zachová jejich stav; staré kampaně mají ověřenou migraci.
- [ ] Zaznamenat výkon a paměť při přechodech měřítek a opakovaných návratech; neudržovat všechny detailní scény trvale načtené.

| Část | Stav | Přesný rozsah |
| --- | --- | --- |
| SP-010.A — identita a místní adresy | Hotovo | `homePlanet` v1, původní světy bez regenerace, opakovatelná aktivace historických kampaní bez vymyšlených návštěv, HUD/deník a 53 nových regresí. |
| SP-010.B — geografická návaznost | K plánu | Kontinenty, oceány, terén a explicitní zasazení původních habitatů; žádná tichá reinterpretace místních souřadnic. |
| SP-010.C — globální navigace a města | K plánu | Globální kamera, výběr měst, vzdálené návraty a zachování stavu, měření výkonu/paměti. |

A prokazuje migraci a zachování **dosavadních** světů; kritérium skutečného cestování mezi vzdálenými místy zůstává otevřené. `GameState.planet` nadále označuje lokální terraformaci pobřeží. SP-009.A má navázat založením a persistencí měst podle adresního kontraktu; ekonomiku/strategie řeší SP-009 a jejich následky SP-007.B2, vesmírnou filozofii SP-007.D. Celé SP-010, SP-009 a SP-007.B2/D se tím neuzavírají.

<a id="sp-011"></a>
### SP-011 — Vlastní loď, soustavy a galaxie

**Výchozí stav:** vesmírné cestování ani datový model soustav neexistují. **Cíl:** jedna přímo ovládaná kosmická loď, návštěvy planet a postupné otevření galaxie.

**Rozdělení plánů:** editor a řízení lodi → planeta/orbita/soustava → druhá soustava a návrat → vybavení a širší hvězdná mapa. Znovu použít principy [blueprintu](../../src/game/blueprint.ts), [kamery](../../src/game/camera.ts) a [ukládání](../../src/game/persistence.ts); nové vesmírné moduly navrhnout nad planetami SP-010. Reference: [manuál, str. 46–51][manual], [ovládaná loď a spojenecký doprovod][faq].

- [ ] Loď lze vytvořit v editoru, pojmenovat, uložit a přímo řídit; model odpovídá uložené konstrukci.
- [ ] Hráč projde domovská planeta → orbita → soustava → cizí soustava → povrch jiné planety a vrátí se bez ztráty stavu.
- [ ] Skenování, náklad, sběr/pokládání organismů, energie, zdraví a vybavení tvoří použitelnou výpravu s čitelnými omezeními.
- [ ] Galaxie obsahuje více rozlišitelných soustav a podporuje další průzkum, nikoli jen dvě napevno spojené scény; zahrnuje navigaci a doprovod spojenců.
- [ ] Save/load funguje při cestování i pobytu mimo domov. Milník C doloží první okruh; D doloží širší průzkum a hospodaření s vybavením.

<a id="sp-012"></a>
### SP-012 — Opakovatelná terraformace cizích planet

**Výchozí stav:** lokální teplota/vláha, T0–T3 a živé řetězce; dnešní krajina potřebuje dvě kultury, dva býložravce a predátora. **Cíl:** různé planety, které hráč klimatem a přivezeným životem mění pro osídlení.

**Rozdělení plánů:** klima každé planety → nástroje oběma směry → dovoz života a stabilita → vazba na kolonie. Navázat na [terraformaci](../../src/game/planet.ts), [klima](../../src/game/climate.ts), [katalog](../../src/game/ecology-catalog.ts), [demografii](../../src/game/demography.ts) a [planetární testy](../../tests/planet.test.ts). Reference: [terraformace Spore][terraforming]; podrobná pravidla před implementací znovu ověřit podle postupu se zdroji níže.

- [ ] Planety mají různé výchozí teploty a hustotu atmosféry; obě osy lze nástroji zvyšovat i snižovat.
- [ ] Každý odemčený pás T má prostor pro tři velikosti rostlin, dva býložravce a jednoho predátora; život se skutečně přenáší lodí mezi světy.
- [ ] Klimatická obyvatelnost, úplnost/stabilita ekosystému a kapacita osídlení jsou odlišné, srozumitelné veličiny.
- [ ] Zásahy mění vzhled a funkci planety; ztráta potřebného života má pozorovatelný následek. Odlet, návrat a načtení zachovají změny.
- [ ] Dvě planety s odlišným výchozím klimatem vyžadují odlišný postup a fungují i po vypnutí nástrojů; navazují na kolonizaci SP-013.

<a id="sp-013"></a>
### SP-013 — Kolonizace, obchod a mimozemské říše

**Výchozí stav:** kolonie, vesmírná ekonomika ani cizí říše nejsou implementované. **Cíl:** terraformace vytváří prostor pro hospodářský a diplomatický růst.

**Rozdělení plánů:** kolonie a produkce → trh a přeprava → říše/vztahy/mise → obchodní a vojenská expanze. Navázat na planetární model SP-010, cestování SP-011, ekologii SP-012 a zkušenosti s [ekonomikou strojů](../../src/game/machines.ts). Reference: [manuál, str. 50–51][manual], [vesmírná fáze][space].

- [ ] Na vhodné planetě lze založit trvalou kolonii, vyrábět suroviny, opravovat a doplňovat loď; kapacita souvisí s obyvatelností.
- [ ] Různé typy koření nebo funkčně odpovídající suroviny mají odlišnou hodnotu, místní ceny a obchodní trasy; skutečný náklad a platby se ukládají.
- [ ] Cizí říše mají území, osobnost, vztahy, mise a dohody, které ovlivňují konkrétní chování.
- [ ] Existuje mírový růst včetně obchodu a koupě soustavy i vojenská expanze s obranou a diplomatickými důsledky.
- [ ] Běžné hraní doloží okruh kolonizace → produkce → prodej → další výprava; rozšířený průchod ověří udržitelnou mírovou i válečnou cestu.

<a id="sp-014"></a>
### SP-014 — Otevřená pozdní vesmírná hra

**Výchozí stav:** dnešní sandbox končí péčí o domácí krajinu. **Cíl:** galaxie nabízí dlouhodobý průzkum, rozvoj a situace, mezi kterými si hráč vybírá.

**Rozdělení plánů:** odznaky a vybavení → mise/události → artefakty a červí díry → podpora mladších civilizací. Nové systémy budou navazovat na SP-011 až SP-013; stávající [historie linie](../../src/game/journey-types.ts) je podklad pro evidenci, nikoli hotový systém vesmírných misí. Reference: [přehled vesmírné fáze][space].

- [ ] Odznaky za různé činnosti odemykají užitečné vybavení a podporují více stylů hry.
- [ ] Průzkumné, obchodní a diplomatické mise mají ověřitelné cíle, odměny a následky.
- [ ] Piráti, obrana kolonií a ekologické krize vznikají z herního stavu; hráč může reagovat a následky přetrvávají.
- [ ] Artefakty, červí díry a podpora vývoje mladších civilizací přinášejí odlišné možnosti průzkumu a vztahů.
- [ ] Delší hraní doloží prostor pro souvislou expedici vedle péče o říši; zaznamenat četnost přerušení, nikoli jen zvýšit počet událostí.

<a id="sp-015"></a>
### SP-015 — Jádro galaxie a výrazná dlouhodobá odměna

**Cíl:** vzdálený, čitelný cíl s nebezpečnou mocností v herní roli Groxů, setkáním v jádru a odměnou s planetárním účinkem. Vlastní obsah LUMAVORY může plnit stejnou herní roli.

**Rozdělení plánů:** mocnost a průchod oblastí → setkání a odměna → pokračování a vyvážení. Využít galaxii, vztahy, vybavení a mise SP-011 až SP-014. Reference: [přehled cíle a Staff of Life][core].

- [ ] Hráč se přirozeně dozví o jádru a má prostředky plánovat postup přes nebezpečnou oblast.
- [ ] Cíle lze dosáhnout více strategiemi; úplné vyhlazení nepřátelské říše není nutnou podmínkou.
- [ ] Setkání poskytne výraznou odměnu, kterou lze skutečně použít na planetě a jejíž účinek je uložen.
- [ ] Po dosažení cíle pokračuje galaxie a rozvoj říše; ověřit návrat z jádra a následnou výpravu.

<a id="sp-016"></a>
### SP-016 — Kapitán a Galactic Adventures

**Cíl:** vrátit do vesmírné fáze přímé ovládání vlastního druhu při planetárních dobrodružstvích. Jde o navazující rozsah po otevřené galaxii, ne podmínku prvního vesmírného okruhu.

**Rozdělení plánů:** výsadek kapitána → výstroj/postup a autorské mise → editor stejných misí a přenos obsahu. Znovu využít [organismus](../../src/render/organism.ts), [lokomoci](../../src/game/locomotion.ts), schopnosti SP-003 a knihovnu SP-005. Reference: [oficiální Galactic Adventures][ga].

- [ ] Kapitán používá vlastní druh, vystoupí na planetu, ovládá se a vrátí se do lodi s výsledky mise.
- [ ] Výstroj a postup kapitána odemykají použitelné možnosti; alespoň tři autorské mise ověří boj, sociální řešení a průzkum.
- [ ] Editor dovolí umístit postavy a objekty, nastavit cíle, dialogy a události; zvládne vytvořit stejné typy misí jako autorské příklady.
- [ ] Vlastní dobrodružství lze uložit, znovu odehrát a přenést s potřebnými výtvory bez poškození kampaně; knihovna je zpřístupní podle SP-005.

<a id="sp-017"></a>
### SP-017 — Výraz tvorů, krajina, zvuk a čitelnost

**Výchozí stav:** procedurální grafika a zvuk fungují; audit ukázal jednoduché siluety, klidnou krajinu a rozsáhlé textové panely. **Cíl:** přiblížit každou novou herní smyčku výraznému, hravému a snadno čitelnému projevu Spore.

**Rozdělení plánů:** samostatné dílčí výstupy A až E, vždy společně s funkčním milníkem. Navázat na [organismus](../../src/render/organism.ts), [styl světa](../../src/render/world-style.ts), [prostředí](../../src/render/habitat.ts), [zvuk](../../src/render/audio.ts) a [UI styly](../../src/ui/styles.css). Výtvarná východiska a snímky současné hry obsahuje [audit](../2026-09-17-spore-similarity-audit.md); vizuální reference [Spore][overview].

- [ ] A: výrazné siluety, měkké organické povrchy, obličeje a sociální animace odlišují tvory; zvuky podporují osobnost a reakce druhů.
- [ ] A/B: krajina má rozlišitelné biomy a kompaktní ikonové ovládání; vztahy, dosahy a cíle jsou vidět přímo při hraní.
- [ ] B/C: přechody ukazují první kroky druhu, nástroje, město a odlet; změny měřítka mají srozumitelnou kameru a zvukovou odezvu.
- [ ] C/D/E: planetární stav, vztahy říší a cíle kapitána mají čitelné vlastní zobrazení s návazností na již naučené ovládání.
- [ ] U každého milníku je doložen krátký průchod skutečným UI a prohlédnuté finální snímky; lidský playtest zaznamená porozumění i případné problémy. Kartu uzavřít až po všech milnících.

<a id="planovani"></a>
## Jak vytvořit plán a aktualizovat tracker

1. Vybrat ID podle milníku a návazností. Přečíst kartu, brief, audit a aktuální kód; rozdíly od výchozí revize zaznamenat do plánu.
2. Velký bod rozdělit na samostatně ověřitelné části. Podúkoly mají ID například `SP-002.1`, `SP-002.2`; přidají se pod kartu s vlastním stavem a odkazem. Mateřské ID a původní kritéria se nemažou.
3. Vytvořit konkrétní plán v `docs/superpowers/plans/`. Jmenný vzor: `YYYY-MM-DD-sp-002-1-creature-body-model.md`. Jde o vzor budoucí cesty, nikoli už existující soubor. Na skutečně vytvořený plán odkazovat z tabulky.
4. Plán popíše problém a cílový průchod, rozsah daného podúkolu, přesné soubory a rozhraní, datové změny/migrace, pořadí kroků, chybové stavy a ověření. Zvlášť uvede, která kritéria mateřské karty pokrývá a která zůstávají na další práci. Současně zahrne příslušný díl SP-017.
5. Při implementaci měnit stav a odškrtávat pouze doložená kritéria. Do posledního sloupce přidat plán, dokončený výstup a dostupný commit nebo revizi; bez commitu lze výslovně uvést pracovní strom.
6. Před stavem **Hotovo** ověřit chování, ukládání a relevantní regrese. Herní změna potřebuje podle rozsahu také běžné hraní bez zápisu testovacího stavu a závěrečný typecheck/build. Připravené importované scénáře uvádět jako takové. Čistě dokumentační změna nepotřebuje celou herní sadu.
7. Krátký výsledek a meze ověření uložit do verzovaného reportu nebo plánu. Velké browser výstupy ponechat mimo Git; zachovat malou finální evidenci podle [AGENTS.md](../../AGENTS.md). Samotný odkaz na lokální ignorované `evidence/` nestačí jako jediný trvalý doklad dokončení.
8. Přidat stručný datovaný záznam níže. Pokud se rozsah změní, uvést důvod a přesunout zbývající práci do pojmenovaného bodu; neoznačovat ji tiše za hotovou. Milník přijmout podle hratelného výsledku briefu, ne podle počtu odškrtnutých dílčích úkolů.

SP-002.1–SP-002.3 jsou doložené [finálním reportem](SP-002-REPORT.md). Navazující SP-003 a SP-004 už mají [report života druhu](SP-003-REPORT.md) a [report objevování a generací](SP-004-REPORT.md). Část A knihovny SP-005 je doložená [reportem](SP-005-REPORT.md); zbývající části B–E zůstávají otevřené. SP-006 uzavírá [report buněčné smyčky](SP-006-REPORT.md); první část SP-007 uzavírá [smlouva a report dědictví](SP-007A-REPORT.md). SP-008 je doložená napříč [A–F](SP-008F-REPORT.md); následky kmene uzavírá [SP-007.B1](SP-007B1-REPORT.md). Milník B pokračuje planetárním rozhraním SP-010 a městy SP-009, jejichž skutečné volby budou zdrojem B2. Celá SP-017 zůstává otevřená, včetně chybějícího lidského testu a poslechu. Tento tracker samotný není vykonatelným plánem všech 17 bodů.

## Zdroje pro implementační návrhy

Zdroje byly dohledány v auditu 17. září 2026. Manuál a oficiální web tvoří hlavní referenci; číslování stran v kartách odkazuje na tištěné strany manuálu. Komunitní přehledy doplňují podrobnosti. U části komunitních stránek byl při auditu dostupný jen text vyhledávacího indexu, proto před převzetím přesných pravidel do implementace ověřit příslušnou mechaniku. Akceptační scénáře a rozdělení práce jsou návrh pro LUMAVORU, nikoli citace specifikace Spore.

- [Oficiální přehled základní hry][overview] — fáze a editory.
- [Originální manuál EA/Maxis][manual] — ovládání, tvor, kmen, města a vesmír.
- [Oficiální archetypy][archetypes] — schopnosti tvorů, kategorie budov a vozidel.
- [Oficiální FAQ][faq] — návaznost etap, osazování světa výtvory, loď a singleplayer.
- [Kmenový průchod GameSpot][tribal] — praktický průběh kmenové fáze.
- [Spore Wiki: terraformace][terraforming] a [vesmírná fáze][space] — ekosystémy a pozdní herní systémy.
- [Přehled Spore a galaktického jádra][core] — dlouhodobý cíl a jeho odměna.
- [Oficiální Galactic Adventures][ga] — kapitán a tvorba dobrodružství.

## Záznam změn

| Datum | Změna | Doložení |
| --- | --- | --- |
| 2026-09-24 | SP-007.B1 dokončeno: tři cesty sjednocení mění strojový příjem/výkon, tři i pět sousedů, historická kompatibilita bez zpětných odměn. 52 nových regresí, celkem 2 643 testů s původními limity; typecheck/build. Produkční tři cesty 21/21 a finální replay 15/15 po opravě čekání na HUD; devět prohlédnutých snímků, nezávislé review a úklid. B2/D, SP-009/SP-010 a celá SP-017 otevřené. Bez commitu, pushe a deploye. | [Report a meze](SP-007B1-REPORT.md), [plán](../superpowers/plans/2026-09-24-sp-007b1-tribal-inheritance.md) |
| 2026-09-24 | SP-008.F dokončeno: pět hospodařících sousedů, fyzické cesty/těla/výstroj, konečné zdroje, obě cesty a přesné výsledky/savey. 2 591 testů s jedním pracovníkem a globálním limitem 60 s po diagnostice timeoutů; typecheck/build. Diplomatické UI 10/10 na předchozím buildu, finální boj 9/9 a diplomatický replay 3/3. Kritéria A–F doložena, celá SP-008 uzavřena; SP-007.B1 a SP-017 otevřené. Bez lidského playtestu/poslechu, commitu a pushe. | [Report včetně souhrnu A–F](SP-008F-REPORT.md), [plán](../superpowers/plans/2026-09-24-sp-008f-five-neighbours.md) |
| 2026-09-24 | SP-008.E dokončeno: zvolený původní člen, placený kontaktní sněm, skutečný účinek, omezení, přerušení a předání bez resetu cooldownu. UI 7/7, šest prohlédnutých snímků, 2 528 testů s jedním pracovníkem a globálním limitem 30 s po diagnostice staršího timeoutu; typecheck/build. F, SP-007.B1 a celá SP-017 otevřené, bez skutečného poslechu/lidského playtestu. | [Report](SP-008E-REPORT.md), [plán](../superpowers/plans/2026-09-24-sp-008e-chief.md) |
| 2026-09-24 | SP-008.D dokončeno: získání skutečného zvonkonoše, fyzický doprovod, placená péče a sběr/doručení, zanedbání, přerušení a uvolnění; přesný save/load i ztracené reference. Produkční UI 8 + 7 skupin kontrol, osm prohlédnutých finálních snímků 1280×720. 2 470 testů s jedním pracovníkem a globálním limitem 30 s po diagnostice pěti timeoutů; typecheck/build. E/F, SP-007.B1 a celá SP-017 otevřené; skutečný poslech/lidský playtest neproveden. | [Report](SP-008D-REPORT.md), [plán](../superpowers/plans/2026-09-24-sp-008d-domestication.md) |
| 2026-09-24 | SP-008.C dokončeno: aktivní hudební návštěva skutečných sousedů, výběr členů/nástrojů a reakcí, odlišný úspěch/selhání, přerušení a přesné pokračování save/load. Produkční UI 9/9, finální 1280×720; 2 417 testů s jedním pracovníkem a globálním limitem 30 s po diagnostice timeoutů, typecheck/build. D–F a civilizační dědictví otevřené; skutečný poslech/lidský playtest neproveden. | [Report](SP-008C-REPORT.md), [plán](../superpowers/plans/2026-09-24-sp-008c-musical-encounters.md) |
| 2026-09-24 | SP-008.B dokončeno: kulturní sestavy, skutečné účinky vedle nástrojů, knihovna kampaně, přenos/checkpointy a staré savey. Produkční UI 6/6 včetně 1280×720; 2 364 testů se dvěma pracovníky a globálním limitem 30 s po timeoutech v zatíženém prostředí; typecheck/build. C–F a civilizační dědictví zůstávají otevřené. | [Report](SP-008B-REPORT.md), [plán](../superpowers/plans/2026-09-24-sp-008b-cultural-outfits.md) |
| 2026-09-23 | SP-006 dokončeno: tři růsty, velikost potravy a lovu, lokální kontakty, tři zděděné objevy a vedení do editoru. Nová linie odehraná přes UI bez přepisování stavu, 6/6 kontrol; 2 267 testů, typecheck/build, nezávislé review a SP-005 regrese. Lidské porozumění a celá navazující kampaň neověřeny. | [Report](SP-006-REPORT.md), [plán](../superpowers/plans/2026-09-23-sp-006-cell-growth.md) |
| 2026-09-23 | SP-005.A dokončeno: knihovna a editor samostatných tvorů, bezpečný import/export, genomoví NPC z dřívějších výtvorů a snapshot v nových liniích. 2 241 testů, produkční setkání/nábor/save-load; části B–E zůstávají otevřené. | [Report](SP-005-REPORT.md), [plán](../superpowers/plans/2026-09-23-sp-005-creature-library.md) |
| 2026-09-23 | SP-004 dokončeno: trvalé objevy oddělené od DNA, kosterní pozůstatky, alfa, použití odměny v nové generaci a fyzický doprovod do nového hnízda. Kompatibilní staré savey, 2 202 testů a nativní browser průchody. | [Report](SP-004-REPORT.md), [plán](../superpowers/plans/2026-09-23-sp-004-discovery-generations.md) |
| 2026-09-17 | SP-002.1–.3 dokončeno: tři UI placené konstrukce, terén/save/recovery, skutečně hraný rozpočet a produkční v2; 2 130 testů a původní browser regrese prošly. Dva SwiftShader benchmarky a lidské mezery jsou zveřejněné; SP-003/004/005/017 otevřené. | [Report přijetí](SP-002-REPORT.md) |
| 2026-09-17 | SP-002 naplánováno ve třech navazujících podúkolech a devíti implementačních úkolech. Zahrnuje genom v2, ochranu v1 saveů, klouby a koncové části, DNA, terén, společné náhledy a příslušnou část SP-017. Herní implementace nezahájena. | [Plán a ověření výchozího stavu](../superpowers/plans/2026-09-17-sp-002-creature-editor.md) |
| 2026-09-17 | SP-001 dokončeno: opraven tečný kontakt, vysvětleny a zachovány dva přesné numerické profily; 1 957/1 957 testů, typecheck/build, UI a review prošly. Nejbližší práce je plán SP-002. | [Report, pracovní strom nad 4da58b6](SP-001-REPORT.md) |
| 2026-09-17 | Založen brief a tracker 17 přijatých bodů; všechny nové karty jsou K plánu. Existující implementace uvedena zvlášť. První práce je diagnostika SP-001 a následně editor SP-002. | [Výchozí audit revize 4da58b6](../2026-09-17-spore-similarity-audit.md), [brief](BRIEF.md) |

[overview]: https://www.spore.com/what/spore
[manual]: https://shared.steamstatic.com/store_item_assets/steam/apps/17390/manuals/manual.pdf?t=1642702281
[archetypes]: https://www.spore.com/comm/tutorials/archetypes
[faq]: https://www.spore.com/comm/faq2
[tribal]: https://www.gamespot.com/articles/spore-walkthrough/1100-6198224/
[terraforming]: https://spore.fandom.com/wiki/Terraforming
[space]: https://spore.fandom.com/wiki/Space_Stage
[core]: https://en.wikipedia.org/wiki/Spore_(2008_video_game)
[ga]: https://www.spore.com/what/ga
