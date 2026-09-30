# SP-009.J · nativní námořní obchod

26. září 2026. Doplnění [obchodního reportu J](SP-009J-REPORT.md) a terénních rolí [plánu L](../superpowers/plans/2026-09-26-civilization-completion.md). Námořní náklad je nyní doložen běžným ovládáním do přirozeně založeného pobřežního města; nejde pouze o připravenou pobřežní unit regresi.

## Původ a skutečně odehraná cesta

Nezměněná historická `machines-restoration-completed.save.json`, SHA-256 `7dffc69f9d073c8046783be74ba9fde13b5ece2282eb6357dcc8a7267cc53dec`. Původ této starší fixture zahrnuje připravenou souš a historické zrychlení DEV; tento nový průchod je **nativní pokračování**, nikoli kampaň od narození. Produkční `index-CiWwbMtf.js`, Chrome 1024×640, žádný testovací čas nebo živý setter.

Hráč před prvním strategickým tahem běžně navštívil lokality1542 a1615. Státy pak přirozeně založily první města1470 a1541; žádné město nebylo přesunuto či vytvořeno zápisem do stavu. Doma vydělal z původních pramenů173,345→350,195 jantaru za98,274 reálných sekund. V knihovně vytvořil vlastní **Tyrkysovou přílivnici**, změnil barvu a velikost lodního šroubu a zaplatil64 za skutečný člun.

Tři dodávky vždy spotřebovaly20 z domácího účtu do úschovy. Člun fyzicky absolvoval obě části trasy **1614→1613→1541**; prostřední lokalita je voda. Každé vyložení i návrat hráč potvrdil. První plavbu přerušil běžný export/import/rekey se zachovaným průběhem, modelem a platbou; pauza nepřidávala postup. Po třech návratech byl kontrakt vyrovnán při koupi Měděné věže1: celková cena144, kredit60, doplatek84. Stát měl v okamžiku koupě dvě skutečná města. Rezerva nebyla dosypaná, stráž zůstala demobilizovaná se zdravím62 a odolnost náměstí80; žádný boj ani konverze.

Návrat domů a finální import zachovaly zaplacený člun u domácího pobřeží, tři uzavřené dodávky, kupní doklad i cizí městský stav. **8 kontrolních skupin, 0 browser chyb.** Opakovatelný driver: `LUMAVORA_URL=http://127.0.0.1:5220 pnpm test:sea-commerce` proti produkčnímu preview. Jeho nová větev vstupní soubor nemění.

## Obraz, výkon a meze

Hlavní vlákno prohlédlo všechny tři snímky: [vlastní člun a náklad](../../evidence/sp-009j-sea/browser/own-boat-commerce-1024.png), [tři dodávky](../../evidence/sp-009j-sea/browser/three-sea-deliveries-1024.png), [koupené město](../../evidence/sp-009j-sea/browser/acquired-coastal-city-1024.png). Vidět je vlastní konstrukce, náklad, trasa, kredit a skutečný výsledek koupě. Městský panel na posledním snímku zůstává posunutý k vojenské části; horní vlastnictví nepředstíráme jako viditelné. Výsledek dokládá také text převodu a uložený doklad.

90 nativních RAF intervalů ve scéně člunu: p50/p95 **16,7ms**, maximum **16,8ms**. Krátká trasa trvá asi1,2s jedním směrem; část měření tedy zachycuje loď již u cíle. Nejde o90 pohybových snímků ani izolovaný GPU benchmark. Čtený diagnostický údaj `modelProof.commerceCamera` byl pořízen ještě před prvním novým vykreslením; vzhled prokazuje prohlédnutý snímek a skutečný render, nikoli tento počáteční prázdný cache údaj.

Kontrola odhalila zastaralé nápovědy o „budoucím“ námořním cestování a nedostupných lodích. Následná úprava říká, že vodní lokalita nemá pěší detail a cíl člunu se volí na pobřežní pevnině; tank potřebuje pevninskou trasu, protože člun tanky nepřepravuje. Toto je oprava textu, nikoli změna tras nebo datových pravidel. Finální vydaný build a společné regrese naváže report L.

Aktivní kampaň, export uprostřed plavby, malý výsledek a tři snímky zůstávají v `evidence/sp-009j-sea/browser`. Osm finálních regresí nad byte-identickými exporty prošlo (634ms testy / 1,12s celý běh, jeden worker); test s prvním importem obchodu odhalil cyklický alias `cityEpoch`, opravený funkčním wrapperem bez změny dat. Trvalou regresi a původ zaznamenává [SEA-README](../../tests/fixtures/commerce/SEA-README.md). Trace ani video se nenahrávaly. Lidské přijetí čeká: bez návodu zvolit pobřežní cíl, vysvětlit rozdíl nákladu a kupního doplatku, vyložit a vrátit člun, poslechnout odezvu. Automatický průchod tento lidský úsudek nenahrazuje.

Námořní role J je doložená. Celé vojenské/konverzní dokončení, souvislý nový počátek a C–E tím dokončené nejsou.
