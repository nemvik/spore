# C3a1 · klima cizích planet a zachovaná biosféra

První klimatický řez [plánu C3](../superpowers/plans/2026-09-26-foreign-terraforming.md) je implementovaný a odehraný. Dokládá první nezměněné kritérium SP-012. Potrava, rozmnožování, stabilita OFF s životem a kolonizace zůstávají navazující prací; dvě prázdné planety T3 nejsou hotová terraformace.

## Změna

Čtyři běžně dostupné nástroje zvyšují/snižují teplotu a hustotu atmosféry. Skutečná rychlost je0,03 osy/s, cena2 energie/s účinného zásahu. Mimo účinný rozsah se energie neplatí. Vyčerpání, mez osy a odlet nástroj vypnou. Zásah, původní klima, účinná práce a čas se ukládají společně. Graf rozlišuje klimatické T0–T3 a fyzicky přítomných šest rolí každého ze tří pásů.

Explicitní expedice v2 zachovává všechny historické C2 organismy, modely, ceny, návštěvy a checkpointy. Pás se odvozuje ze stabilního původního ID; vysazení zaznamená hráčem vybraný pás. Parser sám neodsimuluje ekologii. Historická expedice v1 zůstává přesná. Nový krok zatím nepovoluje nedoložená narození, úmrtí ani ekologický drift.

Povrch, glóbus a atmosféra používají stejné uložené osy; aktualizují existující GPU objekty. Mapa navštívených planet ukazuje současné klima. Menší okno1024×640 má opravenou výšku pravého panelu, aby se nekryl se sbalenou hvězdnou mapou; delší ovládání se posouvá uvnitř panelu.

## Skutečný průchod

`pnpm test:space-climate` navázal na byte-identický C2 export SHA256 `3f83884800c58691f87a694750f17a32564c4d82eab6aec01285bf87439ed137`. Běžné UI, nativní RAF, skutečné klávesy a veřejný export/import; žádné přepsání živého stavu ani testový čas.

- Žhavá slza začala horká/řídká, dosáhla T3 ochlazováním a zahušťováním. Mrazový dech začal chladný/hustý a potřeboval zahřívání a ředění.
- Naměřených6,0667 aktivních sekund změnilo osu o0,182 a spotřebovalo12,1333 energie. Nezávisle naměřené solární dobíjení placené konstrukce bylo2,82/s.
- Zapnutý i vypnutý nástroj prošel veřejným exportem/importem se změnou ID kampaně. Skutečný C2 exemplář byl vysazen do pásu2 a znovu odebrán, oba placené doklady zachované. Odlet s aktivním zahříváním nástroj vypnul.
- Návrat přes soustavy zachoval oba upravené světy, zdrojový svět, náklad i celou zmrazenou domácí větev. Po docku se domácí čas znovu rozběhl.

Plný běh `evidence/sp-012a1/browser/result.json`: pět skupin kontrol,0 browser chyb, proces exit0, build `index-Ho1enUAl.js` / `index-Y-JqHdid.css`. Aktivní pokračování SHA256 `c9ceea1f68c9c5d0392ee202be04046ac9792b077fbe781b468df56f345d0009`; ON `bd6e3e82676fa2fbd6b38323f7f44b9d712044a71e337fe027bcb2d81c9f934a`; OFF `7b8c359b8c5e7286b95403bafd40bb59e03ae8fc346ae948b84cc552bd33e022`.

První diagnostický pokus nesprávně použil zaokrouhlené HUD dobíjení2,8. Rychlost klimatické práce byla správná; po opravě měření na skutečné dobíjení přešel celý původní okruh. Failure a jeho export zůstávají v `browser-rate-diagnostic`; nejde o zamlčený zelený první pokus.

## Prezentace a ověření

Po zjištění překryvu panelu následoval finální CSS build `index-BYNccbd2.js` / `index-jPn49OyM.css` a krátký nativní replay z přesného skutečného OFF exportu. `final-browser/result.json` ověřuje skutečné boxy grafu, čísel, panelu, mapy a patičky i kliknutí všech čtyř nástrojů/OFF;0 chyb a exit0. Hlavní vlákno osobně prohlédlo finální graf a nástroje i výsledný chladný svět. Snímky jsou různé posunuté pohledy na delší panel, nikoli tvrzení, že je veškerý obsah vidět současně.

Krátký vzorek90RAF měl p9516,7ms. Dva párové cykly orbita→povrch→orbita měly shodně214→221→214 geometrií. To je krátké měření pustého klimatického světa; ne dlouhý soak, měření GPU času ani zatím měření populace potomků.

Před finálními fixtures prošlo256 cílených případů v osmi souborech a samostatně3 prezentační regrese, typecheck a produkční build. Review vedlo k opravám neměnnosti klimatické baseline i uzavřených dokladů pásu, stability zakladatelského pásu při migraci, okamžitého OFF při vyčerpání energie skenem/přenosem a aktuálního klimatu v mapě. Tři byte-identické ON/OFF/návratové fixtures mají13 úspěšných regresí včetně veřejného importu, local save/load, původního přednákupního checkpointu a zvlášť označeného připraveného plného letového checkpointu. Nativní ON/OFF zachovaly domovinu; finální export obsahuje17 skutečných domácích kroků po docku. Přesný původ uvádí `tests/fixtures/space/C3A1-README.md`.

Celá finální sada: **172 souborů /4006 testů prošlo za138,20s**, bez timeoutů, vynechání nebo opakování. Obsahuje272 relevantních space/ship případů. `pnpm exec vitest run --pool=threads --maxWorkers=1`, log `evidence/sp-012a1/verification/full-suite.log`; typecheck i kontrola diffu prošly.

Úklid `evidence/sp-012a1/artifact-cleanup.json` zachovává čtyři užitečné snímky, skutečnou aktivní kampaň, fixture zdroje a malé logy. Odstraněné nahrazené snímky a vlastní dočasný log mají manifest. Žádné traces/video/screencasty; po úklidu21GiB volných.

## Čekající lidské přijetí

1. Bez návodu zkusit poznat z grafu správný zásah pro horkou řídkou a chladnou hustou planetu; zhodnotit čitelnost1024×640.
2. Vybrat pás vysazení a vysvětlit rozdíl mezi klimatickým T a skutečnou přítomností života.
3. Poslechnout čtyři nástroje, zhodnotit kameru a omezený pohyb. Automatická aktivace zvuku není lidský poslech.

Nová souvislá kampaň od narození, kolonizace, D–E a ostatní otevřená kritéria nejsou tímto řezem uzavřená. Bez nových závislostí, commitu, pushe či deploye.
