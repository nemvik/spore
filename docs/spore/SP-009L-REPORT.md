# SP-009.L · celé civilizační alternativy a uzavření planetárního rozsahu

26. září 2026. [Plán](../superpowers/plans/2026-09-26-civilization-completion.md). Navazuje na J, B2, K1 a K2; není novým začátkem implementace. Tento report odděluje skutečná pokračování historické kampaně od dosud čekající souvislé kampaně od narození. Bez commitu, pushe, deploye a nových závislostí.

## Hrané alternativy

| Cesta | Skutečný výsledek | Následek v další etapě |
| --- | --- | --- |
| Obchod | J: čtyři cizí města, 12 skutečných dodávek a zaplacené převody; B2: návrat, fungující město a běžné G→5. | O 20 % menší spotřeba nástroje, ověřená v [B2](SP-007B2-REPORT.md). |
| Konverze | Čtyři města1542/1615/1470/1543, fyzické poutě a situační obřady, 18 plateb po20, celkem360. Žádný vojenský ani obchodní převod. Všech pět měst vlastněno, bez závazků, fungující převzaté hospodářství, návrat a G→5. | Skutečný nasazený kořen culture:6 / zdroj206: vitalita75→75,48 za1,6s, obnova×1,2. |
| Vojenská | Vlastní dělový tank16 z návrhu15 za56, čtyři dobytá města, poražené původní stráže i protiútoky obou států a jedna nově financovaná K2 armáda. Sedm oprav po10, fyzické návraty, všichni vlastníci změněni výhradně bojem, G→5. | Skutečný vrták: atmosféra−0,8504344512→−0,7296801353 za100 kroků /1,6667s; síla×1,2 odpovídá výpočtu. |

Konverze a vojenská větev vycházejí ze stejného nezměněného skutečně hraného `evidence/sp-009j/browser/paid-carriers.save.json`, SHA256 `3f43b7406d6cc68ae33659ee7aa813aad27c64b0624d2f24ed6fc3677fc9e2ee`. Každá zachovává původní neměnný regionální výsledek, finance a konstrukce; žádné přidání peněz či připravených vlastníků. Oba dokončené průchody mají **8 kontrolních skupin /0 browser chyb**, veřejný export/import/rekey i save/reload/load. Řídí je běžné UI a nativní RAF, bez zápisu živého stavu či zrychlení času.

Vojenský průchod má dvě návazné části. První běh dobyl1542 a1470, ale vyčerpal900 sekund reálného limitu při ústupu. Export a malý failure report zůstaly zachovány. Od záznamu druhého převzetí uběhlo jen přibližně2,57s simulace; předchozí desetisekundová přeprava zabrala169,97s reálného času. Příčina rozdílu časů není prokázána. Nezávislá diagnostika stejného exportu ukázala průchodnou okliku kolem překážek; nebyl důvod měnit navigaci. Nativní pokračování přes veřejný import skutečně vrátilo tank za **35,02s reálně /34,97s strategického času** a dohrálo zbývající města. Dočasné `caffeinate -i` bránilo uspání pouze po dobu testovacího procesu; nepřidávalo simulační čas ani neměnilo nastavení systému.

Konstrukce a opravy jsou doložené platebními pozorováními původního failure reportu a navazujícího resultu. Historický strojový save samostatný ledger oprav neobsahuje; nové fixture testy mu takový ledger nevymýšlejí. Původ, hashe, skutečně zachovaná pole a limity shrnuje [L-README](../../tests/fixtures/civilization/L-README.md).

## Terénní role a přesná kritéria

Tank fyzicky bojuje na souši a používá domácí jantar; letoun zpřístupňuje domácí vzdušný region a přenáší skutečné obchodní zásilky; člun pluje vodní trasou, vyloďuje osídlení a dopravuje zásilky mezi pobřežími. Modely a placené snapshoty návrhů dokládají [vozidlová knihovna](SP-005B-VEHICLES-REPORT.md), [J](SP-009J-REPORT.md) a [I](SP-009I-REPORT.md). Chybějící námořní obchod byl nyní skutečně dohrán: vlastní člun za64, tři vratné dodávky přes vodu1613, kredit60 a převod města1541 za144−60; import uprostřed plavby. [Samostatný report s původem](SP-009J-SEA-REPORT.md), **8 skupin /0 chyb a8 fixture regresí**. Pobřežní cíl vznikl přirozeným osídlováním při běžných návštěvách, nebyl vložen do stavu.

Pět nezměněných kritérií SP-010 má konkrétní implementaci a důkaz:

1. Trvalá identita planety/lokalit oddělená od scény: SP-010.A, zachovaná ve všech nynějších převodech a savech.
2. Kontinenty, oceány, biomy a rozpoznatelný domov: SP-010.B a skutečná námořní trasa J-sea; pevninské detaily vznikají až návštěvou.
3. Místní/globální kamera a výběr skutečných měst: SP-010.C, SP-009.A a celé tři civilizační cesty.
4. Vzdálené návraty, zachování světa a historické migrace: C, J, B2 a nynější vojenská/konverzní/námořní pokračování s veřejným save/load/importem.
5. Výkon/paměť a omezený počet detailních scén: měřené opakované návraty C/J/K1/K2; renderer drží jen aktuální detail vedle původní scény. Nové krátké reprezentativní výsledky níže.

Bezšvový detail celého glóbu, samostatné námořní bitvy ani AI letadla nejsou dodatečná kritéria SP-010. Původní kritéria se nemění. SP-009 a B2 zůstávají evidenčně otevřené pro závěrečnou novou linii a lidské přijetí; implementační mezery B a cílené celé alternativy jsou tím pokryté. Následuje [milník C](../superpowers/plans/2026-09-26-first-space-circuit.md).

## Opravy z ověřování

- Importní pořadí commerce→mobilization odhalilo kruhovou závislost: konstantní alias `cityEpoch=ownershipEpoch` mohl zachytit `undefined`. Wrapper vyhodnocuje již inicializovanou funkci při volání; žádná změna účtů či datového formátu. Regrese začínající importem commerce chybu reprodukovala a po opravě prošla.
- Nápověda nyní vysvětluje, že člun nepřepravuje tanky a otevřená voda nemá pěší návštěvu; loď spojuje pobřežní místa. Neoznačuje již existující lodě za nedostupné.
- Při skutečném návratu z výpravy se odstraní přechodné staré domácí toasty, jejichž čas během návštěvy stál. Neměnná historie a svět zůstávají. Oznámení návratu se krátce zobrazí dole a pošesti aktivních domácích sekundách zmizí; po loadu se nevytváří trvalý překryv horního HUD.

## Ověření a evidence

Cíleně prošlo377 testů v7 souvisejících souborech; po opravě importního cyklu216 testů ve4 souborech; návratové hlášky52/52. Finální celá sada prošla: **162 souborů / 3 734 testů**, 114,11 s. Nové skutečně hrané fixture mají **18 vojenských/konverzních a 8 námořních regresí**. Prošel typecheck a produkční build `index-CrwCMOlS.js` / `index-BVotID9q.css`: JS 1 523,31 kB / gzip 473,82 kB; upozornění na velký chunk trvá. `git diff --check` a syntax všech tří driverů prošly. První finální build zachytil pouze typové chyby nových fixture testů (zúžení PlanetState, chybějící id zprávy); opravy nemění produkční stav.

Hlavní vlákno prohlédlo všech šest finálních snímků alternativ a tři námořní. Krátkých90 nativních RAF intervalů: konverze p95 **16,8ms**, vojenský boj **16,7ms**, námořní průchod **16,7ms**. Námořní vzorek zasahuje i okamžiky po doručení; nejde o90 snímků souvislé plavby. Žádný z těchto údajů není izolovaným GPU benchmarkem nebo dlouhým soakem.

Aktivní kampaně, checkpointy a původ vojenského pokračování se zachovávají v `evidence/sp-009l`; byte-identické regresní kopie jsou v `tests/fixtures/civilization`. Námořní aktivní stav je v `evidence/sp-009j-sea`. Trace/video se nevytvářely. Úklid `evidence/sp-009l/cleanup.json` zaznamenal odstranění dvou nahrazených vojenských mezisnímků; původní failure export/report zůstal. Finální replay má samostatný `review-cleanup.json`; neúspěšné mezivýstupy chybného selektoru driveru jsou odstraněné. Disk po úklidu přibližně 23 GiB volných.

Finální produkční replay všech tří exportů na stejném buildu zachoval přesný B2 řez, doklady měst a historické státní účty. Skutečná návštěva/návrat z konverzní větve před G odstranila starý toast; spodní oznámení bylo viditelné po 5,05 s a pryč po 6,45 s domácího času. Běžné G otevřelo etapu 5. **0 browser chyb**, 360 RAF intervalů p50 16,7 / p95 16,8 / max 16,8 ms, 503–508 draw calls. Oba finální snímky 1024×640 prohlédl subagent i hlavní vlákno; ovládání a text jsou čitelné. [Výsledek replaye](../../evidence/sp-009l/final-replay/result.json). Nezávislé review návratových oprav a importního wrapperu nenašlo další blokující chybu.

**Lidské přijetí čeká:** z vlastního uloženého konce civilizace vysvětlit proč je G odemčeno; v deníku rozlišit tři doložené následky; vrátit poškozený tank a zaplatit opravu; určit přístav pro vlastní člun; po návratu přečíst HUD bez překryvu a poslechnout boj/obřad/pohon. Automatizace neověřila lidské porozumění ani poslech. Ruční migrace není třeba. Nová souvislá kampaň až k jádru a dobrodružstvím, ostatní části A a C–E zůstávají podmínkou celého aktivního goalu.
