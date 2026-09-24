# SP-008.F — implementační plán a pracovní záznam

> Provedení: superpowers:executing-plans, nativně v této relaci; na konci čerstvé read-only review. Výslovný pokyn uživatele autorizuje návrh i implementaci bez dalšího schvalování. Žádný commit/push.

**Cíl:** Nově založený kmen má pět rozlišitelných, hospodařících a fyzicky dosažitelných sousedů; všech pět musí být vyřešeno před vstupem do strojů.

**Architektura:** Existující ActiveTribeState v2 dostane volitelný marker `roster: 'five'`. Absence znamená historické tři identity. Společný katalog identit zásobuje pravidla, rozmístění a prezentaci. Společnosti, kulturní výstroj, hudba, domestikace, náčelník a historie zůstávají existujícími systémy. Nové následky v civilizaci nevzniknou.

**Technologie:** TypeScript, Three.js, Vitest, produkční Vite + Playwright.

**Specifikace:** Zadání této relace; docs/spore/BRIEF.md, ROADMAP.md SP-008, SP-008A–E-REPORT.md a SP-007A-CONTRACT.md. Základ 190f55f, čistý strom.

## Pravidla návrhu

- Identity garden/terrace/sanctuary zachované; reed (Rákosové tůně) a basalt (Čedičová mez) používají existující těla a nástroje, ale odlišnou rychlost, sílu, preferenci zdrojů, dar a hudební pořadí. Reed: rychlost 4,6, zásah 3, domov 140, vztah +10, dar 12, dvě píšťaly. Basalt: rychlost 3,2, zásah 6, domov 240, vztah −10, dar 16, dvě chřestidla. Terasa zůstává jediná počátečně nepřátelská.
- Stejný konečný sklad 48, náklad 2, jídlo 2, obnova za 12. Preference potravy není zákaz ostatního sběru. Nové osady hledají volný prostor poblíž existujících zdrojů; světové zdroje, regenerace a překážky se nepřepisují. Pokud měření ukáže nedostatek, změna musí být samostatně zdůvodněna.
- Nová kampaň limituje součet členů všech expedic na dva. Nedostatek, desetisekundové varování, placené doručení kořisti, odvolání a návrat zůstávají.
- Dokončení vyžaduje přesnou sadu pěti identit, všechny allied/conquered a alespoň jednoho živého vlastního člena. Historický save zachová přesně původní tři. Pouhé odstranění dvou záznamů nemůže zkrátit novou kampaň; marker se porovnává i s checkpointem.
- Odměny zůstávají +8 za spojenectví / +12 za dobytí právě jednou, chráněné resolved. Obnova populace/oprava ani load výsledek nevynuluje. Zaniklá populace se zdarma neobnoví; bez hostitele není hudba/sněm ani běžný rozhovor, prázdnou osadu lze fyzicky obsadit útokem. Ztráta hostitele ukončí aktivní návštěvu beze změny odměn.
- Roster/UI používá stejné identity a ID jako renderer/picking/kamera. Přehled všech pěti, vzdálenost/směr od domova, řešení, aktuální práce, všechny výpravy a dostupné akce; nativní posuv při 1280×720.
- Pohyb nové kampaně musí respektovat zděděné tělo a výstroj u překážek. Navazující regrese prověří v1/v2, pomalý plášť, skutečný kontakt a návraty; časové limity 90 s se bez důvodu nezvyšují.

## Úkoly a ověření

- [x] 1. `tests/tribe-five.test.ts`: červená regrese založení pěti, oddělených členů/domovů, přesné sady a přechodu po 3 vs 5; následně katalog `src/game/tribe-roster.ts`, typy a založení/ready v `tribe.ts`.
- [x] 2. `tests/tribe-five-persistence.test.ts`: marker, 5 faktů historie, 5 cooldownů hudby, chybné sady/marker/checkpoint, historické fixtures. Upravit `persistence.ts`, `tribe-music-validation.ts`; sdílet dar. Očekávání nového vstupu původních testů změnit na pět, historické tři ponechat.
- [x] 3. `tests/tribe-five.test.ts`: fyzické cesty několika seedů, těla/výstroj, sběr/doručení, placená obnova, souběžné konflikty a prázdná populace. Upravit rozmístění, společnost a sdílený pohyb jen podle doložených selhání. Zachovat svět a zdroje.
- [x] 4. Nové identity v `tribe-copy.cs.ts`, `tribe-music.ts`, `render/settlement.ts`; přehled a souběžné varování v `ui/tribe.ts`/CSS. Regrese prezentace s reálnou geometrií/pickingem a nativní browser kontrola všech pěti ovladačů.
- [x] 5. Trvalé průchody všemi pěti diplomacií i bojem, hudbou a sněmem, návrat/obnova zásob, A–E a historie; skutečná produkční UI větev s export/import/load a přechodem. Vstupy přiznat, žádné živé settery nebo advanceTime, trace vypnutý.
- [x] 6. Celá `pnpm test`, typecheck, build; každý timeout diagnostikovat, limity/assertions neoslabit. Čerstvé review celé změny, opravy a odpovídající retest. ROADMAP, PROGRESS, SP-008F-REPORT; úklid vlastních artefaktů s manifestem a kontrolou disku.

## Review focus

1. Ztráta posledního hostitele a prázdná osada: žádný nekonečný respawn, phantom hudba ani automatický výsledek.
2. Uložená nová kampaň s odstraněnými sousedy/checkpointem: odmítnutí, nikoli starý tříkmenový režim.
3. Současné výpravy a obrana jiného domova: limit skutečných lidí, neztracený náklad a funkční odvolání.
4. Široké tělo u stromu a kulturní plášť: skutečný fyzický kontakt před limitem, návrat do tábora.
5. Čtvrtý/pátý soused mimo panel: dosažitelné běžným posuvem, shodný cíl kamery/rozkazu/modelu.

## Záznam

- Před prací: strom čistý, HEAD 190f55f, main; disk 240 GiB volných. Požadované dokumenty a související kód prostudované.
- Ruling: pokračovat nativně a bez schvalovacích zastávek — výslovné zadání žádá plán a implementaci až k ověřenému výsledku; žádný commit/push.

- Regrese začaly červeně pro počet, marker, cooldowny a fyzický obal; následná implementace je opravila. Simulační diplomacie i boj od běžných 36 zásob prošly včetně placené stavby/náboru, návratů a save/load. Společná pětiminutová ekonomika ověřena na třech seedech, navigace na pěti.
- Čerstvé read-only review (subagent five_review, autorizovaný executing-plans) našlo duplicitní akci mapy/karty a nedosažitelnou osadu pro platné tělo radius9,419. Mapové akce odděleny. Clearings nyní respektují skutečné tělo/výstroj a library NPC; pro velká těla se filtruje průchozí komponent od domova. Přesný překrývající se řetěz sedmi překážek prokázal, proč samotná volná plocha nestačila. Pět celých cest tam/zpět prošlo po opravě.
- Široká těla využívají úplnější existující navigační graf s cache statických hran; běžná/historická navigace zůstává původní. Také velcí NPC vybírají počáteční polohu a zdroje ve stejném průchozím komponentu jako svůj domov. Žádné přesouvání překážek nebo zdrojů.
- Vlastní kontrola odhalila indexování gardens/terraces podle pořadí sousedů. Červená regrese pro obrácené pořadí save; oprava používá identitu a zachovává stávající archetyp i highlands.
- Produkční diplomatická větev na index-cc17Ukvv.js: 10 skupin kontrol, 0 chyb; reed hudba +62,5, basalt sněm +31,25, 5 spojenců, 5 faktů a stage4. Navazující finální build ověřen odděleně níže.
- Souběh předchozí celé sady s browserem vedl k devíti timeoutům v šesti souborech a RPC timeoutu. Těchto 49 testů samostatně prošlo s původními limity (18,89 s). Následující celá sada běžela bez browseru s jedním pracovníkem a globálním limitem30s; očekávání ani původní zdrojové limity se nesnižovaly.

- Závěrečná kontrola identity doložila red test: čedičový predátor nemůže preferovat detritus. Použit existující žrout pramenů (gnaw) se shodnou potravou; profil síly/ceny/rychlosti nezměněn. Předběžný conquest browser běh ukončen před dokončením a nebude započítán. Opraven i duplicitní fokus hlášení výpravy/karty stejným principem jako mapa.
- Celá poslední sada: 141 souborů / 2 591 testů, 196,73 s, Node24.15 / Vitest3.2.4, maxWorkers1 / global testTimeout60000. Předchozí sériový limit30s měl jediný starší terénní timeout, který znovu izolovaně prošel za2,033s s původním limitem; přesná příčina rozptylu hostitelského času není prokázaná. Assertions/herní limity nezměněny.
- Finální typecheck/build prošly, JS index-DDaIel-0.js (1 233,26 kB, gzip379,56), známý bundle warning. Celý běžně ovládaný conquest na tomto buildu prošel 9/9, 0 chyb, 714,725 s: všech pět dobytí, obránci, návraty/péče, stabilní mapový/kartový fokus, po třech save/import/reload/load bez dokončení a po pěti stage4 s pěti fakty.
- Finální diplomatický replay 3/3, 0 chyb, 158,926 s: odehraný aktivní hudební save reed +62,5, odehraný dokončený save pěti spojenců, pět mapových cílů/stabilní fokus a přechod/export. Není to nová celá diplomatická kampaň na finálním hashi; report rozlišuje přesné buildy a vstupy.
- ROADMAP, PROGRESS a SP-008F-REPORT aktualizované. F i kritéria celé SP-008 doložené napříč A–F; SP-007.B1 a SP-017 otevřené. Osm finálních snímků prohlédnuto. Manifest úklidu: 45 odstraněných souborů / 4 171 712 B, zachované potřebné savey a aktivní kampaně; trace/video nebyly zapnuté. Disk po úklidu 240,73 GiB, browser/preview uzavřeny. Bez commitu/pushe.
