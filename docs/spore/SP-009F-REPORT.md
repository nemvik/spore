# SP-009.F — obrana a skutečný protiútok · report v1

25. září 2026. Navazuje na čistý `e4c340c910834bf65aa9b7e27e0a1632858f132a`.
Implementační průchod bez commitu, pushe a deploye; navazující pokyn uživatele autorizoval commit a push F na `main`, bez deploye. Před uložením ověřeno všech 71 otisků finálního manifestu beze změny. Evidence zůstává lokální podle stávajícího `.gitignore`, regresní E fixture se ukládá do Gitu. [Plán před implementací](../superpowers/plans/2026-09-25-sp-009f-defense.md),
[smlouva F v1](SP-009F-CONTRACT.md). Dokončení se vztahuje pouze na omezený průchod F;
SP-005.B, celé SP-009/SP-010/SP-017 a SP-007.B2/D zůstávají otevřené.

## Implementovaný průchod a konečné peníze

Skutečné pokračování E má u každého státu původní rezervu 400, z níž 280 odešlo na
založení/otevření dvou měst a 80 na dvě původní stráže. Zbývá **40** — přesně cena
jednoho tanku původní konstrukce stráže. Stát po skutečné ztrátě svého města vybere
vlastní zdroj, hráčem držený cíl a dosažitelnou pevninskou trasu. Rozhodnutí zaplatí
jediný výpad ze zbývající rezervy. Vyčerpaný či poražený stát dostane důvod odmítnutí;
žádný nový příjem, historický nákup ani náhradní jednotka se nedoplňuje.

Hráč nasazuje tentýž tank z `machines.fleet`, vyrábí jej v původním editoru a opravuje
za původních 10 jantaru. Nový soupeřův `MachineUnit` má jedinou autoritu v placeném
`Military.raids`, svázanou se státní transakcí. Sdílí geometrii tanku, navigaci,
kolize a střelbu E. Příprava 15 s, doprava 5 s/hranu, bezpečný vstup, skutečný pohyb,
dosah 12, překážky a poškození předcházejí každému výsledku. Nepřítomný boj čeká.
Převzetí vyžaduje zničenou obranu, odolnost náměstí 0 a živý tank fyzicky na náměstí
po 5 nepřerušených sekund. Časovač příjezdu sám nikdy vlastníka nemění.

Soupeř může zničit obránce, poškodit město a zůstat jako okupant. Hráč může zaplatit
opravu nebo nový tank, okupanta zničit a město znovu obsadit. Přeživší ustupující
soupeř zůstává uložený bez další výpravy; zničený hráčův tank skutečně opustí flotilu.
Nedořešený výpad nebo okupant blokuje přechod do další etapy s viditelným důvodem.

## Vlastnictví, hodiny a uložená větev

CityRegistry **v6**, States **v3**, Military **v2**. Explicitní opakovatelná aktivace
migrace live i checkpointu probíhá před rekey, parser historii nedoplňuje. Přidává
jen prázdnou F historii/výpady a odolnost existující zaplacené radnice. Rozpracovaný
E rozkaz obsazení přeruší, hotový E `capture` zůstává byteově stejným záznamem.

Každá F změna synchronně připojí vlastníka před/po, původní jednotku, identitu
výpadu, strategický tah, bojový čas a úplný účetní snapshot. Zachová zakladatele,
pokladnu, jídlo, budovy/vzhledy, obyvatele i jejich ID. Revize zahrnuje počet změn
vlastníka: staré hospodářské potvrzení neplatí ani po návratu stejného vlastníka.
Opakované vyhodnocení obsazení nevytvoří druhý doklad či odměnu. Limity historie
nebo účetnictví odmítnou obsazení před mutací a soupeř ustoupí.

B místní výroba, C zmrazení domova a D strategické rozhodování zůstávají oddělené.
Příprava/přeprava soupeře běží jen s aktivním místním hraním; střet jen při návštěvě
cíle. Pauza, editor, knihovna, globál a skrytý tab neposouvají čas. Odchod přeruší
obsazování, návrat neléčí. Žádné offline dohánění. Checkpoint obnovuje celou větev
najednou, včetně peněz, jednotek, poškození a historie, bez slučování s prohranou větví.

Ztráta posledního hráčova města zachová původní domov, prameny a stroje; pokračování
musí zaplatit ze skutečných zdrojů. Poražený stát bez města nedostane nové založení
ani výpad. Původní regiony a dědictví B1 se nepřepisují.

## Ověření a původ vstupů

- Úplná sada **151 souborů / 3 110 testů**, 99,98 s. Poté přidána jedna cílená regrese
  blokovaného příjezdu: finálních **67/67** testů F/E, z toho 37 F. Celá sada nebyla
  kvůli této jedné další regresi opakována. Determinismus, účetnictví, geometrie,
  skutečná výhra/prohra, poslední města obou stran, oprávnění, poškozené importy,
  migrace/checkpoint a historické A–E jsou v těchto testech.
- Typecheck/build prošly; bez nové závislosti či změny lockfile. Známé upozornění
  Vite na chunk nad 500 kB trvá. Finální build a browser výsledky viz evidence níže.
- Výchozí E export je nová byte-identická fixture
  `tests/fixtures/geography/sp-009e-military.save.json`, SHA-256
  `1699d660bdb0b0ec4d8468df451c7d57cb908f6a0c8da394a9f28a4511558e64`.
  Originál `evidence/sp-009e/browser/active-campaign.save.json`, aktivní B/C/D
  a všechny původní tracked fixtures zůstávají nedotčené.
- **Hlavní produkční průchod:** běžný import skutečné E fixture, placená oprava
  původního tanku, skutečně odražený útok, export během boje, rekey, odchod/návrat.
  Nový import E zahájí oddělenou prohranou větev: tank je zničen a město obsazeno;
  původní prameny doma vydělají na nový tank za 56 a vklad 20. Hráč nový tank sestaví
  v původním editoru, zničí okupanta, přeruší a opakuje obsazení, hospodaří, ustoupí,
  vrátí se dvacetkrát a uloží/načte kampaň.
- **Připravený vstup posledního města, produkční průchod 2/2, 0 chyb:** offline kopie E bez dřívějšího hráčem
  založeného města A a bez checkpointu. Není to odehraná ztráta A ani migrace
  skutečné historie. Peníze, stroje, prameny, státní doklady a převzetí E zůstávají.
  Následný protiútok, ztráta posledního města, výdělek doma, placená oprava,
  zničení okupanta, opětovné převzetí a hospodaření jsou skutečně hrané.
- **Připravená obnova:** offline mrtvá kopie konečné větve obsahuje jako checkpoint
  skutečný dřívější export po ztrátě města. Běžné tlačítko obnovy vrátí celý tento
  odehraný stav; netvrdíme, že smrt tvora vznikla v tankovém střetu.
- Historický browser **12/12, 0 chyb** znovu používá původní driver a jeho výslovně připravené legacy
  přechodové/úmrtní vstupy: původní etapy, dosažený reef, kmen/stroje a B1,
  planeta, sandbox a import SP-010.A. Netvrdíme novou celou kampaň od narození.
- Žádný browser během hraní nepřepisuje živý stav/localStorage ani nezrychluje čas.
  Diagnostika pouze čte stav, měří RAF, heap a WebGL. Původní skill klient použit
  s doloženým adaptérem běžného UI importu a skutečného čekání místo virtuálního času;
  jeho SwiftShader smoke se nepočítá do výkonu Apple GPU.

## SP-017, výkon a review

Varování ukazuje přicházející zaplacený výpad a odkaz na cíl. Městský panel ukazuje
vlastnictví, vybraný původní tank, oba zdravé/poškozené stroje, náměstí, rozkazy,
cenu, cestu, důvody odmítnutí a úplnou posloupnost vlastníků. Nativní fokus a
mezerník ověřují rozkazy; při aktualizaci panelu se uzel tlačítka nesmí změnit na
jinou akci pod ukazatelem. Bojová kamera drží oba blízké tanky v záběru.
Panel při 1024×640 používá scroll; cena/historie mají rozbalitelné podrobnosti.

Finální build `index-CFlsP9Q5.js`: 1 390,24 kB / gzip 431,92 kB. Chrome headless,
ANGLE Metal / Apple M4, pixel ratio 1. Hlavní průchod **4/4, 0 chyb**. Měření proběhlo
samostatně, bez paralelních testů či jiného browser scénáře:

| Měření | Výsledek |
|---|---|
| Rozkaz Obrana, klik → ověřený stav | 53,23 ms |
| Vstup do města, 24 vzorků | p50 64,92 / p95 66,24 ms |
| Návrat domů, 20 vzorků | p50 68,19 / p95 77,60 ms |
| Aktivní boj, 187 RAF intervalů | p50 33,30 / p95 33,40 / max 33,40 ms |
| GPU čas boje, 60 nenulových vzorků | p50 0,538 / p95 1,080 / max 1,609 ms |
| GPU čas během návratů, 22 nenulových vzorků | p50 0,531 / p95 1,291 / max 1,292 ms |
| Boj: heap po GC / GPU prostředky | 20,12 MB / 570 geometrií, 22 programů, 2 233 bufferů |
| Návraty 10 → 20: heap po GC | 22,64 → 24,46 MB |
| Návraty 10 → 20: GPU prostředky | shodně 404 geometrií, 22 programů, 1 587 bufferů |

GPU čas pochází z dostupného `EXT_disjoint_timer_query_webgl2`, nikoli z počtů
prostředků. V každém okně se měřilo nejvýše 120 RAF callbacků; nulové callbacky
bez GPU práce (diagnostický RAF a přehled UI) jsou v raw výsledku zachované a pro
GPU percentily výše vynechané. Interval RAF zahrnuje plánování prohlížeče/CPU a není
GPU časem. Jde o krátké vzorky, ne celkové vytížení GPU ani dlouhý soak. Heap mezi
10. a 20. návratem vzrostl o 1,82 MB; neprohlašujeme nulový únik paměti.

První měření odhalilo drahé opakované vytváření statického navigačního grafu.
Cache nyní drží jen současné bojiště a invaliduje změnu překážek/zástavby nebo
obalu aktuálního tanku; pohyblivá těla řeší druhý kolizní sweep. Nový bojový vzorek
je omezen na skutečně aktivní boj, nikoli pauzu/editor nebo přípravu výpadu.
Finální snímky boje, výhry, prohry a opětovného převzetí při 1024×640 i 1280×720
byly vizuálně prohlédnuté.

Nezávislé review `/root/review_defense` uzavřelo šest konkrétních opravených nálezů:
přechod etapy za okupace, migrace rozpracovaného obsazení E, ověření vlastníků při
platbě, budoucí fáze/timer checkpointu, výška druhého kolizního sweepu a omezení
navigační cache na současnou konstrukci. Dodatečně ověřilo všech pět dvojic příjezdů
skutečného E vstupu: bez kolize, odstup 6,8, totožné po save/load, výpad za 40 dostupný.
Browser odhalil navíc nestabilní identitu tlačítek; oprava ověřena opakováním hraní.
Cílené testy odhalily překážku v původně pevném vstupu; deterministické natočení
řeší příjezdy bez změny terénu či historických budov. Finální opravu přepínání kamery reviewer samostatně ověřil bez dalšího nálezu.
Vlastní kontrola diffu dokončena; finální kamera znovu prošla produkčním průchodem.

## Důkazy, reprodukce a další krok

- [Hlavní aktivní F save](../../evidence/sp-009f/browser/active-campaign.save.json)
  a [produkční výsledky 4/4](../../evidence/sp-009f/browser/results.json).
- [Připravená poslední městská větev, výsledky 2/2](../../evidence/sp-009f/last-city/results.json),
  [její vstup](../../evidence/sp-009f/last-city/prepared-last-city.save.json)
  a [odehraný výsledek](../../evidence/sp-009f/last-city/active-campaign.save.json).
- [Historický browser 12/12, 0 chyb](../../evidence/sp-009f/historical/results.json),
  [skill adaptér a úspěšné provedení](../../evidence/sp-009f/skill/adapter.json).
- [Boj 1024×640](../../evidence/sp-009f/browser/combat-1024.png),
  [znovu získané město](../../evidence/sp-009f/browser/recaptured-1024.png),
  [původní E a oba F doklady v UI](../../evidence/sp-009f/browser/history-1024.png).
  Čisté finální snímky byly znovu pořízeny běžným importem obou aktivních save,
  kamerou a návratem panelů na začátek; žádný uložený výsledek se tím nepřepsal.
- [Testy](../../evidence/sp-009f/verification/tests.log),
  [finální cílené regrese](../../evidence/sp-009f/verification/focused.log),
  [build](../../evidence/sp-009f/verification/build.log),
  [nezávislé review](../../evidence/sp-009f/verification/review.json),
  [otisky historie](../../evidence/sp-009f/verification/historical-verification.json).
  Porovnáno **33 tracked fixtures proti HEAD a 38 vstupních otisků** včetně aktivních
  B/C/D/E; nula změn. Nová E kopie odpovídá originálu.
- [Úklidový manifest](../../evidence/sp-009f/cleanup.json): odstraněno 32 vlastních
  mezivýstupů/duplicit/pracovních kopií, 5,52 MB. Finální evidence přibližně 4,2 MB.
  Aktivní F save, připravené regresní větve a malé finální snímky zachované.
  Trace/video vypnuté, `.playwright-mcp/traces` není přítomná. Disk kontrolován před
  delšími běhy a po úklidu: přibližně 11 GiB při začátku, 9,1 GiB na konci;
  změna volného místa celého systému není přisuzována této malé evidenci.
  Cizí data ani historická evidence se nemažou.

```sh
pnpm test --maxWorkers=1
pnpm build
pnpm preview --port 5213
# V druhém terminálu:
pnpm test:defense
pnpm test:defense-last-city
HOME_PLANET_OUTPUT=evidence/sp-009f/historical LUMAVORA_URL=http://127.0.0.1:5213 pnpm test:geography
```

Ruční migrace není potřeba. Pro pokračování importovat hlavní F aktivní save;
stát už svůj jediný výpad zaplatil a město bylo skutečně znovu získáno.
Nejde o rozsáhlé armády, opakované automatické nákupy ani ekonomickou obnovu států.
Obchodní převzetí, konverze, knihovna vozidel/lodí, moře a vesmír nejsou implementované.
Chybí lidský playtest/poslech, Safari/mobil, dlouhý soak a širší vyvážení. Měřený
krátký lokální běh nemůže tyto meze nahradit.

**Přesné pokračování:** samostatně sepsat smlouvu první obchodní cesty převzetí
(cena a její konečný zdroj, souhlas/odmítnutí, oprávnění, atomická platba/změna
vlastníka a checkpoint), napojenou na společnou historii F. Nepřidávat historickým
státům peníze ani další výpady. Vojenské rozšíření na více jednotek či další výpady
vyžaduje vlastní finanční a prostorovou smlouvu; F je automaticky neotevírá.
