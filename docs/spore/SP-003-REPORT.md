# SP-003 — život druhu a tvorová fáze

Implementováno v pracovním stromu nad `063ef9cfd`, 21.–22. září 2026. [Plán](../superpowers/plans/2026-09-21-sp-003-creature-life.md), [tracker](ROADMAP.md#sp-003). Bez nových závislostí, změny lockfilu, commitu nebo publikace. Původní lokální změna `AGENTS.md` je ponechána uživateli.

## Výsledek

- Nová linie na souši má vlastní hnízdo se dvěma vizuálními příslušníky téhož genomu a čtyři cizí hnízda. Jejich osm obyvatel jsou skuteční tvorové s pohybem, potravou, zdravím a uloženými vztahy. Původní divoká populace a ekologické cesty pokračují.
- **V** zahájí setkání; **1–4** odpovídá zpěvem, tancem, okouzlením a pózou. Požadavek, čas, omyly a reakce jsou vidět. Druhy preferují různé projevy, dostupnost a síla vycházejí z genomu; blízká smečka pomáhá.
- **B** přepíná boj: kousnutí vyžaduje fyzický kontakt čelisti, výpad používá skutečný pohyb s kolizemi, úder rukama přerušuje přípravu obránce a plivnutí letí k původnímu cílovému bodu. Pohybující se cíl může uniknout. Platí energie, obnova, dosah a kryt. Obránci před úderem označí místo; mohou zasáhnout hráče i společníky.
- **R** nabere přátelského obyvatele. Sleduje hráče, bojuje, jí a může zemřít; lze ho propustit. Vyřešené hnízdo jednorázově udělí 12 DNA, inteligenci a kapacitu smečky, nejvýše tři. Usmíření/obnova prázdného hnízda stojí 25 energie a neopakuje odměnu.
- Tři výsledky a **G** doma dokončí sociální, predátorskou nebo smíšenou cestu. Pokračování založí existující kmen. Historie se zachová; aktivní smečka zůstává na pobřeží.
- HUD používá stálé DOM prvky, aby změny zdraví a vzdálenosti nerušily klikání a klávesový fokus. Hnízda, vztahy, projektily, varování, reakce, zvuk a omezený pohyb doplňují příslušnou část SP-017.

## Ukládání a kompatibilita

Nová pravidla zapíná výslovný volitelný `creatureStage.version = 1` při založení linie. Nejde o hromadnou migraci starých kampaní. Marker se přenáší checkpointem a při obnově; data mají přísné limity a kontrolu vazeb na živé obyvatele/druhy. Všechny historické save fixtures se načtou bez přidání historie a dosavadní tickové charakterizace zůstávají zelené.

Sociální/predátorský/smíšený výsledek se ukládá samostatně. Kvůli současným pozdějším etapám se mapuje na existující `restoration/predator/migration`; nové dědictví celé linie zůstává SP-007. SP-004 (objevování a generace) a SP-005 (knihovna a společný genom cizích NPC) nejsou součástí této změny. Domácí příslušníci jsou prezentační doprovod; společníci pocházejí z cizích hnízd.

Nezávislý review odhalil a ověřil opravy: odstranění neplatných živých vazeb při přechodu do kmene, zachování historického výsledku po čtvrtém hnízdě v sandboxu, oddělení obyvatel od staré symbiózy a zrušení rozběhnutého útoku divokého predátora při přátelství. Nálezy mají regresní testy. Další kontrola zahrnula 2 880 krokových save/load roundtripů akcí, 46 okrajových roundtripů a 213 roundtripů obrany smečky. Finální review bez dalších konkrétních nálezů.

## Ověření

Prostředí: macOS ARM64, Node 22.23.1, pnpm 11.24.0, Playwright 1.55.0 / Chromium, lokální WebGL přes ANGLE Metal. Browser potřeboval start mimo macOS sandbox. Trace zůstal vypnutý.

- `pnpm exec vitest run tests/creature-stage.test.ts tests/creature-stage-presentation.test.ts`: **39/39**.
- `pnpm test`: **2 182/2 182**, 115 souborů. Zahrnuje historické ukládání, ekologii, editor, pohyb a navazující etapy.
- `pnpm typecheck`, `pnpm build`, `git diff --check`: prošly. Build má známé upozornění na JS chunk přes 500 kB.
- Šest kombinací dvounožec/čtyřnožec × sociální/predátorská/smíšená cesta prochází simulací, včetně uložení, obnovy a přechodu. Tyto cílené testy nastavují pozice, energii a obnovu; nejsou důkazem hraného průchodu.
- Browser používá pouze normální klávesy, kliknutí, import/export a RAF. Výchozí souš, těla i DNA jsou připravené fixtures; průchody nejsou nově odehrané celé kampaně. Výsledky jednotlivých běhů jsou v lokální `evidence/sp-003/`.

| Běžné vstupy | Výsledek | Lokální důkaz |
| --- | --- | --- |
| Dvounožec, sociální, finální produkce | 3 přátelství, fyzické následování smečky, export/import, G a kmen, export/import kmene; 0 chyb | `evidence/sp-003/social-biped/` |
| Čtyřnožec, predátorská, produkce | 6 obránců, 9 porcí jídla, úhyby, G a kmen, export/import kmene; 0 chyb | `evidence/sp-003/predator-quadruped/` |
| Dvounožec, smíšená, dev | Přátelství + 4 obránci, 6 porcí jídla, smečka a save/load, G a kmen; 0 chyb | `evidence/sp-003/mixed-biped/` |

Produkční test potvrdil, že `advanceTime` není dostupné. Všechny nové herní mechanismy byly při těchto třech bězích stejné; finální sociální běh navíc ověřil drobnou opravu návratu popisku R po náboru. Snímky 1440 × 900 a kompaktní bojové ovládání 1280 × 720 byly skutečně prohlédnuté. Stavové výstupy a běžně exportované hry zůstaly zachované. Původní klient skillu `develop-web-game` také provedl samostatný krátký start/pohyb nové linie (byte-identická místní kopie kvůli rozlišení importu Playwrightu; jeho výchozí SwiftShader, samostatný dev smoke, nikoli měření výkonu).

Krátké samostatné měření u hnízda, finální produkce, dvounožec, Apple M4 / ANGLE Metal, medium, 1440 × 900: po zahřátí posledních 500 snímků **p50 16,7 ms / p95 16,8 ms, 0 nad 50 ms**. Není to srovnání se starou revizí ani benchmark celé kampaně. Produkční JS `index-BUphEdh2.js`, SHA-256 `c9cc365a34e7148dab24e35be722cae9a7bfd3ff58ba09e786593d584b2c4e5e`.

Původní bojový helper při stání na místě zemřel; byl opraven na skutečné úhyby, potravu a návrat domů. Následný průchod odhalil nahrazování HUD tlačítek, které je opravené zachováním DOM identity. Herní obtížnost se kvůli těmto pokusům nesnižovala.

Závěrečný vlastní review i nezávislá kontrola hotové. Záznamy: `evidence/sp-003/verification/`, úklidový manifest `evidence/sp-003/cleanup.json`. Odstraněny duplicitní snímky, generované pracovní fixtures, kopie klienta a izolovaný stažený Chromium; cizí evidence a uložené hry nedotčeny. Trace/video nebyly vytvořeny; `.playwright-mcp/traces/` neexistuje. Lokální testovací servery zastaveny. Finální evidence má 4,4 MiB; volné místo po úklidu 38 GiB.

## Reprodukce

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm dev --port 5187
# V druhém terminálu:
pnpm test:creature-stage --route=social --body=biped
CREATURE_STAGE_OUTPUT=evidence/sp-003/mixed-biped pnpm test:creature-stage --route=mixed --body=biped
CREATURE_STAGE_OUTPUT=evidence/sp-003/predator-quadruped pnpm test:creature-stage --route=predator --body=quadruped
```

Produkční kontrola: `pnpm build`, `pnpm preview --port 5190`; ke stejnému příkazu testu přidat `LUMAVORA_URL=http://127.0.0.1:5190 LUMAVORA_PRODUCTION=1`. Test pak ověří i nepřítomnost vývojového `advanceTime`. `--smoke` ověří import a HUD, `--measure` přidá krátké měření snímků; trace je pouze na výslovné `LUMAVORA_TRACE=1`.

## Meze

Ověření nedokládá zábavnost, vyvážení celé kampaně ani její délku. Chybí lidský playtest a test Safari/telefonu. Dvě připravená těla mají toxinovou žlázu; dostupnost schopností bez příslušných orgánů a kontaktní kousnutí mají samostatné regrese. Dosavadní velikost produkčního balíku se neřešila v této změně.

Pro běžné hraní použít **Nová linie**. Existující uložené linie zůstanou na původních pravidlech.
