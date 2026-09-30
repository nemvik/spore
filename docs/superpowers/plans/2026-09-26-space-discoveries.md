# D4 · relikty, červí díra a pomoc mladší společnosti

Navazuje na dokončení D3c; **D4 dokončené a doložené [finálním reportem](../../spore/SP-014D4-REPORT.md)**. Hlavní i ekologická skutečná cesta, regresní/fixture/model testy, full4587, finální typecheck/build a čitelná prezentace prošly. Přijaté SP-014 a SP-007.D se nemění; jádro/doporučení D5 a závěrečná celá nová kampaň dále otevřené. Main vlastní architekturu/integraci; další nezávislé review blokoval limit účtu subagentů a nebylo vydáváno za provedené. Milník E je odložený podle aktuálního BRIEF.

## Ověřitelný hratelný výsledek

Hráč fyzicky prozkoumá dva různé relikty. První zpřístupní skutečný obousměrný průchod červí dírou, který překoná běžný dosah vlastní lodi. Druhý poskytne poznatky, které může osobně předat mladší společnosti. Ta se postupně změní a po skutečné pomoci poskytne placený lodní servis bez hráčovy kolonie a doložené diplomatické doporučení pro navazující cestu k jádru. Nejde jen o nový text vztahu nebo již existující trh.

Relikty jsou průzkum na místě, nikoli fyzicky odvezený náklad. UI je nesmí vydávat za předměty v nákladovém prostoru. Zkoumání vyžaduje živou loď, skutečný povrch, přiblížení ke konkrétnímu modelu do6 a výšku do8. Každý výsledek se zapíše jednou a přežije odlet/import. Samotná starší návštěva objev nevytváří.

## Obsah a souvislá cesta

- **Průchodový relikt** na původním světě5 „Měděná ulita“ odhalí dvojici5↔22. Jejich vzdálenost přibližně60 převyšuje i placený dosah32. Červí díra je viditelná v měřítku soustavy, má jasný cílový konec a vlastní příkaz u místního majáku.
- **Paměťový relikt** na světě20 „Mělké slunce“ předá znalost obnovy a spolupráce, použitelnou u nové mladší společnosti. Jde o jiné těleso a jiný praktický výsledek než průchodová navigace.
- **Mladší společnost** přednostně na živém světě19 „Safírový mech“. První kontakt z ní neudělá novou plnou válečnou říši. Osobní předání skutečně objevené paměti otevře společnou dílnu; druhá konkrétní pomoc ji rozvine na servisní sídlo. Viditelný model i nabídky se změní podle doložených stupňů.
- Hráč zvolí jednu cestu druhé pomoci: **patronát** zaplatí40 z reálné lodní pokladny, nebo **ekologické vedení** vyžaduje šest nových skutečných placených skenů místních ekologických rolí po přijetí a stabilní první pás při osobním odevzdání. V zaniklém historickém biotopu zůstává dostupný patronát; ekologická cesta může skutečný život dovézt. Výsledek obou cest je plnohodnotná spolupráce, ne odlišná velikost kosmetického vztahu.

Pomoc neposkytne hotovost ani náklad, nezaloží hráčovu kolonii a nepřebere planetu. Servis bude mít dosavadní ceny/účinek oprava až40 za5 a energie až60 za3; příslušné nové účtenky výslovně doloží právo službu použít. Doporučení se skutečně uplatní v D5 diplomatické cestě; samo o sobě ještě neuzavírá cíl jádra ani SP-007.D.

## Kompatibilita a datové hranice před editací

1. **Generator1 se nemění.** Všechny32 adresy, souřadnice, profily, ceny, původní modely a navštívené světy zůstanou. Relikty a navigace jsou překryv metadat. Relikty mohou stát i na historicky navštívené planetě bez regenerace obsahu.
2. Mladší sídlo se při explicitní aktivaci vybere jednotně pro live/CP z vhodných živých světů mimo domov a budoucí vnitřní oblast. Sjednocené původní kolonie a kapitály zůstanou chráněné; preferovaný19 se posune na nejbližší volnou vhodnou adresu. Pokud jsou všechny vhodné světy obsazené, diplomatické sídlo zůstane výslovnou enklávou bez přepsání majetku. Konkrétní allocator a konflikt pozdějšího vlastnictví se uzavřou před runtime.
3. Nová optional verzovaná `space.discoveries` má vlastní aktivační řez live/CP a konečné permanentní doklady dvou reliktů, kontaktu, předání paměti, přijatého druhu pomoci a výsledku. Nepotřebuje další obecný128akční archiv. Doklady nové ekologické pomoci se zachytí při skutečné akci, aby je pozdější odrolování biologického logu nesmazalo. Parser nic neobjevuje, neplatí a nerozvíjí.
4. Červí díra použije existující `SpaceLeg` a běžnou6s simulaci letu. Cena navržená14 energie se platí při přijetí, stejně jako běžný skok. Nová explicitní značka způsobu letu a revize objevu rozliší pending leg i dokončený cestovní doklad. Historické leg/logy zachovají přesný tvar a běžný dosah/cenu; import v polovině červí díry nedoplní energii ani nepřeskočí zbytek. Doprovod, cargo, domácí stasis a následné běžné přistání používají dosavadní cestovní mechanismus. Rozšíření travel/biosphere/CP validací se nejprve cíleně zmapuje.
5. Patronát dostane vlastní permanentní doklad a explicitní účetní kategorii v ekonomice7. Nesmí předstírat prodej, vklad nebo koupi území. Staré receipt tvary zůstanou stejné. Nový servis bez kolonie potřebuje historický podklad oprávnění, nikoli výjimku podle dnešního stavu společnosti; reverse účetnictví a CP se rozšíří společně. Službu zablokuje skutečné nepřátelské vlastnictví/embargo, ne hráčova ekologická karanténa na jiné kolonii.
6. Pro druhou cestu jsou nové skeny skutečně placené existujícím nástrojem. Dřívější skeny, minulé dohody nebo návštěvy se nezapočtou. Volba pomoci a její odměna musí být idempotentní a odmítat vzdálené/zastaralé příkazy. Změna cílové planety, kolonijního vlastnictví či diplomatické aktivity nesmí dát bezplatnou druhou odměnu.
7. Nové obrazové modely používají jednorázovou alokaci, skutečný lokální pokrok, reduced-motion a disposal. Mapa jasně rozliší běžný skok a průchod; kompaktní místní panel ukáže cenu, požadavek a další krok. Zvuk jen při skutečné změně.

## Ověření a závislost D5

Jednotkové regrese: historická aktivace bez grantu, obě pomoci, revidované/zastaralé doklady, nepřístupné/obsazené/enklávové adresy, průchod oběma směry a rozpracovaný CP, source-log rollover, skutečné platby/služby, přesná stará ekonomika a náklad. Nezávislé review kontraktu před editací a finálního propojení před native; typecheck/build/relevantní celá sada.

Native naváže na přesný hotový D3c export. Skutečný průzkum5→červí díra22 (uložení/import uprostřed)→relikt20→společnost19→první pomoc→skutečně použitý servis→obousměrný návrat/domov. Druhou pomoc ověřit z veřejného předchozího exportu, ne změnou živého stavu. Měřit reálné automatické incidenty během delší expedice, počet vynucených návratů, reprezentativní90RAF a návraty scén. Kompaktní snímky osobně prohlédnout, zachovat aktivní kampaň a odstranit mezivýstupy.

D5 musí kontrolovat nové vstupy do celé chráněné vnitřní oblasti včetně červích děr; jediná hlídaná mezilehlá hvězda by šla přeskočit dosahem32. Staré lety, návštěvy i kolonie uvnitř oblasti nesmějí být zpětně neplatné nebo uvězněné. Konkrétní hranice a dvě skutečné strategie (diplomatické doporučení/průchod a omezený boj s hlídkou), odměna s planetárním účinkem a návrat dostanou samostatný plán. D4 tento navazující výsledek pouze připraví; neoznačí jej za splněný.

## Cílený integrační audit před implementací

Nezávislý široký audit agenta proběhl; dodatečné detailní review zastavil limit účtu subagentů. Následující konkrétní body zkontroloval main v aktuálním kódu, nejde o tvrzení dokončeného druhého nezávislého review.

- `space-types.ts` má uzavřený `SpaceLeg` a vnořený typ cestovního řádku. Nový průchod potřebuje volitelný explicitní doklad v obou; `space.ts:record` jej musí převzít před vynulováním dokončeného letu. Běžný skok i přechod měřítka musí zachovat původní přesný JSON.
- `space-validation.ts` jediný kontroluje konkrétní mezihvězdný dosah/cenu6s letu i historický dosah řádku. Pouze doložená dvojice5↔22 smí dostat odlišnou cenu/dosah. Relikt musí předcházet přijetí letu ve všech složkách časového řezu; nový doklad nesmí legalizovat libovolnou vzdálenou dvojici nebo let před objevem.
- `space-expedition-v1-validation.ts`, biosférická projekce a ekologický CP neodvozují vlastní mezihvězdnou cenu. `space-expansion-validation.ts` ověřuje shodu celého pending letu, přesnou konstantní energii/odolnost během něj a `energyPaid` při zahájení v nulovém čase. Tento mechanismus se zachová včetně spojence. Průzkum reliktu proto nyní nemá nový energetický výdaj; placená navigace používá stávající letový účet.
- Trvalé průzkumné svědectví říše i pirátský přílet mají záměrně uzavřené doklady `surface`/`orbit`. Červí díra končí v `system`, tyto dva doklady se nerozšiřují. Teprve následný skutečný sestup může splnit původní misi nebo spustit piráta.
- Nová služba mimo kolonii zasahuje současně `economyQuote`, tvorbu účtenky, její uzavřený tvar, `rewindSpaceEconomy`, úplný součet a CP, plus `validateWarReceipt`, který dnes vždy vyžaduje hráčovo vlastnictví pro repair/charge. Pouhá výjimka v UI či dnešním runtime by vytvořila neuložitelnou hru. Služba společnosti ponese konkrétní permanentní doklad dokončené pomoci a její tehdejší revizi; starý servis dál vyžaduje tehdejší vlastní kolonii.
- Patronát potřebuje oddělený nový receipt/kategorii/count a permanentní kopii ve výsledku pomoci. Příslušný výdaj se odečítá ve všech součtech, reverzním účtu a UI. Při ekologické pomoci vznikne stejný stupeň spolupráce bez peněžního zápisu; pouze původní skutečné scan účtenky.
- Nové sídlo nemění `ownerAt`, generátor ani počet plných říší. Sjednoceně chránit live/CP kolonie a kapitály; vybrat živou adresu mimo vnitřní oblast, preferovat19. Budoucí vlastnictví nesmí přemístit sídlo. Při nepřátelské okupaci zůstane doklad pomoci, služby se pozastaví. Stávající trh každé původně živé planety zůstane bez falešného „odemknutí“.

Praktické pořadí editací: uzavřený discovery model a čistý obsah → místní průzkum a doklady → výslovná navigace a historická validace → skutečná pomoc a ekonomika7/služby → UI/modely → nezávislé nebo výslovně evidované náhradní review → jednotkové/fixture/native důkazy. Dokončení D3c a jeho aktivní save mají přednost před novým produkčním buildem D4.
