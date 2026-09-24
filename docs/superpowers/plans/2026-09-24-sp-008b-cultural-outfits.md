# SP-008.B — kulturní výstroj

24. září 2026. Rozsah autorizuje zadání: porovnat kód, naplánovat a pokračovat až k ověřenému výsledku. Implementace přímo v této relaci; bez commitu/pushe/deploye.

## Porovnání a rozhodnutí

`tribe.ts` má jeden pracovní nástroj na člena, dopravu 2/5 porcí, dílny a ekonomiku v jídle. `tribe-neighbours.ts` provádí kontaktní diplomacii/boj, `tribe-society.ts` aktivní obranu, `tribe-wildlife.ts` útoky fauny. `settlement.ts` vykresluje zděděný genom a samostatně pracovní nástroj. Kulturní data ani editor neexistují. Save kampaně v3 / kmene v2 používá přesné klíče a samostatný checkpoint. SP-007.A odvozuje bonus z historie; ten se nesmí přepsat ani opakovaně udělit.

Volba: samostatná kulturní vrstva se dvěma pevnými pozicemi (hlava/záda) a třemi barvami. Nahrazení pracovního nástroje by zrušilo současnou ekonomiku; volné umisťování tělesných částí by zasahovalo do zděděného těla. Pevné anatomicky odvozené úchyty zachovají genom a umožní stejný náhled i světový model.

Katalog: chochol (4 jídla, diplomacie ×1,25), hřeben (4, útok ×1,2), brašny (6, kapacita +2 porce), krunýřový plášť (6, přijaté kontaktní poškození ×0,75, rychlost ×0,9). Jedna volba na každé pozici. Nástroj se kombinuje, nezdvojuje; koš s brašnami nese 7. Ochrana netlumí hlad. Ceny jsou za člena při změně vzhledu/funkce, bez vratky; stejná výstroj se neplatí znovu. Sundání je zdarma, ponechá už nesený náklad. Vybavení vyžaduje živé vlastní členy do 10 m od domova; symbionti zůstávají bez kulturní výstroje. Výběr je atomický, neplatný člen či chybějící jídlo nemění nic.

## Data a rozhraní

Nový `game/culture.ts`: `CulturalDesign {id, revision, name, color, head, back}`; `TribeCulture {version:1, designs}` (nejvýše 24). `ActiveTribeState.culture?`, `TribeUnit.outfit?` jsou volitelné. Člen vlastní úplný snapshot návrhu; přejmenování/revize/smazání návrhu nepromění již zaplacené vybavení. Návrhy jsou v knihovně kampaně, bez závislosti na localStorage knihovny tvorů. Z SP-005 přebíráme identitu/revizi, odpojený návrh, atomický přenos, ochranu kolize a uložený snapshot; obecná knihovna všech typů není součást B.

`cultureEffects(outfit)` odvozuje čísla z katalogu, `quoteOutfit(state, ids, design|null)` vrací cenu/omezení, `equipOutfit` provede platbu a kopii. `saveOutfitDesign`, `importOutfitDesign`, `deleteOutfitDesign` spravují omezenou knihovnu, `parseOutfit/serializeOutfit` přísný malý JSON soubor. Save parser validuje přesné klíče/verzi/enumy/ID/revize, duplicity a zakáže výstroj symbiontům. Historická absence zůstane absencí. Checkpoint obsahuje celý tehdejší stav a při obnově vrátí i nákupy, zásoby a návrhy; přidání kulturní knihovny za hraní nevyžaduje přepsání historického checkpointu.

## Pořadí implementace a ověření

1. **Datový model, ekonomika, přenos** — `game/culture.ts`, `era-types.ts`, `persistence.ts`, `tests/culture.test.ts`. Nejdříve červené regrese: odmítnutí bez jídla/na dálku/symbionta bez částečné platby; dvě sestavy a nezávislý snapshot; kolize importu; vadný JSON a meze. Potom implementace a zelený běh.
2. **Skutečné účinky** — `tribe.ts`, `tribe-neighbours.ts`, `tribe-society.ts`, `tribe-wildlife.ts`. Testy musí zachytit větší skutečně odebraný/doručený náklad, násobení kontaktní diplomacie a útoku vedle SP-007.A, menší zásah od NPC/fauny a pomalejší pohyb pláště. Odstranění brašen nesmaže náklad ani neumožní jeho překročení. Staré savey bez výstroje zachovají původní čísla.
3. **Společné vykreslení** — `render/culture.ts` vytváří díly z téhož katalogu a genomu, `settlement.ts` a `renderer.ts` jej sdílejí. Hlava/záda se odvozují z anatomie v1/v2. Pracovní nástroj zůstane viditelný. Regrese porovná sestavu v náhledu a osadě, změny revize a uvolnění starých objektů.
4. **Editor a čitelnost SP-017** — `ui/culture.ts`, `ui/culture.css`, `ui/tribe.ts`, `main.ts`: otevření z kmene, pojmenování a výběr dvou částí/barvy, uložit nový/upravit/duplikovat, import/export/smazat, výběr členů, explicitní cena a důvod blokace, vybavit/sundat, živý odpojený náhled s pracovním nástrojem, otočení. Pauza simulace při editaci, zavření zahodí neuložený draft. Zvuk úspěchu/odmítnutí, HUD jméno a skutečné účinky. Kompaktní rozložení v 1280×720.
5. **Persistence a regrese** — přesný export/import, starý fixture audit, snapshot po úpravě knihovny, checkpoint před/po koupi, přechod do strojů, nezměněný genom/jídelníček/historie a aktivní sousedé. Spustit cílené sady a pak celou `pnpm test`, `pnpm typecheck`, `pnpm build`, `git diff --check` bez browserové zátěže.
6. **Produkční UI** — nový `scripts/culture-browser.mjs`, npm příkaz. Přiznaný vstup: dokončené pobřeží → kmen, jídlo a dílny připravené před importem; žádné kulturní sestavy. UI vytvoří sběrače a vyjednavače/obránce, vybaví je, odehraje sběr a setkání, exportuje a načte kampaň. Jen kliknutí/klávesy/soubory a skutečný RAF, žádný live setter ani advanceTime. Zkontrolovat malý editor/HUD, otevřít finální snímky, chyby browseru a doklady cen/účinků.
7. **Review, report, úklid** — vlastní kontrola a nezávislé review dle workflow; opravit doložené problémy. Aktualizovat jen B v ROADMAP, aktuální souhrn nahoře v PROGRESS a `SP-008B-REPORT.md` s přesnými výsledky/mezeními. Smazat vlastní mezivýstupy, zkontrolovat evidence/traces/tmp/disk; ponechat kompaktní manifest, vstup, aktivní export a finální snímky.

## Rizikové případy pro review

- Návrh uložený znovu nesmí zadarmo změnit již vybavené členy; stará revize zůstane platným snapshotem.
- Hromadné vybavení nesmí utratit jídlo při jednom nepřípustném členovi nebo při nedostatku.
- Kulturní bonus nesmí přepsat pracovní nástroj, tělo, stravu, SP-007.A ani populace SP-008.A.
- Parser nesmí přijmout neznámou část/barvu, duplicitní ID, příliš dlouhé jméno či výstroj symbionta; staré savey nesmí potichu migrovat.
- Náhled i svět sdílejí díly/úchyty; malý viewport nesmí skrýt cenu, potvrzení nebo tlačítko návratu.

## Hranice dokončení

B je hratelný editor a dvě odlišné použité sestavy s funkčním save/load. C hudební setkání, D domestikace, E náčelník, F pět sousedů a SP-007.B1 civilizační následky zůstávají otevřené. Lidské porozumění, dlouhodobá rovnováha, mobil/Safari, celá nová kampaň a výkonový soak nejsou tímto průchodem doloženy.

## Záznam provedení

- Výchozí revize `18346fb`, čistý pracovní strom; Linux, Node 24.15.0. Před dlouhými běhy 241 GiB volného místa. Beze změn závislostí/lockfilu.
- Datový model a ekonomika: 21 počátečních regresí zelených. Rozšíření přidává marker `culture` při prvním návrhu či vybavení; historický limit nákladu zůstává 5, vlastní kulturní člen smí uložit 7 i po sundání brašen. Symbionti ponechávají limit 5.
- Účinky: sedm přímých regresí nejprve červených na původních hodnotách 2/5 porcí, 3,68 vztahu, 20,7 poškození, plném zásahu a rychlosti. Po integraci zelené. Test fauny nejprve vyžadoval opravu připraveného vstupu na skutečného korunoplaza. Doplněn lov s kontrolou nepovoleného jídelníčku.
- Náhled a svět: tři testy společné geometrie v1/v2 a uvolnění změněné výstroje; původní model těla a pracovní nástroj zůstávají. UI je odpojený draft, 24 uložených návrhů, revize/kopie/import/export, výběr vlastních členů a placené použití u domova.
- Doplněny regrese 11 historických JSON vstupů, přechodu do strojů, nákladu po sundání, odděleného editoru, staré oblečené revize a escapování jmen.
- Nezávislé review reprodukovalo dokončení souborového importu po zavření editoru. `CultureEditor.importFile` nyní ověřuje aktuální relaci před změnou i chybovým hlášením; dvě nejprve červené regrese prošly a reviewer opravu znovu ověřil.
- Produkční diagnostika reprodukovala nahrazování nativních tlačítek při aktualizaci počítadel HUD. Stávající algoritmus tvora vytažen beze změny do `ui/sync-markup.ts` a použit také pro kmen. Browser regrese na identitu skutečného tlačítka byla před změnou červená a po ní zelená. Jde o příslušnou odezvu SP-017.
- Ověřovací ovladač byl opraven: čeká na asynchronní import a klávesami posune kameru, pokud potravu zakrývá HUD; před sběrem kontroluje skutečně vydaný rozkaz. Jeden běh ukončil SIGTERM prostředí, bez výsledku. Tyto běhy se nepočítají jako úspěšné.
- Finální produkční UI 6/6 bez chyb: dvě ručně sestavené a placené výstroje; revize/import; skutečný sběr 7 porcí a +28 jídla, diplomacie 4,00 vztahu/s, boj se skutečnými obránci, export/import a reload/load. Následná nativní diagnostika potvrdila průběžný náklad i v HUD. Sedm finálních snímků otevřeno, včetně tří v 1280×720. Připravený vstup a meze jsou výslovně v reportu.
- Celá sada 125/125 souborů, 2 364/2 364 testů (40 nových), 94,91 s: `pnpm test --maxWorkers=2 --testTimeout=30000`. Předchozí plné běhy měly jen časová selhání starších testů; finální běh upravuje souběh/globální timeout, nikoli assertions nebo zdrojové limity. Typecheck/build/syntax ovladače/diff-check zelené; bundle warning trvá.
- Vlastní zbytečné artefakty odstraněny: 225 souborů / 58 895 001 B; manifest `evidence/sp-008b/cleanup.json`. Uchována aktivní kampaň, vstup, export sestavy, sedm snímků a malé logy (~3,4 MiB). Traces/video vypnuté, evidence/.playwright-mcp/tmp zkontrolované, 241 GiB volného místa. Vlastní preview server ukončen.
- ROADMAP, aktuální souhrn PROGRESS a [SP-008B-REPORT.md](../../spore/SP-008B-REPORT.md) uzavírají pouze B; C–F a civilizační dědictví zůstávají otevřené. Bez commitu, pushe a deploye.
