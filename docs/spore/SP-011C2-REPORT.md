# C2 · cizí soustavy a skutečný životní náklad

Navazuje na [C1](SP-011C1-REPORT.md) a [plán C2](../superpowers/plans/2026-09-26-foreign-life.md). První i finální produkční okruh jsou odehrané a společná testová sada prošla. Celý milník C, vybavení/doprovod D, čerstvá souvislá kampaň a lidské přijetí zůstávají otevřené.

## Implementace

- 32 stabilních pojmenovaných soustav, odlišný živý/horký/chladný povrch a navigace s aktuální polohou, vzdáleností, dosahem18, cenou a důvodem odmítnutí. Sousední soustavy jsou dostupné základní lodí; mezihvězdný skok trvá6 aktivních sekund. Navštívená planeta vznikne až při skutečném příletu na povrch. Domov se negeneruje znovu.
- Živá planeta má36 konkrétních původních obyvatel: tři velikosti rostlin, dva býložravce a predátora. Původní genomy jsou uložené jednou u zdrojového světa. Cíl ani nová knihovní revize je nemění. Tento řez ještě nesimuluje potravu, rozmnožování nebo terraformaci; ty patří navazujícímu C3.
- Sken stojí1 energii, odběr a vysazení2. Dosah skenu i kapacita nákladu vycházejí z placené konstrukce; přenos vyžaduje vzdálenost6. Odběr přemístí skutečnou instanci, vysazení spotřebuje tentýž náklad. Výběr i náklad uvádějí původní planetu a číslo exempláře. Domácí znalost nenahrazuje fyzický organismus.
- Samostatná volitelná expedice v `space` v1, výslovně aktivovaná i v checkpointu; staré C1 exporty se při pouhém parsování nemění. Unikátní identity, souvislá historie128 akcí, kumulativní spotřeba a zpětná kontrola přesunů chrání i okamžité uložení, rollover a přenos po importu. Žádné doplnění historických exemplářů, plateb nebo návštěv.
- Běží pouze aktivní cizí povrch. Náklad, neaktivní planety a celá domácí větev stojí. Povrch používá skutečné uložené modely, viditelný cíl/paprsek a zvuk nástroje; jeden aktivní detail sdílí původní WebGL renderer.

## Hraný důkaz

`evidence/sp-011c2/browser/result.json` a `run.log`: build `index-BEGaM-dx.js` / `index-CPId81zN.css`, pět skupin kontrol, žádná browser chyba. Výchozí byte-identická odehraná C1 kampaň má SHA256 `a1d2bfb8fc821621447f05d368252d8b62d79f7fdf5f9893580d4216806e7c34`. Driver `pnpm test:space-expedition` používá normální UI, WASD/Q/C/R/V, skutečný RAF, veřejný export/import a pouze čtenou diagnostiku. Nepřepisuje živý stav, nepřidává zdroje a nepoužívá testový čas.

Vlastní Jantarová vážka přeletěla domov→Jantarový háj→Žhavá slza→Jantarový háj→domov. Celkem28 měřítkových/skokových přechodů. Žrout pramenů `life-11` změnil zdroj36→35 a náklad0→1; druhý svět0→1→0 po vysazení a opětovném odběru. Zachoval identitu, původní model, zdraví100 a výživu1. Export/import změnil ID kampaně, nikoli adresy světů nebo exemplář. Celá domácí větev byla shodná od startu do okamžiku před přistáním; po návratu opět běží domácí čas.

Finální export tohoto prvního běhu: `evidence/sp-011c2/browser/active-campaign.save.json`, SHA256 `1392669d44ae620b5b89603074aec461ee551745a4f911306733396612bba14c`. Zachovaný mezilehlý `carried-life.save.json` umožňuje regresi výpravy mimo domov. Jde o skutečné pokračování B2/C1, nikoli důkaz nové kampaně od narození.

## Prezentace, výkon a meze

Všechny čtyři snímky1024×640 osobně prohlédlo hlavní vlákno i browser agent: mapa, živý povrch/výběr, vysazený tvor na pustém světě a návrat do dílny. Zjištěné nejasné domácí názvy měřítek, chybějící mezery a původ v nákladu jsou opravené; finální opakování ověřilo jejich build.

Živý povrch s35 obyvateli:90RAF, p50/p9516,7ms, max16,8ms,614draw calls a189486 trojúhelníků. Čtyři párové návraty orbita→povrch→orbita měly všechny213→983→213 geometrií,0 textur a21 programů; nezůstala další geometrie. Jde o krátký reprezentativní vzorek a počty prostředků, nikoli samostatně měřený GPU čas nebo dlouhý soak. Historické časové limity celé C1 testové sady jsou přiznané v jejím reportu; nejsou nahrazené tímto browser výsledkem.

## Finální build a regrese

`pnpm build` prošel: `index-CjHG66dU.js` (1595,21 kB / gzip499,62 kB), CSS `index-CPId81zN.css`. Známé upozornění na velikost hlavního chunku zůstává. Finální `pnpm test:space-expedition -- --final` opakovalo celý původní okruh do `evidence/sp-011c2/final-browser`; šest skupin kontrol,0 chyb, navíc viditelný původ/ID, mezery a J se skutečnou skokovou historií. Všechny čtyři finální snímky znovu osobně prohlédnuté. Finální90RAF p9516,7ms/max16,8ms,608draw calls/161562trojúhelníků; všechny čtyři návraty znovu213→983→213. Aktivní pokračování má SHA256 `3f83884800c58691f87a694750f17a32564c4d82eab6aec01285bf87439ed137`.

Před finálním browserem prošlo182/182 testů v šesti lodních/vesmírných sadách a `tsc --noEmit`. Nová prezentace ověřuje skutečné rozměry tří rostlin, změněný původní genom, odebrání/přidání téhož těla a přesné uvolnění zdrojů včetně Points. Připravený test všech32 soustav projde veřejnými skokovými funkcemi31 cizích planet a396 fyzických obyvatel; jeho pozice jsou výslovně připravené. Export včetně plného checkpointu má1 232 880 UTF-8 bajtů, samotný checkpoint575 157. První redundantní několikanásobný roundtrip dokončil assertions, ale překročil5000ms; po odstranění dvou duplicit prošel za2,10s při stejném limitu. Nešlo o změnu produkce ani zvýšení timeoutu. Log uchovává oba výsledky.

Byte-identické C2 fixtures a jejich zdroje jsou v `tests/fixtures/space/README.md`. Původní exporty mají ještě skutečný přednákupní checkpoint; nový plný letový checkpoint v unit testu je označená příprava. Po přistání legitimně běží domácí čas, proto se netvrdí úplná rovnost prvního letového a konečného domácího exportu. Nezávislé review a kontrola finálního diffu neodhalily další materiální C2 vadu.

Celá finální sada: **168 souborů / 3 924 testů prošlo**,191,90s, `pnpm exec vitest run --pool=threads --maxWorkers=1`, bez vynechání, timeoutů či zvýšení limitů. Před ní prošlo18/18 historických C1/C2 fixture případů a typecheck. Log `evidence/sp-011c2/verification/full-suite.log`. Dřívější C1 časové rozdíly se tím nemažou, aktuální úplný běh je zelený.

Finální browser dokončil assertions, exporty a zavření Chrome; zůstal nečinný Node bez Chrome potomků. Ukončen pouze jeho vlastní PID pomocí SIGTERM (harness exit143), nikoli vydáván za procesový exit0. První browser proces skončil0. `final-browser/review.json` odlišuje hraný výsledek od ukončení harnessu; driver nyní loguje dokončené `browser.close`.

Úklid `evidence/sp-011c2/artifact-cleanup.json` odstranil čtyři nahrazené první snímky a vlastní dočasný log,836105B. Zachovává první exporty jako přesné zdroje fixtures, oba kompaktní výsledky a čtyři finální snímky. Žádný trace/video, volných21GiB.

## Čekající lidské přijetí

1. Z dílny najít hvězdnou mapu, doletět do Jantarového háje a podle popisku rozpoznat skutečnou polohu lodi i domov.
2. Najít konkrétního tvora, poznat rozdíl sken/odběr, zkontrolovat původ v nákladu a vysadit jej na Žhavé slze. Zhodnotit čitelnost při1024×640.
3. Poslechnout skok, pohon a tři nástroje s běžnou hlasitostí; ověřit komfort kamery a režimu omezeného pohybu. Automatické události nejsou dokladem poslechu člověka.

Bez nových závislostí, commitu, pushe nebo deploye. Další závislost: klimatické nástroje a ekologická stabilita C3, poté kolonizace, produkce a prodej. ROADMAP zachovává všechna původní kritéria.
