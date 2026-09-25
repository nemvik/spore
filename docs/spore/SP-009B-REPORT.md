# SP-009.B — místní městská ekonomika

Verze reportu **1**, 25. 9. 2026. **SP-009.B hotovo v rozsahu [smlouvy B v1](SP-009B-CONTRACT.md)**, pracovní strom nad skutečným čistým `c1b2c75b6` (SP-009.A). [Plán a kritéria](../superpowers/plans/2026-09-25-sp-009b-city-economy.md) vznikly před implementací. Bez commitu, pushe, deploye, nových závislostí a změny lockfilu. Celé SP-009/SP-010/SP-017 zůstávají otevřené.

## Výsledek a pravidla

Hráč ve skutečně založeném městě převede 80 jantaru z původní strojové zásoby do nové místní pokladny, postaví obydlí za 20, pěstírnu za 16, dílnu za 24 a dvakrát pozve dva civilní obyvatele za 8. Zbývající 4 jantary zaplatí první provozní cyklus. Při zde ověřeném rozmístění město každých 10 sekund aktivního hraní vyrobí 6 porcí, spotřebuje 4, vydělá 6 jantarů a zaplatí 4, tedy čisté **+2**. Výsledky vycházejí ze skutečného počtu lidí, pracovních míst, zásob, zapnutých budov a vzdáleností.

Čtyři funkční typy: obydlí (kapacita 4), pěstírna (2 pracovníci), dílna (2 pracovníci) a zahrada odpočinku (1 pracovník). Příchody jsou placení noví civilní osadníci vlastní linie s trvalými místními ID a původem; neodčítají ani nekopírují původní kmenové jednotky. Figurky zobrazují uložené sčítání obyvatel, nemají samostatnou autonomní fyziologii. Nejsou zde automatická narození, úmrtí nebo migrace při nepřítomnosti.

Spokojenost 0–100 zahrnuje jídlo, zaměstnání, zaplacenou údržbu, blízké dílny a odpočinek. Ovlivňuje příjem dílny: `floor(8 × spokojenost / 100)`. V navazujícím skutečném hraní druhé obydlí, další dva obyvatelé a dvě placené zahrady změnili výsledek ze spokojenosti **60 / příjem 4 / náklady 5** přes **75 / 6 / 6** na **100 / 8 / 7**. Následný přirozeně odehraný cyklus tyto hodnoty skutečně zaúčtoval. Úplné ceny, jednotky, pořadí pracovníků, prostorové vztahy a rovnice jsou ve smlouvě.

Parcely respektují nezměněný terén, hranice detailu, dekorace, radnici, náměstí, stanoviště a přístupovou cestu. Kontrola při potvrzení i importu počítá s rozměrem těla. Není implementovaný editor vzhledu ani knihovna. Čtyři rozlišitelné modely a kontrolky odrážejí skutečné stavby a stav provozu.

Příkaz znovu ověří prostředky a očekávanou revizi před jedním synchronním odečtem a změnou. Opakování stejného potvrzení se odmítne. Demolice nevrací jantar a nesmí odebrat obsazenou kapacitu. Pokud před cyklem chybí celá údržba, žádný provoz nevyrábí a nic se nestrhne; lidé spotřebují jen dostupné jídlo. Hráč může vypnout zbytečný provoz, běžným návratem vydělat u vlastních pramenů a převést dalších 20. Nouzových 20 porcí stojí 10. Neexistuje grant, dluh, výběr městské pokladny do domova ani zpětná odměna.

Ekonomika běží jen v aktuálním místním městě při aktivním hraní. Ukládá rozehraný zlomek 10s cyklu. Pauza, menu, globální přehled, domov a ostatní lokality nic nedohánějí. Výběr města nemění etapu/vlastnictví. Původní čas, RNG, organismus, jednotky, historie, B1 a místní terraformace zůstávají během výpravy zmrazené podle C; jedinou výslovnou ekonomickou změnou domova je hráčský převod jantaru. Prameny a B1 se znovu uplatní pouze při původním hraní doma; městská dílna nevytváří nový B1 násobek.

## Verze a historické kampaně

Nový **CityRegistry v2** vyžaduje `economy: null | CityEconomy`, ekonomika má vlastní verzi 1. Obálka kampaně v3, HomePlanet v3, atlasový generator 1, detailGenerator 1, `City.local.version=1`, původní `worlds` a význam `GameState.planet` zůstávají. Budovy jsou městský stav nad neměnným generovaným základem.

Parser nadále přijme absenci registru a v1. Výslovná UI aktivace `enableCities` migruje live i checkpoint před rekey; opakování je beze změny. Staré kampaně dostanou prázdný registr, skutečná města A pouze neaktivní `economy:null`: zachovají ID, vlastníka, adresu, jméno, radnici a doklad již zaplaceného založení 60. Žádné vymyšlené budovy, obyvatelé, minulá výroba nebo čas. Otevření hospodářství vyžaduje nové hráčské potvrzení převodu 80. Ruční migrace není nutná. Starší aplikace registr v2 neumí přečíst.

Skutečný odehraný export A je byte-identicky uložen v [regresní fixture](../../tests/fixtures/geography/sp-009a-city.save.json), SHA-256 `ab594a3f92456985aced44c2cc28ba3e659b55df21f6411eae189d33a0efe38d`. Zdroj `evidence/sp-009a/browser/active-campaign.save.json` zůstal zachovaný. Přísný parser kontroluje přesná pole, ceny, ID, kapacity, účetní rovnosti, dosažitelné meze, geometrii a bezpečnou pozici. Nejde o ochranu před úmyslným přepsáním celého singleplayer save.

Checkpoint může obsahovat starší ekonomiku, zbouranou stavbu nebo dosud neotevřené hospodářství téhož města. Obnova nahrazuje celou větev včetně obou zásob jantaru; import/rekey vytváří samostatný slot, nic neslučuje ani nepřičítá. Ledger a identity chrání opakované čtení/obnovu před vedlejšími odměnami.

## Skutečně provedené ověření

| Ověření | Výsledek a důkaz |
| --- | --- |
| Celá Vitest sada, jeden worker, bez současného browseru | **147 souborů / 2 925 testů**, 89,24 s; [log](../../evidence/sp-009b/verification/full-tests.txt). Poté přidány dvě úzké regrese a text legendy/časového limitu UI; finální dotčené testy a browser jsou níže. Netvrdíme nový úplný běh 2 927 testů. |
| Finální ekonomika + původní města/cestování | **168/168**, z toho **66 ekonomických**; [log](../../evidence/sp-009b/verification/final-targeted.txt). Ekonomika, nedostatek, opakování, změna peněz mezi návrhem a potvrzením, nákup jídla, demolice, 27 neplatných vstupů, 7 seedů, dvě města, čas/pauza/globál, checkpoint/rekey a původní etapy. |
| Historické fixtures | Všech **11 původních** byte-identických; opakovaná migrace, 120 kroků parity původních systémů včetně B1. Skutečné geografické A/B/C a městská A opakovaně přes save/import/rekey/checkpoint. |
| Typecheck, build, diff | Prošly; [typecheck](../../evidence/sp-009b/verification/typecheck.txt), [build](../../evidence/sp-009b/verification/build.txt). Node 22.23.1, pnpm 11.24.0. Žádný lint script v projektu. |
| Hlavní produkční browser | **5/5 skupin, 0 chyb**, [výsledek](../../evidence/sp-009b/browser/results.json). Skutečná A → placený rozvoj/populace → kladný cyklus → deficit → návrat/prameny/převod/obnova → pauza/globál → export/import/rekey → save/reload/load → 20 návratů → checkpoint. |
| Šest obyvatel a odpočinek | **4/4 skupin, 0 chyb**, [výsledek](../../evidence/sp-009b/leisure/results.json). Dále vydělaných 60 doma, placený rozvoj, dva prostorové účinky zahrad, skutečný cyklus 8−7, koupené zásoby a přesný reimport. |
| Historický produkční browser | **12/12 skupin, 0 chyb, 12,124 s**, [výsledek](../../evidence/sp-009b/historical/results.json). Nová linie, oba organismové přechody, útes, souš→kmen, kmen→stroje/B1, checkpoint, stroje→místní terraformace, T3 a skutečný A import. |
| Skill klient | Adaptovaný původní klient `develop-web-game` prošel na finálním šestihlavém městě, canvas prohlédnut, bez chyb. [Původ, přesné úpravy a souhrn](../../evidence/sp-009b/skill/adapter.json). Pouze instalovaný Chrome, UI import a nativní čekání místo časového shimu. |

Reprodukce z kořene repozitáře (produkční preview nechat běžet ve druhém terminálu):

```sh
pnpm exec vitest run --maxWorkers=1
pnpm exec vitest run tests/city-economy.test.ts tests/cities.test.ts tests/planet-travel.test.ts --maxWorkers=1
pnpm typecheck
pnpm build
pnpm preview --port 5210 --strictPort
```

Proti běžícímu preview postupně:

```sh
pnpm test:city-economy
CITY_ECONOMY_OUTPUT=evidence/sp-009b/leisure node scripts/city-economy-browser.mjs --leisure
HOME_PLANET_OUTPUT=evidence/sp-009b/historical pnpm test:geography
```

Nový běh znovu vytvoří mezilehlé artefakty; po jejich kontrole je uklidit podle pravidel AGENTS.md, zachovat aktivní exporty. Hlavní browser čte byte-identickou fixture A a žádný připravený městský výnos.

Finální produkční JS `index-DfOK7cGZ.js`: **1 304,07 kB / gzip 404,60 kB**; CSS `index-NvGwa-on.css`: **50,46 kB / gzip 11,24 kB**. Známé upozornění Vite na chunk nad 500 kB zůstává, práh ani časové limity testů se nezvyšovaly. Jediný posunutý historický unknown-version test odmítá registry **3** místo nově podporované **2**; staré očekávané otisky se nepřegenerovaly. Nové hospodářské kapacity 16 budov / 32 lidí / 120 porcí jsou vysvětlené ve smlouvě, nejsou změnou původních limitů.

### Připravené vstupy a hraní

Hlavní vstup není nová kompletní kampaň: je to nezměněná odehraná A (seed 481516, město „Záře nad údolím“, lokalita 776, původní rezerva přibližně 113,375 jantaru a vlastní prameny). Neobsahuje připravenou ekonomiku. Všechen nový rozvoj, příjem, deficit i obnova byly odehrané přes UI a native RAF. Ovladač vybírá parcely čtením čistého prostorového výpočtu mimo prohlížeč, zahrady pomocí čistého náhledu; skutečné umístění i platba jsou kliknutím a potvrzením. Během hraní se nezapisoval živý stav ani localStorage a nebyl dostupný `advanceTime`.

Pouze pro větev checkpointu vznikl **offline** vstup s mrtvým hráčem a checkpointem z právě odehraného exportu; import a obnova jsou běžné UI. Historický ovladač přiznává připravená jídla/průzkum/deník/generace, polohu u brány, plíce/nohy pro druhý přechod, historickou výhru a mrtvou větev. Jejich původ je v [PREPARED.md](../../evidence/sp-009b/historical/PREPARED.md); nejde o nově odehraných šest etap. Jednotkové testy navíc záměrně konstruují finance, dva městské registry, jiné seedy a neplatné vstupy; nejsou vydávané za browser hraní více měst.

### Ovládání, snímky a výkon

Ověřeno přirozené automatické zaměření potvrzení po 450 ms, Tab→zrušit, Shift+Tab→potvrdit a mezerník; bez programového zaměření v ovladači. Také zrušení platby, odmítnutá kapacita/peníze, klávesa N, uvolnění drženého WASD při přechodu, pravé tažení kamery, kolečko, pauza a návrat. Rozlišení **1280×720 a 1024×640**; panely mají vlastní scroll, nižší příkazy se odkrývají posunem. UI odděluje skutečný poslední cyklus od výhledu, vysvětluje příčiny nálady, ceny a neaktivní čas. Zvuk používá existující odezvu; lidský poslech nebyl proveden.

Prohlédnuté finální důkazy: [neaktivní A](../../evidence/sp-009b/browser/legacy-inactive.png), [první produkce](../../evidence/sp-009b/browser/productive-city-1280.png), [deficit a náprava](../../evidence/sp-009b/browser/deficit.png), [globální přehled 1024](../../evidence/sp-009b/browser/global-economy-1024.png), [místní přehled 1024](../../evidence/sp-009b/browser/local-economy-1024.png), [parcely 1024](../../evidence/sp-009b/browser/lots-1024.png), [šest obyvatel a příčiny spokojenosti](../../evidence/sp-009b/leisure/leisure-six-residents.png). Prohlédnuté jsou také uchované historické stroje/B1, sandbox 1024 a migrovaný A atlas; skill canvas a duplicitní finální záběr byly po kontrole uklizené.

Finální měření proběhlo sériově bez testové sady a bez trace/video, Chrome headless, medium, pixelRatio 1, 1024×640. Odezva zahrnuje dokončení UI vstupu do viditelného panelu, nikoli čistý GPU čas. p95 je vzorek na indexu `floor(n×0,95)` seřazeného pole.

| Metrika | Finální hodnota |
| --- | --- |
| Návštěva města, 21 vstupů | medián **30,94 ms**, p95 **31,81 ms**, maximum **32,08 ms** |
| Návrat domů, 20 vstupů | medián **35,47 ms**, p95/maximum **41,98 ms** |
| RAF, 436 intervalů před checkpoint reimportem | p50 **16,7 ms**, p95 **16,8 ms** |
| JS heap po vynuceném GC, 0 / 10 / 20 návratů | **14 928 936 / 18 592 844 / 19 186 848 B**; 10→20 **+594 004 B** |
| Geometrie, 0 / 10 / 20 návratů | **341 / 286 / 286** |
| Živé WebGL buffery, 0 / 10 / 20 návratů | **1 273 / 1 120 / 1 120**, počítáno přes create/delete s WeakSet bez držení objektů |
| Finální scéna | **115 draw calls**, 23 830 trojúhelníků, 1 textura, 18 programů |

Renderer drží jeden aktuální vzdálený detail; změna cyklu nebo pokladny nepřestavuje celou scénu. Geometrie/buffery se při nahrazení uvolňují, staré detaily se trvale nevykreslují. Výchozí vzorek zahrnuje studené objekty a mezi návraty přibude navštívená poušť a domácí renderer. Jde o krátké měření, nikoli důkaz nulového dlouhodobého růstu paměti, 60 FPS na libovolném stroji nebo přesné srovnání s A/C. WebGL hlásil pouze „WebKit WebGL“, konkrétní GPU nebylo v běhu identifikované. Doplňkový skill klient výslovně používal SwiftShader a není zdrojem uvedených výkonnostních čísel.

## Review, opravy a úklid

Vlastní review a nezávislé read-only review subagentem dokončené změny proběhly. Subagent nezávisle ověřil 115 testů. Opravené P2: globální keydown blokoval nativní Tab/mezerník v lokálním UI; `InstancedMesh` obyvatel neuvolňoval instance buffery. Finální browser používá skutečnou klávesnici a počítá buffery. Následné nezávislé review oprav bez dalších nálezů. Vlastní kontrola ještě opravila mapování zoomu hospodářské kamery, jehož původní spodní mez pohltila celé povolené kolečko; původní rozsah uloženého zoomu 13–45 zůstal.

První jednotkové selhání bylo záporné nule výhledu a nevyhovující parcelou v testu odpočinku; výhled normalizuje nulu, test volí skutečně blízké místo. První browser doběhl až k obnovení provozu, ale ovladač neotevřel po návratu složený seznam budov; opraven ovladač se stejným timeoutem. Dřívější úspěšný browser překryl krátký omylem spuštěný široký test subagenta; jeho měření se nepoužívá. Výše jsou pouze nové sériové finální běhy po opravách.

Vlastní artefakty byly zredukované podle [manifestu úklidu](../../evidence/sp-009b/cleanup-manifest.json): odstraněny neúspěšné a duplicitní snímky, mezilehlé exporty a pracovní kopie skill klienta. Zachované jsou regresní fixture, nutné připravené checkpointové vstupy, malé výsledkové logy, deset finálních snímků a aktivní exporty. [Hlavní odehraná kampaň](../../evidence/sp-009b/browser/active-campaign.save.json) a [pokračování se šesti obyvateli](../../evidence/sp-009b/leisure/active-campaign.save.json) lze importovat běžným menu. Historické aktivní savey i veškerá cizí evidence zůstaly zachované. Žádné nové trace/video/ZIP. Stav disku a přesné odstraněné soubory jsou v manifestu; [otisky ověřených souborů](../../evidence/sp-009b/verification/manifest.json) identifikují tento pracovní strom a build.

## Meze a přesné pokračování

Všechna vymezená kritéria B jsou ověřená; **žádné otevřené blokující kritérium B**. Dvě města a sedm seedů jsou prokázané simulačně, produkční ekonomické hraní používá jedno skutečné město na seedu A. Nebyl proveden lidský playtest, mobil/Safari ani dlouhý soak; souhrnná populace není autonomní občanská AI. Soupeřící státy, obrana/dobývání, obchodní převzetí, konverze, moře, vesmír a SP-007.B2/D nejsou implementované. První širší kritérium SP-009 obsahuje také obranu, proto zůstává nezaškrtnuté i po dokončení B.

**Další krok: SP-009.C — editor vzhledu městských budov a jejich knihovna (potřebná část SP-005.B)** nad neměnnými ekonomickými typy B. Začít konkrétní smlouvou oddělující vzhled, revizi výtvoru a placenou městskou instanci; zachovat ledger, cenu, pracovníky, parcely, identitu a migrace. Neotevírat při tom automaticky státy ani SP-007.B2/D. K pokračování nyní není potřebná ruční oprava nebo migrace kampaně.

## Navazující autorizace publikace — 25. 9. 2026

Po dokončení ověření uživatel výslovně požádal o commit a push SP-009.B do `main`. Před publikací se všech 31 hashů zdrojů, dokumentace, fixture, lockfilu, buildu a výsledků shodovalo se závěrečným manifestem. Pracovní strom obsahoval přesně 25 souborů této změny a vzdálený `main` byl stále na `c1b2c75b6`. Následně přibyl pouze tento publikační záznam a jeho protějšek v PROGRESS.md; herní implementace i ověření zůstávají totožné. Navazující práce je SP-009.C podle poslední kapitoly. Bez deploye.
