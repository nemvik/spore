# SP-010.B — geografická návaznost domovské planety

24. září 2026. Pracovní strom nad čistým `main` / `93e5f4b91c787275eacd587a710a0023d161e20c`, navazuje na skutečně dokončenou SP-010.A. [Plán před implementací](../superpowers/plans/2026-09-24-sp-010b-geography.md), [datový kontrakt B](SP-010B-CONTRACT.md), [zachované místní adresy A](SP-010A-CONTRACT.md). Bez nové závislosti, změny lockfilu, commitu, pushe či deploye.

## Doručený rozsah

`homePlanet` v2 ukládá kompaktní recept geografického atlasu: verzi generátoru, původní seed a původ geografie. Atlas má 72×36 buněk na sféře, obvod rovníku 36 km, výšky, pevninu/vodu, sedm biomů, výchozí zeměpisné podmínky a souvislé regiony s deterministickými ID. Tři generované pevninské laloky se podle seedu mohou spojovat; není garantovaný pevný počet kontinentů. Vzniká ze stejného receptu po save/load i vyprázdnění omezené cache, nečte ani nespotřebovává RNG kampaně či světů.

Existující mikrosvět, útes a pobřeží jsou výslovně zasazené do společného pobřežního regionu: pobřeží na pevnině, útes a mikrosvět v přilehlé mělčině. API zpřístupňuje jejich kotvy, region a přesný obousměrný převod. Původní místní jednotky a meze se nemění; nová vrstva jim přiřazuje 0,001 / 0,1 / 1 m na jednotku. `LocationAddress` zůstává původní adresou. `GeographicAddress` používá samostatná pole longitude/latitude/altitudeMeters; záměna významů se neprovádí.

`addressGeography` spojuje adresu s původním autoritativním `World`, původním `groundHeight`, novou výškovou kotvou a hrubým regionem. Mapa i budoucí města čtou tentýž model. Neexistuje druhá kopie organismů, zdrojů, kmenů, strojů či historie. `GameState.planet` zůstává místní terraformací se svým klimatem a T0–T3. Statické klimatické hodnoty atlasu se do ní nepřenášejí a nejsou tvrzením o dosaženém výsledku kampaně.

Geografie je aktivovaná v nové kampani i při běžném load/importu, uložená společně s checkpointem a dostupná přes existující deník J / tlačítko planety. Přehled zobrazuje mapu, aktuální lokalitu a povrch, legendu, číslovaný detail habitatů, souřadnice, fyzickou šířku a původ dat. Rozbalitelný detail vysvětluje měřítko a oddělené místní klima. Nová mapa nedává žádná vlastnictví, objevy ani cestovní oprávnění. Existující zvuk a hlášení přechodů zůstávají; nový zvukový systém nevznikl.

## Historické kampaně a kompatibilita

| Vstup / operace | Ověřené chování |
| --- | --- |
| Samotný parser starého save bez homePlanet | Absence zůstává. Původní simulační pravidla nejsou přepnutá. |
| Samotný parser validního SP-010.A v1 | Vrací v1; nepřidává geografii ani nový význam souřadnic. |
| UI load/import absence nebo v1 | Výslovná aktivace/migrace na v2 před změnou importního slotu, zachované ID a původní registry. Původ `legacy-assigned`, i když historický tick je nula. |
| Nová UI linie | Původ `birth`, stejný recept i v prvním checkpointu. Předem připravené pobřeží NPC není návštěva. |
| Opakovaná aktivace, import/rekey, export/load | Stejný seed, kotvy a ID; další aktivace již nemění ani checkpointový string. Bez grantu/platby/spawnu či změny historie. |
| Starší checkpoint / opakovaný přechod | Stejný atlas a kotvy, registr podle jeho původních existujících světů. Obnova vrací svět, ekonomiku a historii společně. |
| Chybějící checkpoint | Původní fallback nová linie, nová identita a geografie s původem birth. |
| Poškozený recept či nekompatibilní checkpoint | Přísné odmítnutí: verze, přesné klíče, seed, původ, smíšená přítomnost/v1/v2 a identity. |

Všech **11 původních save fixtures je byte-identických**, SHA-256 kontrolováno v testech. Navíc je verzovaný skutečný krátký browser export SP-010.A v1 v `tests/fixtures/geography/`, SHA-256 `d1ab026239c80e0843e379984056c2b9e0b963069051a111cb27b207f5dc8ece`. Není to uměle vytvořený doklad odehrané kampaně; původ a rozsah popisuje README fixture.

Obálka kampaně zůstává v3, homePlanet mění verzi v1→v2. Staré aplikace před B nové exporty v2 nepřečtou. B čte oba formáty; ruční migrační zásah není potřeba. Jakákoli budoucí změna výstupu `generator:1` musí mít vlastní verzi a migraci.

## Regrese, build a nezávislé review

**63 nových testů** v `tests/planet-geography.test.ts`, vedle všech 53 původních regresí A:

- 32 seedů: determinismus po vytěsnění cache, 2592 platných buněk, voda/pevnina, regiony a sousednost přes šev, biomy, neměnné kotvy a pobřežní vazby. Pevné otisky čtyř seedů chrání smlouvu generátoru.
- Čtyři seedy a všechny tři habitaty: obousměrné převody včetně původních mezí X/Z ±78 a Y ±1024; původní svět i terén zachované. Cizí planeta, neznámé/neexistující místo, vzdálený bod a neplatné hodnoty odmítnuté.
- Každá historická fixture: SHA-256, absence→v1→v2, opakování, save/export/import/checkpoint, původní adresa. **120 kroků skutečné simulace v A a B se stejnými vstupy dává přesně shodný původní stav, historii, RNG a B1.** Jde o krátkou paritu, nikoli dlouhý soak.
- A regrese dále ověřují všechny etapy, oba organismové přechody, pobřeží→kmen→stroje→terraformaci, P0 návrat a aktivaci, starší checkpoint, NPC snapshot, skutečný lokální save/load i B1 ekonomiku.
- Nová regrese chrání formát fyzických rozměrů a čitelnou aktuální lokalitu.

První cílené ověření 115/115. První celá sada **144 souborů / 2 758 testů**, 84,76 s. Po opravě review 115/115, po vizuálním doladění 116/116. **Finální celá sada: 144 souborů / 2 759 testů, 82,83 s**, jeden worker, bez souběžného browseru. `pnpm typecheck` i `pnpm build` prošly; build sám znovu obsahuje `tsc --noEmit`. Node 22.23.1, pnpm 11.24.0, Vitest 3.2.4. Produkční JS `index-TTg_sO7R.js`: 1 246,80 kB / gzip 384,92 kB, CSS `index-DlxiKQtd.css`: 44,92 kB / gzip 10,07 kB. Zůstává známé upozornění Vite na chunk >500 kB.

Nezávislý subagent provedl dvě read-only review, v obou spustil 115 testů. Navíc prozkoumal 1000 seedů: platné kotvy a všechny rohy habitatů, 431–784 pevninských buněk a 2–3 souvislé pevniny. Našel P2: poslední reprezentovatelná délka pod 180° se po přičtení 180 zaokrouhlila na 360 a volila sloupec 72. Opraveno omezením sloupce, regrese pro severní pól, rovník a jižní pól. P3 komentář nesprávně sliboval tři oddělené pevniny; zpřesněn, výstup generátoru neměněn. Následné review potvrdilo opravy i API/kontrakt bez dalších nálezů. Třetí závěrečná read-only kontrola posledního formátování a dokumentace rovněž bez nálezů; ověřila shodu všech devíti zdrojových hashů s finální evidencí, testy ani browser neopakovala.

Vlastní review ověřilo diff, rozsah a konzistenci parseru, nezměněné místní adresy, žádný zápis do světů/RNG/odměn, hranice cache, číselné UI a stav checkpointů. Po vzniku v2 se jediná původní testová mutace „neznámá verze 2“ změnila na „neznámá verze 3“; v1 s nepatřičným receptem má vlastní regresi. **Timeouty, kroky simulace a historické hashe se neoslabovaly.** Při prvním typechecku nového testu opraveno odvozování návratového typu mutačních callbacků; nebyla to chyba hry.

## Produkční browser a SP-017

Finální `pnpm test:geography`, Chrome, skutečný production build, 1280×720 a 1024×720: **12/12 skupin kontrol, 0 browser chyb, 12,176 s**. Běžné klávesy, tlačítka, file input/download a nativní RAF. Žádný zápis do živého stavu nebo localStorage, žádné `advanceTime` ani zrychlování času. Izolovaný kontext nepřepisoval uživatelovy sloty.

| Skupina | Skutečně vykonané akce |
| --- | --- |
| Nová linie | Běžné narození, pohyb D, J a rozbalení detailu klávesnicí, návrat, save/export/import/rekey, reload a lokální load. |
| Připravené brány 0→1 a 1→2 | G, zachované ID/recept, přepnutí aktuální lokality a mapové značky, viditelné hlášení příchodu, export checkpointu. |
| Historický útes | Import původního odehraného reef save, pohyb W a atlas s příslušnou vodní lokalitou. |
| Historická pobřežní výhra | Běžné pokračování do kmene, stejná pobřežní identita/geografie a současná pětice sousedů. |
| Historický dokončený kmen | Běžný přechod do strojů, stejná geografie a B1 income ×1,2, export/reimport. |
| Připravená mrtvá větev | Běžná obnova checkpointu, stejná identita/geografie/B1. |
| Historické dokončené stroje | Přechod do místní terraformace T0, otevření původní lokální mapy, oddělené planet/homePlanet. |
| Historický T3 sandbox | Zachované dokončení/sandbox, atlas/detail a HUD při 1024×720, aktivní export. |
| Skutečný SP-010.A export | Běžný import v1, migrace se starým ID a původem legacy-assigned, export/reimport stejné geografie; offline kontrola adresního převodu výsledného exportu. |

**Připravené vstupy jsou přiznané:** dvě brány mají před importem splněná jídla/průzkum/generace, pozici u brány a druhá plíce/nohy; death fixture vzniká offline z právě exportované strojové kampaně se zachovaným checkpointem. Historické výhry a dokončené etapy mají původní provenienci fixtures. Toto je krátký průchod propojení a kompatibility, **nikoli nově odehraná šestietapová kampaň**.

První browser odhalil kolizi nové třídy `.planet-atlas` s existující lokální terraformací: šířka byla 110 px a barvy přebíraly lokální styl. Nová mapa používá vlastní `.home-atlas`; původní lokální mapa se nemění. Druhý průchod 12/12 bez chyb, 12,275 s. Prohlídka snímků pak odhalila `15.600000000000001 m`; formát opraven na `15,6 m`, přidán test a viditelný název aktuální lokality nad mapou. Finální průchod opět 12/12. Rozměrové assertions ani akční timeout 30 s se nezmírnily. Sandbox blokoval start portu/Chrome; opakování s povolením hostitele prošlo, nešlo o produktovou chybu.

Otevřeno a prohlédnuto všech **devět ponechaných finálních snímků**: fresh-atlas, reef-atlas, coast-atlas, tribe, machines, terraform, sandbox-1024-atlas, sandbox-1024-detail a migrated-a-atlas. Škálování, barevná legenda i textová pevnina/voda, číselné značky a aktuální lokalita jsou čitelné. Podrobnosti jsou dostupné nativním scrollováním deníku; nenutíme celou mapu i historii do jediné obrazovky. Dvě krátká měření otevření J včetně čekání na DOM: 8 ms u nové linie, 15 ms v sandboxu. Nejde o benchmark p95 nebo paměti navigace.

Klient skillu `develop-web-game` proběhl také na finálním buildu. Dočasná kopie měla pouze adaptér na instalovaný Chrome, vypnutou časovou pomůcku, skutečné čekání 1/60 s místo advanceTime a kontrolu, že herní advanceTime je undefined. Jedna dávka šipka vpravo / pauza / mezerník, bez chyb. Canvas snímek byl otevřen, neobsahuje HUD a není dokladem atlasu; vlastní pohyb D prokazuje hlavní scénář. Hash originálu a adaptéru je v `skill-client.json`.

## Reprodukce, evidence a přesné pokračování

```sh
pnpm exec vitest run tests/planet-geography.test.ts tests/home-planet.test.ts --maxWorkers=1
pnpm exec vitest run --maxWorkers=1
pnpm typecheck
pnpm build
pnpm preview --port 5210 --strictPort
# Druhý terminál:
pnpm test:geography
```

[Výsledky browseru](../../evidence/sp-010b/browser/results.json), [souhrn ověření](../../evidence/sp-010b/verification.json), [aktivní T3 kampaň](../../evidence/sp-010b/browser/active-campaign.save.json), [nová aktivní linie](../../evidence/sp-010b/browser/fresh-active-campaign.save.json), [migrace A](../../evidence/sp-010b/browser/migrated-sp-010a.save.json). Evidence je lokální/gitignored; tento report, plán, smlouvy, testy, A fixture a scénář jsou verzovatelné zdroje a dostačují k reprodukci.

**Dokončená je pouze SP-010.B.** Dodává regionální rastr a vložené původní detailní habitaty. Neimplementuje souvislý globální detailní mesh, ovladatelnou globální kameru, cestování/streamování vzdálených scén, města, vlastnictví, městskou ekonomiku, samostatné civilizační strategie nebo vesmír. Celé SP-010, SP-009, SP-007.B2/D i průřezová SP-017 zůstávají otevřené.

Přesný další krok **SP-010.C**: navrhnout a implementovat globální kameru a výběr geografických míst nad `planetAtlas` / `GeographicAddress`, explicitní vstup a návrat do uloženého habitatového `World`, stav nových vzdálených scén a měření paměti/výkonu při opakovaných návratech. ID a místní adresy A musí zůstat zachované. **SP-009.A** může založit a ukládat město s `LocationAddress`, používat `addressGeography` pro kontext a doplnit vlastní pravidla vhodnosti/stavby/vlastnictví. Teprve skutečné civilizační volby dodají B2, vesmír D.

Neproběhl lidský playtest/poslech, dlouhý soak, celá nová kampaň, Safari/mobil ani benchmark dálkových návratů. Ruční akce nejsou pro používání nebo migraci potřeba. Úklid je zaznamenán níže.


## Úklid a závěrečný stav

[Manifest úklidu](../../evidence/sp-010b/cleanup-manifest.json): odstraněno **15 vlastních souborů / 3 804 047 B** — podrobné testové logy po shrnutí, dočasný skill klient a jeho výstupy, neúspěšný/duplicitní snímek a mezilehlé exporty. Zůstává přibližně **3,3 MiB** finální evidence: devět prohlédnutých snímků, aktivní savey, potřebné připravené vstupy a malé výsledkové logy. Předchozí úkoly ani historická data se nemazala. `.playwright-mcp/traces/` neexistuje; trace, video nebo screencast nevznikly. Vlastní preview a všechny browser kontexty jsou zavřené. Disk před i po úklidu 22 GiB volných.

Finální typecheck a `git diff --check` prošly i po dokončení evidence. Implementační kritéria plánu B jsou doložená; otevřené meze a přesný další krok C výše zůstávají součástí závěru, ne skrytým příslibem hotové celoplanetární hry.
