# SP-009.H — první náboženská konverze · report v1

25. září 2026. Navazuje na čistý `55e8f4ad1`. Implementační průchod bez commitu, pushe a deploye. Navazující pokyn uživatele autorizoval commit a push H na `main`, bez deploye. Před uložením souhlasilo všech 74 otisků finálního manifestu; implementace a ověřené výsledky se nemění.
[Plán před implementací](../superpowers/plans/2026-09-25-sp-009h-conversion.md),
[smlouva H v1](SP-009H-CONTRACT.md). Evidence je lokální podle `.gitignore`;
regresní G fixture a browser driver jsou součástí změny určené pro Git.

## Proveditelnost a vymezený mechanismus

Skutečný G export má doma **13,085000000089229** jantaru a dva původní prameny
s příjmem **1,8/s** díky zachovanému B1. Pokladny pěti měst jsou 32/74/4/30/4.
Poražený Svaz má původní rezervu **0** a zmrazený kupní příjem **203**; Liga má
původní rezervu **40**, civilní účet **0** a dvě města. Jediný výpad Svazu je
zničený, hráčův původní tank #14 zůstává doma se zdravím 41,8. Tyto účty nejsou
zaměnitelné; nové obřady lze financovat aktivním domácím hraním bez dotací.
[Audit a otisky vstupu](../../evidence/sp-009h/verification/feasibility.json).

Pouť Souznění používá tři skutečná místní stanoviště a aktivní volbu obřadu:
Sdílení odpovídá nouzi, Smíření strachu z násilí, Paměť místní tradici/svébytnosti.
Námitka závisí na jídle/obyvatelích, stráži a posledním městě. Hráč musí dojít
WASD do 3 jednotek, číst aktuální námitku a zaplatit **20 z domova**. Správná
odpověď přidá pečeť, chybná spotřebuje stejné prostředky a jednu pečeť odebere.
Žádný státní příjem, vyrobené jídlo, léčení, pasivní vliv nebo vztah nevzniká.

Potřeba 3 pečetí roste o jednu za poslední město a jednu při rezervách nad 40.
Samostatné potvrzené dokončení stojí dalších 20 a vyžaduje blízkost náměstí do 6.
Bezchybná cesta stojí 80/100/120. Odchod či vojenský závazek dostupnost přeruší;
změna vlastníka trvale zneplatní pečeti vlastnické epochy. Doklady a výdaje
zůstanou. Výslovné vzdání se je bezplatný reset, nikdy vratka.

Dokončení znovu porovná celý příkaz: owner/epoch, revizi, počet událostí,
rezervy/počet měst, populaci/jídlo/stráž/odolnost. Znovu kontroluje život,
etapu, původní pramen, pevninskou cestu, místní polohu, všechny vojenské závazky,
prostředky i limity. Teprve pak synchronně odečte cenu, vloží účetní událost,
převodní doklad a změní owner/revizi. Dvojí a zastaralé potvrzení nic neplatí.
Obřad zneplatní rozjednanou nabídku G; převod G či F ukončí H epochu. Jeden stát
smí dokončit jeden mírový převod G/H za původní strategický tah.

## Uložený význam, majetek a čas

CityRegistry **v8**, `City.conversion` **v1**, States **v4**, Military **v2**,
obálka **v3**. Explicitní migrace aktivuje předchozí vrstvy a přidá prázdné H
události v live i checkpointu před rekey; opakování nemění ani checkpointový
string. Parser nemigruje ani nevyrábí minulost. Nové státní i hráčské město
má od narození prázdný deník. Historické kampaně nedostanou náboženskou minulost,
peníze, vztahy, jednotky či odměny.

Každý náklad má jediný doklad `home → consumed`, rovnost before−amount=after.
Postup se odvozuje z deníku, není druhou autoritou. Převod H odkazuje na závěr
s přesným součtem skutečné spotřeby epochy a snapshotem ekonomiky/stráže/škod.
Founder, capture E a všechny převody F/G zůstávají ve stejném řetězci.
Parser kontroluje tvary, meze, sekvenci, polohu, pečeti, historické transakce,
populaci a vazbu complete↔transfer. Checkpoint je přesný prefix; obnova nahradí
celou větev bez sloučení zůstatků. JSON není kryptografický důkaz proti přepsání
celé kampaně. Limit 64 událostí/město a 32 převodů je konečný; při 63 událostech
může být poslední placenou událostí pouze hotové dokončení. Vzdání se za 0
neobnovuje prostor a na posledním místě větev zablokuje.

Obyvatelé/ID, pokladna, jídlo, budovy/vzhledy, platby a škody zůstávají. Stráž
se demobilizuje, její uložené zdraví a původní platba se nepřepíšou. Tanky a vraky
se nemění; nevzniká léčení nebo odměna. Mírové H přijetí samo nezakládá protiútok F.
Poslední město lze konvertovat i s původní rezervou 40; poražená Liga zmrazí své
účty, neexpanduje ani neutratí rezervu. Svaz si ponechá zmrazených 203 z G.
Původní regiony, prameny, B1, místní čas B, zmrazení domova C i čas D trvají.
Pauza/editor/knihovna/globál nic neposouvají, žádné offline dohánění.

## Ověření a původ vstupů

- Úplná sada **153 souborů / 3 232 testů**, **177,20 s**, jeden worker.
  **65 H regresí** pokrývá determinismus, konečné platby, ztrátu/obnovu pečetí,
  vzdálenost, nedostatek, čekání, všechny fáze výpadu, zastarání/dvojí dokončení,
  G/H konflikt, poslední město, skutečný F boj i placený H pokus následovaný
  vojenským převzetím, striktní import, historické migrace, rekey a checkpoint.
- Unit testy výslovně připravují polohu u stanovišť a některé negativní/mezní
  stavy. Tyto vstupy nejsou tvrzené hrané výsledky. Pečeti, placené obřady,
  původní boj a převody používají skutečné herní funkce. Hypotetický návrat
  stejného vlastníka je pouze test neobnovení epochy, nikoli odehrané dobytí.
- Typecheck a build prošly. Žádná závislost, změna lockfilu nebo testových limitů.
  Build `index-B7HcULZS.js`: **1 419,44 kB / gzip 441,11 kB**. Známý Vite warning
  o chunku nad 500 kB trvá.
- Nová G fixture je byte-identická originálu, SHA-256
  `ef18ee498054528ab141fd3a69acde110d007fc6188a2e348862f8bbc34b6386`.
  **32 původních datových/kódových fixtures** proti HEAD a **25 starších exportů**
  proti G manifestu beze změny. [Otisky](../../evidence/sp-009h/verification/historical-verification.json).

- Finální produkční browser **5/5, 0 chyb**, skutečný G vstup, native RAF.
  Domácí prostředky **13,085 → 290,135** za **154,063 s** skutečného času,
  **9 235 ticků**; přírůstek 277,05 přesně odpovídá 1,8/s simulovaného domácího
  času. První město skutečně odehraje úspěch, chybu (pečeť 1→0), tři další
  úspěchy a závěr: **120 spotřebováno**, žádný příjem státu. Placený vklad 20
  a následný místní hospodářský cyklus jsou odehrané. Druhé poslední město
  vyžaduje čtyři obřady + závěr: **100 spotřebováno**, přes odmítnutí obchodu G.
- Konečná původní/civilní rezerva států **0/203 a 40/0**, všechny městské
  vlastníky drží linie. Domov ve finálním exportu **50,705**; rozdíl po nákladech
  odpovídá krátkým skutečným návratům k pramenům. Původní E/F/G jsou shodné,
  tank #14 zůstává na 41,8 zdraví a živé původní stráže na uložených 62,
  demobilizované bez odměny. Žádný nový výpad nebo jednotka.
- Pauza/editor/knihovna/globál zachovají data, odchod/návrat i import rozpracované
  větve zachovají pečeť. Reálný místní cyklus zneplatní staré potvrzení, zrušení
  a dvojí mezerník neplatí. Kamera, fokus/Tab/mezerník, 20 návratů a otevírání
  historie, běžný export/import/rekey/save/reload/load prošly.
- Jediný offline připravený H browser vstup je smrt finální kopie s checkpointem
  ze skutečného jednopečetního exportu. Běžná obnova vrátí přesně celou rozpracovanou
  větev, účty, vlastníky a E/F/G/H doklady. Odehraná smrt se netvrdí.
- Historický produkční driver **12/12, 0 chyb**, **23,143 s**: původní etapy,
  skutečný historický kmen/stroje, B1, regiony/prameny, planeta/sandbox a SP-010.A.
  Přechodové a úmrtní vstupy jsou výslovně připravené původním driverem, nikoli
  nová kampaň odehraná od narození; [původ vstupů](../../evidence/sp-009h/historical/PREPARED.md).
- Původní develop-web-game klient prošel s adaptérem native-time čekání,
  instalovaným Chrome a běžným importem G/návštěvou cíle. Zachovaný vstupní,
  snímkový a error loop; finální obraz a textový stav prohlédnuté, bez chyb.
  Tento SwiftShader smoke není GPU benchmark. Žádný browser nepřepisuje živý
  herní stav, localStorage ani hodiny.

## SP-017 a měření

UI uvádí cíl/vlastníka, námitku a význam odpovědí, pečeti/situační odpor,
polohu/vzdálenost, cenu/zdroj/spotřebu, přerušení a nevratnou ztrátu epochy,
explicitní potvrzení/zrušení/výsledek i jednotlivé doklady. Společná historie
rozlišuje E/F/G/H. Nativní fokus jde na potvrzení, pak na nadpis výsledku;
Tab a mezerník i původní kamerové ovládání jsou ověřené. Posuvný panel při
1024×640 zachová dostupné ovládání bez přetečení. Finální nedostatek, neúspěch,
potvrzení, obě převzetí a E/F/G/H historie při 1024×640, město při 1280×720,
původní stroje/sandbox a skill snímek byly skutečně prohlédnuté.

Chrome headless, ANGLE Metal / **Apple M4**, pixel ratio 1, build výše.
Měření proběhlo bez souběžné testovací nebo browserové zátěže:

| Měření | Výsledek |
|---|---|
| Zaplacený obřad → ověřená událost, 9 vzorků | p50 37,86 / p95 50,58 ms |
| Dokončení → ověřený vlastník, 2 vzorky | max 63,91 ms |
| Vstup do města, 27 vzorků | p50 42,80 / p95 47,60 ms |
| Návrat domů, 20 vzorků | p50 39,25 / p95 48,44 ms |
| Otevření/zavření historie, 20 dvojic | p50 96,75 / p95 130,84 ms |
| Návraty, 316 RAF intervalů | p50 16,70 / p95 33,30 / max 183,30 ms |
| GPU callback s kreslením, 38 vzorků | p50 0,510 / p95 2,428 / max 2,758 ms |
| H průchod, návraty 10→20, heap po GC | 19,837 → 20,055 MB |
| H průchod, návraty 10→20, GPU prostředky | geometrie 299→310, buffery 1 177→1 221, programy 19, textura 1 |
| Doplňková diagnostika, návraty 10/20/30/40 | stále 349 geometrií / 1 374 bufferů / 19 programů / 1 textura |

GPU timer `EXT_disjoint_timer_query_webgl2` zahrnuje jen dokončené nedisjoint
vzorky s alespoň jedním skutečným draw callem. Jde o práci renderovacího RAF
callbacku, ne celkové vytížení GPU. Počty prostředků nejsou GPU čas; RAF navíc
obsahuje CPU/plánování, GC a přepínání UI. Maximální RAF zásek se neskrývá.

Počáteční růst prostředků v hlavním průchodu vyvolal samostatnou **40cyklovou
nativní diagnostiku** ze skutečného H exportu. Od 10. do 40. návratu se počty
ustálily; každý další blok 10 návratů vytvořil i odstranil přesně 3 950 bufferů.
Heap 10→40: **22,960 → 22,978 MB**, mezitím kolísal. Počty domácích objektů
se nezměnily; konkrétní příčinu počátečního růstu neurčujeme. Doloženo je
ustálení tohoto krátkého scénáře, nikoli dlouhodobá absence úniku.
[Diagnostika](../../evidence/sp-009h/memory-diagnostic/results.json).

První produkční pokus úspěšně dokončil první město, ale assertion driveru
před druhým městem použila město z jiného přečteného objektu stavu. Čistá quote
správně odmítla cizí referenci. Driver opraven na jeden konzistentní snapshot
bez změny herních pravidel; celý průchod od G zopakován na finálním buildu.
Skill adaptér při přípravě narazil na sandbox spuštění Chrome, duplicitní
selektor a timeout před finálním buildem; finální samostatný běh prošel.


## Nezávislé review

`/root/review_conversion` provedl samostatnou kontrolu účetnictví, epoch,
atomických předpokladů, migrace/checkpointu a vazeb E/F/G. Opraveny dvě P2 mezery:
částečný obřad mohl uvádět nemožný historický tah/rezervu/města/stráž, a následně
nemožný počet obyvatel měnící správnou odpověď. Parser nyní rekonstruuje meze
z původních transakcí a úplných vlastnických snapshotů. Negativní regrese i
nezávislé SSR reprodukce opravy potvrdily; skuteční 4 obyvatelé projdou, 32 či
liché 3 ne. Reviewer navíc úspěšně provedl 63→64 událostí, skutečnou spotřebu
1 280 a save round-trip. Žádný konkrétní blokující nález nezůstal otevřený.
[Záznam review](../../evidence/sp-009h/verification/review.json).
Finální review ověřilo také produkční výsledky, tři snímky 1024×640 a 40cyklovou
diagnostiku; bez otevřeného konkrétního blokujícího nálezu. Vlastní kontrola
změněných i nových souborů a `git diff --check` dokončené.

## Důkazy a úklid

- [Aktivní H kampaň](../../evidence/sp-009h/browser/active-campaign.save.json),
  [produkční výsledky](../../evidence/sp-009h/browser/results.json),
  [historické výsledky](../../evidence/sp-009h/historical/results.json).
- [Potvrzení 1024×640](../../evidence/sp-009h/browser/ready-1024.png),
  [první převzetí](../../evidence/sp-009h/browser/converted-1024.png),
  [poslední město](../../evidence/sp-009h/browser/last-city-1024.png),
  [doklad H](../../evidence/sp-009h/browser/history-h-1024.png),
  [původní E/F](../../evidence/sp-009h/browser/history-ef-1024.png),
  [původní G](../../evidence/sp-009h/browser/history-g-1024.png).
- [Testy](../../evidence/sp-009h/verification/all-tests.log),
  [build](../../evidence/sp-009h/verification/build.log),
  [skill adaptér](../../evidence/sp-009h/skill/adapter.json).

[Úklidový manifest](../../evidence/sp-009h/cleanup.json): odstraněno **24** vlastních
mezivýsledků/duplicit a pracovních kopií, **4,57 MB**. Zachované všechny aktivní
exporty, skutečné výdělečné/rozpracované/předzávěrečné H větve, potřebné připravené
checkpointové/historické vstupy a malá finální evidence přibližně **5,03 MB**.
Trace/video/ZIP nevznikaly; `.playwright-mcp/traces` není přítomná. Disk před
běhy přibližně **12 GiB**, po úklidu **11,53 GiB** volných. Systémový rozdíl
nepřičítáme této malé evidenci. Žádné cizí artefakty nebo starší aktivní save
nebyly smazané ani přepsané.

## Přesné pokračování a meze

Omezená H cesta doplňuje hratelné E/F a G; neprokazuje dokončení celé civilizační
fáze od narození samostatně každou cestou. Celé SP-005.B/SP-009/SP-010/SP-017
zůstávají otevřené, stejně jako širší armády/diplomacie/trh, knihovna vozidel/lodí,
vesmír a SP-007.B2/D. Automatizovaný hráč ověřuje čitelné instrukce a interakce;
lidské porozumění, zábavnost, poslech, Safari/mobil a dlouhý soak nejsou ověřené.

**Dále podle pořadí roadmapy:** samostatně vymezit první omezenou námořní expanzi
SP-009.I. Nejdřív audit skutečné H kampaně, jejího pobřeží/cílů a konečných peněz;
potom smlouva placeného námořního prostředku, terénní průchodnosti, přepravy,
vlastnictví a persistence nad SP-010. Historické kampaně nesmějí dostat loď,
peníze ani obnovené poražené státy. B2/D vyžadují vlastní návrh a nejsou odměnou H.

```sh
pnpm test --maxWorkers=1
pnpm typecheck
pnpm build
pnpm preview --port 5215 --strictPort
# V druhém terminálu:
LUMAVORA_URL=http://127.0.0.1:5215 pnpm test:conversion
HOME_PLANET_OUTPUT=evidence/sp-009h/historical LUMAVORA_URL=http://127.0.0.1:5215 pnpm test:geography
```

Opakovaný browser ukládá do svého výstupního adresáře; pro nový diagnostický běh
nastav jiné `CONVERSION_OUTPUT`, aby zůstal zachovaný aktivní save.
Ruční migrace není potřebná; běžný import/load ji provede před rekey.
