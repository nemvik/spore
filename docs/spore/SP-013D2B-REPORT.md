# D2b · spojenecký doprovod a koupě soustavy

**Implementováno a doloženo skutečným hraním, celou regresní sadou i produkčním buildem.** [Smlouva](../superpowers/plans/2026-09-26-space-allies.md). Navazuje na [dokončené vybavení D2a](SP-014D2A-REPORT.md).

Po skutečné zakázce a obchodní dohodě lze osobně u vyslanectví zaplatit40 za spojenectví a doprovod. Tři profilové modely fyzicky následují hráče omezenou rychlostí, přecházejí s jeho skutečným letem a sdílejí vlastní baterii12: solár nejvýše0,8/s, předání nejvýše2/s v dosahu6. Účty zaznamenávají jen skutečně přijatou a předanou energii. Při přechodu, pauze a doma pomoc stojí. Vztah+10 nepřecení původní obchodní doklady.

Za120 lze koupit suverénní soustavu s její planetou. Původní diplomatická kotva a dohody zůstávají; efektivní vlastnictví povolí následnou samostatně placenou kolonii40 podle skutečné stability. Trvalé povolení kolonie uchovává kupní i zakládací serial. Staré kolonie nedostávají vymyšlenou historii. Ekonomika v4 uchovává původní ceny a výbavu, přidává přesné nové výdaje a nezávisle aktivovanou prázdnou větev live/checkpoint.

První typecheck prošel po doplnění explicitního guardu reverzního servisu pro rozšířenou union. Nezávislé review odhalilo a main opravil stázi celého doprovodu v prokazatelně stejném letu a reset zobrazeného paprsku po obnově staršího snapshotu. Main doplnil energetické CP meze, pořadí nové kolonie vůči CP a zákaz kolizí permanentních ekonomických serialů po odrolování účtu. Starý text diplomatické enklávy zůstává; koupená soustava má odlišný popis, který nepředstírá nezaplacenou kolonii.

- Nová prezentace **14/14** za1,57s, původní D1/D2a prezentace **29/29** za2,58s. Ověřené tři modely, stabilní geometrie/uvolnění, skutečný stav UI a regrese paprsku po rollbacku. `evidence/sp-013d2b/verification/presentation.log`.
- Nový core první focus32/33 našel skutečnou další CP mezeru: +0,1 hráčovy energie během stejného nepřerušeného letu prošlo příliš obecným horním limitem soláru. Main zpřesnil kontrolu skutečně zmrazené lodi, biologických a ekonomických akcí během téhož letu; produkce kolonií dál plyne. Původní diagnostika `core-tests.log` zůstává, spolu s16/16 zelenými D2a fixtures.
- Finální nový core **35/35** za19,18s, typecheck zelený (`core-tests-r2.log`, `typecheck.log`). Zvlášť ověřuje skutečné platby40/120/40, podporu z baterie, nulový čas i dock/launch, ztracené či zpětně změněné doklady, dvě zakoupené kolonie po odrolování, serialové kolize a CP chronologii probíhajícího letu. Připravené unit pozice/počáteční rollover pokladna nejsou vydávané za native.
- Širší space/ship agregát **25 souborů /567 testů** prošel za109,08s; celá sada **187 souborů /4301 testů** prošla za218,84s s exit0. Typecheck a produkční build prošly; 238modulů, `index-CUI1rfu6.js` / `index-DDhTxvxv.css`, JS1713,33kB (gzip535,85kB). Zůstává známé varování Vite o velkém chunku. `scripts/space-allies-browser.mjs` prošel main review i syntaxí; zdroj je přesný D2a export s reálným účtem261. Předání změřil odděleně od vlastní solární výroby lodi. Driver umí vytvořit potřebný energetický deficit souvislým běžným řízením.

## Skutečný produkční průchod

`scripts/space-allies-browser.mjs` pokračoval výhradně veřejným UI a běžnými RAF z přesného dokončeného D2a exportu SHA `a2f91fe0d3123a35c7ecae4672476b01a90ea24268f2d0689cfc11e3a14e61d3`. Bez přepisu živého stavu, debug času, dosypaných peněz či přeskočeného letu. Čtyři skupiny kontrol prošly,0 browserových chyb, exit0 a potvrzené uzavření browseru. `evidence/sp-013d2b/browser/result.json` a `run.log`.

- Prázdná explicitní aktivace v4 zachovala původní účty, cenu, výbavu, diplomatické doklady i život; generační checkpoint dostal samostatný prázdný cut, ne aktuální historii.
- Skutečná aliance40 E24, titul120 E25 a kolonie40 E26 změnily účet261→221→101→61. Před koupí UI založení odmítlo; po koupi trvalé povolení přesně25/26. Vztah40→50, původní smluvní sůl stále12. Vyslanectví a všechny D1/D2a doklady zachované.
- Za skutečných1,316667s pomocník vyrobil1,053333 a předal2,633333 energie; přírůstek hráče přesně odpovídal vlastnímu soláru4,82/s + předání, pod stropem105. Skutečný pohyb pomocníka nepřekročil rychlost38,8. Konkrétní stabilní identita i bateriová rovnice přežily import.
- Nová kolonie vyrobila skutečných8 kusů po80,283333s a naložila je E27. Skutečný šestisekundový let s nákladem8 a doprovodem přežil veřejný export/import/rekey; energie i celý spojenec stály, čas letu pokračoval. Po fyzickém dokování ještě68 domácích ticků potvrdilo stázi zaparkovaného pomocníka. Prodej8×7=56 E28 podle skutečně zveřejněné domácí ceny uzavřel účet**117**, nulový náklad a financování další cesty. Původní kolonie si zachovaly načtené počty; neaktivní biosféry i celý domácí snapshot zůstaly do fyzického přistání zmrazené.

Aktivní kampaň: `evidence/sp-013d2b/browser/active-campaign.save.json`, SHA `94f06db656b31db2de2fb720668dcfb725b0d25899da87fcd52338bb7d8faa3c`. Skutečný rozpracovaný let: `allied-laden-flight.save.json`, SHA `21493206083b9b3e3b1ccc505d5e47d6c1166a50b4b0cc306a55610475ab1a1d`. Dva navazující importy změnily pouze identitu linie a běžně plynoucí stav; trvalé doklady se nezměnily. Původní zdroj je zachovaný.

## Obraz, výkon a meze

Main i nezávislý agent osobně prohlédli všechny3 snímky1024×640: placený pryskyřičný doprovod s paprskem vedle původní vybavené lodi; vlastnický blok; skutečný náklad8/12 s vysvětlením, proč ho místní trh nekoupí. Panely jsou čitelné bez překrytých tlačítek, pravý panel potřebuje běžné rolování; druhý snímek má nahoře záměrně odrolovaný dřívější text. Nevydáváme to za lidskou orientaci nebo poslech.

90 skutečných RAF nad54 organismy, kolonií, vyslanectvím, vybavením a doprovodem: p50 **16,7ms**, p95/max **16,8ms**; WebKit WebGL1024×640,1587draw calls,428790trojúhelníků,1860globálních geometrií,0textur,22programů. Čtyři páry orbita/povrch: **242→1684–1685→242**, retence0; programy22 a textury0 stabilní. Jde o krátké reprezentativní měření, nikoli dlouhý soak nebo všechny stroje.

### Čekající lidské přijetí

1. V běžném UI najít spojeneckou nabídku, porozumět ceně a ověřit pohyb/předávání bez znalosti reportu.
2. Koupit soustavu a následně rozlišit vlastnictví, stále přítomné vyslanectví a samostatnou placenou kolonii; naložit a prodat její produkt jinde.
3. Posoudit čitelnost tří různých modelů doprovodu a slyšitelnost potvrzení. Native dokládá pryskyřičný model; ostatní dva kryjí automatické modelové testy, ne lidský poslech/hraní.

Celé D/E, války, jádro, nová souvislá kampaň a lidské přijetí zůstávají otevřené. D2b uzavírá mírový nákup a první skutečný doprovod; tím není uzavřené složené kritérium mírové **i válečné** expanze. Navazuje [D3](../superpowers/plans/2026-09-26-space-conflict.md). Žádný commit/push/deploy.

## Přesné regresní fixtures a úklid

Oba finální exporty jsou byte-identické kopie `tests/fixtures/space/native-d2b-campaign.save.json` a `native-d2b-flight.save.json`; provenience v `D2B-README.md`. Nových **17/17** testů `tests/space-expansion-fixtures.test.ts` prošlo za9,93s s exit0 (`evidence/sp-013d2b/verification/native-fixtures.log`). Kontroly pokrývají parse/roundtrip/storage/rekey, přesné účty a historii, skutečný domácí SHA a dokončení původního letu bez přidané energie. Samostatně vytvořený plný midleg checkpoint je výslovně unit příprava; původní checkpoint66066 se nepřepisuje. Tyto testy byly přidány po celé sadě4301 a nepřičítají se zpětně k jejímu výsledku.

`browser/review.json` a `artifact-cleanup.json` evidují3PNG a5 unikátních exportů,10 původních souborů3 917 379B. Žádné traces/temp/duplicitní pracovní kopie, videa nebo ZIPy; nebylo co odstranit. Volno po kontrole17,58GiB. Zachované původní zdroje, aktivní kampaň a přesné fixtures. Result SHA `7d43df4059c7b9e388ca26eb7015b620d7252e494117204dc177c5fe252ed124`.
