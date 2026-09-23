# SP-004 — objevování částí a generace

Dokončeno 23. září 2026 v pracovním stromu nad `5aed4ba93`. [Plán](../superpowers/plans/2026-09-23-sp-004-discovery-generations.md), [tracker](ROADMAP.md#sp-004). Bez nových závislostí, změny lockfilu, commitu nebo publikace.

## Hratelný výsledek

- Nová linie má na souši katalog pěti objevitelných adaptací: kloubové paže, chemická tykadla, pružné ostny, hořké žlázy (toxin) a recyklační uzel. Objev nese původ, tick, generaci objevu i první generaci skutečného použití. DNA dál platí konstrukci; objev se neutrácí. Orgány použité v předchozích etapách jsou zděděné a nezamknou se.
- Tři viditelné kostry, označené ✧ na mapě, se zkoumají tlačítkem z dosahu 5 m s volným výhledem. Západ poskytne paže, jih recyklaci, východ toxin. První přátelství i vítězství nad druhy přidávají další části; opakování nepřidělí stejný objev znovu.
- Jeden korunoplaz je vzácná alfa: 96 zdraví místo 48, silnější obranný zásah (16 místo 9 před ochranou), sociální cíl 9 místo 6. Zlatý kruh a popis v HUD upozorňují na náročnost a toxinovou odměnu. Přátelství i porážka alfy hráčem či smečkou odměnu odemknou; hráč může tvora obejít nebo se vrátit s lepším tělem a smečkou.
- Blízká smečka dál skutečně zvyšuje sociální odpověď a nově ji doprovází animací. Počet jejích úspěšných pomocí se ukládá. Katalog v obou editorech ukazuje původ/nápovědu; centrální potvrzení odmítne zamčené části i v podstrčeném draftu. S novými částmi se otevře rovnou konstrukční katalog, také u staršího genomu.
- Potvrzení editoru v hnízdě vytvoří další generaci, zaznamená narození a použité objevy. Vlastní příslušníci převezmou stejný genom. Smrt, nedostatek energie, probíhající setkání nebo migrace reprodukci blokují; zrušení editoru nic nerodí.
- Po první nové generaci na souši lze v hnízdě zahájit dobrovolnou migraci k prozkoumaným pozůstatkům. Dva vlastní příslušníci následují hráče, obcházejí překážky a při odstupu přes 18 m čekají. Hráč společně dorazí a potvrdí založení nového hnízda. Přesune se skutečný domov, léčení, mapa i místo editoru; identita linie, tělo, přátelé a katalog zůstávají. Událost vstoupí do historie a UI vytvoří checkpoint. Migraci lze zrušit.

## Data a kompatibilita

Volitelná větev `creatureStage.discovery.version = 1` je zapnutá pouze při založení nové UI linie. Dosavadní kampaně včetně SP-003 zůstávají na původních pravidlech, bez dodatečného zamykání částí. Formát kampaně zůstává v3. Nový parser přesně kontroluje pole, známé části, duplicity, hranice čísel/pozic, generace, časy, návaznost přesunů a shodný marker checkpointu. Přechod do kmene zachová historii a ukončí případný doprovod. Ekologická migrace ze stávajícího `migration.ts` se nemění.

## Ověření

macOS / Apple Silicon, Node 22.23.1, projektový Playwright 1.55.0 / Chromium 140, ANGLE Metal. Chromium bylo nutné spustit mimo macOS sandbox kvůli MachPort; automatická kontrola spuštění povolila. Žádný browser trace ani video.

- `pnpm test`: **116 souborů / 2 202 testů**, vše prošlo včetně starých saveů a dosavadních etap.
- Nová sada `tests/creature-discovery.test.ts`: **20 testů**. Ověřuje katalog/DNA, odmítnuté akce bez mutace, použití odměny a narození, sociální pomoc, obě alfa odměny, zdraví při krmení, fyzický doprovod, save/load, zrušení a dokončení migrace, pokračování ke kmeni, poškozené importy a prezentaci.
- `pnpm typecheck`, `pnpm build`, `git diff --check`: prošly. Build má dosavadní upozornění na JS chunk nad 500 kB (finální hlavní JS 1 104,44 kB, gzip 333,47 kB).
- Nezávislý read-only review ověřil pravidla, staré savey, centrální zamykání, průzkum → reprodukci → migraci → kmen a shodný pohyb po uložení/obnově uprostřed obcházení stromu. Vlastní review hotový.

Browser scénáře používají **importovanou připravenou souš, tělo a rozpočet 220 získané DNA**, potom pouze běžné klávesy, kliknutí, RAF a UI export/import. Nejde o nově odehranou celou kampaň; za běhu se nezapisuje do herního stavu ani nepoužívá `advanceTime`. Produkce navíc ověřila, že tento vývojový hook neexistuje.

| Scénář | Pozorovaný výsledek |
| --- | --- |
| Genom v2 / dvounožec | Přátelství se zvonkonošem, R a skutečný společník; průzkum západních kostí; druhé přátelství se třemi sociálními pomocemi smečky; doma použití paží, generace 2; nativní export/import po narození a uprostřed cesty; společný příchod, nové hnízdo a otevření editoru. Všech pět kontrol, 0 browser chyb. |
| Starší genom v1 / Luma, finální produkce | Stejná úplná výprava; přidání objevených paží převede tělo do v2 a zachová jméno Luma. Generace 2, tři sociální pomoci, přesun z `(0, 1.2, 0)` na `(-20.7276, -0.7451, -15.3004)`, 104 DNA po konstrukci, uložený katalog a hnízdo. Všech pět kontrol, 0 browser chyb. |
| Alfa, finální produkce | Nativní cesta kolem východního stromového pásu, delší sociální setkání, vztah 80, jediný objev toxinu s původem alfa; export/import zachoval výsledek. 0 browser chyb. |
| Původní skill klient | Krátký start nové linie a pohyb na dev serveru; prázdný katalog správně přítomný už v buňce, 0 chyb. Byte-identická dočasná kopie klienta kvůli rozlišení lokálního Playwright importu. |

Snímky objevů, sociální odpovědi, odměny v editoru, doprovodu, nového domova, alfy i rozložení 1280 × 720 byly skutečně otevřené a prohlédnuté. Základní browser viewport 1440 × 900. Lokální kompaktní evidence a uložené výsledky jsou v `evidence/sp-004/`; trvalými doklady jsou také tento report, regresní testy a reprodukovatelný browser skript.

Při ověřování se opravily tři skutečné hrany: posun výšky původních hnízd při synchronizaci rendereru, oscilace rodiny u stromu kvůli chybějícímu směru cesty a nenormalizovaný úhel z validního importu při startu migrace. Poslední dvě mají konkrétní regrese. První neúspěšný browser průchod při čekání na zaseknutou rodinu zahynul; po opravě oba úplné průchody prošly. Alfa helper nejprve zkoušel procházet souvislým pásem stromů; opravená běžná trasa ho obchází, herní pravidla se kvůli testu neměnila.

## Reprodukce a hraní

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
pnpm preview --port 5190
# V druhém terminálu:
LUMAVORA_URL=http://127.0.0.1:5190 LUMAVORA_PRODUCTION=1 pnpm test:creature-discovery
LUMAVORA_URL=http://127.0.0.1:5190 LUMAVORA_PRODUCTION=1 CREATURE_STAGE_OUTPUT=evidence/sp-004/classic pnpm test:creature-discovery --body=classic
LUMAVORA_URL=http://127.0.0.1:5190 LUMAVORA_PRODUCTION=1 CREATURE_STAGE_OUTPUT=evidence/sp-004/alpha pnpm test:creature-discovery --alpha
```

Pro hraní založit **Novou linii**. Na souši navštívit ✧, prozkoumat pozůstatky a vrátit se k ◇ / Tab. Po nové generaci nabídne přehled druhu přesun hnízda. Historické kampaně se automaticky nepřepínají.

Chybí lidský playtest porozumění/zábavnosti a dlouhodobého vyvážení, Safari a telefon. Tato dodávka nedokončuje celou průřezovou SP-017. Pět objevovaných adaptací používá současné funkční orgány; knihovna výtvorů SP-005 a dědictví dalších etap SP-007 jsou samostatná práce.

Pracovní browser soubory, duplicitní snímky, dočasná kopie skill klienta a izolovaný Chromium jsou uklizené. Zachované důkazy mají 5,5 MiB; manifest `evidence/sp-004/cleanup.json` uvádí odstraněné artefakty. Aktivní export nové generace/hnízda a export rozpracované migrace zůstávají. Testovací servery zastavené; po úklidu 23 GiB volného místa.
