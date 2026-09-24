# SP-009.A — založení a persistence skutečných měst

Report **v1**, dokončeno 25. 9. 2026. Výchozí čistý HEAD **`a24f2cf0649333d20bdcc3edfc9731b22057e2f3`**, skutečná SP-010.C. [Plán](../superpowers/plans/2026-09-24-sp-009a-cities.md), [datová smlouva v1](SP-009A-CONTRACT.md). Bez commitu, pushe, deploye, nové závislosti nebo změny lockfilu.

Navazující pokyn uživatele po dokončení implementace autorizoval commit a push této změny do `main`. Před publikací se všech 26 hashů zdrojů, dokumentace, fixture, lockfilu a buildu shodovalo se závěrečnou evidencí a načtený `origin/main` byl stále `a24f2cf06`. Potom byly doplněny pouze publikační záznamy v reportu a progressu; herní kód ani ověřovaný build se nezměnily. Deploy není součástí tohoto pokynu.

## Doručený rozsah

**SP-009.A je dokončená; integrační kritérium výběru skutečných měst SP-010.C je ověřené.** Hráč v dosažené strojové etapě s vlastním jantarovým pramenem vstoupí na vzdálenou pevninu, fyzicky změří tři stanoviště, chůzí vybere vhodné místo a pojmenuje město. Založení stojí **60 jantaru z existující strojové zásoby**, odečtených společně s vložením jediného města. Cena odpovídá pěti obnovovacím nákladům po 12 / šesti opravám po 10; požadavek vlastního pramene brání utracení počátečního rozpočtu bez zdroje obnovy. Původní přechody etap se nemění a výběr města je neobchází.

Město má stabilní ID podle lokality, název, vlastníka v neměnném namespace linie, `LocationAddress`, doklad založení/platby a místní rozvržení v1. V terénu skutečně stojí náměstí a radnice s kolizí. Adresa používá původní A/B/C API; globální seznam i zlatá mapová značka předávají **skutečný registr** do `selectAddress`. Výběr nemění etapu, vlastnictví ani aktivní lokalitu; návštěva vstoupí do uloženého detailu a zachová poslední bezpečnou výpravovou polohu. Návrat a opětovná návštěva město neduplikují.

Založení kontroluje pevninu/vodu, místní výšku, celou stavební plochu uvnitř hranic, sklon a převýšení, původní překážky, příchod/stanoviště a dekorace náměstí/radnice. Kolize používá společnou geometrii a obal hráčova těla. Radnice je 14 místních jednotek východně od náměstí, proto hráče při založení nepřesouváme. Jedno město na vzdálený detail, nejvýše stávajících 64 detailů; limit save **8 MiB** beze změny.

Samostatné `GameState.cities` v1 je overlay. Původní kmenová osada, sousedé, strojová základna a terraformované regiony zůstávají samostatnými entitami. Žádné předem vlastněné/demonstrační město, přejmenování nebo kopie původních entit. **HomePlanet v3, atlasový generator 1 a detailGenerator 1 zůstávají významově stejné**, generovaný World se založením nemění. `GameState.planet` stále vlastní pouze původní místní terraformaci.

Cestovní pravidla C zůstávají: původní organismus, jednotky/příkazy, čas kampaně, RNG, ekonomika, historie a B1 během výpravy stojí. Založení je jediná explicitní nová platba. Jednotky zůstávají doma; město nemá populaci, produkci, léčení ani jiné časové účinky. Neaktivní města se nesimulují a nic nedohánějí. Renderer drží jediný aktuální vzdálený detail vedle původní scény, městský overlay uvolňuje společně s ním.

## Historické kampaně a persistence

Parser zachovává historickou absenci; UI idempotentně aktivuje prázdný registr v live i checkpointu před importním rekey. **Nevymýšlí města, založení, vlastníky, platby ani cesty.** Všech 11 původních fixtures zůstalo byte-identických, stejně jako skutečné A/B vstupy. Nový zachovaný skutečný export C: [sp-010c-travel.save.json](../../tests/fixtures/geography/sp-010c-travel.save.json), SHA-256 `d967d50991850aa312a1032ec58d8d1a406608dc85383851843b9267c660a84f`, byte-identický s původním odehraným `evidence/sp-010c/browser/active-campaign.save.json`.

Přísný parser odmítá neznámé verze/pole, cizí/duplicitní identitu, chybné vlastnictví, cenu, původ, pramen, čas, adresu, terén i nebezpečnou uloženou polohu. Checkpoint smí obsahovat starší podmnožinu měst, ale společné město musí mít totožnou identitu, založení, adresu a místní stav. Obnova nahrazuje **města i ekonomiku celé větve**: před založením nezůstane město a vrátí se původní zůstatek; po založení zůstane město a zaplacený zůstatek. Nevzniká zvláštní refund ani sloučení obou větví. Bez checkpointu platí původní nová linie s prázdným registrem. Starší aplikace bez tohoto rozšíření nové city exporty nepřečtou; ruční migrace není potřeba.

## Regrese, build a review

- **51 nových testů** v `tests/cities.test.ts`: sedm seedů (0, 1, 42, 481516, 20260913, 8675309, 0xffffffff), ID/adresy/povrch/hranice, terén/dekorace/kolize a bezpečný příchod, gate/pramen/průzkum/rozpočet/jméno, právě jedna platba, dvě odlišná města a opakované volby, zmrazení systémů a skutečná produkční pohybová funkce.
- Místní/globální/vzdálený/vzdáleně-globální save/load, rekey/export/import a checkpoint; rollback obou stran platby, fallback nové linie a původní přechod stroje→terraformace. 17 skupin úmyslně poškozených městských dat. Všechny historické fixtures včetně A/B/C mají opakované aktivace, rekey a obnovu; 11 původních fixtures navíc **120 kroků parity** původních systémů/RNG/historie/B1.
- Původní A/B/C: **167/167** testů. Celá sada **146 souborů / 2 861 testů**, **106,71 s**, `pnpm exec vitest run --maxWorkers=1`, bez souběžného browseru. Po přidání explicitního rekey do všech historických city testů znovu **51/51**. Žádné změny timeoutů, kroků, hashů nebo očekávání původních testů.
- `pnpm typecheck`, `pnpm build`, `git diff --check` prošly. Node 22.23.1 / pnpm 11.24.0. Finální JS **`index-DUx1vyFh.js` 1 279,70 kB / gzip 395,54 kB**, CSS **`index-DFsQ1a_r.css` 48,65 kB / gzip 10,86 kB**, 150 modulů. Známý warning Vite nad 500 kB trvá, limit se neměnil. Samostatný lint script repository nemá.

Vlastní kontrola ověřila autoritu dat, atomickou platbu, checkpointy, původní systémy, textové escapování, focus, render/disposal a finální diff. Nezávislý subagent spustil 100 cílených testů a našel dvě P2: refresh statusu odpojoval tlačítko založení a ztrácel fokus; dekorace se kontrolovaly jen proti tělu místo celého náměstí. Opravené stabilním DOM tlačítkem a společným poloměrem náměstí v rendereru/validaci. Kolize má konkrétní regresi, focus skutečný browser důkaz. Následné nezávislé review **bez dalších nálezů**, 51/51 city testů a kontrola skutečného C hashe. Prohlídka snímků vedla ještě k centru místní kamery mezi náměstím a radnicí, aby panel radnici nezakrýval; nezávislá kontrola potvrdila, že kamera nemění polohu nebo uložený stav.

## Produkční browser a SP-017

Finální build výše, Chrome, běžné klávesy/myš/file input/download, **nativní RAF bez živých zápisů, přepisů localStorage nebo zrychlování času**. `advanceTime` v produkci ověřeno nepřítomné. Izolované kontexty nezměnily uživatelovy uložené kampaně.

`pnpm test:cities`: **5/5 skupin, 0 console/page chyb**. Nová linie má prázdná města. Nezměněný historický dokončený kmen přejde přes UI do strojů a bez obsazeného pramene nesmí založit město. Hlavní **připravený vstup** je nezměněný historický odehraný `machines-restoration-final.save.json`, již s vydělaným jantarem a vlastními prameny. Není to nová šestietapová kampaň ani nové vydělání celého rozpočtu.

Dále se skutečně odehraje: vstup do travin 776 → chůze ke všem třem stanovištím a E → chůze na vhodné místo → zadání jména → Tab, **450 ms zachovaný fokus**, Enter → zaplacené město **Záře nad údolím** → globální výběr → místní město → domov → opětovná návštěva → export/import/rekey → save/reload/load → uložený globální výběr/kamera → místní zobrazení při 1024×720 → 20 návratů se střídáním druhého pouštního detailu. Offline čtecí `citySite` pomáhá ovladači vybrat souřadnice, ale hráč k nim vždy dojde běžnými klávesami. Žádná připravená města, měření ani živé teleporty. Export po založení potvrzuje byte-významově shodné původní systémy s jediným rozdílem **−60 jantaru**. Kamera pravým tlačítkem, pauza, vyčištění drženého vstupu a místní/global load jsou ověřené.

První pokus zastavil ovladač: vybral první SVG značku města mimo aktuální výřez místo dostupného tlačítka seznamu. Opraveno cílením na `button`, beze změny 30s akčního limitu. Město už před tímto selháním bylo platně založené/exportované, ale celý pokus se nepočítá jako dokončený okruh. Finální celý okruh prošel. Geografické kontroly nepřistupují do ještě nenavštíveného detailu přes fiktivní město.

Historický `HOME_PLANET_OUTPUT=evidence/sp-009a/historical pnpm test:geography`: **12/12, 0 chyb, 14,53 s**. Nová linie, obě organismové brány, starý útes, pobřeží→kmen→stroje/B1, checkpointová obnova, stroje→místní T0, T3 sandbox a skutečný A export. **Připravené před importem:** splněné jídlo/průzkum/generace/pozice u dvou bran a plíce/nohy pro druhou; mrtvá větev s původním checkpointem. Zdrojový scénář a `historical/PREPARED.md` uvádějí původ. Tímto se nepředstírá nová kompletní kampaň.

Doplňkový klient skillu `develop-web-game` prošel přes instalovaný Chrome/SwiftShader, bez virtual-time shimu, s běžným importem odehraného města a nativním čekáním. První canvas capture byl ještě starý rámec; adaptér nyní počká na skutečný postup času vzdálené scény o 0,5 s a porovná canvas s úplným HUD. Oba finální snímky otevřeny a ověřeny. Hash originálu i adaptéru a změny jsou v `skill-client.json`; nejde o herní opravu nebo zrychlení času.

Prohlédnuté finální snímky ukazují podmínky/cenu, pojmenování, založení, skutečné náměstí/radnici, globální výběr, přesnou adresu/ID, návrat a místní i globální 1024×720. Panely mají vlastní scroll, detail globálního města používá nativní scroll přehledu. Nejde o lidský playtest zábavnosti/srozumitelnosti, skutečný poslech nebo ověření mobilu/Safari.

## Krátké měření návratů

| Měření finálního okruhu | Výsledek |
| --- | --- |
| Návštěva města, 21 vzorků (UI → místní HUD) | medián 63,28 ms; p95 64,10 ms; max 70,68 ms |
| Návrat domů, 20 vzorků | medián 53,32 ms; p95/max 71,09 ms |
| RAF, 225 vzorků poslední relace po importu | p50 33,3 ms; p95 33,4 ms |
| JS heap po GC, návraty 0 / 10 / 20 | 14 768 192 / 15 038 828 / 15 195 172 B |
| GPU ve všech třech vzorcích | 308 geometrií, 82 draw calls, 21 404 trojúhelníků, 0 textur, 19 programů |

Heap mezi návraty 10 a 20 přidal **156 344 B**, GPU počty zůstaly stabilní. Měří se krátká série nad konkrétním starým strojovým světem a dvěma výpravovými detaily při 1024×720/medium; čísla nejsou dlouhý soak ani obecný důkaz absence úniku. Odezva zahrnuje ovladač/DOM, RAF odpovídá tomuto běhu a nelze jej bez stejné scény/prostředí přímo porovnat s dřívějším C během. Žádný herní/výkonnostní limit nebyl změněn. GC pouze pro měření heap, nikoli herního času.

## Evidence, úklid a pokračování

Reprodukce:

```sh
pnpm exec vitest run tests/cities.test.ts tests/planet-travel.test.ts --maxWorkers=1
pnpm exec vitest run --maxWorkers=1
pnpm typecheck
pnpm build
pnpm preview --port 5210 --strictPort
# Druhý terminál:
pnpm test:cities
HOME_PLANET_OUTPUT=evidence/sp-009a/historical pnpm test:geography
```

[Výsledky měst](../../evidence/sp-009a/browser/results.json), [historické výsledky](../../evidence/sp-009a/historical/results.json), [aktivní městská kampaň](../../evidence/sp-009a/browser/active-campaign.save.json), [souhrn ověření](../../evidence/sp-009a/verification.json), [úklid](../../evidence/sp-009a/cleanup-manifest.json). Lokální evidence je gitignored; plán, smlouva, report, testy, browser scénář a skutečná C fixture jsou verzovatelné zdroje.

Podle manifestu odstraněno **29 vlastních souborů / 5 484 356 B**: mezivýstupy, duplicitní snímky, neúspěšná diagnostika a dočasný klient. Zůstává přibližně **3,1 MiB** evidence včetně aktivního městského save, historického aktivního sandboxu a **8 finálních snímků**. Po úklidu bylo na disku **22,06 GiB volných**. Trace/video/screencast/ZIP se nevytvářely; `.playwright-mcp/traces/` neexistuje. Testovací browsery i preview server jsou zavřené. Cizí evidence a aktivní uživatelské sloty nedotčené.

**Otevřeno:** celé SP-009/SP-010/SP-017 a milník B, městská ekonomika/populace/spokojenost, editor budov, soupeřící státy, dobytí/obchod/konverze, námořní expanze, vesmír a SP-007.B2/D. Také lidský playtest/poslech, Safari/mobil, dlouhý soak a nová celá kampaň. Dokončená A není tvrzení o plné civilizaci.

**Přesný další krok SP-009.B:** nad `CityRegistry`/`LocationAddress` navrhnout verzovaný místní model obyvatel, produkce, nákladů a spokojenosti, s konkrétními placenými akcemi a explicitními časovými pravidly vůči pozastaveným lokalitám C; pak jeho ekonomickou smyčku realizovat a změřit. Města ani prameny nevytvářet migrací. Ruční zásah pro používání A nebo migraci není potřeba.
