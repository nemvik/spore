# D1 · první společnosti, zakázky a dědictví

**Stav: implementace, regrese/typecheck/build i skutečný UI průchod dokončené v rozsahu D1. Samostatné byte-identické fixture regrese také prošly.** [Plán a smlouva](../superpowers/plans/2026-09-26-open-galaxy.md). Tento řez neuzavírá války, expanzi, vybavení, jádro ani celé karty SP-007/SP-013/SP-014.

## Změna

Pryskyřičný spolek, Kořenový sněm a Čedičová stráž mají stabilní kapitální adresy, různou osobnost, fyzické vyslanectví a vlastní osobní kontakt. Mapa ukazuje jejich území/signál. Aktivace bere v úvahu kolonie live i checkpointu společně; plně osídlená historická galaxie dostane diplomatické enklávy bez odebrání hráčovy osady. Parser sám registry ani cenu nemění.

Zakázka vyžaduje novou skutečnou činnost po přijetí: prodat osm dovezených kusů, zaplatit skeny šesti různých rolí nebo sestoupit na konkrétní pustý svět a vrátit se. Kořenový sněm nabízí jako výslovnou alternativu mapování, aby úplné historické vyhynutí nezablokovalo kontakt. Splnění se osobně odevzdá právě jednou za vztah +30; další potvrzení uzavře dohodu pro budoucí skutečné prodeje.

Čtyři dokladové oblasti linie přispějí po šesti hlasech. Úplný uložený jídelníček, doložená cesta tvora, kmene a dokončená civilizační expanze určují filozofii a příbuznost. Neznámá strava nevynuluje skutečně zachované kmenové/B2 výsledky. Přehled vysvětluje vstupy, součet i účinek: po dohodě +2 za kus místo +1 u příbuzné společnosti. Nejde o zpětný grant ani znovunásobení dřívějších bonusů.

Ekonomika v2 explicitně zaznamená cenový řez. Staré prodeje zůstávají beze změny a používají v1 cenu. Nové prodeje drží základní cenu, konkrétní smlouvu, její vztahovou revizi a bonus. Seriál ekonomické akce určuje pořadí i při shodném čase: prodej, kterým byla splněna zakázka, nedostane později uzavřenou smlouvu zpětně.

## Dosavadní review a ověření

- Nezávislé review opravilo rozpor odrolovaných důkazů se zachovanými součty: permanentní prodeje/scan witnesses spolu s neduplicitní zachovanou historií musí vejít do skutečného prodejního/skenerového účtu. Staré first-scan údaje zakladatelů musí souhlasit; mrtvý odrolovaný potomek zůstává platným historickým důkazem.
- Řezy kontaktu/přijetí a odměn odpovídají časům a seriálům sousedních zachovaných letových, biologických i ekonomických akcí. Rozpracovaný let po legitimním kontaktu ve stejném čase zůstává možný.
- Sběr důkazů probíhá ve skutečné úspěšné transakci před uložením. Načtení ani kreslení zakázku neplní. Doklady přežijí omezení zdrojových logů; registry D1 má nejvýše 12 trvalých akcí.
- Finální typecheck prošel. První běh odhalil pouze chybný typ přípravy nového testu (vojenská metoda není uložené `military` v původním trade/conversion poli); testová příprava byla opravena a její cílená regrese prošla. Původní diagnostika zůstává v `typecheck-initial.log`. Produkční smlouva se kvůli testu neměnila.
- Kompatibilita na dosavadních testech ekonomiky, skutečných C3b/A2 fixtures a staré prezentace: **4 soubory /52 testů prošlo**, 18,92 s. Log `evidence/sp-013d1/verification/compatibility.log`.
- Nové nezávislé testy: **45 core +15 prezentace**. Celý space/ship agregát **19 souborů /438 testů**, 57,32 s; finální celá sada **181 souborů /4 172 testů**, 175,85 s, exit0. Bez vynechání testů, změny timeoutů nebo opakování celé sady. Logy `space-tests.log`, `full-suite.log`, `typecheck.log` v `evidence/sp-013d1/verification/`.
- Produkční build prošel: 228 modulů, `index-DOuJMpyR.js` / `index-DN-cdrE6.css`, JS 1 685,72 kB (gzip 528,22 kB). Přetrvává upozornění na velikost chunku. Log `build.log`.
- Native použilo přesný C3b export SHA `01f1c07ae53847a4b4a2d4938d1d22782bb5529ea1696a7e5f05268f242aff5a`; prepared unit souřadnice ani fondy nejsou důkazem běžné dosažitelnosti.

## Skutečné uložené fixtures

Tři byte-identické veřejné výstupy (hlavní dokončení, před přijetím Kořenů, nezávislá průzkumná větev) jsou v `tests/fixtures/space/`, původ/SHA v `D1-README.md`. **17/17 testů prošlo za8,25s**, exit0, na navazujícím D2 source se zachovanou v2 semantikou. Log `evidence/sp-013d1/verification/native-fixtures.log`; následný typecheck prošel (`native-fixtures-typecheck.log`). Ověřeno přesné parsování/roundtrip, lokální uložení a importní rekey, skutečný starý prázdný CP, oddělené připravené full CP, cenové doklady80→96,6 placených rolí a survey alternativa. Žádné prepared CP se nevydává za součást native hraní.

## Hraná evidence a přesné meze

- První nový prodej skutečných8 kusů za10 přinesl80; po odevzdání a dohodě další8 za12 přineslo96. Tržby312 před přijetím nedaly postup. Nový účet425, tržby488; původní14 ekonomických řádků beze změny.
- Kořenový sněm: placený sken před přijetím zachoval znalost, ale nedal nový postup. Následných6 skutečných placených skenů po přijetí včetně stejného původního organismu splnilo šest rolí; odevzdání/dohoda prošly veřejným importem.
- První browser běh skončil1 kvůli předpokladu driveru: stiskl R pod požadovanými4 energie a čekal zahájení letu. Hra správně odmítla a doporučila stání pro solární nabití. Bounded timeout uložil veřejný recovery SHA `39e3afa50c3c35c56928d76903e9fb8ff4014c4792caaa1e57bfd6983c0af759`; skutečný landing proof stráže zůstal zachován. Opraven pouze driver (čekat na skutečné dobití), pokračování z přesného veřejného exportu v `browser/continuation`. Původní chyba se nevydává za úspěšný běh ani chybu produkce.
- Pokračování odevzdalo skutečný průzkum stráže, ratifikovalo poslední dohodu a fyzicky se vrátilo domů. Skončilo exit0, context/browser uzavřeny,0browser errors. Hlavní vlákno osobně prohlédlo všechny4 finální snímky1024×640: vlastní loď, tři výrazně odlišná vyslanectví, kontakty a cenové oznámení jsou viditelné. Pravý panel má při rolování část horního textu mimo výřez; celý obsah/deník jsou dostupné rolováním. Žádný překryv základního ovládání.
- Hlavní výprava celkem70 skutečných letových přechodů,12 trvalých diplomatických akcí,4 nové ekonomické řádky,7 placených skenů a4 veřejné rekey/importy. Aktivní export `evidence/sp-013d1/browser/continuation/active-campaign.save.json`, SHA **b2cf84538fea52c2e243affcbc2e0896507ccabe63d287d68a307e8986f8972e**. Celý domácí obsah resin-treaty→recovery a dále až do skutečného docku se zachoval; po dokování běží domov běžně.
- Samostatná větev začala přesným veřejným `before-roots-accept` exportem (SHA3937954d012cb894ea6cefc0dfcd55349472592ff6b5c64aa9e9997fe47003cf), přijala mapování cíle5, skutečně přistála, vrátila se ke sněmu, odevzdala/dohoda+1 a doletěla domů:18 přechodů,0errors,exit0. Hlavní export nezměněn. Výstup `browser/survey-branch/branch-campaign.save.json`, SHA **b77ce2200ef96db10971efa1b7df7c15020d8f3dbaa074dde1aef8bf6bfea9b1**. Cíle8 a5 byly prvními návštěvami; native sám nedokládá opakovaný průzkum známého cíle.
- Nový vzorek90 skutečných RAF na živém čedičovém kapitálu s36 organismy: p50 16,7ms, p95/max16,8ms,871draw calls/241070trojúhelníků/1060geometrií,0textur/21programů. Původní čtyři párové kořenové orbita→povrch→orbita všechny **212→1070→212** geometrií,0textur/21programů. Krátký reprezentativní vzorek není dlouhý soak ani univerzální důkaz bezúnikovosti. Původní90RAF vzorek se při první chybě neuložil a není rekonstruován odhadem.
- [Kompaktní review](../../evidence/sp-013d1/browser/review.json), [manifest](../../evidence/sp-013d1/browser/artifact-cleanup.json):4 finální PNG,9 veřejných exportů,19 původních souborů/7,05MB. Nebyly vytvořeny trace/video/screencast ani dočasné pracovní kopie; žádné unikátní důkazy se nemažou. `.playwright-mcp/traces` neexistuje,17,85GiB volných. Pozdější D2a editace nejsou ověřením tohoto připnutého D1 buildu.

## Čekající lidské přijetí

1. Bez znalosti skriptu najít první signál, dojít ke kontaktu, přijmout zakázku a vysvětlit rozdíl mezi znalostí organismu a novým placeným skenem.
2. Po odevzdání uzavřít dohodu, z ceny a lodního účtu rozpoznat účinek a z deníku vysvětlit skutečné/nezaznamenané dědictví.
3. Vyzkoušet další vyslanectví při1024×640, přečíst rolovaný cíl a podle kláves dojít domů; poslechnout odlišné potvrzovací zvuky. Hodnotit čitelnost a četnost rolování, ne pouze přítomnost textu.

Lidské přijetí a poslech zatím neověřené. Goal pokračuje, bez commitu/pushe/deploye.
