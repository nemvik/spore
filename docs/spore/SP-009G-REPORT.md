# SP-009.G — první obchodní převzetí · report v1

25. září 2026. Navazuje na čistý `f3b67b2bf98449d7542723b9009d3504c6fbdc85`.
Implementační průchod bez commitu, pushe a deploye. Navazující pokyn uživatele autorizoval commit a push G na `main`, bez deploye. Před uložením ověřeno všech 90 otisků finálního manifestu; vzdálený `main` byl stále `f3b67b2bf`. Herní implementace se nemění. [Plán před implementací](../superpowers/plans/2026-09-25-sp-009g-trade.md),
[smlouva G v1](SP-009G-CONTRACT.md). Evidence je lokální podle stávajícího
`.gitignore`; skutečná regresní F fixture je novým souborem pro Git.

## Proveditelnost a vymezená cesta

Skutečný F export obsahuje pouze **0,4050000000810883 domácího jantaru**.
Původní dva vlastněné prameny s B1 dávají **1,8/s aktivního hraní doma**.
Městské pokladny 32/74/4/4/4 jsou oddělené; původní rezervy států **0/40**
odpovídají jejich skutečným výdajům z původních 400. Svaz už zaplatil a ztratil
jediný výpad. Převzetí posledního Zeleného dvora 2 má při vstupu cenu **200**;
nefinancuje se pokladnou, dotací ani dodatečně vymyšlenou transakcí.
[Čtecí audit](../../evidence/sp-009g/verification/feasibility.json).

Jednorázová kupní smlouva je celá potřebná obchodní vazba. Živá linie při místní
návštěvě, dosažená civilizace, původní vlastní pramen a pevninská cesta umožní
vyžádat nabídku. Stát s více městy přijme při součtu rezerv nejvýše 40; poslední
město prodá pouze při obou rezervách 0. Cena je 60 za radnici, původní zaplacené
ceny existujících budov, 4 za civilní závazky každého obyvatele, současná pokladna
a příplatek 60 za poslední město. Místní výroba tedy může reálně změnit cenu.
Čekání nikdy nevyrábí vztah, obchodní postup ani vlastnictví.

Potvrzení opakuje kontrolu vlastníka, hospodářské revize/cyklu, ceny, rezerv,
počtu měst, prostředků a vojenských závazků. Libovolný nasazený hráčův tank nebo
nedořešený výpad prodávajícího odmítne prodej včetně přípravy, přepravy, boje,
obsazování a ústupu. Souběžná změna návrh zneplatní před platbou. Jediná synchronní
operace odečte `machines.resource`, připíše `RivalState.tradeReserve`, připojí
kupní doklad a přepne vlastníka. Druhé potvrzení nemá co zaplatit.

Přijaté peníze smí zbývající stát použít jen pro původní převod 20 do vlastního
města při nedostatku a po vyčerpání původní rezervy. Každý takový výdaj má
`account:'trade'`. Původní reserve stále = 400 − původní rezervní výdaje;
tradeReserve = skutečné kupní příjmy − civilní převody. Žádný nový výpad,
stráž, založení ani odměna se z kupní ceny nefinancuje. Dobrovolně prodané město
není cíl protiútoku. Po prodeji posledního města stát neosidluje ani neutratí
zmrazené peníze; hráč může hospodařit a dál vydělávat doma.

## Historie, majetek a uložený význam

CityRegistry **v7**, States **v4**, Military **v2**, obálka save **v3**.
Explicitní opakovatelná aktivace migruje live i checkpoint před rekey. Přidává
pouze nulový civilní účet a verze, žádnou obchodní minulost. Parser nemigruje.
Founder, původní capture E a všechny původní F doklady zůstávají zachované;
`method:'trade', version:1` rozšiřuje společný řetězec F o cenu, oba účty před/po,
rozhodnutí státu, snapshot ekonomiky, zdraví stráže a poškození náměstí.

Pokladna, obyvatelé/ID, jídlo, budovy/vzhledy, původní platby a škody zůstávají
městu. Stráž se trvale demobilizuje: její zaplacená konstrukce i uložené zdraví
zůstávají, aktivní tank/render/střelba/kolize skončí. Hráč nedostane jednotku,
léčení ani odměnu. Původní tanky a vraky se nepřepisují. Pozdější obchodní doklad
nesmí legalizovat oživení stráže zničené předchozím vojenským převzetím.

B místní výroba, C zmrazení domova a D strategický čas jsou zachované. Pauza,
editor, knihovna, globál a nepřítomné lokality nemají dohánění. Obnova checkpointu
nahrazuje celou konzistentní větev, nikoli slučuje dva zůstatky nebo přidává vratku.

## Ověření a původ vstupů

- Úplná sada **152 souborů / 3 164 testů**, 111,58 s, jeden worker bez browseru.
  Z toho **51 regresí G**: determinismus, rovnosti, přijetí/odmítnutí, poslední
  město, nedostatek, zastarání/dvojí potvrzení, fáze E/F, čekání a zmrazení,
  skutečný F boj pod G, striktní import, migrace/rekey/checkpoint a historie A–F.
- Přímo připravený účetně konzistentní nedostatek městské pokladny v unit testu
  ověřuje 2× převod z původních 40 a 7× převod z přijatých 140, poté prodej
  posledního města. Tento nedostatek **není tvrzený hraný výsledek**. Každý krok
  prochází parserem a checkpoint vrací oba účty. Samostatný připravený F-only
  vlastnický řetězec ověřuje odmítnutí historicky oživené stráže.
- Typecheck/build a `git diff --check` prošly. Žádná nová závislost, změna lockfilu
  nebo testových limitů. Build `index-DV5eVfxE.js` 1 401,69 kB / gzip 435,96 kB;
  známé Vite upozornění na chunk nad 500 kB trvá.
- F fixture je byte-identická kopie originálu, SHA-256
  `1ceed299a31254e8bda104be18b0a86213e37ccfbf45aa2456aed194bad4c2cc`.
  **31 historických datových/kódových fixtures** porovnáno proti HEAD a **15
  historických exportů** proti předchozím F manifestům; nula změn. README se
  rozšířilo o původ nové fixture. [Otisky](../../evidence/sp-009g/verification/historical-verification.json).

- Finální produkční browser **5/5, 0 chyb**, běžný import F a native RAF.
  Domov vydělal 0,405 → **235,185** za 130,66 s skutečného času (7 826 ticků).
  Po skutečném městském cyklu vzrostla pokladna 4 → 7 a cena 200 → **203**.
  Potvrzení mezerníkem odečetlo 235,215 → **32,215** a připsalo civilní účet
  0 → **203**. Následný placený vklad 20 a místní hospodaření proběhly běžným UI.
  E capture i oba F převody jsou shodné; žádná nová jednotka nebo léčení.
- Pauza/editor/knihovna/globál stojí, zastaralá nabídka a zrušení neplatí,
  dvojí mezerník nevytváří doklad. 20 odchodů/návratů a otevření dokladu,
  export/import/rekey/save/reload/load a kamera jsou ověřené.
- Alternativní **hraná** větev začíná exportem skutečně vydělaných prostředků:
  Liga prodá město za **140**, ponechá si původní rezervu 40 a civilní účet 140;
  prodej zbývajícího posledního města odmítne. Prodej nezahájí nový výpad.
- Jediný offline připravený browser spouštěč G je smrt finální kopie s checkpointem
  ze skutečného předkupního exportu. Běžná obnova vrátí přesně oba účty,
  vlastnictví a úplnou historii před nákupem. Není tvrzena odehraná smrt tvora.
- Historický produkční driver **12/12, 0 chyb**, 23,875 s: původní etapy,
  prameny/regiony, B1, planeta/sandbox a SP-010.A. Používá původní výslovně
  připravené přechodové a úmrtní vstupy; není to nová kampaň od narození.
- Původní develop-web-game klient prošel s doloženým adaptérem: běžný UI import
  aktivního G save, nativní čekání místo virtuálního času a instalovaný Chrome.
  Zachovaný vstupní/snímkový/error loop; jeho SwiftShader smoke není GPU benchmark.
  Žádný browser přitom nepřepisuje živý stav, localStorage ani herní hodiny.

## SP-017, měření a review

Panel zobrazuje současného vlastníka, rozpis ceny, domácí zdroj, jmenovitého
příjemce a oddělenou vojenskou/civilní rezervu, důvod souhlasu či odmítnutí,
výslovné potvrzení/zrušení, výsledek a doklad. Ve společné historii se bojové
převody F rozlišují od obchodu G. Nová nabídka přepisuje staré oznámení odmítnutí.
Fokus jde na potvrzení a po zrušení/odmítnutí zpět na nabídku; po úspěchu na
výsledek. Nativní Tab/mezerník, kamera a scroll jsou součástí browser ověření.

Chrome headless, ANGLE Metal / **Apple M4**, pixel ratio 1, finální build výše.
Měření samostatně bez souběžných testů či jiného browser scénáře:

| Měření | Výsledek |
|---|---|
| Potvrzení kupní smlouvy → ověřený vlastník | 65,48 ms |
| Vstup do města, 24 vzorků | p50 46,68 / p95 114,26 ms |
| Návrat domů, 20 vzorků | p50 40,30 / p95 52,38 ms |
| Otevření a zavření dokladu, 20 dvojic | p50 109,71 / p95 143,04 ms |
| Návraty, 340 RAF intervalů | p50 16,70 / p95 50,00 / max 66,60 ms |
| GPU čas callbacků s kreslením, 35 vzorků | p50 1,161 / p95 3,631 / max 5,913 ms |
| Návraty 10 → 20: heap po GC | 19,916 → 20,546 MB |
| Návraty 10 → 20: GPU prostředky | shodně 316 geometrií, 19 programů, 1 textura, 1 242 bufferů |

GPU čas je z dostupného `EXT_disjoint_timer_query_webgl2`; bere jen dokončené
vzorky bez disjoint příznaku a s alespoň jedním draw callem. Jde o práci v daném
renderovacím RAF callbacku, nikoli celkové vytížení GPU. Počty prostředků nejsou
GPU časem, RAF interval zahrnuje také CPU/plánování a přepínání UI. Počáteční
jiný počet prostředků odpovídá jiné kameře; srovnatelné návraty 10/20 jsou stejné.
Heap +0,630 MB neprokazuje nulový únik. Krátké měření není dlouhý soak.
Finální nabídka, výsledek a odmítnutí při 1024×640 i město při 1280×720 byly
skutečně vizuálně prohlédnuté; žádné skryté tlačítko nebo přetečení nebylo nalezeno.

První produkční průchod dokončil výdělek, nákup, hospodaření, 20 návratů,
uložení i druhou kupní větev bez browser chyb. Závěrečná diagnostická assertion
chybně požadovala nulový čas mezi Obnovit a následnou Pauzou: uběhl jeden běžný
snímek 1/60 s, všechny účty/doklady odpovídaly. Driver nyní čte obnovu synchronně
po zpracování stejné klikací události. Herní čas ani stav se kvůli testu nemění.
GPU měření navíc vybírá jen RAF callbacky obsahující skutečné draw calls.

Nezávislé review `/root/review_trade` uzavřelo změnu bez zbývajícího kódového
nálezu. Opravena ztráta fokusu po zrušení/odmítnutí/vypořádání a slabší kontrola
stráže zničené před pozdějším obchodem. Reviewer nezávisle reprodukoval devět
civilních převodů i obnovy checkpointu; oba případy mají trvalé regrese. Finální
review porovnalo kód, účetnictví, migrace, důkazy a čtyři finální snímky. Doporučení
k výběru GPU vzorků zapracováno před opakováním celého produkčního průchodu.
Vlastní kontrola diffu dokončena; zastaralý průběžný záznam v PROGRESS byl nahrazen
finálním výsledkem. Žádný nález nezůstává otevřený.

## Důkazy, úklid a přesné pokračování

- [Aktivní G kampaň](../../evidence/sp-009g/browser/active-campaign.save.json),
  [produkční výsledky](../../evidence/sp-009g/browser/results.json),
  [historické UI výsledky](../../evidence/sp-009g/historical/results.json).
- [Nabídka 1024×640](../../evidence/sp-009g/browser/offer-1024.png),
  [převzaté město](../../evidence/sp-009g/browser/purchased-1024.png),
  [odmítnutí posledního města](../../evidence/sp-009g/browser/refusal-1024.png),
  [účetní doklad](../../evidence/sp-009g/browser/receipt-1024.png),
  [zachované E/F](../../evidence/sp-009g/browser/history-ef-1024.png) a
  [historie G](../../evidence/sp-009g/browser/history-g-1024.png); všechny prohlédnuté.
- [Testy](../../evidence/sp-009g/verification/tests.log),
  [build](../../evidence/sp-009g/verification/build.log),
  [review](../../evidence/sp-009g/verification/review.json),
  [skill klient](../../evidence/sp-009g/skill/adapter.json).

[Úklidový manifest](../../evidence/sp-009g/cleanup.json) eviduje odstranění **32**
vlastních mezivýsledků/duplicit/pracovních kopií, **6,56 MB**. Zachovaný aktivní G
save i první diagnostický aktivní save, skutečné předkupní/výdělečné exporty,
nutné připravené checkpointové a historické vstupy, malé výsledky a finální snímky.
Finální evidence přibližně **5.04 MB**. Trace/video vypnuté;
`.playwright-mcp/traces` není přítomná. Disk před delšími běhy přibližně 11 GiB,
po úklidu 10 GiB volných; změna celého systému není přičítána této malé evidenci.
Cizí data a starší aktivní kampaně nebyly smazané ani přepsané.

```sh
pnpm test --maxWorkers=1
pnpm build
pnpm preview --port 5214 --strictPort
# V druhém terminálu:
pnpm test:trade
HOME_PLANET_OUTPUT=evidence/sp-009g/historical LUMAVORA_URL=http://127.0.0.1:5214 pnpm test:geography
```

Dokončení se vztahuje pouze na první omezený průchod G. SP-005.B, celé SP-009,
SP-010 a SP-017 zůstávají otevřené. Konverze, rozsáhlý trh/diplomacie/armády,
knihovna vozidel/lodí, moře, vesmír a SP-007.B2/D nebyly implementované.
Lidský playtest/poslech, Safari/mobil a dlouhý soak nejsou součástí důkazů.

Pro pokračování importovat nový aktivní G save: hráč vlastní také skutečně
koupený Zelený dvůr 2, původní E/F historie je nedotčená a poražený Svaz má
zmrazenou kupní cenu. Ruční migrace není potřeba. Přesný další návrhový krok:
vymezit první konverzní cestu SP-009 se samostatnými podmínkami, historií a
vzájemným vyloučením s obchodem/bojem. Nové výpady nebo uvolnění poražených rezerv
vyžadují samostatný finanční návrh; G je automaticky neodemyká.
