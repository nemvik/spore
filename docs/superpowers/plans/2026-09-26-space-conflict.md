# D3 · skutečný boj, prohra, válka a krize

**D2b, D3a a D3b dokončené; D3c události jsou integrované a ověřují se.** [Průběžný report D3a](../../spore/SP-014D3A-REPORT.md). Historický audit níže vysvětluje původní závislosti; hotovou válku/obranu dokládá [D3b report](../../spore/SP-013D3B-REPORT.md), nynější krize [D3c report](../../spore/SP-014D3C-REPORT.md). Navazuje na [otevřenou galaxii](2026-09-26-open-galaxy.md), původní kritéria SP-011/SP-013/SP-014 se nemění. Hlavní vlákno vlastní architekturu, datové smlouvy a integraci; samostatné testy/review/native mají oddělené vlastníky.

## Pořadí ověřitelných výsledků

1. Ovládaná vlastní loď skutečně bojuje: viditelný protivník a zbraň, dosah, energie, kadence, poškození, manévr a ústup. Výhra i prohra mají uložený výsledek. Po prohře lze pokračovat stejnou kampaní; běžně získané prostředky financují skutečnou opravu. Doložit i zdraví/servis, které mírové C/D2 průchody nemohly prakticky vyzkoušet.
2. Diplomacie umožní vědomé vyhlášení války, vojenské převzetí území, obranu a mír s konkrétními následky. Obchodní D1 doklady, původní kapitály, zaplacené title a allied účtenky zůstanou neměnné. Efektivní vlastnictví se rozšíří doloženým výsledkem boje, nikoli přepisem staré historie. Zakládání kolonií musí zachovat skutečné pořadí získání území→placená kolonie i po odrolování.
3. Pirátské nájezdy, obrana kolonií a ekologické krize vznikají z konkrétního uloženého stavu. Hráč dostane viditelnou možnost reagovat/ustoupit a následky přetrvají. Žádné náhodné přepadení při samotném importu; žádná simulace všech neaktivních biosfér. Měřit skutečnou četnost přerušení delší expedice a obnovitelné financování mírové i vojenské cesty.

Každý uzavřený hratelný řez má přesné regresní/CP testy, produkční UI důkaz, prohlédnuté snímky a report. Jediný boj s pirátem neuzavírá válku, obranu ani všechny krize.

## Konkrétní omezení současného kódu

Nezávislý read-only audit z26.září:

- `validateSpace` odmítá health0 s nenulovou location, ale `stepSpace` a `changeSpaceScale` samy zdraví lodi nekontrolují. Prosté přidání damage→0 by dovolilo pohyb neuložitelného vraku. Je nutný výslovný uložitelný terminální stav a konzistentní blokace běžných příkazů.
- Vesmírná větev `main.tick` vrací řízení před obecným `switchMode('death')`. Obecná smrt a desetisekundová ochrana se týkají těla. Poškození kosmické lodi proto nemá bezdůvodně zabít domácího tvora ani měnit zmrazený domácí snapshot.
- `recoverGeneration` vrací celý starý checkpoint, neprovádí lodní servis. Běžné nákupy/odlet/autosave nevytvářejí nový generační checkpoint; používání obecné obnovy jako jediného řešení by mohlo zahodit celou vesmírnou část. Obnova vraku musí mít vlastní skutečnou herní cestu a zachovat aktuální kampaň.
- Log dnes dovoluje sousední měřítka, mezihvězdný `system→system` a domácí `surface→dock`. Nouzový návrat není podporovaný. Pokud záchrana mění adresu, potřebuje vlastní doložený přechod/provenienci a CP pravidla; nelze jen nastavit `location=null`. Původní `ship-1`, blueprint a kupní doklad zůstanou stejné.
- Domácí ekonomika dovoluje pouze vklad/prodej. Servis potřebuje vlastní kolonii a živou loď. Doma dnes vrak nejde opravit, vypustit ani nahradit. Opravu v domácí dílně je nutné rozšířit společně s účetní a reverzní validací, případně výslovným herním záchranným plněním. Nedostatek peněz nesmí vytvořit nevratný softlock.
- Nulová energie sama softlock netvoří: normální pohyb pokračuje a každá konstrukce má vlastní klidový solár. Zachovat tento doložený ústupový základ.
- `stepSpace` posune space čas před `stepSpaceEconomy`. Nastavení smrti hráče v témže kroku by zastavilo ekonomiku a rozbilo přesnou rovnici času. Terminální rámec musí zůstat účetně konzistentní.
- D2b nyní chrání stejný nepřerušený přechod přesným zdravím/energií lodi i celým spojencem; nový boj v tomto přechodu nemá probíhat. Nulový čas a kladné přírůstky energie se opírají o skutečné skeny/solár/dobíjení/předání. Nové zbraně, poškození a obnova vyžadují vlastní účetní důkazy, ne povolení libovolné změny těchto hodnot.

## Auditní rozhodnutí před implementací D3

Konkrétní model nepřítele/útoku a časové meze; původ a četnost setkání; permanentní versus omezené bojové důkazy; přesný stav vraku, cenu a účinek záchrany, domácí servis a jeho dostupnost i při prázdném účtu; rozšíření vlastnictví a kolonijního povolení; diplomatické následky včetně zaplaceného spojence, jehož říše se dostane do války. Nové explicitní verze nesmějí přepsat staré v1–v4 ekonomické ceny, moduly, záchrannou či válečnou historii, která dosud neexistuje.

Native bude navazovat na skutečný dokončený D2b export; připravené bojové fixtures ověří extrémy samostatně. Celá nová linie až k jádru, použití odměny a návrat zůstávají závěrečnou samostatnou podmínkou. Dobrodružství jsou nově na přání uživatele odložené volitelné pokračování.

## Uzavřený řez D3a · obranný pulz a přežitelná prohra

D3a přidá opakovatelné vědomé prověření pirátského signálu na cizí orbitě. Signál vychází ze skutečné polohy; jeho otevření není náhodný útok při načtení. Po výsledku je společná prodleva90 vesmírných sekund, aby šlo souvisle pokračovat. Automatické nájezdy/koloniální obrana/ekologické krize a válka zůstávají D3b/c, nebudou tímto označeny za hotové.

- Vlastní kabina má obranný pulz: dosah24, cena3 energie, kadence0,65s, zásah12. Jedno tlačítko nebo mezerník míří na jedinou viditelnou pirátskou loď v dosahu; neprovádí pohyb. Aktuální úspěšný zásah má uložený čas i oba konce paprsku. Pirát má60 odolnosti, letí rychlostí8 k odstupu12 a střílí po1,8s za8 v dosahu18. Skutečným pohybem lze uniknout dosahu. Přechod do soustavy nebo sestup ukončí boj ústupem teprve po úspěšném zahájení existujícího placeného letu. V průběhu přechodu se nebojuje.
- Prohra zanechá loď s0 odolnosti na stejné adrese a s původním nákladem. Tělo ani domácí svět neumírají. Vraku jsou zakázané běžné pohyby, skeny, obchod i přechody. Samostatná výslovná nouzová oprava ze záchranné kabiny potřebuje12 skutečných sekund; zachová polohu, náklad, účty, kupní doklad, kolonii a dědictví, vrátí25 odolnosti (nejvýše maximum) a nepřidá energii. Nevrací generační checkpoint a nikam neteleportuje. Servis40 za5 nad vlastní kolonií zůstává skutečnou levnou cestou k plné odolnosti. Záchrana nevyžaduje peníze. Případný historický0-health dock se bude výslovně řešit při aktivaci/validaci; nesmí dostat automatické vyléčení.
- Nová volitelná `space.combat` v1 se aktivuje explicitně po D2b, samostatně i v checkpointu. Původní ekonomika zůstává v4, nevznikají fiktivní staré odměny, poškození nebo nové doklady příjmů. D3a výhra zaznamená vyčištění signálu a odklad dalšího; finanční odměny a území jsou až smlouvou války/událostí.
- Aktivace uchová vlastní časový cut, tehdejší odolnost (nebo null před stavbou) a dosavadní servis. Posledních32 střetů má identitu, čas/cuty/adresu, skutečnou počáteční odolnost/servis, fyzického nepřítele, počty zásahů, konkrétní poslední paprsky a výsledek. Starší dokončené střety se sečtou do omezeného archivu (výsledky, střely, přijaté poškození, skutečně obnovené zdraví, poslední konec). Aktivní střet ani neopravený vrak nelze odrolovat. Zdraví je přesně aktivace + pozdější placený servis − skutečné bojové poškození + dokončená nouzová obnova. Energie zohlední skutečné střely v nulovém čase i CP horním limitu; existující pravidlo úplného klidu uvnitř letu se zachová.
- Validace bude ověřovat uzavřená schémata, monotónní sekvence a časy, dosažitelné adresy/cuty, dosahy/pohyb/kadenci, přesný účinek zásahů a výsledků, návaznost posledního boje na polohu/let a přesný vrak/záchranu. Obnovení dokončeného CP zachová starší výsledky; živý CP v boji nebo opravě smí pokračovat pouze dopředu. Globální zdravotní rovnice i omezená historie musí fungovat po odrolování.
- Výrazný pirát má úhlový tmavý trup, červené segmenty a klepeta; krátké skutečné paprsky a zvuk úderu/pulzu, čitelný cíl a odolnost. Vraku odpoví zhaslé motory a záchranný prstenec. UI zobrazuje cenu/dosah, jasný ústup a čas záchrany. Modely a paprsky se nevytvářejí po snímcích; respektují omezený pohyb a mají disposal/rollback test.

### Ověřitelné dokončení D3a

Jednotkové testy: aktivace starých saveů, vítězství, mimo dosah/bez energie/kadence, manévr a oba ústupy, prohra→uložení→import/rekey→12s obnova→skutečně placený servis; nula peněz; pending let a zmrazený domov/život; CP tampering a rolování; historie D2b beze změn. Samostatné prezentační testy a nezávislé review. Native naváže na přesný D2b export: vyhraje, ustoupí i prohraje, uloží vrak a rozpracovanou záchranu, pokračuje běžnými RAF, doletí k vlastní kolonii a zaplatí servis, nakonec se vrátí domů. Read-only pozorování je povolené, živé settery/debug čas nikoli. Změřit výkon a disposal, osobně prohlédnout kompaktní snímky, aktualizovat tracker/report bez uzavření zbylých válek a událostí.

### Zpřesnění po nezávislém review

Historický health0 dock dostane pouze explicitní větev `legacyRescue`, žádný falešný pirátský výsledek. Jeho i lodní obnova měří existující `economy.elapsed`, který běží z běžného planetárního času doma a z běžného vesmírného času mimo domov. `stepShipRescue` běží až po skutečném ekonomickém kroku v obou větvích. Aktivace uchovává také skutečný ekonomický čas; parser nic neaktivuje. Baseline null zůstává jen před stavbou, CP s nenulovou známou baseline nedovolí ji dodatečně vydávat za představební.

Archiv rozlišuje počet zásahů a skutečně odečtenou odolnost: druhá prohra z25 končí čtyřmi zásahy, ale pouze25 poškozením. Čas a poslední konce paprsků dokazují poslední dosah, účty a vůči CP dosažitelný pohyb/kadenci. Nejde o úplný replay každé minulé střely. Odrolování musí zahrnout přesně známé uzavřené řádky z CP; nepozorovaný zbytek je omezený souhrnnými účty a časem.

### Cílený audit závislostí D3b

Nezávislý audit po integraci D3a potvrdil: ztracená kolonie musí zůstat v účtech (ID, založení, stock/cargo/sales, modulové a diplomatické doklady), zatímco její výrobu, load, upgrade, repair/charge a montáž modulu musí podmiňovat skutečné vlastnictví. Válečné vlastnictví má přednost před původním paid title a existencí kolonie; nesmí přepsat původní kapitál/vyslanectví ani kolonijní povolení. Nové vojenské založení potřebuje vlastní důkaz získání→založení.

Pro válku se musí výslovně určit protistrana trhu na dobytém/koupeném světě: `empireAt` je diplomatická kotva, `ownerAt` skutečný vlastník. Nové nabídky lze omezit, historické D1 `priceBasis`/treaty/mission zůstanou přesné. Zaplacený spojenec ve válce nezmizí z účtu; zachová ID/baterii/kumulativní energii a dostane doložené pozastavení i návrat po míru bez nové baterie12. CP posuzuje skutečný čas vyhlášení/míru, nikoli pouze současný příznak. Konkrétní datová smlouva D3b se uzavře před její implementací po D3a native; tento audit ještě není hotová válka.

Konkrétní navazující [D3b smlouva války a obrany](2026-09-26-space-war.md) prošla nezávislým review. Hratelná integrace i nativní hlavní/spojenecká větev jsou hotové; přesné výsledky a meze vede [D3b report](../../spore/SP-013D3B-REPORT.md). Navazuje D3c.
