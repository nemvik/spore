# Závěrečná nová kampaň A–D

27. září 2026. [Plán](../superpowers/plans/2026-09-26-final-campaign.md). **Nová linie dokončila cestu od buňky přes celý útes, tvora, kmen a civilizaci až k jádru galaxie. Odměna byla použita a uložena; proběhl návrat, další výprava na změněnou planetu i druhý návrat.** Samostatné nové konverzní a vojenské civilizační větve také prošly. E je podle novějšího uživatelského pokynu odložené. Celá sada4 637testů/205souborů a finální build prošly; [lidské přijetí a poslech](A-D-HUMAN-ACCEPTANCE.md) čekají.

**Aktualizace28. září:** [nezávislé review a opravy](FINAL-REVIEW-REPORT.md) uzavřely tři P2 a ořezané ovladače pauzy. Novější kontrola:4 641testů/206souborů,58exportů/checkpointů a finální build prošly. Původní hraný průchod i jeho aktivní save zůstaly zachované; nově ověřené kopie a buildy jsou výslovně oddělené. Lidské přijetí nadále čeká.

## Původ a kontinuita

Nový izolovaný Chrome, normální Nová linie, seed8675309. Začátek bez importu, fixture, setteru, testového času nebo query. `advanceTime` je na produkci nepřítomné. Pohyb, potrava, evoluce, kultura i přechod jsou skutečné klávesy/tlačítka a nativní RAF. Read-only diagnostika pomáhá řízení; nejde o slepý lidský playtest. [Ovladač](../../scripts/final-campaign-organism.mjs) navazuje na již existující [běžný organismový ovladač](../../scripts/fresh-organism-browser.mjs).

Start: `index-1qdtev7n.js`, SHA256 `7585920a051981251886b96874f0e5172dab5ca45e62299aa31d11293a06049c`. Po opravě rady: `index-CFq8lRHM.js`, SHA256 `562504cbe7127226d8a1b9963c6f642a14c524658b3550bd9a7fc2e0b399a063`; Po doplnění rady k proudu: `index-Cm7pSy2E.js`, SHA256 `40367e4b06e32f97c3f10aafd6ecc818a48ab2f4d45c53807f5a25b53acd697e`. Poté čistě CSS úprava kompaktních projevů vytvořila `index-Dy7Z5FiO.js` se stejným JS hashem a `index-CeZlwDC1.css`, SHA256 `980fd1d58aa1359bed31cbfe7ca2626cf14e280c04266a2329ffc79e4aa6accf`. `evidence/final-campaign/organism/provenance.json` a `segments.jsonl` evidují build, vstupy a hashe. První recorder očekával absolutní asset URL; hash byl doplněn ihned po narození během pauzy, před hraním.

Veřejný export dokončené buňky `04-cell-complete.save.json`: **ea9d1f097a2204b6aa4f76a4aee5f1f87f667d72ea12288ada6ca8ead9167a82**. Následující skutečný přechod G vytvořil `05-reef-arrival.save.json`: **5255fdd971feab40e7db616b10a5a95def417ddd86ceaa1f50a6186fdf4aaabf**. Přesně tento payload byl veřejně importován po novém buildu; shoda těla, generace, historie, objevů a těla checkpointu ověřena. Import legitimně změnil identitu linie. Žádný rewind ani doplnění poznání/zdrojů.

## Odehrané výsledky

- Buňka: tři skutečné růsty, tři objevené a použité orgány, vlastní Jasnozrnka (odstín205/vzor2), druhá generace. Nové orgány stály46DNA. Zahrada skončila skutečným bezpečným jídlem závojníka, pohyblivá kolonie prošla širokým východním ústím víru, poslední kultura zakořenila u severního odtoku. Na konci40jídel,0lovů,214volnýchDNA,105zdraví. Tři podmínky i skutečný přechod splněné.
- Útes: třetí generace zaplatila140DNA za ploutve, žábry, plíce, končetiny, zásobník a sosnu. Korálová pastva byla bezpečně snědena plachtovcem. Jedlá krusta byla snědena a strop uvolnil stoupající mateřskou řasu. Horní výsadbu zprvu plachtovec nenavštívil; skutečná návnada jej přilákala, lovec jej znovu odehnal. Hráč lovce dohnal a dvěma placenými toxinovými pulzy porazil. Poškození115→71,5 i spotřeba energie zůstaly. Dvě další přenesená sousta postupně přivedla konzumenta k hornímu porostu; živé krmení splnilo podmínku.
- Průduch: přímý sestup proti vzniklému výstupnému proudu s otevřeným filtrem neuspěl a skutečně spotřeboval energii. Hra nebyla vrácena. Hráč se najedl, sestoupil vedle proudu, dlouhou sosnou odebral kulturu z okraje při69,175% dechu a použil proud k výstupu. Kultura přežila (84,790 vitality po výstupu), skutečný přenos96m na sever splnil poslední ekologii. Útes skončil56jídly,1lovem,252DNA,115zdravím a všemi5podmínkami.

Veřejný útesový export `09-reef-complete.save.json`: **f180a30b2394214d80a1a362e0ac90ef5af61fb5052375d35a4e346b124716c2**. Po skutečném pohybu a G vznikl `09-creature-arrival.save.json`: **a81b049a5713868432d1760edefbac6ed6a1772a6599368f2d3ed03385cf1b52**. Na souši jsou čtyři normálně inicializovaná hnízda bez výsledků, zděděné tři buněčné objevy a nezměněná zaplacená generace3.

- Souš: západní kosti skutečně odemkly ruce. Čtvrtá generace v editoru přešla na konstrukci v2, přidala symetrické paže, tvar přední páteře a zrnitý povrch; zaplaceno 67 DNA. Tělo zůstává vlastní Jasnozrnkou. Všechna čtyři hnízda byla skutečně spřátelena, žádný bojový výsledek připraven. Zaznamenány čtyři nektarové porce a pět objevených částí. První přijatý zvonkonoš při cestě zanikl, jeho ID174 je v pozdějším světě nepřítomné; žádná obnova. Nově přijatý prachokřídlík při setkání s alfou skutečně pomohl pěti odpověďmi. U východního pramene kleslo zdraví na28,975; obranný toxin stál15energie, běžný návrat a pobyt v hnízdě obnovily zdraví na115. V závěru již nebyl přítomný ani druhý společník. Tato ztráta také zůstala zachovaná.
- Skutečné G v hnízdě uzavřelo sociální cestu (čtyři historické fakty `source: action`, nikoli připravený výsledek). Tlačítko pokračování založilo kmen se třemi vlastními potomky,36jídly a pěti nevyřešenými sousedy. Veřejný export `14-tribe-arrival.save.json`: **bb6f4de611750cec400c2f9aa0a57ae921ba1f9f075c8d6d14fa723bef086846**. Předchozí živé tělo/historie zůstaly. Žádná smrt hráče ani obnova checkpointu v celé dosavadní nové kampani.
- Kmen následně nasbíral a donesl skutečných96jídla navíc, zásoba36→132; také sousedé viditelně sbírali a najímali nové členy. Export `tribe/15-tribe-harvest.save.json`: **9d4a46dbc19e3d5034c10fa65a2ab6363e3f90ebf8ee422b120a9f7b9f60d1b4**. Tento přesný stav byl veřejně importován do CSS buildu. Kontinuita těla, členů, výsledků, historie a kmenového checkpointu ověřena; třetí legitimní rekey. Následovala skutečná dílna za22, tři bubny za18 a kulturní výstroj „Hlas Jasnozrnky“ za10 jídla. Všech pět sousedů navštívili skuteční členové, zaplatili dary a dosáhli aliancí; po každé návštěvě se vrátili domů. Po třetím i čtvrtém sousedovi zůstala brána uzavřená. Všichni tři přežili, konečná zásoba52. Kmen se uzavřel přibližně po205s skutečné simulace.

Veřejný konečný kmen `tribe/20-tribe-complete.save.json`: **8e3b7a30bd178d731c61f29dac2ba56ae4b897f1a0c2e71c438838a4b2c40ff8**. Skutečný přechod: `tribe/21-machine-arrival.save.json`, **5f306da08048ce99b397b3d399b1b5666c7040b7d65a8fe6f713ad38187b5ad8**. Etapa4 začala normálním rozpočtem100 a prázdnou flotilou, zachovala vlastní tělo a pět historických faktů `source: action`. Dědictví `income: 1.2`, `power: 1`, `route: allied`; skutečně měřené příjmy tří pramenů byly0,72/1,80/3,24 jantaru za sekundu proti základu0,60/1,50/2,70, tedy přesně +20%.


## Celá obchodní civilizace z nové linie

Vlastní „Kořenový poutník“ stál52jantaru a „Křídlo Jasnozrnky“56. Tank skutečně vrtal prameny; letadlo oživilo vzduchem dostupnou vysočinu. Všechny tři regiony dosáhly půdy100 a dvou placených osadníků. Oba stroje se fyzicky vrátily domů. Export `civilization/24-domestic-complete.save.json`: **a3ade3afda6693702b7e86daa0df2f8f132d7ae588128713cae0a07dffc282ad**. Samotné domácí regiony bránu nesplnily.

Hráč navštívil skutečně dosažitelnou travnatou lokalitu1088, prozkoumal tři místa a založil „Jasnozrnné údolí“ za60. Do města převedl100, zaplatil dům20/zahradu16/dílnu24 a čtyři obyvatele16. Skutečný desetisekundový cyklus: příjem7, provoz4, jídlo6/spotřeba4, hlad0, spokojenost90. `26-own-city-functioning.save.json`: **cc7a2eba33eeab865c89c9efa49663242d27ae0da998d66375752929e66ddb0a**.

Doma proběhlo dalších445,517 skutečných sekund těžby (+1443,474jantaru) na rozpočet2001,18. `27-earned-home-budget.save.json`, **8e4ce3837d2a87a3b3b6dd6d668dc4925cebaf9eb4747f0b7486f3f2759e7c0d**, je zachovaný společný prefix nové linie pro samostatné vojenské/konverzní hrané větve; obě už jsou samostatně dokončené níže.

Vlastní letadlo skutečně převezlo dvanáct nákladů po20, vyložilo je a vrátilo se. Každé ze čtyř měst mělo samostatný kontrakt a tři dodávky. Ceny v pořadí Zelený dvůr1/Měděná věž1/Měděná věž2/Zelený dvůr2:373/370/338/412, vždy60již zaplaceného kreditu a skutečný doplatek313/310/278/352. Celkem1493jantaru; čtyři kontrakty vypořádané, všech pět měst vlastních. Žádný vojenský převod nebo připravené vlastnictví. Po fyzickém návratu brána povolila skutečný přechod do5 a zachovala tělo generace4. `30-planet-arrival.save.json`: **1a8eaeec38d9cb433ec367a5063648d2ceb6b9ad1a98e9b42f98f2804c28d930**.

Následné běžné přepnutí nástroje a měření pomocí skutečného `planet.elapsed` prokázalo spotřebu **0,20/s** (základ0,25 × obchodní dědictví0,8). Domácí příjem měřen zvlášť s vypnutým nástrojem. `30-inheritance-measured.save.json`: **5954319b5cc7ac1e261b9a75dcf01aa2f231c485ede6d0d07623909eb7cbfedd**. Hlavní save nebyl vrácen ani editován, žádná smrt či checkpointová obnova.

[Ovladač měst](../../scripts/final-campaign-cities.mjs) používá skutečná tlačítka/pohyb; hostové čtecí dotazy jen plánují dostupnost terénu a staveb. Opravené předpoklady ovladače: první travnaté pole leželo přes moře, SVG výběr nesměl dostat Enter místo skutečného tlačítka, další obchodní převod musí počkat na následující strategický tah a průběžná obnova HUD odpojuje locator při scrollu. Každý neúspěšný pokus zachoval odehraný čas/zdroje a pokračoval v témže stavu. Nejde o čtyři prokázané herní chyby.

Osobně prohlédnuté finální PNG: editor letadla, dokončené regiony, vlastní město, obchodní let při1024×640 a připravená civilizační brána. Městský PNG zobrazuje stavby a tělo, nikoli rozbalenou finanční prognózu. Krátké90RAF vzorky: regiony16,8ms, město16,7ms, obchodní let16,8ms p95. Browser bez runtime chyb. Produkční kód/build se v tomto civilizačním úseku nezměnil.




## Samostatné nové civilizační alternativy

Obě větve používají **přesný veřejný prefix27** této nové linie, v novém samostatném prohlížeči, se skutečnými akcemi a nativním časem. Nejde o připravený stav ani opakování celého narození; před rozdělením je společný legitimně odehraný vývoj. Hlavní vesmírný save se během větví neovládá a kontroluje se jeho přesná byte shoda. Ovladač `civilization-paths-browser.mjs --fresh-final` ověřuje pevný SHA zdroje, běžný blokovaný přechod a všechny vlastní platby. Historický režim L zachovává svůj původní zdroj i limity.

**Konverze dokončená:**18skutečných obřadů po20, čtyři převzetí za80/80/100/100. Původní obrany zachované, žádný vojenský převod/nájezd. Všech pět měst vlastních, normální G do5. Následně vlastní letoun skutečně odebral/vysadil kulturu a dědictví zvýšilo kladnou obnovu75→75,485 za1,616667s, přesně0,25×1,2/s. Veřejný import/rekey a save/reload/load zachovaly celé výsledky.8kontrolních skupin,0browser chyb,exit0. Výsledný `alternatives/conversion/active-campaign.save.json`: **41820ceb5de0df1c6007c23f785d9eb7367f13b60b78be13c274b2de7e2d2ba7**. Tři finální PNG osobně prohlédnuté;90RAF p95 16,7ms. Hlavní save d011f5cc…f4b321 přesně zachovaný. **Vojenská větev dokončená:** vlastní dělový „Strážce sjednocení“ stál56, skutečně porazil původní stráže i náměstí všech čtyř měst. Zničil dvě placené armády (jednu nově vyrobenou K2 za40 z fungujícího hospodářství, jednu původní státní), zaplatil šest oprav po10 a fyzicky se vracel. Všech pět měst vlastních, žádný mírový převod, normální G do5. Skutečných96kroků/1,6s terraformace změnilo atmosféru−0,8503826510→−0,7343272572, shoda s výkonem×1,2 do1e−7.11kontrolních skupin/0browser chyb/exit0, veřejný import a save/reload/load zachovaly historii. `alternatives/military/active-campaign.save.json`: **41d0d3c167d7b2e6d8a20a631124320d464fb8213d378709f60ceefe58ad104d**. Tři finální PNG osobně prohlédnuté. Hlavní save přesně zachovaný; technické dokončení všech tří cest B/B2 je tím doložené. Lidské přijetí a poslech zůstávají oddělené.

## První celý vesmírný okruh v téže linii

V běžném editoru vznikla sedmidílná „Světlonoška Jasnozrnky“: rozšířený trup, natočené boční ploutve a další horní ploutev. Návrh uložený i veřejně exportovaný jako `space/svetlonoska.ship.json`; skutečná stavba108jantaru, deset vkladů po20 na palubní účet200. Model má115odolnosti/105energie/náklad8/solár2,82/s. `31-own-ship-funded.save.json`: **5bbea4faa17830e09fae06b28276ff29d8605531a9bf21a3c5fc3ef065984965**.

Loď skutečně vzlétla, vystoupala na orbitu a letěla do soustavy1. Zdrojová biosféra se rozrostla ze36 na54jedinců. Osm placených odběrů po skutečných skenech zahrnulo tři rostlinné role, dvě býložravé role (po dvou jedincích) a predátora. V každém zdrojovém pásu zůstali alespoň dva jedinci každé role; výsledný zdroj46jedinců. Odnože i původ každého exempláře se zachovaly. Žádné automatické přidání života.

První kontakt s Pryskyřičným spolkem u povrchového majáku zafixoval skutečné dědictví: rostliny38/maso0/ostatní22, úplné uzavřené etapy0–2, sociální tvor, spojenecký kmen a obchodní civilizace. Skóre12Správce/12Prostředník/0Průkopník dává **Tkadlec cest**. Přehled vysvětlil původ i účinek, který je při dohodě+2za kus. Hráč přijal běžnou zakázku dovézt/prodat8nových výrobků. `34-first-contact.save.json`: **cdee3a7cb1225fb3baa093c517ccc99f964d2d55cbe66abd6cade69ef30cdeae**.

Na pusté Žhavé slze2 skutečné ochlazování/zahušťování změnilo klima0,8/−0,7 na0,041627/−0,032113. Nástroje zaznamenaly práci0,778/0,677 i přirozený drift; nevytvořily žádný organismus ani stabilitu. Skutečná výsadba všech osmi exemplářů založila první pás se všemi šesti rolemi. Po přirozeném krmení a10s stabilizaci vydržel dalších20s s nástrojiOFF, pak se dále množil. **Tento nový průchod dokládá první pás; dřívější C3a2 samostatně dokládá všechny tři pásy i opačnou klimatickou planetu.**

Kolonie zaplacena40, skutečná výroba8kusů výtrusového vlákna a nakládka8. Na orbitě při návratu k1 nastal jeden automatický pirát; následující běžný sestup provedl placený ústup4energie, bez střel/poškození/ztráty nákladu. Nešlo o soubojovou výhru ani vynucený návrat domů. Skutečný prodej8×11 přinesl88, zakázka dokončena a dohoda otevřela příští vyšší cenu. Účet200−40+88=**248**.

Veřejný import právě odehraného exportu a save/reload/load zachovaly skutečné účetní doklady, cargo, loď, dědictví a checkpoint (změnila se pouze legitimní identita). Za0,35skutečné sekundy mezi importem a pauzou solár doplnil0,987energie, přesně2,82/s. Opraven původně příliš přísný assertion ovladače; bez vrácení času/energie. Další opravy ovladače porovnávají úplný veřejný svět s úplným veřejným světem (diagnostika vynechává vyčerpané zdroje) a dovolují přirozeně pokračující produkci kolonie během přistání. Úplné domácí položky po celé výpravě až do přistání přesně odpovídaly prvnímu vzletu.

Běžný let přes orbitu/soustavu domova a přistání uzavřely okruh. Vzdálená biosféra i kolonie zachované, zdraví lodi115, účet248, kolonie vyrobila12/naloženo8, čtyři kusy ve skladu.22cestovních záznamů a384,067s vesmírného času;1automatický pirát/1ústup/0karantén/0proher/0vynucených návratů. `39-first-expedition-home.save.json`: **d011f5cc29100929a780e07c5655d874cfd492e140b4b95780dbb41880f4b321**. Po ověřených nezávislých čerstvých civilizačních alternativách hlavní kampaň pokračuje D.

[Nový nativní ovladač](../../scripts/final-campaign-space.mjs) nikdy nevkládá stav ani neposouvá simulaci. První převzetí staženého návrhu selhalo kvůli oddělenému dočasnému adresáři druhého CDP klienta; dohledán právě skutečně stažený UUID u vlastníka prohlížeče, návrh nebyl generován z diagnostiky. Další stavba použila již uložený výtvor bez opakování návrhu. Osobně prohlédnuty vlastní editor, zdrojová biosféra, dědictví, stabilní pás a domácí návrat.90RAF p95 první živý svět/dědictví16,7ms, domácí návrat16,8ms. Browser runtime chyb0.

Offline audit **47odehraných exportů** prošel přesným parse/serialize roundtripem a obnovou checkpointu na oddělených kopiích (etapy0–5). Tento běh předcházel poslednímu prodeji/importu/návratu; jejich audit navazuje. Nejde o hráčovu checkpointovou obnovu. Manifest `cleanup-civilization-20260926.json` odstranil12mezivýstupů/4 318 686B; zachoval prefix27, aktivní kampaň i finální důkazy. `replaced-artifacts.jsonl` rozlišuje starší hash pojmenované zastávky od pozdějšího návratu na stejné místo.

## D · získané vybavení, dědictví a cesta k jádru

Z domácí těžby hráč skutečně převedl dalších 200 kreditů. Obchodní zakázka odemkla nákladový modul za **80**. U říše Kořenů na4 proběhlo šest nových placených skenů různých rolí, návrat k majáku, splnění katalogu a dohoda. Čedičový svaz na7 zadal skutečný průzkum planety8, po návratu uznal výsledek a uzavřel dohodu. Na vlastní kolonii2 následovala montáž soláru za **60** a pohonu za **120**. Všechna tři zařízení mají získané odemčení i vlastní platbu; náklad12, dosah32 a skutečné dobíjení4,82/s.

Dalších osm skutečně vyrobených a převezených kusů výtrusového vlákna se u první říše prodalo za **13/kus**, oproti původním11. Tkadlec cest tak prokázal konkrétní smluvní bonus+2, nikoli zpětné přepsání první tržby. Součet tržeb192 a všech plateb dává konečný účet **400−40−260−40+192=252**. `43-inherited-trade-sale.save.json`: **5630e44f06d59874b5585344cf06db7e799cc0600264f09d618e52369b17fd9c**.

V soustavě5 loď osobně prozkoumala relikt průchodu a zaplatila skutečný šestisekundový průlet červí dírou do22 za14energie. Paměť kořenů byla získána na20 a předána mladé společnosti na19. Skutečně zaplacený patronát40 vytvořil servisní sídlo i doporučení: `44-society-supported.save.json`, **5a05248922212851f79dcf67333815426508ce8b46741094a78b70853154e5b6**. Nejde o darované kredity nebo upravený questový stav.

Na orbitě23 následoval osobní kontakt a diplomatický průchod s doporučením serial6. Na povrchu31 loď doletěla k samotnému Srdci světla a převzala Kořen jasu. `45-galactic-core.save.json`: **e33be4a4dd7a342673bfc518340812557c1f2e06b821eeafb5635a4010bdd2b8**. Na pusté planetě24 odměna skutečně spotřebovala **30energie**, ukotvila obě osy klimatu na0 a nevytvořila žádný život ani stabilitu. `46-core-reward-used.save.json`: **77321e8806df7d4c8a9891a7a8cbd05482c7602e1d62b43b6077d53c7e816240**.

Pátý veřejný import hlavní linie a běžné save/reload/load zachovaly získanou odměnu, loď, historii, peníze, cargo a checkpoint. Následoval skutečný let24→22, červí díra22→5 a běžná cesta domů. Úplný domácí stav až do přistání přesně odpovídal druhému odletu; cizí biosféry a kolonie přežily. `47-first-expedition-home.save.json`: **913815dfb6d33238a39a542a75e581ac73a05c75c9835eae23e375544054428f**.

Hra pokračovala třetím odletem: domov→5→červí díra22→24. Znovu navštívená planeta stále měla trvalé klima0/0 a původní uložený doklad odměny. Pak se loď stejnou sítí skutečně vrátila domů. **Konečná hlavní kampaň** `space/49-first-expedition-home.save.json`: **4970920af1b1ac92d6cc6f9bcb92674e87026b197cd4814b3dc47de8deb1dae0**. Generace4, zdraví lodi115, účet252, kolonie vyrobila24/naloženo16/sklad8, osídlený první pás stále18jedinců. Hlavní linie nezemřela, nebyla vrácena checkpointem a neobdržela debug postup.

| Souvislý vesmírný úsek | Simulovaný čas v aktivním vesmíru | Cestovní záznamy | Nové automatické události |
| --- | ---: | ---: | --- |
| První koloniální okruh C | 384,067 s | 22 | 1 pirát, skutečný ústup, bez poškození |
| Mise/výbava/průzkum/jádro/odměna/návrat | 452,900 s | 82 | 0 |
| Další výprava ke změněné planetě a návrat | 129,100 s | 22 | 0 |
| Celkem | **966,067 s** | **126** | **1 pirát, 0 karantén, 0 proher, 0 vynucených návratů** |

Tato linie měla jednu vlastní stabilní kolonii a tři dohody; nevedla válku ani nevlastnila další koupenou soustavu. Samostatně odehrané mírové rozšíření, války, obrana, krize a silová cesta k jádru nadále dokládají D2b/D3b/D3c/D4/D5, s jejich zveřejněným původem. Nový průchod jejich připravenou počáteční historii nepřejmenovává na novou buňku. Četnost událostí platí pro uvedenou konkrétní strategii, nikoli pro každou konfiguraci říše.

Osobně prohlédnuté finální obrazy: tři moduly, společenské sídlo, jádro a Kořen při1024×640, oba návraty domů. Tělo lodi a skutečné modulové prstence/panely zůstaly rozlišitelné. Tři scény sídlo/jádro/Kořen mají po90nativních RAF p95 **16,7ms** bez souběžné testovací zátěže. Žádná runtime browser chyba. Oprava ovladače hvězdné mapy používá stabilní viditelný název soustavy místo pozice řádku, kterou průběžně mění třídění podle vzdálenosti. Neúspěšný pokus zachoval živou kampaň a všechny platby.


## Oprava pozorovaného problému

Ostnatá Jasnozrnka stála u nové zahrady a konzumenti před ní prchali. Původní průvodce doporučoval čekat na příchod, ale vliv vlastního těla nepojmenoval. Po fyzickém odstoupení úkol skutečně skončil. [Průvodce](../../src/ui/journey-guide.ts) nyní u nedokončené vodní pastvy vysvětluje strach z čelisti/ostnů a radí ustoupit14m. Hráče neposílá cílovou šipkou zpět do porostu. Pravidla strachu, potravy, odměny a postup se nemění.

Nová rada byla následně vidět v běžné útesové kampani. [Regrese](../../tests/journey-readability.test.ts) pokrývají obě části, odstup, neozbrojené tělo, dokončení a čistě čtecí výstup. **76/76** čitelnost/prezentace/persistence/útesová smyčka po obou opravách prošlo; `pnpm build` včetně `tsc --noEmit` prošel. Zůstává známé upozornění na velký JS chunk. Celá sada se pro tuto malou prezentační změnu znovu nevydává za spuštěnou.

Průvodce průduchem navíc při skutečně aktivním výstupném proudu radí boční sestup a odběr z okraje. Síla proudu ani pravidla dechu se nemění. Nová regrese rozlišuje živý horní porost, vyčerpaný porost a hluboký kořen. Během této opravy byl nejčerstvější veřejný export znovu beze změny importován: ztracená energie, historie, tělo a checkpoint zůstaly; legitimní druhý rekey.

Opravy ovladače: URL/channel nastavení místo pevného starého serveru, skutečné čekání na cooldown, výběr kategorie Vše a správný select vzoru. První pokusy o objev/editor selhaly v ovladači, na souši byl navíc opraven předpoklad, že T prozkoumá kosti: T správně zvedlo potravu, kosti mají vlastní skutečné tlačítko. Všechny tyto mezikroky zůstaly zachované, pokračovalo se v tomtéž živém stavu. Dlouhé čekání u pastvy bylo neúspěšnou herní strategií, nikoli důkazem softlocku. Neúspěšné operace jsou evidované v `segments.jsonl`.

## Prezentace, výkon a zbývající práce

Snímek souše při1024×640 odhalil, že dvouřadý panel projevů zakrývá tělo. CSS nyní drží čtyři tlačítka v jedné řadě i v této šířce; dvě řady zůstávají pod900px. Dva skutečné UI testy běžných a bojových projevů na přesném odehraném exportu13 v odděleném browseru prošly: tlačítka uvnitř viewportu, panel pod175px, žádná browser chyba. Hlavní pozastavený kmen měl před/po shodný SHA. Oba opravené PNG osobně prohlédnuté, tělo je viditelné. Tato oddělená kontrola layoutu není novým postupem hlavní kampaně. Produkční build/typecheck prošel (`build-r3.log`).

Osobně prohlédnuté: původní buněčný editor a tělo, `cell-complete-1024.png`, zaplacené útesové tělo/editor a `reef-pasture-distance-1024.png`, dále `vent-side-guidance-1024.png` a závěrečný `reef-complete-1024.png`. Editorový CDP klient zpočátku zachytil1024UI uvnitř1536plátna; nastavení viewportu sjednoceno, tento mezisnímek není důkazem rozbitého herního layoutu.

90nativních RAF: buňka p95 **33,4ms**, útes u pastvy **16,7ms**, boční průduch **16,8ms**, dokončený útes **16,7ms**. Bez souběžných testů/buildu, metriky v odpovídajících `*-performance.json`. Jde o krátkou kadenci browseru, nikoli izolovaný GPU benchmark nebo tvrzení o dlouhodobém60fps.

Krátká souš90RAF p95 **16,8ms**; editor v2 a sociální ovládání osobně prohlédnuté. Závěrečný modalový snímek ukazoval horní planetární mapu; není důkazem čitelnosti spodních tlačítek. Ta byla skutečně použitá.

Kmenové výstroje i finální mapa5/5 osobně prohlédnuté;90RAF p95 **16,7 / 16,8ms**.

Nové civilizační alternativy i souvislé D jsou dokončené. [Průřezové technické ověření SP-005/007/017](SP-005-007-017-AD-REPORT.md) je doložené; celá sada4 637testů/205souborů prošla. Nezávislí subagenti jsou stále nedostupní kvůli limitu účtu do3.října; jejich nové review není vykázané. Lidský playtest a poslech čekají podle [konkrétních scénářů A–D](A-D-HUMAN-ACCEPTANCE.md). Úklid vlastních mezivýstupů je evidován manifesty v `evidence/final-campaign/`; starší odkazy v logu neznamenají, že payload stále existuje. Aktivní save, vlastní návrhy, vstupy alternativ a konečné důkazy zůstávají. Žádný commit, push ani deploy.

## Oprava vypnutí běžných zvuků

Závěrečná kontrola `Soundscape.play` odhalila, že nulová hlasitost efektů stále plánovala nenulový konec obálky a běžné noty se po skončení explicitně neodpojovaly. Nová regrese před opravou selhala už na plánování při master0; po minimální opravě prošly všechny4testy společného zvuku, včetně effects0/mute a odpojení každé noty. Původní tóny a hlasitost zapnutých efektů zůstaly zachované.

[Samostatný nativní UI test](../../scripts/final-audio-browser.mjs) na produkci prokázal4kontroly/0browser chyb: effects0, master0 a mute nevytvoří efekt; zapnutý klik skutečně doběhne a odpojí oscilátor i gain. Použil skutečné posuvníky a tlačítko editoru, pasivní pozorování Web Audio, žádné zásahy do herního stavu. První pokus ovladače měl chybnou klávesu E; opraven na skutečné tlačítko, hlavní kampaň byla byte-po-byte zachovaná. Finální snímek nastavení1024×640 osobně prohlédnut. **Poslech tím není ověřen.**

Finální build včetně typechecku prošel: `index-Dhq0xyAo.js`, SHA **acd7caf9f4f2adfd14d95864769503a493dd6b90204838a448dbc40afa8540a0**, CSS zůstává **980fd1d58aa1359bed31cbfe7ca2626cf14e280c04266a2329ffc79e4aa6accf**. Známé upozornění na velký JS chunk trvá. Celá hraná hlavní výprava skončila na předchozím buildu; poslední změna se týká pouze zvuku, kompatibilitu hotového save na finálním buildu ověřuje zvláštní izolovaný průchod.

## Závěrečný stav a úklid

`pnpm exec vitest run --maxWorkers=2 --testTimeout=30000`: **205souborů /4 637testů prošlo**,332,82s,exit0. Zahrnuje historické savey, přenosné knihovny, přechody, uložené doklady a checkpointy. Finální veřejný import/save/reload/load/export v izolovaném browseru prošel5kontrolami bez chyby a zachoval původní hlavní soubor. Doklad `release/result.json` výslovně odděluje72skutečných domácích ticků od importovaného stavu. První příliš přísný assertion nevzal v úvahu běžící strategický čas; export prokázal, že se změnil pouze domácí clock a průběžný výrobní čas kolonie, nikoli výsledky či platby.

**Konečný offline audit57zachovaných exportů prošel**, etapy0–5,0chyb. Zahrnuje poslední export50, oba nové civilizační výsledky a izolovaný finální buildový export. Každý soubor prošel přesným parse/serialize roundtripem, obnovou checkpointu na kopii a ověřením nezměněného zdrojového SHA. Doklad `save-audit.json`; obnovu na kopiích nelze zaměnit za hraný návrat checkpointem.

Před ukončením vlastního testovacího prohlížeče vznikl poslední veřejný export bez opětovného zavření save dialogu. Zachoval i5skutečných domácích ticků, které předchozí exporter odehrál při návratu z dialogu do pauzy. **Aktuální kanonická kampaň** `organism/active-campaign.save.json` je totožná s `space/50-terminal-export.save.json`, SHA **7f357263d7c2666ce0bb545c6313eee3bbb46df2ace92b106efe084f68ee8aa6**. Milník49 zůstává beze změny jako důkaz dokončené výpravy a vstup finálního buildového testu. Tělo, Kořen, účet252 a zdraví115 zachované; žádné přepsání postupu.

Závěrečný manifest `cleanup-final-20260927.json` odstranil35duplicitních/mezních souborů, **6 145 518B**. Kompakce opakovaných kumulativních účetních záznamů ušetřila dalších **1 633 479B**; všechny události, výslovné doklady, finální úplné savey a index původních fází zůstaly. Starší manifesty organismu/civilizace/C jsou také zachované. Trace/video nebyly zapnuté, `.playwright-mcp/traces/` neexistuje. Po úklidu je evidence této finální kampaně přibližně36MiB a na disku přibližně12GiB volno; nejde o volné místo vyhrazené této hře. Ostatní práce a jejich artefakty se nemazaly.

Čeká lidské provedení [sedmi konkrétních scénářů](A-D-HUMAN-ACCEPTANCE.md). Nové nezávislé review agentů není dostupné kvůli limitu účtu; normální vlastní review a jeho meze shrnuje [průřezový report](SP-005-007-017-AD-REPORT.md). Goal není dokončený pouhým zeleným testem. Žádný commit, push ani deploy.
