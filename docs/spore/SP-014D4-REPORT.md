# D4 · relikty, průchod a mladší společnost

**D4 dokončené jako hratelný řez; celé SP-014/SP-015 ani goal tím uzavřené nejsou.** Navazuje na přesný skutečný konec D3c. Smlouva a další závislosti jsou v [plánu D4](../superpowers/plans/2026-09-26-space-discoveries.md); D5 má [samostatný plán](../superpowers/plans/2026-09-26-galactic-core.md).

## Implementace

Dva původní fyzické relikty stojí na5/20. Osobní průzkum prvního odhalí obousměrnou červí díru5↔22 za14 energie a6s skutečného letu. Druhý poskytne poznatky společné dílny pro Kruh prvních světel, přednostně na19. Sídlům lze pomoci skutečným patronátem40 nebo šesti novými placenými skeny místních rolí se stabilním prvním pásem. Výsledný servis opravuje/dobíjí za dosavadní ceny bez přivlastnění planety nebo založení kolonie. Doložené doporučení je zatím připravené pro diplomatickou cestu D5; jeho budoucí použití se netvrdí hotové.

Volitelný registry discoveries1 a účet7 mají explicitní aktivaci zvlášť pro live/CP, permanentní doklady, striktní parser a kontrolu historie. Generator1 a staré lodě, relace, náklad, kolonie, účtenky a světy se nepřepisují. Historická místa chrání allocator, zaplněná galaxie dostane výslovnou enklávu. Modely používají geometrii vytvořenou jednou, reduced-motion a společné uvolnění scény. UI ukazuje signály, souřadnice, cenu, důvod nepřístupnosti a další krok.

## Automatické ověření

- 21 runtime regresí prošlo: obě pomoci, platby/servis, staré čtyři přesné D3c savey, skutečné unit lety oběma směry, pending import/rekey/CP, odmítnutí falešných dokladů.129 reálných vkladů odrolovalo účet patronátu,130 reálných skenů biologický podklad katalogu; permanentní důkazy a CP zůstaly. Připravené unit pozice a jediný předem připravený treasury nejsou native důkazem získání nebo dostupnosti.
- 9 testů prezentace/modelů prošlo po opravě skutečného pořadí inicializace modelu. První běh měl5 pádů modelu na čtení nepřiřazené soustavy a1 neúplný připravený UI vstup bez navštíveného světa. Opraven produkční konstruktor i cílená testová projekce; původní log zachován.
- **Celá sada201 souborů /4587 testů prošla**,355,55s, exit0. Bez vynechání a bez změny timeoutů. Typecheck a produkční build prošly. První build zachytil pouze chybu TS unionu v nové připravené testové projekci; opraven přesný narrowing na živou expedici.
- Build: JS `index-DXmawlLx.js`, SHA256 `284f92402330a3828f2048bed64be87a0082c69ea374fc988aaf78734a8473da`; CSS `index-DynpGrtY.css`, SHA256 `ef6773d15a47104484ec1f987a6cb6de0c7a97d5c3d73382373aa094f4bfd2ca`. Původní upozornění na velikost hlavního chunku přetrvává. Lokální preview ověřeno proti tomuto HTML.

Logy jsou v `evidence/sp-014d4/`. Main provedl integrační kontrolu runtime/účtu/CP/modelů. Další nezávislé agentreview blokuje explicitní limit jejich účtu; nevydává se za provedené. Dosavadní široký nezávislý audit je zaznamenaný v plánu.

## Hrané ověření a zbývající přijetí

Driver `scripts/space-discoveries-browser.mjs` používá jen skutečné veřejné ovládání, import/export a read-only textovou telemetrii, bez setterů, debug času a upravených payloadů.

- Hlavní cesta vyšla z byte-identického D3c exportu SHA `3acb977ae01fc9be5192207cefeb9d0e1ee96ab2ca406405a5cc99f94797a5c1`. Osobně prozkoumala relikty5/20, přeletěla5→22 červí dírou za14 se skutečným exportem/importem před koncem6s letu, doletěla ke společnosti19 a předala paměť. Následoval patronát40, skutečná oprava16 odolnosti za5, další import a návrat22→5→domov. **45 přechodů,3 veřejné rekey, účet308→263, zdraví99→115,0 browser chyb, exit0.** Původní lodní návrh, zaplacené vybavení, domácí stav do skutečného přistání, neaktivní světy, živý náklad a kolonie zachované.
- Samostatná alternativa vyšla z přesného veřejného `shared-workshop.save.json` před volbou. Šest **nových skutečných placených** skenů a stabilní místní ekosystém dokončily ekologickou pomoc, bez patronátu. Skutečná oprava5, import a návrat domů: **10 přechodů,1 rekey, účet303, zdraví115,0 browser chyb, exit0**. Hlavní soubor zůstal byte-identický.
- První main pokus selhal v driveru: pořadí řádků mapy bylo ještě z předchozího HUD snímku, po přerovnání kliklo na sousední platný cíl5 místo očekávaného4. Hra0chyb; compact failure/log zachovány. Oprava čeká na skutečný veřejný HUD po příletu, hledá sémantický řádek a kliká konkrétní `data-action`. Úspěšný druhý běh začal z původního skutečného D3c, nikoli upraveného recovery.
- Hlavní D4 trvala238,3833 aktivních ekonomických sekund, alternativa od odbočení77,6s. V obou **0 nových automatických otevření,0 vynucených návratů,1 dobrovolné domácí přistání**. Původní1 karanténa/1obnova/1pirát/1výhra z D3c zůstaly. Nová výprava vezla0 nákladu a neměla nový zdroj pirátského kandidáta. Společně s D3c397,4333s/2 automatickými událostmi dokládá prostor pro expedici i reakci na správu říše; není to dlouhý soak ani nová celá kampaň.
- Reprezentativní sídlo90RAF: **p50/p95 16,7ms, max16,8ms**. Čtyři skutečné páry orbit→povrch→orbit měly253→1098/1099→253 geometrií,0textur,22programů; žádná retence. Měření proběhlo bez souběžného buildu/testů.

Main osobně prohlédl původní5PNG a potom2 opravené. Portál byl v prvním snímku částečně za levým HUD; posunul se do volného středu obrazu. Finální build **`index-CmJ932je.js`**, SHA256 `82371283cdf3f79945730cf3a8b5c98934379d368d7c641c02832c6fc45692a2`, CSS beze změny. Po tomto čistě prezentačním posunu prošlo9 model/UI +8 nových exact-fixture testů, typecheck/build a veřejné panelové replay2/2/0chyb/exit0. Snímky jasně ukazují celý portál s konkrétním cílem/cenou a skutečné rozvinuté sídlo s nabídkou servisu. Hlavní/alternativní nativní průchody jsou na výše uvedenémDXmawlLx; finální modelový posun nepozměnil jejich stav nebo datovou smlouvu.

Aktivní kampaň: `evidence/sp-014d4/browser/active-campaign.save.json`, SHA **`c62b896de2e54ff1123f04e13877cf0cf32e9a864bd7781812c71bddb34e1da9`**. Samostatná ekologická: SHA `e67596f4add14be415af88f8f67ad08c7f7a58e41d9cffdf0563cf1eb2be0049`. Čtyři byte-identické fixtures a jejich původ jsou v `tests/fixtures/space/D4-README.md`; všech8 regresí prošlo, včetně původního CP před koupí lodi.

Úklid s manifestem `evidence/sp-014d4/artifact-cleanup.json` odstranil3 465 984B vlastních chybných/mezipokusových exportů, přebytečné screenshoty a plný duplicitní failure payload. Zachovány zdroje, fixtures, aktivní a alternativní kampaň, potřebné replay/odbočovací exporty, kompaktní výsledky/logy a4 prohlédnuté finálníPNG. `.playwright-mcp/traces` neexistuje, trace/video/ZIP nebyly vytvořeny, prohlížeče zavřené,16,09GiB volno. Žádná cizí data odstraněna nebyla. `git diff --check` a syntaxe obou driverů prošly.

Čekající lidské přijetí: bez znalosti souřadnic z testu najít oba signály, doletět k modelům a projít červí dírou; pochopit cenu a rozdíl dvou forem pomoci; rozpoznat rozvoj modelu sídla; poslechnout potvrzení průzkumu a servisu. Automatická kontrola není lidský playtest ani poslech. Souvislá nová buňka→jádro a použití odměny/návrat nejsou tímto řezem doložené. Goal zůstává aktivní A–D, E je odložené; bez commitu/pushe/deploye.
