**Audit podoby LUMAVORY se Spore — 17. září 2026**

Největší posun přinese propracovaný editor a život vlastního druhu, skutečná civilizace s městy a následně vesmírná expanze. Existující kampaň má šest funkčních etap, ale jejich pravidla jsou z velké části vlastní ekologickou hrou. Počet etap proto sám nevystihuje podobnost se Spore.

Audit vychází z revize `4da58b6`, zdrojového kódu, nového spuštění testů a buildu, krátkého ověření produkční hry v prohlížeči a dohledaných podkladů o Spore. Herní implementace ani referenční testovací vstupy se při auditu neměnily. Níže uvedené priority a podmínky dokončení jsou doporučení pro další vývoj.

**Jaký Spore je referencí**

Vydané Spore má pět hlavních fází: buňku, tvora, kmen, civilizaci a vesmír. Důležitou součástí jsou editory tvorů, vozidel, budov a kosmických lodí. [Oficiální přehled Spore](https://www.spore.com/what/spore).

Terraformace je činnost uvnitř vesmírné fáze. Ukončení LUMAVORY u obyvatelné domácí krajiny tedy vynechává velkou část pozdějšího Spore. Samostatná fáze mnohobuněčného podvodního tvora do vydané hry nepatřila; náš útes může zůstat volitelným rozšířením, jeho další rozšiřování však není nejvyšší prioritou věrnosti. [Terraformace ve Spore](https://spore.fandom.com/wiki/Terraforming), [oficiální FAQ o prostředí jednotlivých fází](https://www.spore.com/comm/faq2).

Galactic Adventures přidává výsadky kapitána na planety, jeho postup a editor dobrodružství. Je vhodnou další vrstvou po vesmírné hře. [Oficiální popis Galactic Adventures](https://www.spore.com/what/ga).

Původní [GAME_BRIEF.md](../GAME_BRIEF.md) záměrně upřednostňoval vlastní ekologickou odyseu. [Návrh rozšíření z 15. září](superpowers/specs/2026-09-15-lumavora-machine-era-design.md) pak určil konec u terraformace. Současný požadavek posouvá prioritu k maximální podobnosti se Spore a výslovně otevírá pokračování. Historické záhlaví návrhu „nic z toho není implementováno“ už nepopisuje dnešní kód.

**Co skutečně máme**

| Oblast | Implementováno | Co omezuje podobnost |
| --- | --- | --- |
| Průchod kampaní | Mikrosvět → útes → souš → kmen → stroje → terraformace. Přímé ovládání těla se mění na řízení skupin a pak stroje. | Pozdější etapy sdílejí stejnou pobřežní krajinu. Chybí přechod od lokálního prostředí k celé planetě a galaxii. |
| Editor organismu | 21 funkčních adaptací, polohy a velikosti částí, symetrie, přímý výběr a přesouvání orgánů, rozpočet DNA, undo/redo, barvy a vzory. Sedm článků těla má vlastní šířku, výšku a ohyb. Model a parametry vycházejí ze stejného genomu. | Chybí editovatelné řetězce kloubů, samostatné ruce/chodidla a širší nabídka tvarů a sociálních orgánů. Sedm článků není plná volnost páteře a končetin. |
| Mikrosvět | Potrava, lov, obranné části, reprodukce, ekologické úkoly a průchod do dalšího prostředí. | Hlavní smyčku nových linií tvoří řešení konkrétních ekologických situací. Chybí výrazné růstové skoky a změny měřítka kořisti i predátorů a sbírání nových částí jako samostatná odměna. |
| Útes a souš | Proudění, dýchání, pohyb podle těla, vláha, přenos potravy a kultur, skuteční konzumenti, lov, symbióza a tři pobřežní závěry. | Chybí hlavní sociální smyčka tvora: vztahy mezi druhy, hnízda, napodobování schopností, rozvoj inteligence a běžná smečka. Současná symbióza má jinou úlohu. |
| Druhy a prostředí | 10 definovaných druhů, devět základních tvarů NPC, seedované populace a tři světy s autorsky určenými místy. | Ostatní tvorové obecně nevznikají ze stejného genomového editoru jako hráč. Nový seed nepřináší nový katalog druhů a libovolně odlišný kontinent. |
| Kmen | Potomci dědí tělo a jídelníček. Symbionti se stávají členy. Sběr s dopravou potravy, stavby, výběr skupin, fronty rozkazů, limit 12 členů, koš/oštěp/buben/měch, tři sousedé, spojenectví i dobytí. | Sousedé mají vztah, zdraví a místní odvetu, ale nemají samostatné tlupy se stejnou ekonomikou a výpravami. Chybí širší kulturní hra a editor oblečení. |
| Stroje | Editor s devíti druhy dílů, tank a letoun, vliv konstrukce na cenu a výkon, jantarové prameny, nejvýše osm strojů, tři regiony, opravy a vyřazování. | Chybí městská ekonomika, vlastní budovy, lodě, soupeřící státy a jejich armády. Region je jednoduchý neutrální nebo hráčův cíl. |
| Strategie a historie | Přenáší se genom, události, ekologické kontakty a pobřežní závěr. Kmen má zděděnou schopnost a stroje zděděný archetyp. | Archetyp strojů vychází z pobřežního závěru přes `legacyAbility`. Způsob vyřešení kmene jej nepřepočítává. Současné obnova/boj/migrace neodpovídají plné nabídce vojenské, ekonomické a náboženské civilizace. |
| Terraformace | Přímé řízení zděděného stroje, vrt a rozsévač, dvě klimatické osy, T0–T3, tři lokality, katalog skutečných kontaktů, školka, živé potravní řetězce a regrese klimatu. T3 musí vydržet 30 simulačních sekund s vypnutými nástroji. | Druhá osa se hráči prezentuje jako vláha. Každá lokalita vyžaduje 2 kultury + 2 býložravce + 1 lovce. Není zde samostatná simulace více planet, kolonií ani jejich ekonomiky. |
| Ukládání a sandbox | Více linií, verzované uložené hry, validace importu, export JSON, checkpointy a pokračování po finále. | Export celé uložené hry nenahrazuje knihovnu samostatných výtvorů použitelných v dalších světech. |
| Vesmír a dobrodružství | Datový model ani hratelný obsah zatím nejsou implementovány. | Chybí kosmická loď, soustavy, průzkum, kolonie, galaktické říše, obchod, vesmírné mise i kapitán. |

Podklady v kódu: [genom](../src/game/genome.ts), [tvar těla](../src/game/body-shape.ts), [katalog druhů](../src/game/content.ts), [odlišné modely NPC](../src/render/organism.ts), [mapování etap na světy](../src/game/stage.ts), [kmen](../src/game/tribe.ts), [sousední kmeny](../src/game/tribe-neighbours.ts), [konstrukce strojů](../src/game/blueprint.ts), [stroje](../src/game/machines.ts), [terraformace](../src/game/planet.ts), [stav pozdějších etap](../src/game/era-types.ts) a [planetární rozhraní](../src/ui/planet.ts). Současnou variabilitu těla dokládá také [verzované srovnání pěti siluet](body-editor/README.md).

**Výsledek nového ověření**

| Kontrola | Výsledek a meze |
| --- | --- |
| Celá sada `pnpm test` | 100 souborů: 98 prošlo, 2 selhaly. Z 1 956 testů prošlo 1 954. |
| Samostatné zopakování neúspěšných souborů | Stejná dvě selhání při jednom workeru; 6 dalších testů v těchto souborech prošlo. |
| Typecheck a produkční build | Přímé příkazy nad lokálními závislostmi prošly. Vite upozorňuje na JS soubor o velikosti přibližně 975 kB, gzip 291 kB. |
| Produkční browser kontrola | Nová linie a skutečný pohyb organismu; vstup do kmene z připraveného pobřeží; načtení hotových strojů; přechod klávesou G do terraformace; načtení stabilního T3 sandboxu. Čtyři milníkové snímky, žádný trace, 0 konzolových chyb. Čtyři WebGL upozornění se týkala `ReadPixels`. |
| Rozsah tvrzení o hratelnosti | Pozdější scény byly načteny běžným importem existujících fixtures. Nebyla znovu odehrána celá kampaň ani všechny strategie. Starší úplný průchod 15 min 59,35 s simulace je historický výsledek popsaný v benchmarku, nikoli nové měření této revize nebo první lidské hraní. |

Selhání [obstacle-contact-regression.test.ts](../tests/obstacle-contact-regression.test.ts) nastalo na řádku 89: při přehrání zaznamenaného průchodu jeden úsek vykázal jeden nehybný tick místo očekávané nuly. Předchozí kontroly pohybu přes 10 m a stoupání přes 5 m prošly. Samotný tento výsledek nedokazuje dlouhodobé zaseknutí hry.

V [step-phases.test.ts](../tests/step-phases.test.ts) se neshodovaly přesné referenční otisky stavu/průběhu simulace. Příčina nebyla tímto auditem určena; bez dalšího porovnání nelze rozhodnout mezi změnou chování, zastaralou referencí a vlivem prostředí. Testy ani jejich očekávání se nepřepisovaly. Ověřováno na Linuxu s Node 24.15.0.

Lokální spouštěč `pnpm build` jednou selhal na otevření databáze svého prostředí. Ekvivalent `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vite/bin/vite.js build` prošel. Skript `test:production` nebylo možné spustit kvůli chybějícímu připnutému Chromium; následovala výše popsaná kontrola dostupným prohlížečem přes Playwright. Při automatickém kliknutí na přechod strojů se opakovaně měnil DOM tlačítka, takže vypršel timeout; běžná klávesa G přechod provedla. Tato kontrola není vydávána za úspěšný běh původního browser skriptu.

Kompaktní lokální důkazy: [souhrn ověření](../evidence/spore-audit-2026-09-17/verification.json), [mikrosvět](../evidence/spore-audit-2026-09-17/01-micro.jpg), [kmen](../evidence/spore-audit-2026-09-17/02-tribe.jpg), [stroje](../evidence/spore-audit-2026-09-17/03-machines.jpg), [terraformace](../evidence/spore-audit-2026-09-17/04-planet.jpg). Adresář `evidence/` je lokální; tabulky a závěry tohoto dokumentu zůstávají čitelné i bez něj. Dostupné místo před ověřováním bylo přibližně 249 GB. Historické důkazy a uložené hry se neodstraňovaly.

**Doporučené změny v pořadí přínosu a návazností**

1. **Nejprve vyjasnit dvě testové odchylky.** Zachytit první rozdílný tick a rozdílná pole stavu, porovnat prostředí s poslední doloženou referencí a rozhodnout, zda je potřeba opravit simulaci nebo zdůvodněně obnovit očekávání. Hotovo znamená vysvětlenou příčinu a opakovatelnou kontrolu; pouhé přegenerování hashů nestačí.

2. **Rozšířit editor na skutečný editor tvora.** Navázat na sedm existujících článků: přidat volnější páteř, upravitelné klouby končetin, ruce, chodidla, více úst a výraznější povrch těla. Zpětná vazba má ukazovat, co tělo umí při chůzi, skoku, útoku a komunikaci. První cíl: vytvořit věrohodně odlišného dvounožce, čtyřnožce a dlouhokrkého tvora, kteří fungují i v krajině. Další modely a ozdoby mají smysl po této konstrukční volnosti. Původní editor Spore dovoloval manipulovat páteří i klouby. [Manuál Spore, tištěné strany 18–21](https://shared.steamstatic.com/store_item_assets/steam/apps/17390/manuals/manual.pdf?t=1642702281).

3. **Vybudovat plnou tvorovou fázi na souši.** Doplnit hnízda vlastního i cizích druhů, vztah k celému druhu, sociální a bojový režim, smečku a růst inteligence. Sociální nabídka má zahrnout zpěv, tanec, okouzlení a pózu, boj odlišné kousnutí, výpad, úder a plivnutí. Úspěch by měl odemykat DNA, nové části a další možnosti soužití. Hráč musí umět postoupit cestou přátelství, predace i jejich kombinací. Ekologická obnova může zůstat hodnotnou vedlejší cestou. Tyto kategorie schopností používá i oficiální rozdělení tvorů ve Spore. [Archetypy tvorů](https://www.spore.com/comm/tutorials/archetypes).

4. **Přidat objevování částí a zážitky vlastního druhu.** Oddělit získané DNA od objeveného katalogu částí. Odměňovat průzkum kosterních pozůstatků a významná setkání; přidat hnízdní migraci, novou generaci a vzácné silné jedince. Smečka má pomáhat viditelnými akcemi, včetně sociálních setkání. Hotovo znamená, že během jedné výpravy hráč objeví něco, kvůli čemu se dobrovolně vrátí do editoru. Hnízda, migrace, přátelství a smečka jsou popsané v [manuálu Spore, strany 34–36](https://shared.steamstatic.com/store_item_assets/steam/apps/17390/manuals/manual.pdf?t=1642702281).

5. **Sjednotit katalog tvorů a přidat vlastní Sporepedii.** Ukládat jednotlivé výtvory nezávisle na kampani; umožnit jejich náhled, úpravu a import/export. Ostatní druhy vybírat z téhož formátu genomu podle jídelníčku, schopností a role v prostředí. Připravit pestrou místní knihovnu a generovat platné varianty. Hráč má v nové linii potkat i svůj starší výtvor. Později stejný princip rozšířit na budovy, vozidla a lodě. Spore využívá tvorbu hráčů k osazování jejich samostatných světů. [Oficiální FAQ o sdílených výtvorech](https://www.spore.com/comm/faq2).

6. **Přiblížit mikrosvět buněčné fázi.** Přidat několik čitelných růstových skoků s odtažením kamery: bývalý predátor se může změnit v dostupnou kořist. Zdůraznit střet konkrétních orgánů, sběr částí a čitelné volby potravy. První fáze má rychle učit smyčku „sním → vyrostu → objevím část → přestavím se“. Nové ekologické úkoly ji nemají překrýt. Růst, potravu a získávání částí ukazuje [manuál Spore, strany 30–31](https://shared.steamstatic.com/store_item_assets/steam/apps/17390/manuals/manual.pdf?t=1642702281).

7. **Odvozovat další fáze z celé historie.** Zachovat existující dědictví těla, ale doplnit výsledky každé etapy: jídelníček, společenské chování, řešení sousedních kmenů a styl civilizační expanze. Z nich skládat bonusy a pozdější filozofii říše. Podstatná oprava současného směru: mírumilovné sjednocení kmene a jeho násilné dobytí mají mít odlišný následek i při stejném pobřežním závěru. Přenos důsledků mezi fázemi potvrzuje [oficiální FAQ](https://www.spore.com/comm/faq2).

8. **Rozvinout kmen jako společnost s aktivními sousedy.** Přidat skutečné jednotky jiných kmenů, jejich sběr, nájezdy, krádeže jídla, obranu a obnovu. Hudební setkání má vyžadovat volbu nástrojů, ne pouze čekání na růst vztahu. Doplnit kulturní výstroj, domestikaci a viditelného náčelníka. Až potom zvýšit počet sousedů ze tří směrem k pěti známým ze Spore. Hotovo znamená, že lze reagovat na samostatnou iniciativu souseda a dohrát fázi diplomacií i bojem. [Průchod kmenovou fází Spore](https://www.gamespot.com/articles/spore-walkthrough/1100-6198224/).

9. **Přestavět Stroje na plnou Civilizaci.** Přidat města s obyvateli, výrobou a spokojeností, rozmisťování domů/továren/zábavy/obrany a editor vzhledu budov. Soupeři potřebují vlastní ekonomiku, vozidla a územní rozhodování. Koření nebo odpovídající surovina má financovat expanzi. Vojenské dobytí, obchodní převzetí a náboženská konverze mají být různé funkční systémy. Vedle tanků a letadel přidat námořní vozidla a vodní zdroje. Městské rozvržení a převzetí měst popisuje [manuál Spore, strany 27–29 a 44–45](https://shared.steamstatic.com/store_item_assets/steam/apps/17390/manuals/manual.pdf?t=1642702281); kategorie budov a vozidel uvádí [oficiální katalog archetypů](https://www.spore.com/comm/tutorials/archetypes).

10. **Změnit měřítko na celou planetu.** Přidat kontinenty, moře, biomy a síť měst. Kamera má umět přechod od jednotlivce či města ke globálnímu přehledu. Hráč musí poznat, že rodné místo je část většího světa. Současná malá mapa pobřeží nemůže tuto roli plnit jen změnou popisku. Planeta a trvalé údaje o jejích lokalitách jsou zároveň nutným základem vesmíru.

11. **Otevřít vesmír s jednou ovládanou kosmickou lodí.** Přidat editor lodi, start z domácí planety, oběžnou dráhu, soustavu a hvězdnou mapu. Základní smyčka: odletět, navštívit jiný svět, něco zjistit nebo získat a vrátit se. Postupně doplnit skenování, nákladový prostor, sběr organismů, energii, zdraví a vybavení. První hratelný úsek má spojit domovskou a cizí soustavu; dlouhodobým cílem je velká rozšiřitelná galaxie. Ve Spore hráč řídí vlastní loď a spojenci mohou doplnit její doprovod. [Oficiální FAQ](https://www.spore.com/comm/faq2).

12. **Převést terraformaci na opakovatelnou práci na různých planetách.** Recyklovat současné T-skóre, katalog kontaktů a živé řetězce. Doplnit odlišné výchozí podmínky, skutečnou atmosférickou osu, nástroje pro oba směry změny a přenášení života mezi světy. Pro bližší shodu má každá úroveň nabídnout tři velikosti rostlin, dva býložravce a jednoho predátora; dnešní dvě kultury jsou zjednodušení. Oddělit klimatickou stabilitu, úplnost ekosystému a možnosti osídlení. Změna světa musí být vidět i po odletu a návratu. [Terraformace ve Spore](https://spore.fandom.com/wiki/Terraforming).

13. **Dodat kolonizaci, obchod a mimozemské říše.** Kolonie mají vyrábět suroviny, poskytovat opravy a tvořit strategickou síť. Přidat odlišně hodnotné typy koření, rozdílné nákupní ceny, obchodní trasy a možnost koupě soustavy. Mimozemské říše potřebují území, osobnost, vztahy, mise a dohody. Tím získá terraformace hospodářský i diplomatický důvod. Hotovo znamená udržitelnou mírovou cestu k růstu říše a alternativu vojenské expanze. Tyto vazby popisuje [manuál Spore, strany 50–51](https://shared.steamstatic.com/store_item_assets/steam/apps/17390/manuals/manual.pdf?t=1642702281).

14. **Přidat otevřenou pozdní vesmírnou hru.** Doplňovat odznaky a odemykání vybavení, průzkumné a diplomatické mise, pirátské útoky, obranu kolonií, ekologické krize, vzácné artefakty, mezihvězdné zkratky a podporu vývoje mladších civilizací. Události mají vytvářet volby mezi výpravou, obchodem a péčí o říši. Frekvenci krizí ověřovat hraním, aby se expedice nezměnila v trvalé objíždění oprav. Pro inspiraci těmito systémy slouží [přehled vesmírné fáze Spore](https://spore.fandom.com/wiki/Space_Stage).

15. **Vytvořit dlouhodobý cíl v jádru galaxie.** Přidat nebezpečnou mocnost odpovídající herní roli Groxů, postup k jádru, výrazné setkání a odměnu s planetárním účinkem. Spore zde nabízí Staff of Life. Přístup k cíli by měl umožnit více strategií a následné pokračování v galaxii; úplné vyhlazení nepřátelské říše nemá být povinnou podmínkou návštěvy jádra. [Přehled pozdní hry Spore](https://en.wikipedia.org/wiki/Spore_(2008_video_game)).

16. **Poté přidat kapitána podle Galactic Adventures.** Umožnit vystoupit z lodi v těle vlastního druhu, plnit planetární úkoly, získávat výstroj a zlepšovat kapitána. Nejprve vytvořit několik rozmanitých autorských misí; následně editor s postavami, cíli, dialogy a událostmi, který stejné mise umí vytvořit. Tato vrstva opět využije investici do editoru, animací, tvorové fáze a knihovny obsahu. [Oficiální Galactic Adventures](https://www.spore.com/what/ga).

17. **Výtvarný projev a čitelnost zlepšovat s každým milníkem.** Aktuální hra má klidnou paletu, jednoduchou vegetaci a rozměrné textové panely. Pro požadovaný dojem doporučuji výraznější siluety a výrazy tvorů, měkčí organické povrchy, čitelné sociální animace, zvukovou osobnost druhů, pestřejší krajinu a kompaktnější ikonové ovládání. Zmenšit opakované vysvětlování v panelech a více ukazovat vztahy přímo ve světě. Přechody mezi érami mají předvést novou schopnost linie: první krok, nástroje, město a odlet. Jde o návrhový úsudek z prohlédnutých scén, nikoli měřenou preferenci hráčů.

**Jak z toho udělat proveditelný postup**

| Milník | Konkrétní výsledek | Na co navazuje |
| --- | --- | --- |
| A — tvor, na kterém hráči záleží | Rozšířený editor, knihovna druhů, hnízda, smečka, sociální i bojový průchod a získávání částí. Přitom upravit začátek buněčné fáze a zpřehlednit ovládání. | Existující genom, animace, svět, ukládání. |
| B — společnost a celá planeta | Aktivní sousední kmeny, výstroj, důsledky minulých voleb, městská ekonomika, soupeřící státy a pozemní/námořní/letecká expanze. | Výsledek A, dnešní výběr jednotek, fronty rozkazů a editor strojů. |
| C — první úplný vesmírný okruh | Vlastní loď odletí do cizí soustavy, přiveze život, upraví cizí planetu, založí kolonii, prodá její produkci a vrátí se domů. | Planetární model z B a dnešní terraformace. |
| D — galaxie s dlouhodobými cíli | Více říší, mise, technologie, diplomacie, války, průzkum, artefakty a cesta k jádru. | Fungující ekonomický a cestovní okruh C. |
| E — planetární dobrodružství | Hratelný kapitán a následně editor misí. | Tvorová hra z A a vesmír z C/D. |

**Doporučený nejbližší ucelený úkol:** vybudovat milník A. Hráč upraví vlastního tvora, opustí hnízdo, získá novou část, spřátelí se s jiným druhem, přibere člena smečky a projde alternativním bojovým řešením. Ověřit dvě odlišná těla a oba způsoby postupu běžným hraním včetně uložené hry. To přímo prověří, zda hra začíná poskytovat hledaný zážitek ze Spore.

Pokud by se nejdříve přidal pouze další planetární úkol, získali bychom více současné hry. Pokud by se začalo rovnou rozsáhlou galaxií, vyřešili bychom konec kampaně, zatímco tvorové a civilizace by zůstali mělké. Výše uvedené pořadí zvyšuje podobnost průběžně a umožňuje znovu používat hotové systémy.

Pro vesmír bude nutné oddělit identitu planety a její trvalý stav od aktuálně zobrazené scény. Dnešní `worlds` je trojice a `worldStageFor()` směruje všechny pozdější etapy na pobřeží. Stejně tak katalog života pracuje s pevně známými druhy a lokalitami. Změny ukládání a katalogu proto patří k planetárnímu milníku; nestačí přidat číslo další etapy a obrazovku s hvězdami. Rozšíření nevyžaduje preventivní přepis celé hry nebo výměnu Three.js.

Nezávislý playtest po každém větším milníku má posuzovat chuť experimentovat s editorem, srozumitelnost dalšího cíle, rozdílnost strategií a důvod pokračovat. Delší čekání, větší ceny a delší přesuny samy tyto vlastnosti nezlepší. Počet automatických testů měří jinou věc než zážitek.

Online sdílení výtvorů lze doplnit později. Reálný multiplayer má pro tento cíl nižší prioritu: původní Spore je singleplayer a sdílí především výtvory osazované umělou inteligencí. Nejprve tedy dává smysl dobrá místní knihovna a přenositelné výtvory. [Oficiální vysvětlení sdílení](https://www.spore.com/comm/faq2).

**Práce se zdroji:** hlavním podkladem byl originální manuál EA/Maxis dostupný z produktové stránky Steamu a oficiální stránky Spore. Podrobnosti o terraformaci a otevřené vesmírné hře doplňují výše odkazované komunitní přehledy; k některým byl dostupný pouze indexovaný text vyhledávače. Návrhy rozsahu milníků a podmínky dokončení jsou autorským doporučením pro tento projekt. Není zde stanoveno neověřené procento podobnosti ani slib termínu dokončení.
