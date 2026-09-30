# LUMAVORA / Spore — tracker dalšího vývoje

Založeno 17. září 2026 podle přijatých doporučení z [auditu](../2026-09-17-spore-similarity-audit.md). Směr a milníky určuje [BRIEF.md](BRIEF.md). ID **SP-001 až SP-017 odpovídají bodům 1 až 17 auditu** a zůstávají stabilní i při změně pořadí práce.

Toto je backlog pro přípravu menších implementačních plánů. Při založení není žádné z nových rozšíření označeno za hotové a není rozpracovaná herní změna. Již existující základ je uveden zvlášť níže.

## Stav a pořadí práce

**30. září — kratší buňka a viditelné dědictví:** prahy 2/4/7, jeden použitý objev, volitelná buněčná ekologie; dvě výslovné historie s aktivním pulzem v útesu, stávající hnízdní a civilizační větve v kompaktním deníku. Domácí příjem po dokončení regionů ×2, možnost společné přepravy zbývajících placených zásilek. Dvě nové produkční linie, legitimní pozdější checkpointy, všechny tři civilizační výsledky a kompatibilita jádra doloženy v [reportu](EVOLUTION-OPENING-REPORT.md). SP-006/007/017 mají tuto navazující implementaci; lidská délka 3–5 minut, porozumění a zábavnost stále čekají. Historické reporty níže popisují tehdejší pravidla, nový report má pro tuto změnu přednost.

**Rozsah schválený uživatelem 26. září 2026:** aktuální cíl končí cestou k jádru galaxie v milníku D, včetně použitelné odměny a ověření návratu/pokračování v existující galaxii. E / SP-016 a dobrodružné části SP-005/SP-017 jsou odložené volitelné pokračování; neblokují dokončení aktuálního cíle a automaticky se na ně nenavazuje. Jejich kritéria zůstávají zachovaná a nesplněná. Všechna kritéria A–D, souvislá nová kampaň až k jádru, alternativní cesty, kompatibilita, vizuál, zvuk a ovládání A–D zůstávají v rozsahu. Podrobnosti určuje [BRIEF.md](BRIEF.md#cíl-a-platnost).

**Nezávislé review a opravy (28. září):** uzavřeny tři kontrolní oblasti; opraven plný registr blokující první města států, opožděný import kampaně, hlasitost již naplánovaných efektů a zalomení tlačítek pauzy. **4 641testů/206souborů**, typecheck/build, veřejné UI regrese a58exportů/checkpointů prošly. Aktivní kampaň beze změny. [Report oprav a přesné meze](FINAL-REVIEW-REPORT.md). Zbývá skutečné lidské přijetí sedmi scénářů; kritéria ani rozsah se nemění.

**Závěrečná nová kampaň A–D dohraná (27. září):** [report, konkrétní akce a hashe](FINAL-CAMPAIGN-REPORT.md). Nová buňka → celý útes → vlastní tvor → všech pět kmenových sousedů → celá obchodní civilizace → vlastní loď → cizí život/terraformace/kolonie/produkce/prodej → získané mise, výbava a dědictví → relikty, podpora, jádro → použitá a uložená odměna → návrat → další výprava a návrat. Samostatně dokončené nové konverzní i vojenské civilizační větve. Hlavní save stojí doma, SHA `7f357263…8ee8aa6`;126cest/966,067s aktivního vesmíru,1pirát s ústupem/0vynucených návratů. Celá sada4 637testů/205souborů, build a57exportů/checkpointů prošly; [souhrn přenosů, dědictví, zobrazení a zvuku](SP-005-007-017-AD-REPORT.md). [Lidské přijetí a poslech čekají](A-D-HUMAN-ACCEPTANCE.md); celý goal zatím není dokončený.

**SP-002 je doložené [reportem editoru tvora](SP-002-REPORT.md).** Model a ukládání, UI konstrukce, pohyb i zkoušení schopností jsou zpřístupněné v produkční souši; report zachovává výkonnostní omezení software rendereru a chybějící lidský playtest. SP-001 je doložené [reportem opravy](SP-001-REPORT.md). Priorita aktuálního cíle jde podle milníků 0 → A → B → C → D; E zůstává volitelné budoucí pokračování. Vizuální práce SP-017 probíhá uvnitř každého milníku. Toto pořadí nenavazuje číslováním na historické fáze P0–P3, které už mají vlastní dokončené plány.

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
| [SP-005 · Knihovna výtvorů a společný genom](#sp-005) | A–E | Rozpracováno | SP-002; další typy spolu s příslušnými editory | **A hotovo:** [knihovna tvorů a NPC](SP-005-REPORT.md), [plán](../superpowers/plans/2026-09-23-sp-005-creature-library.md). **Budovy z B hotové:** [SP-009.C](SP-009C-REPORT.md); **Vozidla z B hotová:** [přenos, editor a placené snapshoty](SP-005B-VEHICLES-REPORT.md), [plán dokončení](../superpowers/plans/2026-09-26-lumavora-completion.md). **Lodě z C1 doložené:** [editor, přenos a placený let](SP-011C1-REPORT.md). Dobrodružství odložená s volitelným E mimo aktuální cíl. |
| [SP-006 · Buněčný růst a přestavba](#sp-006) | A | Hotovo | SP-001 | [Plán](../superpowers/plans/2026-09-23-sp-006-cell-growth.md), [růst, kontakty a objevování](SP-006-REPORT.md); 2 267 testů, nová linie bez připraveného stavu, meze lidského playtestu v reportu |
| [SP-007 · Dědictví celé linie](#sp-007) | A–D | K ověření | SP-003; výsledky dalších etap průběžně | **A hotovo:** [smlouva](SP-007A-CONTRACT.md), [report](SP-007A-REPORT.md), [plán](../superpowers/plans/2026-09-23-sp-007a-lineage-history.md); **B1 hotovo:** [následky kmene](SP-007B1-REPORT.md); **B2 hotovo:** [brána, historie a tři účinky](SP-007B2-REPORT.md), [nové všechny tři cesty](FINAL-CAMPAIGN-REPORT.md); **D technicky doložené novou linií/cenou11→13**, čeká lidské porozumění přehledu. |
| [SP-008 · Aktivní kmenová společnost](#sp-008) | B | Hotovo | SP-003, SP-007.A (smlouva dědictví) | **A–F hotovo:** [aktivní sousedé](SP-008A-REPORT.md), [kulturní výstroj](SP-008B-REPORT.md), [hudební setkání](SP-008C-REPORT.md), [domestikace](SP-008D-REPORT.md), [náčelník](SP-008E-REPORT.md), [pět sousedů a souhrn kritérií A–F](SP-008F-REPORT.md); F v pracovním stromu nad `190f55f` |
| [SP-009 · Města a civilizace](#sp-009) | B | Hotovo | SP-008, SP-010.A/B/C | **A hotovo:** [založení a persistence](SP-009A-REPORT.md), [smlouva A](SP-009A-CONTRACT.md). **B hotovo:** [placená ekonomika](SP-009B-REPORT.md), [smlouva B](SP-009B-CONTRACT.md). **C hotovo:** [editor budov a knihovna](SP-009C-REPORT.md), [smlouva C v1](SP-009C-CONTRACT.md), [plán](../superpowers/plans/2026-09-25-sp-009c-building-editor.md). **D hotovo:** [soupeřící státy a mírové osídlení](SP-009D-REPORT.md), [smlouva D v1](SP-009D-CONTRACT.md). **E hotovo:** [první vojenská cesta](SP-009E-REPORT.md). **F hotovo v omezeném rozsahu:** [obrana, protiútok a opakované převzetí](SP-009F-REPORT.md), [smlouva F v1](SP-009F-CONTRACT.md). **G hotovo v omezeném rozsahu:** [obchodní převzetí](SP-009G-REPORT.md), [smlouva G v1](SP-009G-CONTRACT.md). **H hotovo v omezeném rozsahu:** [konverzní obřady](SP-009H-REPORT.md), [smlouva H v1](SP-009H-CONTRACT.md). **I hotovo v omezeném rozsahu:** [placená námořní expanze](SP-009I-REPORT.md), [smlouva I v1](SP-009I-CONTRACT.md). **K1 hotovo:** [prostorová obrana](SP-009K1-REPORT.md). **K2 hotovo:** [výroba a placená obnova armád](SP-009K2-REPORT.md). **L hotovo:** [celé hrané alternativy, terénní role a finální replay](SP-009L-REPORT.md). [Nová linie nyní doložila obchod i oddělené vojenské/konverzní dokončení celé etapy](FINAL-CAMPAIGN-REPORT.md). Lidské přijetí/poslech zůstává v SP-017. |
| [SP-010 · Celá planeta](#sp-010) | B | Hotovo | SP-001 | **A hotovo:** [identita domova a lokalit](SP-010A-REPORT.md), [smlouva pro města](SP-010A-CONTRACT.md), [plán A](../superpowers/plans/2026-09-24-sp-010a-home-planet.md); **B hotovo:** [geografie a ověření](SP-010B-REPORT.md), [smlouva B](SP-010B-CONTRACT.md); **C navigace/návraty hotové:** [report C](SP-010C-REPORT.md), [smlouva C](SP-010C-CONTRACT.md); integraci skutečných měst ověřuje [SP-009.A](SP-009A-REPORT.md); všech pět nezměněných kritérií uzavírá [L](SP-009L-REPORT.md). |
| [SP-011 · Loď a vesmírné cestování](#sp-011) | C–D | Hotovo | SP-009, SP-010, SP-005 (knihovna a formát) | [C: vlastní loď → cizí svět → úplný okruh](../superpowers/plans/2026-09-26-first-space-circuit.md); [C1 implementováno a hraně doloženo](SP-011C1-REPORT.md): editor/přenos, placená loď a odlet/návrat; přesné testové a výkonové meze v reportu. [C2 implementováno a hraně doloženo](SP-011C2-REPORT.md): tři soustavy, skutečný životní náklad, import a návrat; 3924 testů celé sady prošlo. [První celý koloniální okruh C3b doložený](SP-013C-REPORT.md); [D3a zdraví, skutečný boj a obnova doložené](SP-014D3A-REPORT.md). Všech pět kritérií SP-011 doloženo; další D karty, nová celá kampaň a lidské přijetí zůstávají otevřené. |
| [SP-012 · Terraformace cizích světů](#sp-012) | C–D | Hotovo | SP-011, SP-005 (organismy) | [Plán C3](../superpowers/plans/2026-09-26-foreign-terraforming.md); [C3a1 klimatické nástroje a opačné nativní přeměny](SP-012A1-REPORT.md) doložené. [C3a2](SP-012A2-REPORT.md): živé pásy, skutečné odnože a obě opačné planety OFF, import i návrat doložené. [Kolonizace C3b doložená](SP-013C-REPORT.md); [Nová linie](FINAL-CAMPAIGN-REPORT.md) doložila skutečný první pás/kolonii/návraty a použití odměny D. Lidské přijetí se eviduje v SP-017. |
| [SP-013 · Kolonie, obchod a říše](#sp-013) | C–D | Hotovo | SP-011, SP-012 | [C3b: kolonie/produkce/prodej/návrat](../superpowers/plans/2026-09-26-space-colonies.md); [C3b report](SP-013C-REPORT.md): 4097 testů celé sady, build a skutečný koloniální okruh prošly; dvě placené kolonie, tři prodeje, ztráta/obnova výroby, import/návrat. [Navazující D plán](../superpowers/plans/2026-09-26-open-galaxy.md), [D1 tři kontakty/dohody, účty a skutečný návrat doložené](SP-013D1-REPORT.md). [D2b doprovod, koupě soustavy a nová produkce/prodej/návrat doložené](SP-013D2B-REPORT.md). [D3b válka, obrana, okupace a skutečný návrat doložené](SP-013D3B-REPORT.md). |
| [SP-014 · Otevřená vesmírná hra](#sp-014) | D | Hotovo | SP-013, SP-007 (vesmírné dědictví) | [D plán](../superpowers/plans/2026-09-26-open-galaxy.md); [D1 obchod, katalog i obě průzkumné zakázky doložené](SP-013D1-REPORT.md). [D2a odznaky, placené moduly a skutečný rozšířený okruh doložené](SP-014D2A-REPORT.md); [D2b skutečný doprovod doložený](SP-013D2B-REPORT.md); [D3a první pirátský boj a obnova hraně doložené](SP-014D3A-REPORT.md); [D3b válka a obrana doložené](SP-013D3B-REPORT.md). [D3c ekologické/pirátské události hraně doložené](SP-014D3C-REPORT.md); [D4 relikty a mladší společnost](SP-014D4-REPORT.md), [D5 jádro](SP-015D5-REPORT.md), [nová souvislá kampaň a četnost událostí](FINAL-CAMPAIGN-REPORT.md). |
| [SP-015 · Cesta k jádru galaxie](#sp-015) | D | Hotovo | SP-014 | [D5 report](SP-015D5-REPORT.md): skutečná diplomacie i silová cesta se záchranou, osobní setkání31, Kořen30energie/trvalé klima bez grantu života, import/návrat/další hlavní výprava.4620regresí, cílené18/38/20, finální build/typecheck, prohlédnuté obrazy a výkonové meze. [Nová souvislá linie také dohraná](FINAL-CAMPAIGN-REPORT.md). Celý cíl dále čeká lidské přijetí A–D; finální technické kontroly jsou doložené souhrnným reportem. |
| [SP-016 · Kapitán a dobrodružství](#sp-016) | E (volitelné) | Odloženo | SP-003, SP-014, SP-005 (přenos obsahu) | 26. září 2026: na přání uživatele mimo aktuální cíl, který končí jádrem galaxie; budoucí pokračování vyžaduje samostatný pokyn. |
| [SP-017 · Vizuál, zvuk a ovládání](#sp-017) | A–E | K ověření | Průběžně s každou hratelnou změnou | [Finální plán A–D](../superpowers/plans/2026-09-26-final-campaign.md), [hraný report, opravy a obrazy](FINAL-CAMPAIGN-REPORT.md), [čekající lidské přijetí/poslech](A-D-HUMAN-ACCEPTANCE.md). A–D zůstává součástí aktuálního cíle; část E odložena jako volitelné pokračování 26. září 2026. |

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

Část **SP-005.A — tvorové** dokončena v pracovním stromu nad `5aed4ba93`: [report](SP-005-REPORT.md), [plán](../superpowers/plans/2026-09-23-sp-005-creature-library.md). Samostatný 3D editor a verzovaná knihovna, deterministické osídlení nové linie, nezávislý snapshot kampaně; 2 241 testů a produkční UI průchod z připravené souše. B — budovy/vozidla a C/D — lodě jsou už doložené níže. Mateřská karta zůstává otevřená pro odloženou část E — dobrodružství.

**Budovová část SP-005.B dokončena v [SP-009.C](SP-009C-REPORT.md)**: skutečná geometrie, samostatné výtvory/revize, bezpečný přenos a stabilní snapshoty v zaplacených městských instancích. **Vozidlová část SP-005.B dokončena:** [report z 26. září](SP-005B-VEHICLES-REPORT.md), společný editor tanku/letounu/člunu, přenosná knihovna, skutečně placené snapshoty, vlastní plavba a historická kompatibilita. 3 375 testů celé sady + finálních 67 vozidlových, 4+2 produkční UI skupiny; meze lidského přijetí v reportu. Budovy i vozidla B jsou tím doložené. **Lodní část C1 je rovněž doložená:** [editor, knihovna/přenos, zaplacený neměnný model a přímé řízení](SP-011C1-REPORT.md). Celá SP-005 zůstává otevřená pro dobrodružství; společné kritérium se nedělí ani nezaškrtává před jejich dodáním.

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

- [x] Výsledky zaznamenávají jídelníček, sociální/bojovou cestu tvora, řešení kmenů a způsob civilizační expanze. **Nová souvislá linie:** [skutečná potrava, čtyři přátelství, pět aliancí, čtyři obchodní převody a uložený první kontakt](FINAL-CAMPAIGN-REPORT.md); historické alternativy a migrace doložené A/B1/B2/L.
- [x] Mírové a násilné sjednocení kmene mají různé následky i při stejném pobřežním závěru. B1 dokládá také smíšenou cestu, historickou trojici a novou pětici.
- [ ] Bonusy a vesmírná filozofie vznikají z doložené historie; hráč v přehledu rozumí jejich původu a účinku. **Technický důkaz:** [celá nová linie, přehled Tkadlec cest a skutečná cena11→13](FINAL-CAMPAIGN-REPORT.md). Lidské porozumění zatím nepotvrzené; [konkrétní scénář](A-D-HUMAN-ACCEPTANCE.md).
- [x] Dvě rozdílné historie vedou k prokazatelně odlišným možnostem. Staré kampaně mají vysvětlené výchozí hodnoty bez smyšlených minulých událostí. Doloženo v A skutečným účinkem v kmeni.

| Část | Stav | Rozsah / doložení |
| --- | --- | --- |
| **SP-007.A — smlouva a záznam výsledků linie** | Hotovo | [Smlouva v1](SP-007A-CONTRACT.md), skutečná potrava/lov a výsledky existujících etap, přehled dědictví, vyvážený důsledek tvora v kmeni. [Report](SP-007A-REPORT.md): 2 291 testů, dvě hrané historie ze stejné připravené souše a nová buňka bez fixture. |
| **SP-007.B1 — následky řešení kmenů** | Hotovo | [Plán](../superpowers/plans/2026-09-24-sp-007b1-tribal-inheritance.md), [report](SP-007B1-REPORT.md): allied +20 % příjmu, conquered +20 % regionálního výkonu, mixed obojí +10 %. Tři/pět sousedů, historické savey bez zpětných grantů, 2 643 testů, tři produkční UI cesty a finální replay. |
| **SP-007.B2 — civilizační expanze a její následky** | Hotovo | [Plán/smlouva](../superpowers/plans/2026-09-26-civilization-inheritance.md), [report](SP-007B2-REPORT.md): skutečná městská brána, neměnný historický řez, tři účinky a neutrální starý stage5. 3 566 regresí, nativní J → 5 / save / nástroj. [L](SP-009L-REPORT.md) dokončilo celou konverzní i vojenskou alternativu včetně skutečné obnovy/síly +20 %, save/load a společného replaye. [Finální nová linie](FINAL-CAMPAIGN-REPORT.md) nyní samostatně doložila všechny tři cesty i skutečné účinky0,8/1,2/1,2; širší D a lidské přijetí pokračují. |
| **SP-007.D — vesmírná filozofie říše** | K ověření | [D1 plán](../superpowers/plans/2026-09-26-open-galaxy.md), [průběžný report](SP-013D1-REPORT.md): doložené čtyři oblasti, vztah a smluvní cena;4172regresí a skutečné tři kontakty/zakázky/dohody, změna ceny10→12 a návrat prošly. [Nová souvislá linie](FINAL-CAMPAIGN-REPORT.md) skutečně odvodila filozofii ze všech čtyř oblastí a zaplatila/prodala za smluvní cenu11→13. Technické účinky doložené; lidské porozumění čeká. |

SP-007 má nyní technické důkazy A/B1/B2/D, včetně všech tří nových civilizačních alternativ a finální nové linie. Celá karta čeká lidské porozumění původu a účinku vesmírné filozofie. Neznámý jídelníček starých saveů se neodvozuje z těla. Připravené vstupy, obnova checkpointu a meze lidského playtestu jsou výslovně rozlišené v reportu.

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

- [x] Města mají obyvatele, produkci, náklady a spokojenost; rozmístění domů, továren, zábavy a obrany mění jejich výsledky. **B + K1:** skutečné hospodářské cykly, prostorová spokojenost a placená umístitelná obrana. [K1 report a hrané porovnání](SP-009K1-REPORT.md); lidské přijetí evidováno zvlášť.
- [x] Hráč navrhuje vzhled budov a ukládá je do knihovny; konstrukční vzhled a hospodářské účinky jsou srozumitelné. **SP-009.C:** skutečné skládání dílů, stejné ceny/účinky B, snapshoty a přenos; [automatizované ověření a meze lidského porozumění](SP-009C-REPORT.md).
- [x] Soupeřící státy spravují vlastní zdroje, vozidla, obranu a územní rozhodování; mohou zahájit expanzi bez hráčova útoku. **SP-009.D pokrývá vlastní konečné zdroje, rozvoj a mírové sousední osídlení; SP-009.E přidává jednu placenou stacionární stráž a skutečné vojenské převzetí. SP-009.F přidává jeden pohyblivý placený protiútok na stát, obranu a ztrátu/opakované převzetí. K2 doplňuje skutečnou budoucí výrobu i bez návštěvy, opakované placené tanky a rozvoj bez blokace jednorázovým výpadem.** [K2 nativní dvě vlny a účetní regrese](SP-009K2-REPORT.md). [Důkazy a meze](SP-009D-REPORT.md).
- [x] Vojenské dobytí, obchodní převzetí a náboženská konverze jsou rozdílné hratelné systémy s možností dokončit fázi každou cestou. **J/B2/L dokládají čtyři skutečné převody a běžný přechod do etapy5 samostatně každou cestou, s odlišným hraným následkem. [Report L](SP-009L-REPORT.md). Nová finální linie nyní doložila obchod i nezávislou konverzní a vojenskou větev ze společného skutečně odehraného prefixu27, včetně jejich dědictví/save/import/reload. [Aktuální důkazy](FINAL-CAMPAIGN-REPORT.md).**
- [x] Pozemní, námořní a letecké stroje využívají odpovídající terén a zdroje; stav všech měst a států přežije uložení. **Knihovna vozidel, I/J a [L](SP-009L-REPORT.md): placené skutečné konstrukce, pozemní boj, výškový region/letecký náklad, vodní výsadek i nativní pobřežní obchod; všechny tři konce zachovány přes export/import/load.**

**SP-009.K1 — prostorová obrana hotová:** věž za 40, placená údržba a oprava, skutečný dostřel/překážky, vlastní přenosný vzhled a kompaktní kamera. 3 633 regresí, finální nativní E pokračování 5 skupin/0 chyb, dvě rozmístění a obrana tankem, import uprostřed boje. [Report a přesné meze](SP-009K1-REPORT.md). **K2 hotovo:** [budoucí produkce a dvě nativně zaplacené armády](SP-009K2-REPORT.md), [plán](../superpowers/plans/2026-09-26-renewable-armies.md). 3 706 regresí, finálních73 K2, 6 UI skupin/0 chyb, import mezi vlnami a prohlédnuté snímky. **L hotovo v cíleném rozsahu:** [report celých alternativ a terénních rolí](SP-009L-REPORT.md), [plán](../superpowers/plans/2026-09-26-civilization-completion.md). 3 734 regresí, celé vojenské/konverzní větve po8 UI skupinách/0chyb; finální společný replay. Návaznost od narození a lidské přijetí otevřené.

**SP-009.J — obchodní návaznost je hotová:** vlastní dopravce, tři skutečné vratné dodávky s úschovou a započteným kreditem, prodej solventního posledního města a původní účetní historie. Produkční D pokračování sjednotilo všechna čtyři soupeřova města výhradně obchodem; 3 434 testů, finální UI 8 skupin/0 chyb, save/checkpoint, 20 návratů a prohlédnuté snímky. [Report v1 a přesné meze](SP-009J-REPORT.md), [smlouva](SP-009J-CONTRACT.md). Původní J svět neměl vhodný pobřežní cíl. Navazující [nativní námořní průchod](SP-009J-SEA-REPORT.md) z dřívějšího nezměněného saveu jej přirozeně vytvořil běžnými návštěvami: vlastní člun, tři vratné dodávky, platba144−60, import uprostřed plavby a návrat; 8 UI skupin/0 chyb a 8 regresí nad skutečnými exporty. Hrané alternativy B2 a terénní role uzavírá L; celá fáze od nové linie zůstává otevřená.

Dílčí **SP-009.A — založení a persistence měst** je hotová: vlastní stabilní registr v1, jméno/vlastník/LocationAddress, skutečné placené založení na ověřené pevnině, místní náměstí/radnice, globální výběr a návraty. [Report a meze](SP-009A-REPORT.md), [datová smlouva](SP-009A-CONTRACT.md), [implementační plán](../superpowers/plans/2026-09-24-sp-009a-cities.md). Původní osady/základna/regiony zůstávají samostatné.

Dílčí **SP-009.B — první hratelná městská ekonomika je hotová**: CityRegistry v2 s explicitní neaktivní migrací, placení civilní obyvatelé, místní pokladna/jídlo, obydlí/pěstírna/dílna/zahrada, prostorová spokojenost a skutečné 10s výsledky pouze v aktivním městě. Žádné domýšlení minulosti nebo dohánění času. [Report v1](SP-009B-REPORT.md), [smlouva B v1](SP-009B-CONTRACT.md), [plán](../superpowers/plans/2026-09-25-sp-009b-city-economy.md). 66 nových regresí, úplný běh 2 925 testů a následně 168 dotčených, produkční okruh 5/5 + odpočinek 4/4 + historie 12/12, výkon/paměť 20 návratů, nezávislé review a opravy. První širší kritérium výše zůstává otevřené kvůli obraně; celé SP-009/SP-010/SP-017 se neuzavírají.

Dílčí **SP-009.C — editor vzhledu budov a knihovna je hotová** nad `b550612f4`: registr v3/ekonomika v2, skládání skutečné geometrie v obalu B, knihovní revize a přenos v1, stabilní snapshoty instancí, původní cena stavby a potvrzená kosmetická změna za 0. Historická B si ponechá vzhled i účetnictví bez falešné tvorby. [Report v1](SP-009C-REPORT.md), [smlouva C v1](SP-009C-CONTRACT.md), [plán](../superpowers/plans/2026-09-25-sp-009c-building-editor.md). 2 981 testů + finálních 222 dotčených; produkční UI 5/5 a historie 12/12, měření 20 editorů/20 návratů, review a opravy. Uzavírá pouze budovovou část SP-005.B.

Dílčí **SP-009.D — první hratelní soupeřící státy jsou hotoví v rozsahu smlouvy** nad `3dfbfc7c4`: dva profily, registr v4/státy v1, vlastní konečné rezervy a doklady, deterministický rozvoj a sousední mírová expanze. Samostatný 10s strategický čas nemění aktivní produkci B ani zmrazení domova C. Migrace live/checkpoint před rekey nevymýšlí minulost; cizí města jsou pouze k návštěvě. [Report v1](SP-009D-REPORT.md), [smlouva D v1](SP-009D-CONTRACT.md), [plán](../superpowers/plans/2026-09-25-sp-009d-states.md). 3 044 testů, produkční průchod 4/4, historický 12/12, skutečné placené akce obou států a 20 návratů, review a opravy. První vojenská cesta navázala dílčím E níže. Celé SP-005.B/SP-009/SP-010/SP-017 i B2/D zůstávají otevřené.

Dílčí **SP-009.E — první omezená vojenská cesta je hotová v rozsahu smlouvy** nad `eb3c05025`: jeden původní placený tank, explicitní pozemní přeprava, skutečný oboustranný boj proti stráži z konečné rezervy, přerušením zrušitelné 5s obsazení a atomické převzetí. CityRegistry v5 / States v2 / Military v1 oddělují původ od současného vlastníka, zachovávají účetní historii a obnovují celou checkpointovou větev. [Report v1](SP-009E-REPORT.md), [smlouva E v1](SP-009E-CONTRACT.md), [plán](../superpowers/plans/2026-09-25-sp-009e-military.md). D fixture je byte-identická. Boj, hospodaření a návraty ověřeny v produkčním browseru, včetně finálních snímků 1024×640, krátkého měření GPU/paměti a nezávislého review. **Navazující obranu a protiútok řeší F níže.** Samotné E tyto scénáře neimplementuje; obchodní převzetí, konverze, moře, vesmír, SP-007.B2/D a celé SP-005.B/SP-009/SP-010/SP-017 zůstávají otevřené.

Dílčí **SP-009.F — první omezená obrana a protiútok je hotová v rozsahu smlouvy** nad `e4c340c91`: původní hráčův tank a jeden soupeřův tank placený ze skutečně zbývajících 40, příprava/cesta, místní pohyb a střet, poškození náměstí, přerušením zrušitelné obsazení a ztráta/opakované převzetí. CityRegistry v6 / States v3 / Military v2 zachovávají E capture a úplnou další posloupnost vlastníků i účetních snapshotů. [Report v1](SP-009F-REPORT.md), [smlouva F](SP-009F-CONTRACT.md), [plán](../superpowers/plans/2026-09-25-sp-009f-defense.md). Produkční hraní rozlišuje skutečné E pokračování a připravený poslední městský vstup; finance, zmrazení, checkpoint, původní etapy/B1, 1024×640, GPU čas i prostředky a nezávislé review jsou doložené v reportu. **Navazující první obchodní cestu řeší G níže.** Další vojenské výpady či více jednotek vyžadují samostatný finanční/prostorový návrh; historické státy nedostanou dodatečné peníze. Celé SP-005.B/SP-009/SP-010/SP-017 a B2/D zůstávají otevřené.

Dílčí **SP-009.G — první omezená obchodní cesta je hotová v rozsahu smlouvy** nad `f3b67b2bf`: skutečné pokračování F vydělá doma z původních pramenů, soupeř rozhodne podle rezerv/měst/vojenských závazků a výslovné potvrzení atomicky platí i mění vlastníka. CityRegistry v7 / States v4 přidávají obchodní doklad do historie F a oddělený civilní účet skutečných kupních příjmů. Poslední město, porážka, demobilizace stráže bez jednotek/léčení, následné hospodaření a úplná obnova větve mají explicitní pravidla. [Report v1](SP-009G-REPORT.md), [smlouva G](SP-009G-CONTRACT.md), [plán](../superpowers/plans/2026-09-25-sp-009g-trade.md). Historické peníze/obchod se nedoplňují; civilní příjem neodemkne armádu. Produkční native-time hraní, 1024×640, GPU čas/prostředky, historické etapy/B1 a nezávislé review jsou doložené v reportu. **Navazující první konverzní cestu řeší H níže.** Rozsáhlý trh/diplomacie, další armády, moře/vesmír, knihovna vozidel/lodí, SP-007.B2/D a celé SP-005.B/SP-009/SP-010/SP-017 zůstávají otevřené.

Dílčí **SP-009.H — první omezená náboženská konverze je hotová v rozsahu smlouvy** nad `55e8f4ad1`: fyzická pouť mezi stanovišti, aktivní situační obřady, skutečná spotřeba domácích prostředků, odpor/ztráta pečetí, přerušení a atomické převzetí včetně posledního města. CityRegistry v8 / konverzní deník v1 zachovávají společnou historii E/F/G, majetek, konečné účty a úplnou checkpointovou větev; migrace live/checkpoint před rekey nevymýšlí minulost. [Report v1](SP-009H-REPORT.md), [smlouva v1](SP-009H-CONTRACT.md), [plán](../superpowers/plans/2026-09-25-sp-009h-conversion.md). 3 232 testů, produkční pokračování G 5/5, historie/B1 12/12, finální 1024×640, GPU čas s kreslením, 20 návratů a doplňkových 40, nezávislé review/opravy/úklid. Liga po ztrátě posledního města zmrazí původních 40; Svaz zachová G příjem 203. **Navazující první námořní průchod řeší I níže.** Širší náboženství/diplomacie/trh/armády, knihovna vozidel/lodí, vesmír, B2/D a celé SP-005.B/SP-009/SP-010/SP-017 zůstávají otevřené.

Dílčí **SP-009.I — první omezená námořní expanze je hotová v rozsahu smlouvy** nad `907dd49fd`: audit skutečné H kampaně, jeden člun za 56 původního domácího jantaru, explicitní nástup, časovaná vodní BFS, přerušení/přistání/návrat a původní placené založení města na nové pevnině. Maritime v1 / námořní konstrukce v2 zachovávají geografii, B1, flotilu, majetek a E/F/G/H; žádní noví soupeři nebo dotace. [Report v1](SP-009I-REPORT.md), [smlouva I](SP-009I-CONTRACT.md), [plán](../superpowers/plans/2026-09-25-sp-009i-maritime.md). 3 309 testů, produkční H→I 4/4, historie/B1 12/12, celé checkpointy, 1024×640, 20 zpátečních okruhů a skutečné GPU kreslení, nezávislé review a úklid. Aktivní kampaň: jeden člun doma, 43 cest, šest měst, domov 26,295; státy stále 0/203 a 40/0. **Přesně dále: samostatný plán SP-007.B2 nad skutečně volenými výsledky E/F/G/H/I, nejprve smlouva děditelných následků a audit aktivního I save bez přepsání B1 nebo domyšlené minulosti.** B2/D, knihovna vozidel/lodí, širší civilizace, vesmír a celé SP-005.B/SP-009/SP-010/SP-017 zůstávají otevřené.

<a id="sp-010"></a>
### SP-010 — Celoplanetární měřítko

**Výchozí stav:** tři fyzické světy; pozdější etapy používají pobřeží. **Cíl:** planeta jako trvalý svět s kontinenty, moři, biomy a místy, ke kterým se lze vracet.

**Rozdělení plánů:** identita planety/lokalit a migrace → generování a návaznost terénu → globální kamera a integrace měst. Nejprve definovat datové rozhraní pro SP-009. Navázat na [svět](../../src/game/world.ts), [typy](../../src/game/types.ts), [mapování etap](../../src/game/stage.ts), [kameru](../../src/game/camera.ts) a [persistenci](../../src/game/persistence.ts). Měřítko referenční civilizace a vesmíru: [manuál][manual].

- [x] Identita planety a jejích lokalit je oddělená od aktuálně vykreslené scény a čísla etapy. **SP-010.A:** trvalá ID tří existujících habitatů, zapojená UI aktivace/přechody/save/checkpointy, místní adresy pro SP-009; [report a meze](SP-010A-REPORT.md).
- [x] Kontinenty, oceány a biomy tvoří použitelný svět; lokální výchozí místo je jeho rozpoznatelnou součástí. **SP-010.B:** deterministický regionální atlas sféry, původní habitaty s explicitním měřítkem a převodem adres, společné API pro mapu a budoucí města, migrace v1→v2; [report a hranice detailu](SP-010B-REPORT.md). C přidává pevninské detaily a cestování podle tohoto atlasu.
- [x] Kamera přechází od místního dění ke globálnímu přehledu s čitelnou navigací a výběrem měst. **C dodává navigaci; [SP-009.A](SP-009A-REPORT.md) ověřuje skutečně zaplacené město, adresní výběr, místní zobrazení a opakované návraty/import/load.** Bez demonstračních nebo předem vlastněných měst.
- [x] Návrat mezi vzdálenými místy i save/load zachová jejich stav; staré kampaně mají ověřenou migraci. **C:** pevninské výpravy, fyzický průzkum, trvalý detail a návrat; [ověření a přesné meze](SP-010C-REPORT.md).
- [x] Zaznamenat výkon a paměť při přechodech měřítek a opakovaných návratech; neudržovat všechny detailní scény trvale načtené. **C:** 20 produkčních návratů, odezvy/RAF/heap/GPU; nejvýše jeden aktuální výpravový detail vedle původní scény, vykresluje se jen aktivní pohled. [Čísla a meze](SP-010C-REPORT.md).

| Část | Stav | Přesný rozsah |
| --- | --- | --- |
| SP-010.A — identita a místní adresy | Hotovo | `homePlanet` v1, původní světy bez regenerace, opakovatelná aktivace historických kampaní bez vymyšlených návštěv, HUD/deník a 53 nových regresí. |
| SP-010.B — geografická návaznost | Hotovo | HomePlanet v2 / generator 1, regionální výšky/povrchy/biomy, kotvy a obousměrné převody, atlas v deníku, 63 nových regresí a produkční průchod. [Plán](../superpowers/plans/2026-09-24-sp-010b-geography.md), [kontrakt](SP-010B-CONTRACT.md), [report](SP-010B-REPORT.md). |
| SP-010.C — globální navigace a města | Hotovo v rozsahu smlouvy C | [Plán](../superpowers/plans/2026-09-24-sp-010c-navigation.md), [kontrakt](SP-010C-CONTRACT.md), [report](SP-010C-REPORT.md). Doložené výpravy, návraty, migrace a výkon; skutečné založení/výběr/persistence měst nyní doloženy [SP-009.A](SP-009A-REPORT.md). |

A/B zachovávají dosavadní světy; C přidává skutečně hrané pevninské výpravy do detailů vytvořených až při návštěvě. Výprava pozastaví původní svět a vrátí jej beze změny. Nejde o souvislý globální terén, námořní expanzi ani městskou ekonomiku. Výběr skutečných měst přes [rozhraní C](SP-010C-CONTRACT.md) nyní dokládá [SP-009.A](SP-009A-REPORT.md). `GameState.planet` nadále označuje lokální terraformaci pobřeží. SP-009.A dodává základ měst podle adresního kontraktu, [SP-009.B](SP-009B-REPORT.md) nad ním ověřuje oddělenou místní ekonomiku a zachované zmrazení domova; další strategie řeší SP-009 a jejich následky SP-007.B2, vesmírnou filozofii SP-007.D. [L](SP-009L-REPORT.md) doplnilo skutečné námořní přepravy, celé civilizační návraty a závěrečnou kontrolu všech pěti nezměněných kritérií: SP-010 je hotové. Souvislý globální detail nebyl přijatým kritériem této karty. Nová kampaň od narození, SP-009, dědictví D a celkové lidské přijetí zůstávají otevřené.

<a id="sp-011"></a>
### SP-011 — Vlastní loď, soustavy a galaxie

**Výchozí stav:** vesmírné cestování ani datový model soustav neexistují. **Cíl:** jedna přímo ovládaná kosmická loď, návštěvy planet a postupné otevření galaxie.

**Rozdělení plánů:** editor a řízení lodi → planeta/orbita/soustava → druhá soustava a návrat → vybavení a širší hvězdná mapa. Znovu použít principy [blueprintu](../../src/game/blueprint.ts), [kamery](../../src/game/camera.ts) a [ukládání](../../src/game/persistence.ts); nové vesmírné moduly navrhnout nad planetami SP-010. Reference: [manuál, str. 46–51][manual], [ovládaná loď a spojenecký doprovod][faq].

- [x] Loď lze vytvořit v editoru, pojmenovat, uložit a přímo řídit; model odpovídá uložené konstrukci. **C1:** [vlastní Jantarová vážka, přenos, platba108 a nativní odlet/návrat](SP-011C1-REPORT.md).
- [x] Hráč projde domovská planeta → orbita → soustava → cizí soustava → povrch jiné planety a vrátí se bez ztráty stavu. **C2:** [nativní okruh přes dvě cizí planety, zachovaný domov i fyzický náklad](SP-011C2-REPORT.md).
- [x] Skenování, náklad, sběr/pokládání organismů, energie, zdraví a vybavení tvoří použitelnou výpravu s čitelnými omezeními. **C2/C3a/C3b/D2a/D3a:** skutečný biologický a obchodní náklad, klimatické nástroje, placené moduly a rozšířená výprava navazují na [poškození, prohru, veřejně uložený vrak,12s obnovu a zaplacený servis](SP-014D3A-REPORT.md). Finální kontextové ovládání má samostatný veřejný replay; lidské porozumění/poslech zůstávají přiznané jako čekající.
- [x] Galaxie obsahuje více rozlišitelných soustav a podporuje další průzkum, nikoli jen dvě napevno spojené scény; zahrnuje navigaci a doprovod spojenců. **D1/D2a/D2b:** [další skutečné průzkumy](SP-013D1-REPORT.md), [rozšířený dosah](SP-014D2A-REPORT.md) a [zaplacený fyzický doprovod při letu/návratu](SP-013D2B-REPORT.md). Jádro a další průzkumné systémy SP-014/015 zůstávají otevřené.
- [x] Save/load funguje při cestování i pobytu mimo domov. Milník C doloží první okruh; D doloží širší průzkum a hospodaření s vybavením. **C2/C3b/D1/D2a/D2b:** [vybavená naložená loď](SP-014D2A-REPORT.md), [nové území, kolonie, doprovod a společný let](SP-013D2B-REPORT.md) přežily skutečné importy/rekey a fyzické návraty. Závěrečná nová kampaň zůstává samostatnou podmínkou.

<a id="sp-012"></a>
### SP-012 — Opakovatelná terraformace cizích planet

**Výchozí stav:** lokální teplota/vláha, T0–T3 a živé řetězce; dnešní krajina potřebuje dvě kultury, dva býložravce a predátora. **Cíl:** různé planety, které hráč klimatem a přivezeným životem mění pro osídlení.

**Rozdělení plánů:** klima každé planety → nástroje oběma směry → dovoz života a stabilita → vazba na kolonie. Navázat na [terraformaci](../../src/game/planet.ts), [klima](../../src/game/climate.ts), [katalog](../../src/game/ecology-catalog.ts), [demografii](../../src/game/demography.ts) a [planetární testy](../../tests/planet.test.ts). Reference: [terraformace Spore][terraforming]; podrobná pravidla před implementací znovu ověřit podle postupu se zdroji níže.

- [x] Planety mají různé výchozí teploty a hustotu atmosféry; obě osy lze nástroji zvyšovat i snižovat. **C3a1:** [dvě opačné přeměny, čtyři účtované nástroje, skutečný import/návrat](SP-012A1-REPORT.md).
- [x] Každý odemčený pás T má prostor pro tři velikosti rostlin, dva býložravce a jednoho predátora; život se skutečně přenáší lodí mezi světy. **C3a2:** [šest skutečně osídlených pásů, potrava a další rodičovství na obou cílech, uložený návrat](SP-012A2-REPORT.md).
- [x] Klimatická obyvatelnost, úplnost/stabilita ekosystému a kapacita osídlení jsou odlišné, srozumitelné veličiny. **C3b:** [placené kolonie, skutečné ceny/náklad, ztráta a obnova výroby, import/návrat](SP-013C-REPORT.md).
- [x] Zásahy mění vzhled a funkci planety; ztráta potřebného života má pozorovatelný následek. Odlet, návrat a načtení zachovají změny. **C3b:** [placené kolonie, skutečné ceny/náklad, ztráta a obnova výroby, import/návrat](SP-013C-REPORT.md).
- [x] Dvě planety s odlišným výchozím klimatem vyžadují odlišný postup a fungují i po vypnutí nástrojů; navazují na kolonizaci SP-013. **C3b:** [placené kolonie, skutečné ceny/náklad, ztráta a obnova výroby, import/návrat](SP-013C-REPORT.md).

<a id="sp-013"></a>
### SP-013 — Kolonizace, obchod a mimozemské říše

**Výchozí stav:** kolonie, vesmírná ekonomika ani cizí říše nejsou implementované. **Cíl:** terraformace vytváří prostor pro hospodářský a diplomatický růst.

**Rozdělení plánů:** kolonie a produkce → trh a přeprava → říše/vztahy/mise → obchodní a vojenská expanze. Navázat na planetární model SP-010, cestování SP-011, ekologii SP-012 a zkušenosti s [ekonomikou strojů](../../src/game/machines.ts). Reference: [manuál, str. 50–51][manual], [vesmírná fáze][space].

- [x] Na vhodné planetě lze založit trvalou kolonii, vyrábět suroviny, opravovat a doplňovat loď; kapacita souvisí s obyvatelností. **C3b:** [placené kolonie, skutečné ceny/náklad, ztráta a obnova výroby, import/návrat](SP-013C-REPORT.md).
- [x] Různé typy koření nebo funkčně odpovídající suroviny mají odlišnou hodnotu, místní ceny a obchodní trasy; skutečný náklad a platby se ukládají. **C3b:** [placené kolonie, skutečné ceny/náklad, ztráta a obnova výroby, import/návrat](SP-013C-REPORT.md).
- [x] Cizí říše mají území, osobnost, vztahy, mise a dohody, které ovlivňují konkrétní chování. **D1:** [tři odlišné požadavky, osobní kontakt, skutečná smluvní cena, dědictví a uložený návrat](SP-013D1-REPORT.md). Války, vybavení a další události navazují.
- [x] Existuje mírový růst včetně obchodu a koupě soustavy i vojenská expanze s obranou a diplomatickými důsledky. **D2b/D3b:** [placená soustava a doprovod](SP-013D2B-REPORT.md), [skutečné invaze, obrana, okupace, obnova, embargo a pozastavení téhož spojence](SP-013D3B-REPORT.md).
- [x] Běžné hraní doloží okruh kolonizace → produkce → prodej → další výprava; rozšířený průchod ověří udržitelnou mírovou i válečnou cestu. **C3b/D2b/D3b:** [mírový okruh s koupí](SP-013D2B-REPORT.md) a [válečný okruh s placenou kolonií, dvěma skutečnými nájezdy, zpětným dobytím a návratem](SP-013D3B-REPORT.md); účet102→222 po nákladech/prodejích. Nová celá kampaň a lidské přijetí zůstávají samostatnou podmínkou cíle.

<a id="sp-014"></a>
### SP-014 — Otevřená pozdní vesmírná hra

**Výchozí stav:** dnešní sandbox končí péčí o domácí krajinu. **Cíl:** galaxie nabízí dlouhodobý průzkum, rozvoj a situace, mezi kterými si hráč vybírá.

**Rozdělení plánů:** odznaky a vybavení → mise/události → artefakty a červí díry → podpora mladších civilizací. Nové systémy budou navazovat na SP-011 až SP-013; stávající [historie linie](../../src/game/journey-types.ts) je podklad pro evidenci, nikoli hotový systém vesmírných misí. Reference: [přehled vesmírné fáze][space].

- [x] Odznaky za různé činnosti odemykají užitečné vybavení a podporují více stylů hry. **D2a:** [tři skutečné druhy zakázek, platby80/120/60, náklad12, delší skoky a měřené dobíjení](SP-014D2A-REPORT.md).
- [x] Průzkumné, obchodní a diplomatické mise mají ověřitelné cíle, odměny a následky. **D1/D4:** [skutečná mapovací/obchodní zakázka a smluvní odměny](SP-013D1-REPORT.md), [osobně předaná paměť, dvě skutečné formy pomoci a použitý servis bez kolonie](SP-014D4-REPORT.md).
- [x] Piráti, obrana kolonií a ekologické krize vznikají z herního stavu; hráč může reagovat a následky přetrvávají. **D3b/D3c:** [skutečné napadení, obrana, okupace a obnova](SP-013D3B-REPORT.md); [automatická karanténa po ztrátě role, náprava týmiž organismy, osobní zprovoznění a pirát od konkrétní nové nakládky](SP-014D3C-REPORT.md). Veřejné importy, skutečná výhra i samostatný ústup zachovaly původ/náklad/stav. Četnost a meze měření jsou v reportu; delší D4 expedice a lidské přijetí zůstávají samostatně otevřené.
- [x] Artefakty, červí díry a podpora vývoje mladších civilizací přinášejí odlišné možnosti průzkumu a vztahů. **D4:** [dva místní relikty, skutečný obousměrný průchod nad běžný dosah, rozvoj dílny/sídla, patronát i ekologická alternativa a placený servis](SP-014D4-REPORT.md). Doporučení bylo skutečně použité v [D5](SP-015D5-REPORT.md).
- [x] Delší hraní doloží prostor pro souvislou expedici vedle péče o říši; zaznamenat četnost přerušení, nikoli jen zvýšit počet událostí. **Dílčí důkaz D3c/D4:**2 automatické události v397,4333s správy a následná238,3833s výprava45letů/0nových otevření/0vynucených návratů; [konkrétní podmínky a alternativní větev](SP-014D4-REPORT.md). **Nový souvislý průchod A–D dokončený:** [126cest/966,067s vesmíru,1automatický pirát v prvním koloniálním okruhu, další dvě expedice104cest/582s bez nového incidentu či nuceného návratu](FINAL-CAMPAIGN-REPORT.md). Konkrétní strategie má jednu stabilní kolonii/tři dohody; lidské přijetí zůstává v SP-017.

<a id="sp-015"></a>
### SP-015 — Jádro galaxie a výrazná dlouhodobá odměna

**Cíl:** vzdálený, čitelný cíl s nebezpečnou mocností v herní roli Groxů, setkáním v jádru a odměnou s planetárním účinkem. Vlastní obsah LUMAVORY může plnit stejnou herní roli.

**Rozdělení plánů:** mocnost a průchod oblastí → setkání a odměna → pokračování a vyvážení. Využít galaxii, vztahy, vybavení a mise SP-011 až SP-014. Reference: [přehled cíle a Staff of Life][core].

- [x] Hráč se přirozeně dozví o jádru a má prostředky plánovat postup přes nebezpečnou oblast. **D5:** [viditelný cíl, mapa a skutečná hranice24–31, osobní volby na23](SP-015D5-REPORT.md).
- [x] Cíle lze dosáhnout více strategiemi; úplné vyhlazení nepřátelské říše není nutnou podmínkou. **D5:** [skutečné doporučeníD4 i9pulzové vítězství, zachovaná prohra/záchrana/placený servis, bez vlastnického nebo peněžního grantu](SP-015D5-REPORT.md).
- [x] Setkání poskytne výraznou odměnu, kterou lze skutečně použít na planetě a jejíž účinek je uložen. **D5:** [osobní setkání31 a skutečně zaplacený Kořen30energie na24, trvalé0/0/T3 bez vytvoření života, veřejný import](SP-015D5-REPORT.md).
- [x] Po dosažení cíle pokračuje galaxie a rozvoj říše; ověřit návrat z jádra a následnou výpravu. **D5:** [obě větve zpět doma; hlavní znovu vzlétla, navštívila tutéž ukotvenou24 a opět se vrátila se zachovanou říší/ekologií/účtem](SP-015D5-REPORT.md). [Nová linie nyní doložila stejné dokončení a pokračování od skutečné nové buňky](FINAL-CAMPAIGN-REPORT.md); lidské přijetí zůstává povinné.

<a id="sp-016"></a>
### SP-016 — Kapitán a Galactic Adventures

**Volitelné pokračování mimo aktuální cíl od 26. září 2026.** Zachovaná kritéria níže se budou řešit až na samostatný pokyn; nejsou podmínkou dokončení hlavní hry po milník D. Totéž platí pro knihovnu/přenos dobrodružství v SP-005 a prezentaci E v SP-017.

**Cíl:** vrátit do vesmírné fáze přímé ovládání vlastního druhu při planetárních dobrodružstvích. Jde o navazující rozsah po otevřené galaxii, ne podmínku prvního vesmírného okruhu.

**Rozdělení plánů:** výsadek kapitána → výstroj/postup a autorské mise → editor stejných misí a přenos obsahu. Znovu využít [organismus](../../src/render/organism.ts), [lokomoci](../../src/game/locomotion.ts), schopnosti SP-003 a knihovnu SP-005. Reference: [oficiální Galactic Adventures][ga].

- [ ] Kapitán používá vlastní druh, vystoupí na planetu, ovládá se a vrátí se do lodi s výsledky mise.
- [ ] Výstroj a postup kapitána odemykají použitelné možnosti; alespoň tři autorské mise ověří boj, sociální řešení a průzkum.
- [ ] Editor dovolí umístit postavy a objekty, nastavit cíle, dialogy a události; zvládne vytvořit stejné typy misí jako autorské příklady.
- [ ] Vlastní dobrodružství lze uložit, znovu odehrát a přenést s potřebnými výtvory bez poškození kampaně; knihovna je zpřístupní podle SP-005.

<a id="sp-017"></a>
### SP-017 — Výraz tvorů, krajina, zvuk a čitelnost

**Dílčí C2:** hvězdná mapa, různé cizí povrchy, původní modely/rostliny, výběr a účtovaný paprsek přenosu. [Report C2](SP-011C2-REPORT.md): čtyři prohlédnuté snímky1024×640,90RAF p9516,7ms, čtyři návraty213→983→213 geometrií. Lidské porozumění/poslech a celé C–E zůstávají otevřené.

**Dílčí C1:** vlastní propojený model lodi, pohony, přechody měřítka, glóbus skutečného domova, ovládání a lodní deník. [Report C1](SP-011C1-REPORT.md): tři prohlédnuté snímky1024×640,90RAF p9516,8ms, opravený únik Points a čtyři stabilní zahřáté návraty; celé procesové assertiony výkonu a staré testové timeouty nejsou vydávány za zelené. Lidské porozumění/poslech čekají.

**Dílčí SP-009.I:** cena/zdroj/doklad, jediný člun a avatar, pobřeží, vodní trasa, postup, důvody odmítnutí, přerušení/výsledek, kamera, nativní klávesnice/fokus a posuvné UI při 1024×640. [Report I](SP-009I-REPORT.md) dokládá prohlédnuté snímky, oddělený GPU čas s draw calls a prostředky při opakovaných návratech. Lidský playtest a celá SP-017 zůstávají otevřené.

**Dílčí SP-009.F:** čitelný přicházející placený výpad, vlastník a neměnná historie, výběr původního tanku/cíle, zdraví a odolnost náměstí, cena/odmítnutí, rozkazy/výsledek, přepínání bojové kamery, stabilní identita tlačítek, nativní fokus/mezerník a posuvný panel při 1024×640. [Report F](SP-009F-REPORT.md) odděluje připravené vstupy od hraných výsledků, GPU čas od počtů prostředků a automatizované ověření od lidského playtestu. Celá SP-017 otevřená.

**Dílčí SP-009.H:** cíl/vlastník, námitka a význam obřadu, cena/domácí zdroj/spotřeba, pečeti a odpor, místo/vzdálenost, přerušení/odmítnutí/výsledek a společná historie E/F/G/H. Potvrzení/zrušení, nativní klávesnice/fokus, kamera a scroll při 1024×640 ověřeny v produkčním průchodu. [Report H](SP-009H-REPORT.md) odděluje připravenou smrt od hraných výsledků, GPU čas od prostředků a krátkou stabilitu od dlouhého soaku. Celá SP-017 otevřená.

**Dílčí SP-009.G:** vlastník, rozpis skutečné kupní ceny, jediný domácí zdroj a civilní příjemce, důvody odmítnutí, explicitní potvrzení/zrušení/výsledek, kupní doklad a společná historie F/G. Nativní klávesnice, návrat fokusu, kamera a scroll při 1024×640 ověřeny v omezeném obchodním průchodu. [Report G](SP-009G-REPORT.md) zachovává otevřené celkové SP-017.

**Dílčí SP-009.E:** textové i barevné vlastnictví a samostatný zakladatel, výběr původního tanku/stráže, rozkazy a odmítnutí, zaplacená cena, zdraví/dosah, skutečný vrak a výsledek obsazení, bojová kamera, nativní fokus/klávesnice a 1024×640. [Report E](SP-009E-REPORT.md) odděluje odehraný boj od připraveného checkpointového vstupu; celá SP-017 zůstává otevřená.

**Dílčí SP-009.D:** přehled států a měst, barevné i textové vlastnictví, oddělené rezervy/pokladny, zaplacené doklady a důvody neprovedení, návštěvnický režim, zaměření města, klávesnice/fokus a 1024×640. [Report D](SP-009D-REPORT.md) dokládá finální snímky a měření; dlouhý soak, lidský playtest/poslech a celá SP-017 otevřené.

**Dílčí SP-009.C:** kamera, 3D/listový výběr dílů, numerická klávesnice/fokus, undo/redo/zrušení, důvody geometrických a importních chyb, ceny/potvrzení a oddělení vzhledu od hospodářských účinků, 1024×640. [Report C](SP-009C-REPORT.md) dokládá snímky a odezvu; lidský playtest/poslech a celá SP-017 zůstávají otevřené.

**Dílčí SP-009.B:** ověřené ceny a potvrzení, skutečný poslední cyklus/výhled, příčiny spokojenosti, důvody odmítnutí, nativní fokus/Tab/mezerník, kamera/pauza a 1024×640. [Důkazy a meze](SP-009B-REPORT.md); celá SP-017 včetně lidského playtestu/poslechu zůstává otevřená.

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

C1 z26.září: vlastní přenosná loď a placený domácí vesmírný okruh jsou hraně doložené. První kritérium SP-011 a lodní část SP-005 splněny; další C2/C3 a D–E otevřené. [Report](SP-011C1-REPORT.md) výslovně uvádí staré časové testové limity, opravu Points leaku a meze globálních GPU počtů.

| Datum | Změna | Doložení |
| --- | --- | --- |
| 2026-09-28 | Nezávislé review a tři P2 opravené; rezerva státních lokalit, ochrana async importu, effects bus a dostupná pauza. 4 641testů,58uložených exportů, UI a finální build prošly. Lidské přijetí čeká. | [Report](FINAL-REVIEW-REPORT.md) |
| 2026-09-25 | SP-009.H hotovo v omezeném rozsahu: aktivní konverzní obřady, spotřeba/odpor/epochy, společná historie a checkpoint, poslední město bez dotací. 3 232 testů, native G pokračování 5/5, historie/B1 12/12, review/opravy, GPU diagnostika a úklid. Dále návrh první námořní expanze I; mateřské karty otevřené. Bez commitu/pushe/deploye. | [Report v1](SP-009H-REPORT.md), [smlouva](SP-009H-CONTRACT.md), [plán](../superpowers/plans/2026-09-25-sp-009h-conversion.md) |
| 2026-09-25 | SP-009.E hotovo v omezeném rozsahu: původní placený tank, konečná obrana, střet/poškození/obsazení, atomické vlastnictví a zachovaná historie, verze 5/2/1. Produkční průchod, regrese a nezávislé review s opravami. Mateřské karty otevřené. | [Report v1](SP-009E-REPORT.md), [smlouva](SP-009E-CONTRACT.md), [plán](../superpowers/plans/2026-09-25-sp-009e-military.md) |
| 2026-09-25 | SP-009.D hotovo v omezeném mírovém rozsahu: dva státy, konečné finance a doklady, skutečný rozvoj/expanze, vlastní strategický čas, registr v4 a explicitní migrace. 3 044 testů, UI 4/4, historie 12/12, rozhodování a 20 návratů, nezávislé review/opravy/úklid. Dále plán obrany a prvního vojenského převzetí; mateřské karty otevřené. | [Report v1](SP-009D-REPORT.md), [smlouva](SP-009D-CONTRACT.md), [plán](../superpowers/plans/2026-09-25-sp-009d-states.md) |
| 2026-09-25 | SP-009.C hotovo: skutečné geometrické díly, knihovna/revize/přenos, stabilní snapshoty a explicitní kosmetická transakce, registr v3/ekonomika v2 a zachovaný default B. 2 981 testů + finálních 222, UI 5/5, historie 12/12, 20 editorů/20 návratů, nezávislé review a opravy. Uzavírá pouze budovy z SP-005.B; dále plán SP-009.D, mateřské karty otevřené. | [Report v1](SP-009C-REPORT.md), [smlouva](SP-009C-CONTRACT.md), [plán](../superpowers/plans/2026-09-25-sp-009c-building-editor.md) |
| 2026-09-25 | SP-009.B hotovo: registr v2, placení obyvatelé a čtyři funkční provozy, prostorová spokojenost, ledger, místní čas a idempotentní migrace. 66 nových regresí, úplná sada 2 925 + finálních 168, browser 5/5 + 4/4 + historie 12/12, 20 návratů, review/opravy/úklid. Dále SP-009.C editor budov/knihovna; celé SP-009/SP-010/SP-017 otevřené. | [Report v1](SP-009B-REPORT.md), [smlouva](SP-009B-CONTRACT.md), [plán](../superpowers/plans/2026-09-25-sp-009b-city-economy.md) |
| 2026-09-25 | SP-009.A hotovo: skutečné placené založení, CityRegistry v1, ověřená pevninská poloha, místní náměstí/radnice, výběr adres C a persistence/návraty. 51 nových regresí, 2 861 testů, městský browser 5/5 + historický 12/12, 20 návratů s měřením, nezávislé review/opravy. Celé SP-009/SP-010/SP-017 otevřené; další SP-009.B ekonomika/populace. | [Report v1](SP-009A-REPORT.md), [smlouva](SP-009A-CONTRACT.md), [plán](../superpowers/plans/2026-09-24-sp-009a-cities.md) |
| 2026-09-24 | SP-010.C navigace/návraty hotové: ovladatelný atlas, trvalé pevninské výpravy, fyzické měření a návrat do zachovaného světa; 51 nových regresí, 2 810 testů, produkční okruh 5/5 + historické 12/12, 20 návratů s měřením výkonu/paměti, review a úklid. HomePlanet v3, B generator beze změny. Výběr skutečných měst a celé SP-010 otevřené; dále SP-009.A. Bez commitu/pushe/deploye. | [Report](SP-010C-REPORT.md), [kontrakt](SP-010C-CONTRACT.md), [plán](../superpowers/plans/2026-09-24-sp-010c-navigation.md) |
| 2026-09-24 | SP-010.B dokončeno: deterministický atlas, geografické kotvy a převody, migrace v1→v2 bez změny světa/historie/RNG, 63 nových regresí, 2 759 testů, produkční browser 12/12, review a úklid. Další krok C; celá SP-010, SP-009 a SP-007.B2/D otevřené. Pracovní strom nad `93e5f4b9`. | [Report](SP-010B-REPORT.md), [kontrakt](SP-010B-CONTRACT.md), [plán](../superpowers/plans/2026-09-24-sp-010b-geography.md) |
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
