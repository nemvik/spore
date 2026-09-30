# Závěrečné průřezové ověření A–D

27. září 2026. Navazuje na [skutečnou novou kampaň](FINAL-CAMPAIGN-REPORT.md), dílčí reporty a nezměněná kritéria [roadmapy](ROADMAP.md). Kapitán a dobrodružství E jsou uživatelem odložené. Automatizované hraní a prohlížení obrázků se nevydávají za lidské přijetí.

**Aktualizace28. září:** [novější nezávislé review a opravy](FINAL-REVIEW-REPORT.md) jsou dokončené. Tři nalezené P2 a ořezaná pauza opraveny;4 641testů/206souborů,58exportů/checkpointů a finální produkční build prošly. Níže uvedené hodnoty27. září zůstávají historickým dokladem příslušného buildu.

## SP-005 · přenosné výtvory

| Přijatá část | Konkrétní implementace a ověření |
| --- | --- |
| Samostatný tvor, identita, náhled a soubor | [Knihovna tvorů](../../src/game/creature-library.ts), společný editor a model; [A report](SP-005-REPORT.md). Regrese přenosu a neplatných importů jsou součástí finální celé sady. |
| Stejný genom NPC, ekologický výběr a setkání s vlastním výtvorem | Společný [model organismu](../../src/render/organism.ts), role a výběr knihovny; konkrétní nativní osídlení a setkání dokládá tentýž A report. Nová finální linie prokazuje kontinuitu vlastního v2 těla do kmene, civilizace i vesmírné historie. |
| Budovy, vozidla, lodě | [Budovy](../../src/game/building-library.ts), [vozidla](../../src/game/vehicle-library.ts), [lodě](../../src/game/ship-library.ts); [budovový report](SP-009C-REPORT.md), [vozidlový report](SP-005B-VEHICLES-REPORT.md), [lodní report](SP-011C1-REPORT.md). Ve finální linii skutečně placený tank52, letadlo56, budovy a loď108; vlastní loď samostatně exportovaná, její neměnný návrh zachovaný během všech návratů/importů. |

Celá sada znovu ověřila existující přenosy, odmítání poškozených dat, placené instance i historické vstupy. Nevznikl další formát nebo nová produkční závislost. Společné původní kritérium zahrnuje také knihovnu dobrodružství; zůstává nezaškrtnuté, protože jeho odložená část E neexistuje. Potřebné části A–D jsou doložené.

## SP-007 · doložená historie a její účinky

[Vesmírné dědictví](../../src/game/space-inheritance.ts) odvozuje čtyři oblasti z uložené historie. Neznámá minulost starých saveů nevytváří smyšlený jídelníček. Finální linie doložila skutečné rostliny38/maso0/ostatní22, sociálního tvora, všech pět spojeneckých kmenů a obchodní civilizaci. Skóre12/12/0 vytvořilo Tkalce cest. Hráč otevřel přehled původu, uzavřel dohodu a za stejný výrobek skutečně obdržel13 místo11 kreditů.

Kmenové dědictví zvýšilo pozorovaný domácí příjem přesně na0,72/1,80/3,24 za sekundu. Obchodní civilizační dědictví snížilo spotřebu skutečného nástroje na0,20/s. Ze stejného odehraného prefixu se nezávisle dokončila celá konverze a vojenská cesta: obnova0,25×1,2/s a terraformující výkon×1,2 byly skutečně změřené, s veřejným importem/reloadem a zachovanou hlavní kampaní. [Podrobnosti a hashe](FINAL-CAMPAIGN-REPORT.md).

Technické původy a účinky A/B1/B2/D jsou tím doložené. Poslední přijaté kritérium vyžaduje také hráčovo porozumění přehledu; to čeká na [lidský scénář](A-D-HUMAN-ACCEPTANCE.md), proto je SP-007 **K ověření**.

## SP-017 · zobrazení, ovládání a zvuk

| Milník | Konkrétní technický důkaz | Otevřená mez |
| --- | --- | --- |
| A · vlastní tvor a reakce | Tři konstrukce a animace [SP-002](SP-002-REPORT.md), společný hlas podle úst a objemu těla, reakce/pomoc smečky [SP-003](SP-003-REPORT.md). Nová placená generace4/v2, společenské akce a skutečné poškození; prohlédnuté finální snímky. | Lidské vnímání osobnosti a zvuku. |
| A/B · biomy, dosahy a kompaktní panel | Celá buňka/útes/souš/kmen/domácí regiony i nová města byly ovládané přes UI. Opravená rada k plašení pastvy, boční sestup v proudu a čtyři kompaktní projevy při1024×640; dva samostatné layout průchody. | Lidská orientace bez znalosti interních pravidel. |
| B/C · přechody a měřítko | Vlastní druh, kulturní výstroj, tank, letoun, budovy a loď se zachovaly v běžných přechodech. Skutečné povrchové stoupání, orbita, soustava, skok, přistání a další odlet; společná kamera a zvukové akce. | Lidské porozumění měřítku a příjemnost přechodů. |
| C/D · planety, říše a cíl | Živé role, náklad, klimatické osy, kolonie, skutečné ceny/dohody a Kořen mají vlastní zobrazení. Doplňkové [bojové obrazy](SP-014D3A-REPORT.md), [události](SP-014D3C-REPORT.md), [objevy](SP-014D4-REPORT.md) a [jádro](SP-015D5-REPORT.md); finální nová linie má vlastní obrazy i uložené pokračování. | Lidské přijetí; část s kapitánem E zůstává odložená. |

Krátké vzorky po90nativních RAF bez souběžného buildu/testů: buňka p95 33,4ms, ostatní reprezentativní scény útesu až jádra přibližně16,7–16,8ms. Nejde o univerzální GPU benchmark ani záruku60fps na všech zařízeních. Obrazy byly osobně prohlédnuté; průběžné a duplicitní snímky mají úklidové manifesty. Samostatné starší reporty uchovávají svoje odlišné hardwarové a připravené vstupní podmínky.

Závěrečná konkrétní oprava zvuku potlačuje běžné efekty při effects0/master0 a odpojuje dokončené noty. **4regrese a4nativní UI kontroly** doložily nastavení, skutečný konec a uvolnění Web Audio uzlů. Neměří příjemnost poslechu. [Audio ovladač](../../scripts/final-audio-browser.mjs) používá veřejné ovládání a pouze pasivní pozorování audio API.

## Finální technická kontrola a review

- `pnpm exec vitest run --maxWorkers=2 --testTimeout=30000`: **205 souborů,4 637 testů, exit0**,332,82s. Zahrnuje knihovny, historické kampaně, přechody, účetní doklady, import/export a checkpointové regrese. Timeout uveden výslovně, nejde o výkonový limit hry.
- `pnpm build` včetně `tsc --noEmit`: **exit0**,261modulů. Zůstává známé upozornění na velký výsledný JS chunk; soubory ani lockfile se kvůli němu nepřegenerovávaly nad rámec buildu.
- Finální produkční import/save/reload/load/export přesného dokončeného save: **5kontrol,0browser chyb**, nezměněná hlavní kampaň. Izolovaná kopie legitimně změnila identitu a odehrála72domácích ticků; ty se započítaly do skutečného času. Nejde o další hraný postup hlavní linie.
- Samostatný offline audit **57zachovaných exportů/0chyb** ověřil přesný parse/serialize roundtrip a obnovu checkpointu pouze na kopiích, včetně závěrečného exportu50. Zdrojové hashe zůstaly stejné; manifest uvádí [finální report](FINAL-CAMPAIGN-REPORT.md).

Normální závěrečné review porovnalo prezentační opravy s aktuálními pravidly strachu/proudu, omezení viewportu, nulovou hlasitost a životnost zvukových uzlů. Nové změny nezasahují do gameplay kontraktů, ceny, RNG, migrací ani uloženého formátu. Auditované nesprávné předpoklady ovladačů (měnící se pořadí mapy, přirozené dobíjení/domácí čas, veřejný versus diagnostický výpis světa) jsou přiznané; nezastírají se jako herní chyby. Finální diff prošel kontrolou whitespace a syntaktickou kontrolou ovladačů.

**Nezávislé review dokončeno28. září:** civilizace, jádro a knihovny/prezentace byly přečteny třemi oddělenými agenty. Tři konkrétní P2 opraveny a znovu nezávisle zkontrolovány; podrobnosti, regrese a aktuální hashe v [navazujícím reportu](FINAL-REVIEW-REPORT.md). Dřívější kvóta už review neblokuje. SP-017 zůstává **K ověření** kvůli skutečnému lidskému průchodu a poslechu; kritéria se nezmenšují. Goal není hotový.
