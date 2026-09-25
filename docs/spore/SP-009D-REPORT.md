# SP-009.D — první hratelní soupeřící státy

**Report v1, 25. září 2026. D hotovo v rozsahu smlouvy.** Pracovní strom nad čistým `3dfbfc7c4`.
[Plán a kritéria](../superpowers/plans/2026-09-25-sp-009d-states.md) a
[smlouva v1](SP-009D-CONTRACT.md) vznikly před implementací. Bez commitu,
pushe, deploye, nových závislostí nebo změny lockfilu.

## Hratelný rozsah

Dva samostatné státy, Svaz zelených údolí a Liga měděných věží, mají stabilní
identitu, vlastní počáteční rezervu 400 jantaru a odlišnou prioritu pěstírny
nebo dílny. Nejsou přejmenované původní kmeny či strojové regiony. Po dosažení
strojové etapy se při místním hraní aktivují; v prvním strategickém tahu
samostatně hledají a platí nové první osídlení. Jejich rozhodování nepoužívá
útok hráče, scénář předem napsaných událostí, jeho finance nebo simulační RNG.

Stát podle aktuálních budov, obyvatel, volných parcel a prostředků otevře
městskou pokladnu, postaví obydlí a oba výrobní provozy, pozve čtyři občany
a hledá druhé město na volné sousední pevnině. Pořadí měst je stabilní podle
identity. Každá akce má zvláštní doklad a skutečný rozpočtový dopad. Čistý
výhled `stateOpportunity` není dokladem: `last.action` je zvolený záměr,
`outcome` jeho výsledek a `transactions` obsahují pouze zaplacené akce.
Odmítnutí ponechá finance beze změny a zobrazí konkrétní důvod.

Založení stojí 60 ze státní rezervy; otevření převádí 80 do městské pokladny.
Rozvoj používá původní ceny B: obydlí 20, pěstírna 16, dílna 24 a dva příchody
po 8. Bez návštěvy má dokončené město čtyři občany, tři budovy a pokladnu 4,
žádný výrobní cyklus. Stát se dvěma takovými městy má zbývající rezervu 120.
Při nedostatku během aktivní návštěvy může převést dalších 20 ze své zbývající
rezervy. Nevytváří peníze, nečerpá hráčovy prameny a nemá strategický příjem.
Po vyčerpání odmítá další platbu. Mez dvě města/stát je výslovná; nejde o plnou
neomezenou civilizační ekonomiku.

## Data, prostor a čas

**CityRegistry v4 / States v1** oddělují vlastníka `lineage|state`, státní
rezervu, rozhodnutí a transakci. Hráčská založení A zůstávají beze změny.
Státní založení má `source:state`, původ activation/expansion a odkaz na
skutečný doklad. Jeho ekonomika v3 mění pouze zdroj otevření; jednotky,
místní účetnictví, ceny, obyvatelé, modely a geometrické obaly jsou B/C.
Hráčova ekonomika zůstává v2 včetně snapshotů vlastních návrhů.

Strategický tah = 10 sekund aktivního místního hraní v etapě 4/5. Samostatný
verzovaný clock ukládá turn i elapsed; nečte wall clock a nezapočítává offline
čas. Pauza, knihovna, editor, globální přehled a skrytý tab stojí. Místní
produkce B běží pouze v právě navštíveném městě; ostatní nic nedohánějí.
Domovský organismus, původní worlds, tick/RNG, jednotky, ekonomika,
historie/B1 a GameState.planet zůstávají při výpravě zmrazené podle C.

První osídlení vybírá domovský kontinent, další pouze hraničně sousední
pevninu vlastního města. Hledání nikdy nepoužije existující výpravový detail,
ani dosud prázdný hráčův; neobsadí habitat, vodu či cizí město. Používá původní
createField, citySite a buildingSite včetně místního terénu, hranic, radnice,
stanovišť, dekorací, cesty, parcel a bezpečné uložené polohy avatara.

Výjimka registru v4 dovoluje systémový detail bez hráčské návštěvy pouze s
odpovídajícím státním založením/transakcí. Takový detail nesmí být aktivní,
mít průzkum, pohyb, místní čas či výrobní cyklus. Skutečná návštěva teprve
přidá původní `visits`; nemění vlastníka ani etapu. Generátory 1,
HomePlanet v3, LocationAddress a původní worlds zůstávají stejné.

## Historické kampaně a obnova

Parser přijímá původní absence a registry 1–3 beze změny. Explicitní UI
migrace live i checkpointu před rekey přidá pouze prázdná pravidla D,
`legacy-activation` a nulový strategický čas. Nevymýšlí minulá rozhodnutí,
platby, návštěvy, výrobu nebo vlastnictví. Skutečné nové státy vzniknou až
při dalším aktivním hraní; aktivace má uložený současný tick a etapu.
Nová UI linie má původ `birth`, ale také čeká na skutečně dosažené stroje.
Opakování migrace nemění ani checkpointový string.

Checkpoint obnovuje celou větev: rezervy, městské pokladny, doklady,
rozhodnutí, obyvatele, vzhledy, detaily a oba druhy času. Obnova před aktivací
vrátí prázdný systém; pozdější nové osídlení se neslučuje se zrušenou větví.
Společné transakce musí tvořit shodný prefix. Save/load a import/rekey nemají
vedlejší granty. Knihovna budov zůstává nezávislá. Save limit 8 MiB se nemění.

Skutečný původní C export je byte-identická verzovaná
[fixture](../../tests/fixtures/geography/sp-009c-buildings.save.json), SHA-256
`d511e6f55d5480cf2305f26641f20e442dcac715d60abd79b920a6b31bab0d77`.
Originál `evidence/sp-009c/browser/active-campaign.save.json` i starší aktivní
B save zůstaly nedotčené. Historické fixtures mají původní otisky.

## Ověření

- `pnpm exec vitest run --maxWorkers=1`: **149 souborů, 3 044/3 044 testů,
  96,22 s**, bez souběžného browseru. **63 nových D regresí**: sedm seedů,
  autonomie/expanze, omezené rozpočty, opakování, prostory/limity/vlastníci,
  časná návštěva a placená náprava, nulový neaktivní čas, migrace/rekey/storage
  a checkpoint, strict-null a poškozené doklady. Všechny položky původního
  fixture manifestu mají navíc 120 kroků parity původních systémů; skutečné
  SP-010.A/B/C a SP-009.A/B/C opakované migrace a obnovu.
- Původní cílená sada města/ekonomika/budovy/cestování: **222/222** před full.
- `pnpm typecheck`, `pnpm build`, `git diff --check` prošly. Finální build
  `index-CDJ6dDwO.js`: 1 347,85 kB / gzip 419,47 kB; CSS 53,13 kB.
  Původní Vite upozornění nad 500 kB zůstává, limity se nezvyšovaly.
  Samostatný lint script není. Node 22.23.1, pnpm 11.24.0.
- Vlastní diff review a nezávislý subagent `sp009d_review`: opraveny oba P2
  (nenavštívený průzkum/čas a nedostatek při časné návštěvě), bílé mapové body
  falešně označující návštěvu a P3 falsy hodnoty místo null. Reviewer dvakrát
  provedl cílené testy (44 a 49), závěrečné read-only review bez otevřených
  nálezů. Všechny opravy jsou zahrnuté v celé sadě výše.

První implementační test našel chybu vlastního validátoru při kontrole ID
příchozích (`nextId++` uvnitř predikátu); opraveno před přijetím regresí.
Typecheck během rozšíření unionů našel chybějící zúžení typu; opravené bez
změny očekávání historických testů. Sandbox odmítl bind preview a spuštění
Chrome; autorizované lokální spuštění mimo tento limit následně fungovalo.
Nejde o nesplněné ověření ani o změnu sandboxového nastavení.

## Produkční hraní a SP-017

Finální produkční build na lokálním preview prošel **4/4 skupinami bez chyb**
([výsledky a měření](../../evidence/sp-009d/browser/results.json)). Vstupem byl
byte-identický skutečný C export s upravenými budovami a získanými zdroji.
Žádní předpřipravení soupeři, doklady, města ani peníze D. Import je běžné UI;
čekání používá nativní RAF, žádné zápisy živého stavu/localStorage ani zrychlení.

- Vlastní město zachovalo původní věž/pavilon a snapshoty. Pauza, knihovna,
  editor a globál zastavily strategii; atlas fungoval klávesnicí i změnou měřítka.
- Pozorováno 16 skutečných strategických tahů. Oba státy samy zaplatily první
  osídlení, otevření, tři stavby a čtyři občany. V tahu 8 oba založily druhé
  sousední město; do tahu 14 je rozvinuly. Každý má **14 dokladů a rezervu 120**.
  Nenavštívená města mají cycle/elapsed 0; tahy 15/16 čitelně odmítly další
  expanzi kvůli limitu. Domovské systémy a B1 zůstaly zmrazené.
- Atlas rozlišil barvu vlastníka a skutečně navštívené lokality. Návštěva
  cizího města nezměnila etapu/vlastnictví a nenabízela hospodářské příkazy.
  Skutečný místní cyklus přidal **+6−4 jantaru a +6−4 jídla**, pokladna 4→6.
  Samostatné tlačítko zaměří náměstí; orbit/zoom a návrat ke sledování tvora
  mění pouze kameru. Ověřené Tab, fokus a nativní rozbalování přehledu.
- Odchod a návrat, import/rekey, save/reload/load zachovaly doklady i custom
  snapshoty. Po 20 návratech vznikl [aktivní save D](../../evidence/sp-009d/browser/active-campaign.save.json).
  Checkpointový negativní vstup je výslovně **offline připravená mrtvá větev**
  z odehraného finálního exportu, s checkpointem odehrané expanze z tahu 8.
  Běžné UI obnovení vrátilo tuto celou větev bez dvojích plateb či expanze.

Prohlédnuty všechny finální D snímky: vlastní město 1280×720, přehled států,
mapa vlastnictví a cizí město 1024×640, finální cizí město 1280×720.
Textové vlastnictví doplňuje barvu; rezervy a pokladny jsou oddělené,
zaplacené doklady i důvody neprovedení přístupné. Panely se při menším
rozlišení posouvají; kamera ukazuje náměstí, radnici, občany a skutečné stavby.
Jde o kontrolu vykreslení a ovládání agentem, nikoli lidský test porozumění.

Historický produkční driver prošel **12/12, 0 chyb** na stejném buildu
([výsledky](../../evidence/sp-009d/historical/results.json),
[připravené vstupy](../../evidence/sp-009d/historical/PREPARED.md)):
nová linie, původní průchody vodními etapami, pobřeží→kmen→stroje/B1,
checkpoint, terraformace, stabilní T3 a migrace SP-010.A. Dva průchodové
vstupy připravují jídlo/průzkum/deník/generace a bránu, druhý plíce/nohy;
historické vítězné vstupy a mrtvá větev jsou popsané v PREPARED.md.
To není nové odehrání celé evoluční kampaně. Prohlédnuty kmen/stroje a T3/atlas.

Původní klient develop-web-game byl spuštěn s adaptérem pro nainstalovaný
Chrome, UI import tohoto odehraného D save a skutečné čekání místo časového
shimu. Původní vstupní/snímkovací/chybová smyčka zůstala; jedna sekvence
šipka vlevo + uvolnění, **0 console/page chyb**, snímek canvasu prohlédnut.
[Otisky a změny adaptéru](../../evidence/sp-009d/skill/adapter.json).

## Odezva a paměť

Měření Chrome v lokálním prostředí, bez souběžných testů nebo trace:

| Pozorování | Výsledek |
| --- | --- |
| Okna 30 RAF intervalů u každého z 16 tahů | p50 16,7 ms, p95 nejvýše 16,8 ms; nejde o izolovanou CPU dobu rozhodovací funkce |
| Rozhodování, tah 1→8→16 po GC | heap 14,55→15,30→15,52 MB; stabilně 375 geometrií, 20 programů, 1 409 živých GPU bufferů |
| Vstup do města (25 vzorků) | p50 30,50 / p95 32,07 / max 33,82 ms |
| Návrat domů (20 vzorků) | p50 43,01 / p95 47,77 / max 47,77 ms |
| RAF při návratech (218 vzorků) | p50 16,7 / p95 16,8 / max 116,7 ms včetně přechodů |
| Návrat 10→20 po GC | heap 20,78→19,61 MB; stabilně 319 geometrií, 18 programů, 1 textura, 1 252 živých bufferů |

Nové vzdálené město tedy nevytváří vzdálenou GPU scénu; přechody používají
původní uvolňování renderu. Krátký benchmark neprokazuje neomezenou stabilitu
ani mobilní výkon. Safari, mobil, dlouhý soak a lidský playtest/poslech nebyly
provedeny. Původní úplný browser na předchozím buildu prošel také 4/4;
report používá výhradně finální replay po strict-null a stabilním řazení.

## Evidence, úklid a opakování

Samostatná složka `evidence/sp-009d/`; zachován aktivní save D, expanzní a
checkpointový doklad, výsledky a malá sada finálních snímků. Mezilehlé logy,
pracovní kopie skill klienta a historické dočasné vstupy/exporty odstraněny;
[manifest úklidu](../../evidence/sp-009d/cleanup-manifest.json) uvádí přesné
cesty a otisky. `.playwright-mcp/traces/` zkontrolováno, žádný D trace/video
nevznikl. Disk před i po 16 GiB volných. Starší evidence a aktivní B/C
soubory nebyly uklízeny ani měněny. Historické fixture otisky znovu ověřeny.

Opakování produkčního D průchodu po `pnpm build` a spuštění preview:

```sh
pnpm preview --port 5212 --strictPort
LUMAVORA_URL=http://127.0.0.1:5212 pnpm test:states
HOME_PLANET_OUTPUT=evidence/sp-009d/historical LUMAVORA_URL=http://127.0.0.1:5212 node scripts/home-planet-browser.mjs --geography
```

Migrace je automatická při UI načtení/importu; uživatel nemusí upravovat save.

## Rozsah a pokračování

Celé SP-005.B, SP-009, SP-010 ani SP-017 se neuzavírají. Zůstávají vozidla,
obrana, vojenské dobytí, obchodní převzetí, konverze, námořní expanze, vesmír
a SP-007.B2/D. Toto je první omezená mírová státní vrstva s úplně dostupnými
informacemi. Strategie nemá mlhu války, diplomacii, převod vlastnictví nebo
příjmy do státní rezervy; místní občané jsou agregovanou populací B.

Přesný další krok: plán další části SP-009 pro první vojenské převzetí,
s explicitní smlouvou obrany, převodu vlastnictví, poškození, financí a
historie. Nejdřív vymezit vztah původních strojů ke skutečným městům; teprve
potom implementovat boj. B2 se nedoplňuje domnělými výsledky této D.

## Publikační dodatek · 25. září 2026

Po dokončení výše uvedeného ověření uživatel výslovně autorizoval commit
a push SP-009.D do `main`. Všech 36 otisků závěrečného manifestu souhlasilo
s pracovním stromem i zachovanými výsledky; vzdálený `main` byl stále
`3dfbfc7c4`. Tento dodatek a záznam v PROGRESS.md nemění otestovaný herní
kód. Původní zákaz publikace platil pro implementační část před tímto
navazujícím pokynem. Deploy není součástí publikace.
