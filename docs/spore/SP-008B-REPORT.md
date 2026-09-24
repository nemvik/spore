# SP-008.B — kulturní výstroj

24. září 2026; pracovní strom nad `18346fb` (SP-008.A). [Plán a záznam práce](../superpowers/plans/2026-09-24-sp-008b-cultural-outfits.md), [roadmapa](ROADMAP.md#sp-008), [smlouva historie](SP-007A-CONTRACT.md). Bez nových závislostí, změn lockfilu, commitu, pushe nebo deploye.

## Herní výsledek

V kmenové fázi je tlačítko **Kulturní výstroj**. Editor pozastaví simulaci a pracuje na odděleném návrhu nad zděděným tělem. Hráč pojmenuje sestavu, zvolí jednu ozdobu hlavy, jednu zádovou část a jadeitovou, jantarovou nebo hliněnou barvu. Část může také vynechat. Barva nemá herní bonus. Tělo, tělesné části, jídelníček a identita zděděných symbiontů se nemění.

| Část | Cena za člena | Účinek |
| --- | ---: | --- |
| Chochol hlasu | 4 jídla | Kontaktní diplomacie ×1,25; kombinuje se s bubnem a SP-007.A. |
| Kostěný hřeben | 4 jídla | Poškození sousední osady, skutečných obránců a povoleného lovu ×1,2. |
| Sběračské brašny | 6 jídla | Kapacita +2 porce: 4 bez koše, 7 s košem. Jedna doručená porce = 4 jídla. |
| Krunýřový plášť | 6 jídla | Přijaté zásahy sousedů a fauny ×0,75; rychlost chůze ×0,9. Hlad netlumí. |

Pracovní **koš/oštěp/buben/měch zůstává samostatný**: jeho dílna, cena, dosah, cooldown a úloha se zachovávají. Plášť nenahrazuje měch ani symbiotický štít; případné ochrany se násobí. Kulturní bonus neopravňuje býložravce lovit. Sestava může pomáhat při obou běžných cestách kmene, ale nezavádí novou hudební minihru.

Vybavení vyžaduje živé členy vlastního druhu do 10 m od domova. Symbionti mají v editoru vysvětlené omezení. Cena celé nové sestavy se odečte každému členovi, jehož vzhled/funkce se mění; shodná výstroj se znovu neplatí. Samotná změna názvu či revize je zdarma. Skupinová platba je atomická: nedostatek jídla, vzdálený nebo neplatný člen nezmění nikoho. Sundání je zdarma, bez vratky, a ponechá nástroj i již nesený náklad.

## Společná data, knihovna a save

`game/culture.ts` je katalog částí, barev, cen a odvozených účinků. `render/culture.ts` staví totožnou geometrii pro náhled i svět podle povrchu zděděného genomu v1/v2. Kulturní části následují tělesný pohyb. Výměna uvolní předchozí geometrii a materiály; tělo se kvůli změně oděvu ve světě nepřestavuje. Náhled ukazuje také aktuální pracovní nástroj prvního vybraného člena. Výbavu doprovází textový přehled účinků, cena, důvod případné blokace, potvrzení akce a stávající syntetická zvuková odezva.

V knihovně **této kampaně** lze uchovat 24 sestav. Návrh má identitu, revizi, jméno, barvu a obě pozice. Lze jej uložit, zkopírovat, upravit, smazat a přenést samostatným souborem `lumavora-outfit` v1 (limit 8 KiB). Kolize odlišného importu vytvoří novou identitu a zachová původní návrh; identický import je idempotentní. Starou oblečenou revizi lze zkopírovat, ale nepřepíše novější uložený návrh.

Vybavený člen vlastní úplný **snapshot** sestavy. Pozdější změna nebo odstranění návrhu jej bez zaplacení nepřevybaví. Z principů SP-005 se přebírá identita/revize, odpojená editace, přísný přenos a nezávislý uložený otisk. B nerozšiřuje obecnou knihovnu tvorů o další budovy, vozidla nebo lodě a nevyžaduje jejich implementaci.

Kampaň zůstává v3, aktivní kmen v2. Přibývá volitelné `tribe.culture = {version:1, designs}` a `member.outfit`. Pole se vytvoří hráčovou akcí; parser staré kampaně ani jejich checkpointy potichu neaktivuje. Validují se přesné klíče, známé enumy/verze, ID, revize, jména, počet návrhů a duplicity; výstroj symbionta se odmítne. Historická absence zachovává limit nákladu 5, kulturní vlastní člen smí uložit 7 i po sundání brašen. Kulturní marker pak zůstává součástí kampaně.

Export/import kampaně obsahuje knihovnu i všechny oblečené revize. Checkpoint ukládá tehdejší zásoby, návrhy, výstroj a svět společně; obnova negrantuje nákup podruhé a nepočítá utracenou větev. Starší checkpoint bez kultury zůstává legitimním návratem před první kulturní akcí. Přechod do strojů výstroj a návrhy zachová v kampani i novém checkpointu, ale nové kulturní účinky se uplatňují pouze v kmenové simulaci.

SP-008.A zachovává společnosti, skutečný sběr, výpravy, obránce i jednorázové výsledky. SP-007.A zachovává původ, počty a fakta historie; výstroj pouze násobí její již existující kontaktní bonus. Nový civilizační následek nevzniká.

## Ověření a reprodukce

Prostředí: Linux 6.8.0-138-generic, Node 24.15.0, pnpm 11.24.0, Playwright 1.55.0, instalovaný Google Chrome 154.0.8037.57, místní produkční Vite preview. Žádné externí herní služby.

```sh
pnpm test
# Finální celá sada na zatíženém počítači:
pnpm test --maxWorkers=2 --testTimeout=30000
pnpm typecheck
pnpm build
pnpm preview --port 5194
# V jiném terminálu; s Playwright Chromium lze vynechat volbu channel:
LUMAVORA_BROWSER_CHANNEL=chrome pnpm test:culture
```

Verzované regrese v `culture.test.ts`, `culture-gameplay.test.ts`, `culture-presentation.test.ts` a `culture-editor.test.ts` ověřují platby, odmítnutí, snapshoty, kolize, malformed vstupy, historické savey, checkpointy, pozdější etapu, skutečný sběr/doručení, útok/diplomacii, zásah NPC/fauny, rychlost pohybu, povolený lov, geometrickou shodu a uvolňování zdrojů. Jeden audit načítá všech **11 verzovaných historických save fixtures** a znovu je roundtripuje.

**Finální celá sada: 125/125 souborů, 2 364/2 364 testů, 94,91 s** s `--maxWorkers=2 --testTimeout=30000`; z toho **40 nových kulturních regresí**. `pnpm typecheck`, `pnpm build`, syntax browser scénáře a `git diff --check` prošly. Produkční JS 1 169,39 kB / gzip 357,44 kB; známé upozornění na velikost nad 500 kB zůstává.

Výchozí `pnpm test` se souběžným typecheckem/buildem skončil 8 timeouty (2 356/2 364); samostatný výchozí běh měl jediný timeout terénního testu (2 363/2 364, 21,17 s). Dva pracovníci s původním limitem měli jediný timeout jiného, útesového výpočtu (2 363/2 364, 111,46 s). Žádný z těchto běhů nehlásil chybu očekávané hodnoty. Zátěž počítače byla kolem 9–11 běžících úloh s dalšími aplikacemi; finální příkaz proto omezuje souběh a zvyšuje pouze globální časový limit na 30 s. Zdrojové timeouty, assertions a simulace se kvůli tomu nemění. **Zelený běh s výchozími časovými parametry není doložen**; výkonový benchmark z těchto časů nevyvozujeme.

### Doložený produkční průchod

Finální scénář má **6/6 kontrol a 0 chyb konzole/pageerror**. Souhrn je trvale zachycen zde; malé lokální doklady jsou v `evidence/sp-008b/verified/`.

| Kontrola | Pozorovaný výsledek |
| --- | --- |
| Nativní ovládání HUD | Stejné tlačítko zůstalo připojené během průběžných změn počítadel. |
| Dvě sestavy | **Hlas zahrady** (jadeit, chochol, brašny) u členů 2 a 4; **Jantarová stráž** (jantar, hřeben, plášť) u člena 3. Každé vybavení stálo 10 jídla, editor neměnil tick. |
| Uložené revize a přenos sestavy | Revize 2 nezměnila oblečenou revizi 1; kolizní import zachoval obě identity, vadný import nezměnil kmen. |
| Sběr s košem | Pozorovaný náklad **6 porcí** a skutečné doručení plného nákladu **+28 jídla**. Doplňkový průchod z UI vytvořeného mezisavu ověřil také průběžné hodnoty 0–6 v HUD; z něj pochází finální `carrying.png`. |
| Diplomacie a boj | Chochol s bubnem poskytoval **4,00 vztahu/s** při fyzickém kontaktu. Stráž s oštěpem poškodila skutečného obránce a následně přijala zásahy (na snímku zdraví 81). Přesné násobky útoku a ochrany dokládají deterministické regrese, nikoli odečet ze snímku. |
| Kampaň | Export/import a nové načtení po reloadu zachovaly knihovnu, oblečené revize i historii. Genom zůstal shodný se vstupem; závěrečné načtení tick 5316. |

Všech **sedm finálních snímků bylo otevřeno a prohlédnuto**: náhled s košem, obranná sestava 1280×720, sběr, diplomacie, boj, HUD 1280×720 a znovu načtený editor 1280×720. Cena, použití, návrat a uložení zůstávají v malém editoru dostupné; katalog částí a delší seznamy mají vlastní posuv. `prepared-tribe.fixture.json` a `active-campaign.save.json` uchovávají vstup a aktivní výsledek.

Browser scénář používá **připravený vstup**: dosavadní fixture dokončeného pobřeží, založený kmen, 180 jídla, tři dokončené dílny (koš/buben/oštěp), vlastní členové blízko domova a jeden doplněný existující zdroj dvanácti porcí. Tato výstavba, počáteční zásoby ani cesta od buňky nejsou odehrané. Vstup nemá kulturní návrhy ani výstroj. Od prvního importu jsou sestavy, platby, změna revize, import, pohyb kamery, sběr, diplomacie, boj, ukládání a načítání provedené běžnými UI vstupy. `render_game_to_text` slouží pouze ke čtení a kontrole; žádný živý setter, přepsání localStorage, zrychlení ani `advanceTime` se nepoužívá. Produkční nepřítomnost `advanceTime` je přímo kontrolována.

Nezávislé review reprodukovalo závod importu se zavřením editoru. Oprava ověřuje aktuální relaci po čtení souboru i při chybě; dvě regrese nejprve selhaly a následně prošly, reviewer ověřil opravu. Další významný nález nezůstal. Vlastní browser regrese odhalila ztrácení živého tlačítka při aktualizaci HUD; kmen nyní používá již existující algoritmus zachování DOM z etapy tvora. První nativní regrese byla červená, opravený běh zachovává skutečný ovládací prvek.

Počáteční neúspěšné browser běhy se nepovažují za dokončení: ovladač četl výsledek souborového importu příliš brzy; následně narazil na zmíněné nahrazování HUD; další pravý klik mířil na zdroj zakrytý panelem. Ovladač nyní čeká na import, klávesami posune kameru a ověří vydaný rozkaz. Jeden další běh skončil v prostředí signálem SIGTERM bez herní výjimky a bez výsledku; finální běh je spouštěn přímo přes Node.

### Úklid

Odstraněno **225 souborů / 58 895 001 B** vlastních mezivýstupů: adresáře `production`, `production-v2`, `production-v3`, `production-v4`, `hud-red`, duplicitní mezisave a vadný import, dočasný HUD ovladač, nahrazené dlouhé logy a nepoužívaný profil/cache přerušeného browseru v `/tmp`. Staré neúspěšné běhy nejsou dostupné jako screenshoty; jejich důvody jsou výše a časová selhání testů mají malý souhrn `earlier-test-runs.json`. Podrobný seznam cest/velikostí je v `evidence/sp-008b/cleanup.json`.

Zůstává přibližně **3,4 MiB** finálních dokladů, vstup, aktivní kampaň a malé výsledkové logy. Kontrola zahrnula celé `evidence/`, `.playwright-mcp/` (bez adresáře `traces`) a vlastní dočasné výstupy. Trace ani video nebyly nahrávány; doklady jiných úkolů se nemažou. Před během i po úklidu zbývá **241 GiB** disku.

## Meze

Ověření nevydává připravený vstup za novou odehranou kampaň. Produkční průchod používá zděděné tělo z historické fixture; v2 je pokryto geometrickou regresí, nikoli druhou plnou browser kampaní. Neproběhl lidský test porozumění/zábavnosti, dlouhodobé vyvažování, výkonový soak, Safari, mobil ani samostatný lidský poslech zvukové odezvy. Známé upozornění Vite na JS bundle nad 500 kB trvá.

Hotová je pouze doložená **SP-008.B**. **C** rozšířená hudební setkání, **D** domestikace, **E** náčelník, **F** pět sousedů a **SP-007.B1** civilizační dědictví zůstávají navazujícími body. Mateřské SP-008, SP-005, SP-007 a průřezové SP-017 nejsou tímto bodem dokončené.
