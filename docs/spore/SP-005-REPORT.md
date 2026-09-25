# SP-005.A — knihovna tvorů a genom NPC

**Návaznost 25. 9. 2026:** budovovou část SP-005.B nyní dokončuje [SP-009.C](SP-009C-REPORT.md) se samostatným [formátem a smlouvou](SP-009C-CONTRACT.md). Níže zůstává původní report A. Vozidla, lodě, dobrodružství a celé SP-005.B/SP-005 se tím neuzavírají.

Dokončeno 23. září 2026 v pracovním stromu nad `5aed4ba93`, navazující existující necommitnuté SP-004 zachováno. Rozsah této dodávky je **část A: tvorové**. Budovy, vozidla, lodě a dobrodružství zůstávají otevřené v mateřské kartě [SP-005](ROADMAP.md#sp-005).

## Co lze hrát

- **Knihovna tvorů** v hlavním menu a pauze: uložit současné tělo, vytvořit nový výtvor, zobrazit náhled, jméno, popis, revizi, datum a vhodnost pro souš.
- **Upravit / 3D** otevře stávající editor v samostatném režimu. Konstrukce, vzhled, undo/redo a zkoušení používají tentýž genom. Uložení mění pouze výtvor v knihovně; kampaň, DNA ani objevy se tím nemění.
- Samostatné soubory `lumavora-creature`, verze 1; obsahují genom v1/v2, stabilní identitu a metadata. Maximum 128 KiB na soubor, 100 záznamů. Shodný import se neduplikuje; odlišná revize se shodným ID dostane novou identitu a nepřepíše místní originál. Vadné soubory, chyby úložiště a zastaralé editace jsou odmítnuté bez přepsání platných dat.
- **Nová linie** zkopíruje čtyři vybrané obyvatele souše při svém vzniku. Výběr je deterministický podle seedu a identity, upřednostňuje různé uložené tvory a ověřuje chůzi, dýchání a potřebnou stravu ekologického slotu. Volná místa vyplní generované dvounohé/čtyřnohé varianty.
- NPC používají společný organismus pro vzhled, animaci a výšku/šířku těla; genom určuje jídelníček, chůzi, obranu, sílu útoku a společné sociální projevy. Zůstávají v původních ekologických rolích a fungují jako sousedé, společníci i obyvatelé navazujících etap.
- Kampaň uchovává vlastní kopii katalogu v souši a checkpointu. Pozdější úpravy/smazání knihovny ani import kampaně na jiném zařízení její obyvatele nezmění. Historické kampaně bez katalogu zachovají původní populaci a aritmetiku.

## Ověření

| Kontrola | Výsledek |
| --- | --- |
| `pnpm test` | **118 souborů, 2 241 / 2 241 testů** na finálním herním kódu |
| Nové cílené regrese | **39 testů**: formát, identity, limity, vadné importy, quota, souběžná zastaralá úprava, escapování, výběr, fyziologie, save/checkpoint, vysoká těla a dosah kousnutí |
| `pnpm typecheck` / `pnpm build` | Prošlo; Vite dále hlásí známé doporučení dělení velkého bundlu |
| Produkční browser | Pět vícefázových scénářů níže, **0 chyb konzole / pageerror**, 1280 × 720 |
| Původní develop-web-game klient | Nová linie, pohyb a krmení v DEV i produkci; stav a snímky prohlédnuté, bez chyb |
| Review | Vlastní kontrola diffu a nezávislé review; tři konkrétní nálezy opravené a regresně ověřené; finální úzké review bez dalšího nálezu |

Produkční scénář přes skutečné klikání, klávesy a běžný RAF:

1. Uložit současného tvora, vytvořit a pojmenovat samostatného tvora, změnit délku a popis, vyzkoušet chůzi a uložit; ověřit nezměněného hráče kampaně.
2. Exportovat, upravit revizi, exportovat znovu, importovat identický soubor, importovat kolidující starší revizi a odmítnout poškozený JSON bez změny kampaně/knihovny.
3. Běžným tlačítkem založit novou linii a exportem potvrdit, že při narození převzala skutečné výtvory z UI knihovny.
4. Importovat výslovně připravený začátek souše se stejným katalogem, odstranit celou knihovnu, dojít k hnízdu, zahájit setkání, odpovídat na projevy, získat přátelství a nabrat tvora do smečky. Export/import kampaně zachová katalog i člena smečky bez knihovny.
5. Uložit tělo další kampaně do knihovny a ověřit jeho přítomnost po reloadu.

**Původ scénáře:** tvor v knihovně a nová linie vznikly běžným UI. Souš používá připravené tělo a DNA; nejde o celou odehranou kampaň od buňky. Během hraní žádné zápisy do živého stavu ani `advanceTime`. Finální snímky knihovny, editoru a setkání byly otevřené a vizuálně zkontrolované.

Krátké měření produkční souše v Chrome headless na macOS (spuštění s ANGLE Metal), medium, 1280 × 720: 300 snímků, p50 **16,7 ms**, p95 **16,7 ms**, **0** snímků nad 50 ms. Jde o krátkou kontrolu jedné scény, nikoli dlouhý soak nebo záruku výkonu na všech zařízeních.

Nezávislé review odhalilo pevný dosah potravy pro vysoká těla, zbývající pevné jídelníčky v nabídce potravy/kmenové smyčce a nesoulad radiusu HUD a druhového kousnutí. Opravy mají přímé testy; oba testy dosahu kousnutí před opravou selhaly a po ní prošly.

## Reprodukce a data

```sh
pnpm test
pnpm build
pnpm preview --port 5189
# V druhém terminálu; s nainstalovaným Playwright Chromium lze vynechat CHANNEL:
LUMAVORA_URL=http://127.0.0.1:5189 LUMAVORA_BROWSER_CHANNEL=chrome pnpm test:creature-library
```

Verzované testy: [formát/knihovna](../../tests/creature-library.test.ts), [NPC a kompatibilita](../../tests/npc-genome.test.ts), [připravená souš](../../tests/fixtures/creature-library.ts), [browser průchod](../../scripts/creature-library-browser.mjs). Lokální kompaktní důkazy jsou v `evidence/sp-005/production/`, skill smoke v `evidence/sp-005/skill-production/`; nejsou jediným dokladem dokončení. Úklid eviduje `evidence/sp-005/cleanup.json`.

## Meze a další práce

Knihovna je lokální, přenos souborem ruční. Do aktivního hráčova těla se výtvor bezplatně neinstaluje; editor kampaně nadále používá vlastní DNA a objevy. NPC mají balancované zdraví (40 % odvozené vitality) a existující ekologické/bojové smyčky, ne autonomní hráčovo ovládání všech akcí. Vodní těla lze uložit a upravit; pro osídlení souše musejí splnit uvedenou kompatibilitu. Lidský playtest dlouhodobé rovnováhy, Safari, mobilní zařízení a maximálně zaplněná scéna složitých importovaných těl nebyly ověřené.

Další části SP-005.B–E a zbytek SP-017 zůstávají otevřené. Žádné nové dependencies, změny lockfilu, commit, push ani deploy. Pro setkávání s knihovními tvory je potřeba **založit novou linii po jejich uložení**.
