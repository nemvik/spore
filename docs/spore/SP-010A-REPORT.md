# SP-010.A — trvalá identita domova

24. září 2026, změna nad čistým `main` / `d90a22e8cbf48c53cfea4bc3e5c346c33d6a17c5`. Navazuje na skutečně dokončené SP-008.A–F a SP-007.B1. [Plán sepsaný před implementací](../superpowers/plans/2026-09-24-sp-010a-home-planet.md), [konkrétní datová smlouva pro SP-009](SP-010A-CONTRACT.md). Bez nové závislosti, změny lockfilu, commitu, pushe či deploye.

## Výsledek a hranice modelu

Aktivní kampaň má domovskou planetu Lumavora a stabilně pojmenované uložené lokality: Mikrosvět, Útesové mělčiny a Dešťové pobřeží. Nový `homePlanet` v1 je oddělený od `GameState.planet`, které dál znamená dosavadní lokální terraformaci. Registry nevlastní druhou kopii světa; odkazy vedou na původní trojici `worlds`.

Etapy tvora, kmene, strojů i terraformace zůstávají na **stejném pobřeží se stejným ID**. Organismové přechody pouze připojí existující či právě založený habitat a změní aktuální referenci. Žádná změna geometrie, souřadnic, těla, kmenové společnosti, strojů, místní terraformace ani historie. Sazby a výsledky SP-007.B1 zůstávají původní.

`LocationAddress = {planetId, locationId, position}` je konkrétní rozhraní pro města. `locationAddress` připraví adresu, `resolveLocationAddress` ji vyhledá i mimo aktivní scénu a vrátí autoritativní uložený svět. Cizí planeta, neexistující lokalita a neplatné místní souřadnice se odmítají. Vhodnost stavby, vlastnictví, ID města a ekonomika jsou úkolem SP-009. Patche, ekologická místa, hnízda, osady a regiony dál používají původní lokální entity; tento díl jim neduplikuje stav.

V HUD všech šesti etap je planeta a aktuální lokalita. Kliknutí nebo stávající J otevře čitelný detail v deníku: existující uložené lokality, právě aktivní místo a vysvětlení, že existence není dokladem návštěvy. Přechod ukazuje novou lokalitu v posledním viditelném hlášení; na souši společně s původním textem sucha. Stávající zvuk přechodu se zachoval, nový zvukový systém nevznikl. Tab nadále otevírá editor.

## Historické kampaně

| Vstup | Výsledek |
| --- | --- |
| Save bez `homePlanet`, samotný parser/API | Absence se zachová, stejně jako ostatní volitelná rozšíření. Staré simulační charakterizace se nepřepínají. |
| Nová UI linie | Identita vzniká při založení před prvním checkpointem. Předem připravené pobřeží NPC knihovny je uložená lokalita, nikoli návštěva. |
| UI load/import starého save | Aktivace doplní pouze identitu a registr skutečných nenulových světů, shodně i do checkpointu. Import ji aktivuje před změnou ID ukládacího slotu. |
| Opakovaná aktivace/import | Stejný původní save dává stejné ID; již uložená identita se nemění při importním přejmenování slotu. Žádné odměny ani jiné historické údaje nepřibudou. |
| Obnova checkpointu | Vrací jeho registry, svět, ekonomiku a historii společně. Starší checkpoint může mít méně lokalit; opětovný vstup znovu používá stejná ID. |
| Chybějící checkpoint | Dosavadní fallback založí novou linii; zapnutí identity se přenese, nová planeta patří nové linii. |
| Staré samostatné kopie s různým ID kampaně | Neslučují se podle stejného seedu ani těla; společný původ není doložen. |

Neexistují nové příznaky návštěv, kontinenty, globální souřadnice nebo domyšlená rozhodnutí. Parser přísně kontroluje verzi, pole, ID, druh/slot, úplnost registru, aktuální alias a shodu s checkpointem. Neplatná přítomná data se odmítají místo tiché opravy. Ruční migrace není potřeba; export po aktivaci obsahuje nový model.

## Regrese, build a review

**53 nových regresí** v `tests/home-planet.test.ts`:

- Všech 11 nezměněných historických fixtures, deterministická opakovaná aktivace, přejmenování importního slotu, ukládání/načítání/export/import, checkpoint včetně starší etapy a poškozených referencí.
- Oba organismové přechody, pobřeží → kmen → stroje → terraformace, návrat P0 preview i jeho aktivace. U pozdějších přechodů je celý původní stav po odečtení nového rozšíření přesně shodný s totožným přechodem bez identity.
- Každá z šesti etap: 120 skutečných simulačních kroků s/bez identity dává stejný původní svět, RNG, tělo, historii, kmen, stroje a lokální terraformaci. Tento krátký důkaz parity není dlouhý soak.
- B1 sazby a checkpointová ekonomika, NPC snapshot a původní hranice lokálních souřadnic. Adresy nezávislé na aktivní scéně, bez kopírování světa či nechtěného přepisu vstupní pozice.

První cílený běh: **154/154** (52 nových + historie/B1/era persistence). První celá sada: **143 souborů / 2 695 testů**, 76,09 s. Po review přidaná 53. regrese a oprava posledního hlášení: **53/53**. **Finální celá sada: 143 souborů / 2 696 testů, 77,24 s**, bez souběžného browseru. Souhrn příkazů je v [ověření](../../evidence/sp-010a/verification.json). Testové timeouty, kroky, očekávání a historické hashe se neoslabovaly.

`pnpm typecheck`, `pnpm build` a `git diff --check` prošly. Node 22.23.1, pnpm 11.24.0, Vitest 3.2.4. Finální produkční JS `index-Bjv2-URM.js`: 1 238,68 kB / gzip 381,39 kB; CSS `index-MIsqSNHW.css`: 43,58 kB / gzip 9,80 kB. Zůstává známé upozornění Vite na velikost hlavního chunku.

Nezávislý subagent skutečně spustil původních 52 nových testů a našel P3: zpráva o suchu přepsala hlášení příchodu. Opraveno spojením textu; regrese nyní kontroluje poslední zprávu. Následné review potvrdilo opravu i kontrakt bez dalšího produkčního nálezu. Doporučilo zpřesnit browser assertions o viditelnost toastu a skutečnou šířku 1024; obojí je doplněné. Vlastní diff review kontrolovalo datové vazby, neexistenci dalších grantů či kopií světa, zachované nízkoúrovňové API, přísné parsování, bezpečný text UI a rozsah změn.

## Produkční browser a SP-017

Finální Chrome / skutečný Vite production build, 1280×720 a sandbox 1024×720: **9/9 skupin kontrol, 0 browser chyb**, 9,614 s běhu scénáře. Jde o krátké ověření identity nad připravenými etapami, **nikoli nově odehranou šestietapovou kampaň**.

| Skupina | Skutečně provedené UI akce |
| --- | --- |
| Čerstvé narození | Nová linie bez fixture, pohyb D, deník J, save, export/import s jiným slotem a stejnou planetou, reload a lokální load. |
| Přechod 0→1 | Připravené splněné požadavky a pozice u brány; běžné G, nová lokalita, stejná planeta a předchozí ID, export checkpointu. |
| Přechod 1→2 | Druhý připravený vstup včetně plic/nohou; běžné G a skutečně viditelný text pobřeží + sucha, stejná planeta. |
| Historický útes | Import původního odehraného `earned-reef-entry-v14.json`, běžný pohyb W a čitelná lokalita. |
| Pobřeží→kmen | Původní připravená historická výhra, běžná volba pokračovat; vznik současné pětice při zachování pobřežní identity. |
| Kmen→stroje | Původní UI dokončená historická trojice, běžný přechod, B1 income ×1,2, export/reimport stejné identity. |
| Checkpoint | Offline připravená mrtvá větev právě exportované strojové kampaně; UI obnoví původní checkpoint, identitu a B1. |
| Stroje→terraformace | Původní UI dokončené stroje, běžný přechod a otevření místní mapy; nové lokální T0 a stejná planeta/lokalita. |
| Historický sandbox | Import původního T3, zachované dokončení/sandbox, kontrola záhlaví a finální export při 1024×720. |

Příprava požadavků, brány, plic/nohou a mrtvé větve je výslovná v [scénáři](../../scripts/home-planet-browser.mjs) a `browser/PREPARED.md`. Historické vstupy zachovávají provenienci svého [manifestu](../../tests/fixtures/saves/README.md). Browser používá nativní klávesy, tlačítka, file input a download. `render_game_to_text` pouze čte; žádný setter, přepis localStorage ani zrychlování času. Produkční `advanceTime` zůstává undefined. Izolovaný kontext nemění uživatelovy aktivní sloty.

Otevřeno a prohlédnuto všech **osm finálních snímků**: `fresh`, `journal`, `historical-reef`, `coastal-arrival`, `tribe`, `machines`, `terraform`, `sandbox-1024`. HUD je čitelný bez závislosti na barvě, nový text nepřekrývá ovládání. Browser automaticky kontroluje odstup záhlaví od kmenového panelu; ruční prohlídka odhalila počáteční těsný odstup, opravený kompaktnější výškou řádku etapy.

První browser na předchozím buildu prošel 9/9. Při zpřesnění detekce překryvu jeden pokus chybně čekal na neexistující kmenový panel v buněčné etapě; ovladač nyní nejprve kontroluje jeho existenci. Další běh zachytil nedostatečný odstup panelu a vedl k finální CSS opravě. **Žádné prodloužení limitů**: browser má původních 30 s na akci; assertions se zpřísnily. Podrobnosti neúspěšných pokusů jsou v malých diagnostických JSON, nikoli vykázané jako dokončené průchody.

Původní klient `develop-web-game` běžel i na finálním buildu z byte-identické dočasné kopie. Adaptér pouze vybral instalovaný Chrome, vynechal jeho časovou pomůcku a nahradil klientský `advanceTime` skutečným čekáním 1/60 s. Krátké běžné šipky/mezerník prošly bez chyb, canvas snímek byl otevřen a prohlédnut; nejde o důkaz kompletního HUD. Hash a popis adaptéru zůstává v `skill-client.json`.

## Reprodukce, evidence a úklid

```sh
pnpm exec vitest run tests/home-planet.test.ts tests/tribe-inheritance.test.ts --maxWorkers=1
pnpm exec vitest run --maxWorkers=1
pnpm typecheck
pnpm build
pnpm preview --port 5210 --strictPort
# V druhém terminálu:
pnpm test:home-planet
```

[Výsledky browseru](../../evidence/sp-010a/browser/results.json), [souhrn ověření](../../evidence/sp-010a/verification.json), [aktivní sandbox](../../evidence/sp-010a/browser/active-campaign.save.json), [nová aktivní linie](../../evidence/sp-010a/browser/fresh-active-campaign.save.json). Evidence je lokální/gitignored; plán, kontrakt, tento report, zdrojové testy a reprodukovatelný browser scénář patří do verzovaných zdrojů.

Úklid dokončen podle [manifestu](../../evidence/sp-010a/cleanup-manifest.json): **11 souborů / 1,713,217 B** odstraněno (testové logy po shrnutí, neúspěšný snímek, duplicitní výstupy a dočasný skill runtime). Zachováno přibližně **4,6 MiB** potřebných vstupů/exportů, osm finálních snímků, aktivní savey a malé logy. Manifest také odlišuje mezivýstupy nahrazené finálním buildem. Žádné dlouhé trace, video, screencasty nebo ZIP. Původní historické fixtures, evidence jiných úkolů a uživatelské kampaně se nemažou. Disk před prací 22 GiB volných, po úklidu 22,23 GiB. `.playwright-mcp/traces/` neexistuje; vlastní preview a browsery jsou uzavřené. Dočasné pracovní kopie vznikly jen uvnitř `evidence/sp-010a/` a byly odstraněné.

## Přesné pokračování a meze

**Dokončená je pouze SP-010.A.** SP-010.B musí vytvořit kontinenty/oceány, návazný terén a explicitně zasadit existující habitaty. SP-010.C musí přidat globální kameru, navigaci a návraty mezi vzdálenými místy, včetně výběru měst. SP-009.A může stavět na hotové místní adrese: založení a persistence měst, následně ekonomika a soupeřící státy. Teprve skutečné nezávislé civilizační volby dodají vstup SP-007.B2; vesmírné výsledky SP-007.D.

Celé SP-010, SP-009, SP-007.B2/D a průřezová SP-017 zůstávají otevřené. Není zde globální cestování, mapa kontinentů, městská ekonomika nebo vesmír. Nevznikl benchmark globální paměti/výkonu; browser je krátký automatizovaný průchod bez lidského playtestu a poslechu, Safari/mobilu či dlouhého soaku. Nové místní souřadnice se později nesmějí bez explicitní migrace reinterpretovat jako globální.
