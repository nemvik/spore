# SP-010.C — globální navigace a návraty

Verze reportu **1**, 24. 9. 2026. Výchozí čistý `main` / **`eed840c65`**, dokončená SP-010.B. Bez commitu, pushe, deploye, nové závislosti nebo změny lockfilu. Před implementací přečtené platné instrukce, brief/roadmapa/progress, smlouvy a reporty A/B, smlouva SP-007.A a report B1. [Plán s kritérii](../superpowers/plans/2026-09-24-sp-010c-navigation.md), [datová smlouva C v1](SP-010C-CONTRACT.md).

## Doložený rozsah

**Navigace a skutečné návraty C jsou hotové.** N otevře ovladatelný atlas, šipky/tlačítka posouvají kameru, +/− mění měřítko a kliknutí nebo číslo vybírá cíl. UI ukazuje aktuální místo, biom, souřadnice, dostupnost a konkrétní důvod odmítnutí. Od skutečně dosažené etapy tvora lze vstoupit na vzdálenou pevninu, chodit zděděným organismem, fyzicky změřit terénní stanoviště pomocí E a vrátit se. Opětovná návštěva zachová polohu i měření. Příchod, návrat, uložení a pauza mají viditelnou odezvu. Atlasová kamera/režim přežívají save/load; změny pohledu čistí vstupy.

Výběr místa nikdy nemění `stage`. Původní `worlds[0..2]` jsou nadále habitaty kampaně, `world` je alias aktivního detailu a `currentLocationId` explicitně vybírá původní habitat aktuální etapy nebo uložený výpravový svět. Původní `player`, jednotky, příkazy, ekonomika, RNG, tick, historie i B1 během výpravy stojí; nic se po návratu nedohání. Vzdálený avatar má samostatnou polohu. Tvor startuje u hnízda bez neseného ekologického nákladu, pozdější etapy používají přehled základny bez přesunu svých jednotek. Přechody/evoluce jsou mimo původní místní dění blokované. Výprava nedává DNA/jantar ani neobchází výsledky etap.

Detaily vznikají až při skutečném prvním vstupu, pouze ze seedu a atlasové buňky. Nový samostatný `detailGenerator:1` nespotřebovává RNG kampaně a nezávisí na pořadí návštěv. Povrch/biom/výškové datum vycházejí z B; lokální reliéf a dekorace tvoří malý pevninský detail. **Atlas B generator 1 a jeho význam/otisky jsou nezměněné.** Původní ID/adresy/souřadnice se nepřevádějí ani nepřepisují. `GameState.planet` stále znamená místní terraformaci pobřeží.

Na GPU zůstává nejvýše původní scéna a jeden výpravový detail; vykresluje se jediný aktivní pohled. Při výměně detailu se geometrie/materiály uvolňují. Navštívená neaktivní místa drží pouze uložená data. Registr má přiznaný limit **64 detailů**, aby byla omezená velikost save a cena validace; po naplnění jsou dřívější návštěvy i návrat stále dostupné. Původní save limit **8 MiB** nezměněn. Nejde o souvislý globální mesh, námořní expanzi nebo simulaci měst.

## Kompatibilita a regrese

`homePlanet` explicitně přechází v2→v3, obálka kampaně zůstává v3. Parser zachovává historickou absenci/v1/v2; UI aktivuje C včetně checkpointu před importním rekey. Opakování nemění výsledná data ani checkpointový řetězec. Starší kampaně dostanou prázdné návštěvy a detaily: žádné domyšlené cesty, objevy nebo vlastnictví. Nové záznamy vznikají skutečným vstupem/návratem/měřením. Obnova checkpointu nahrazuje celou větev, nesčítá objevy. Starší verze aplikace nový v3 HomePlanet export nepřečte.

- **51 nových regresí** v `tests/planet-travel.test.ts`: osm seedů a obrácené pořadí, laziness, atlasové biomy/vazby, adresní převody včetně pólů/hran, bezpečné spawny/pohyb, zmrazení systémů a opakovaná akce bez odměn. Dále dostupnost, 64 míst, místní/globální/vzdálené režimy save/import/checkpointů, rollback, fallback nové linie, rekey, striktní odmítnutí neplatných dat a skutečné rozhraní výběru dodané adresy SP-009.
- Všech **11 původních historických fixtures** zůstává byte-identických; test provádí 120 kroků parity původního světa/RNG/identity/historie/B1 napříč etapami. A/B regrese chrání přechody a původní geografii. Skutečný A export SHA-256 `d1ab026239c80e0843e379984056c2b9e0b963069051a111cb27b207f5dc8ece` zůstává; přidaný skutečný B export `tests/fixtures/geography/sp-010b-fresh.save.json` je byte-identická kopie B evidence, SHA-256 `690c9453718f6275883b11f34315d593099bcd42116c82d91217bcecb9d2d7fd`.
- Celá sada: **145 souborů / 2 810 testů**, **82,53 s**, `pnpm exec vitest run --maxWorkers=1`. Po poslední malé změně ořezu adresní kamery a UI znovu **167/167** dotčených testů, **8,53 s**. Bez zvýšení timeoutů nebo oslabení očekávání; dva testy A mají pouze explicitní TypeScript zúžení rozšířeného union typu.
- Typecheck a build prošly; finální **`index-BUmQKdKj.js` 1 266,97 kB / gzip 391,87 kB**, CSS **`index-Ben6GYAZ.css` 47,45 kB / gzip 10,64 kB**, 147 modulů. Node 22.23.1, pnpm 11.24.0. Známý Vite warning nad 500 kB zůstává; limit se neměnil. Samostatný lint script repository nemá. `git diff --check` prošel.

## Produkční browser a výkon

Finální Chrome přes produkční preview, build `index-BUmQKdKj.js`, běžné klávesy/kliknutí/import/export a **skutečný RAF bez přepisování živého stavu, localStorage nebo zrychlování času**.

`pnpm test:travel`: **5/5 skupin, 0 console/page chyb**. Připraveným vstupem je nezměněný historický save již dokončeného kmene; přechod do strojů proběhne normálním UI. Nejprve doložena zamčená výprava nové linie a odmítnutí vody. Potom domov → trávy 776 → W/E a uložené měření 1/3 → domov → opětovná návštěva → export/import/rekey → uložit/reload/načíst. Exporty potvrzují přesně zachované původní systémy během fyzické výpravy a neduplikované měření. Globální kamera, pauza, vyčištění drženého vstupu a načtení ověřeny i v 1024×720. Následuje 20 návratů se střídáním travin 776 a pouště 756, končí dvěma detaily/třemi prvními návštěvami.

| Měření krátkého okruhu | Výsledek |
| --- | --- |
| Vstup, 22 vzorků (UI click → připravený HUD) | medián 32,12 ms; p95 34,62 ms; max 35,14 ms |
| Návrat, 20 vzorků | medián 36,09 ms; p95/max 37,72 ms |
| RAF, 267 vzorků během okruhu | p50/p95 16,7 ms |
| JS heap po vyžádaném GC, návraty 0 / 10 / 20 | 14 503 860 / 17 729 852 / 17 839 308 B |
| GPU geometrie, stejné vzorky | 295 / 194 / 194 |
| GPU po 10 i 20 návratech | 66 draw calls, 20 564 trojúhelníků, 1 textura, 16 programů |

První vzorek zahrnuje jiný stav zahřátí rendereru; mezi 10. a 20. návratem heap přidal 109 456 B, backing storage zůstalo 11 193 381 B. To dokládá stabilní počet vykreslovacích zdrojů v krátkém okruhu, **není to dlouhý soak ani obecný důkaz absence úniku**. GC slouží jen k měření paměti a nemění herní čas. Latence zahrnuje browser ovladač/DOM a není čistým CPU benchmarkem.

Historické `HOME_PLANET_OUTPUT=evidence/sp-010c/historical pnpm test:geography`: **12/12 skupin, 0 chyb, 11,886 s**. Nová linie, připravené organismové brány 0→1→2, skutečný starý útes, pobřežní výhra→pět sousedů, dokončený tříčlenný sousedský registr→stroje/B1, mrtvá checkpointová větev→obnova, stroje→místní T0, hotový T3 sandbox 1024 a skutečný A export. **Připravené před importem:** jídla/průzkum/deník/generace/poloha u bran, pro druhou bránu plíce/nohy; mrtvá větev z UI exportu se zachovaným checkpointem. Podrobnosti v `historical/PREPARED.md` a verzovaném driveru. Nejde o nově odehranou šestietapovou kampaň.

Doplňkový klient skillu `develop-web-game` také prošel. Jeho pracovní kopie použila nainstalovaný Chrome, běžný import a nativní čekání místo virtual-time shimu/`advanceTime`; původní a upravený SHA i parametry jsou v `skill-client.json`. Produkční `advanceTime` ověřeno nepřítomné. Canvas a plné HUD 1024 byly skutečně otevřené a prohlédnuté.

## Review, opravy a evidence

Vlastní review dat/aliasů, vstupů, persistence, rendereru, testů i finálního diffu. Nezávislý subagent nalezl P2: atlas/výprava zakrývaly editor otevřený přes Pauza→Knihovna→Vytvořit, a P2: zpráva o uložení nebyla v novém pohledu viditelná. Opravená priorita editoru a navigační notice včetně chyb. Subagent obě opravy ověřil v produkčním browseru 1024 bez chyb; provedl 51+210 regresí a kontrolu 64 detailů/obnovy i všech 428 pevninských buněk vstupního seedu. Následná kontrola bez produkčních nálezů. Opraven také mrtvý odkaz J v terénní hlavičce a odstraněno interní označení SP-009 z hráčského textu.

Browser zachytil numerický rozdíl `Math.sin/cos` mezi prostředími při přísném porovnání nově generovaného detailu. Nový detail generator 1 proto kvantuje výšku na 1e−6 místní jednotky; nedotýká se B generatoru ani starých souřadnic. Historický driver jednou ztratil překreslované tlačítko při scroll+Enter; používá nyní běžný locator click se stejným timeoutem a očekáváním. Finální opakování prošlo. Všechny výsledky výše jsou z úspěšných běhů, staré failure snímky uklizené.

Evidence `evidence/sp-010c/`: výsledky browserů, kompaktní logy testů, hashe zdrojů/finálního buildu v `verification.json`, aktivní save, výchozí a globální export, nutné připravené vstupy. **Deset finálních snímků skutečně prohlédnuto**: sedm nového okruhu (včetně globálního i místního 1024×720), pobřežní příchod, místní terraformace a atlas historického sandboxu 1024. Field panel má na menším rozlišení vlastní scroll; měření a hlavní navigace zůstávají viditelné. Doplňkový canvas byl po kontrole odstraněn jako duplicita.

Úklid pouze vlastních mezisouborů zaznamenává `cleanup-manifest.json`: **25 souborů / 5 424 173 B odstraněno**, přibližně **3,7 MiB** finální evidence. Aktivní save a nutné vstupy zachované, cizí data/aktivní kampaně nedotčené. Trace/video nebyly zapnuté; `.playwright-mcp/traces/` neexistuje. Preview a vlastní browsery po ověření ukončené. Disk po úklidu **20,09 GiB** volných; přesné bajty před/po jsou v manifestu. Závěrečný nezávislý průchod kódu/dokumentace ověřil čísla i meze; opraveno pouze zpřesnění duplicity ID ve smlouvě výběru adres.

## Otevřené podmínky a pokračování

`AddressSelection { id, name, address: LocationAddress }` + `selectAddress` je konkrétní rozhraní pro skutečná města SP-009: řeší místní/geografickou adresu a World, vybere buňku/kameru, nevytváří entity, vlastnictví ani cestu. **Výběr skutečných měst zůstává otevřený**, protože SP-009 ještě nevytváří města. Žádná demonstrační města nejsou v produkci. Celé SP-010 ani SP-017 se neuzavírají; mimo rozsah jsou městská ekonomika, státy, vesmír a SP-007.B2/D.

Přesný další krok: **SP-009.A — model stabilních ID měst a `LocationAddress`, skutečné založení, persistence/validace/checkpointy a napojení uloženého registru do `selectAddress`; potom produkčně ověřit výběr skutečného města a uzavřít příslušné kritérium C.** Bez ruční migrace. Lidský playtest/poslech, Safari/mobil, dlouhý soak a celá nová kampaň neprovedeny.

## Navazující ověření SP-009.A (25. 9. 2026)

Historický závěr reportu výše popisuje stav commitu `a24f2cf06`. [Report SP-009.A v1](SP-009A-REPORT.md) nyní dokládá zbývající integrační kritérium C: skutečně založené město s vlastní identitou/adresou, globální výběr přes původní API, místní zobrazení, opakované návštěvy a persistence. Tento dodatek nemění historická čísla ani generátory a automaticky neuzavírá celou SP-010/SP-009/SP-017.
