# C3 · terraformace, živé pásy a první kolonie

Navazuje na skutečně odehraný [C2 okruh](../../spore/SP-011C2-REPORT.md). Autoritou zůstávají všechna původní kritéria SP-012/013 a společný [plán C](2026-09-26-first-space-circuit.md). Tento plán není doklad hotové funkce.

## Pořadí a ověřitelné výsledky

1. **C3a — klima a živé pásy:** běžné ovládání čtyř energetických nástrojů mění obě osy klimatu. Hráč přiveze původní život do tří pásů, každý se třemi velikostmi rostlin, dvěma býložravci a predátorem. Skutečná potrava, výživa, zdraví, ztráta populace a odnožování mají následky. Klimatické T, úplnost a stabilní kapacita jsou oddělené. Horká řídká a chladná hustá planeta potřebují opačné zásahy; oba dosažené ekosystémy vydrží s nástroji OFF, odlet i load zachovají stav.
2. **C3b — kolonie a návratný obchod:** stabilní pás dovolí skutečně zaplatit kolonii. Omezená produkce → vyzvednutí do skutečného nákladu → jiný místní trh → prodej a použití výdělku na další výpravu. Vlastní kolonie opravuje/dobíjí loď. Vyšší stabilní pásy zvyšují kapacitu; ekologický rozpad omezí výrobu/osídlení, nikoli vymaže zaplacenou historii. Žádné zdarma doplněné kredity. Říše, války a širší diplomacie jsou navazující D.

Každý řez má unit/save/render regrese, nezávislé review, typecheck/build a skutečné produkční hraní. Připravené pozice ve fixture testech nejsou důkaz dosažitelnosti. Pro konec C je nutný celý společný okruh; dílčí body nejsou důvodem přejmenovat celý milník na hotový.

## Evoluce dat bez ztráty C2

- Parser stávající expedice v1 zachová přesnou C2 větev a její přísnou konzervaci36 původních ID. Výslovná idempotentní aktivace expedice v2 převede live i checkpoint; nesmí změnit exempláře, zdraví/výživu, modely, doklady, návštěvy, klima ani domácí větev. Přidá prázdnou demografickou historii, vypnutý nástroj a pásové přiřazení existujících obyvatel. Samotné načtení souboru nic neodsimuluje.
- Původní zakladatelé zůstanou buď živí, v nákladu, nebo mají trvalý záznam úmrtí. Potomek dostane nové monotonní ID v namespace původu modelu a ekologické role, skutečného rodiče, rodiště a čas narození. Modelový původ není rodiště: odnož na původně pusté planetě nadále používá původní uložený genom.
- Pro každý původ/roli platí `6 zakladatelů + narození − úmrtí = živí ve všech světech + náklad`. Ukládat čítače a nejvýše36 zakladatelských úmrtí na zdroj; neukládat každého mrtvého potomka navždy. Živá populace je omezená96 na planetu a náklad konstrukcí. Vývoj galaxie nesmí skončit jen kvůli dosažení limitu historických odnoží.
- Sken, odběr, vysazení, narození a úmrtí potřebují společné pořadí akcí, protože více změn může mít totožný čas. V2 zachová posledních128 akcí i monotonní kumulativní čítače. Z v1 se přesně odvodí placené počty: při `A = nextAction−1`, `E = energySpent` je počet přenosů `E−A` a počet skenů `2A−E`. Ve v2 zůstane přesný účet `E = skeny + 2×přenosy`; biologické události mají nulovou lodní cenu a nesmějí zlevnit minulé účty.
- Úplný zachovaný suffix od checkpointu dovolí ověřit rodiče, skutečné přesuny, narození a úmrtí ve správném pořadí. Po odrolování se kontrolují kumulativní meze, bilance, původ přeživších a zachovaná historie; bounded log není tvrzení, že lze rekonstruovat celou genealogii bez checkpointu. Změna verze nesmí jen obecně povolit chybějící C2 ID.
- Tři pásy přiřazují konkrétní obyvatele do šesti rolí. Při vysazování je cílový pás viditelný a měnitelný. Stejný exemplář nemůže zároveň plnit více pásů. Rodící populace nezabírá neomezené místo; při nedostatku zdrojů se rozvoj zpomalí a ztráta posledního člena vyžaduje dovoz skutečného života.

## Klima a ekologie

- Původní teplota a atmosféra jsou již uložené z C2. Klimatické T0–T3 se počítá z obou os. Čtyři nástroje mění po jedné ose oběma směry a odečítají skutečnou energii pouze při účinném aktivním zásahu. Pauza, odlet a neaktivní planeta neprodukují skryté účinky; při zahájení letu se nástroj vypne. Vyčerpaná loď může stále doletět a solárně dobít podle C1.
- Nekopírovat domácí dolet potravy bez pohybu: C2 genomy a fyzické rozmístění by tak mohly ihned vyhladovět dosud zdravý zdroj. Pro první cizí ekosystém je zdrojem potravy konkrétní kompatibilní populace stejného pásu; skutečná spotřeba mění její stav. Animace ukazuje krmení/reakce, nepředstírá další uložené organismy.
- Rostliny vytvářejí skutečnou biomasu, býložravci spotřebovávají kompatibilní produkci podle uloženého genomu a predátor skutečnou kořist. `crest` může mít v genomové dietě i detritus; nouzové krmení se nesmí vydávat za predátorskou službu stabilnímu pásu. Chybějící rostliny/potrava zhorší výživu, zdraví a nakonec počet jedinců. Obnova populace má skutečného živého rodiče a spotřebu, nikoli kopii z pouhé znalosti skeneru.
- Stabilní pás vyžaduje klimatickou způsobilost, všechny role, životaschopnou výživu a potravní vazby. Stabilní kapacita osídlení vychází ze souvisle udržených pásů. Změna klimatu, půdy, vegetace a životaschopnosti musí být patrná v krajině i kompaktním panelu; samotný zelený odznak není ověření ekologické funkce.

## Hospodářství C3b

Samostatný verzovaný vesmírný účet se otevře prázdný; jeho počáteční prostředky musí hráč převést ze skutečného domácího zdroje u dílny nebo vydělat. Záznam uchová obě strany převodu. Kolonie, stavba, zásoby, přeprava, tržní prodej, oprava a doplnění mají konkrétní ceny a atomické doklady. Místní surovina a cena jsou deterministické pro adresu planety; nabídka ukazuje aktuální důvod i skutečnou částku. Úplný checkpoint obnoví celou větev, nikoli refundaci jedné platby.

## Reference a vlastnictví práce

26. září byl znovu hledán odkazovaný manuál a terraformační reference. Oficiální PDF skončilo timeoutem; přímá komunitní stránka v předchozím pokusu402. Aktuální vyhledávací výpis [SporeWiki](https://spore.fandom.com/wiki/Terraforming) podporuje rozlišení klimatického T a šesti ekologických rolí. Přesná čísla nebo pravidla nepřístupného manuálu se nepředstírají jako přečtená. Konkrétní ceny, rychlosti a původní ekologie LUMAVORY se řídí přijatými kritérii a vlastními měřeními.

Main vlastní architekturu, migraci, produkci a integraci. Agent pro testy smí upravovat jen jasně přidělené nové testy/fixtures, browser agent jen vlastní driver/evidenci a review agent pracuje readonly. Neběží těžké testy během finálního RAF měření. Lidské porozumění, poslech a delší komfort mají konkrétní čekající scénáře; neblokují nezávislou další implementaci.

## První integrovaný řez C3a1

Klima mění teplotu/atmosféru rychlostí0,03/s a stojí2 energie/s pouze za skutečně dosaženou změnu. Solární obnova funguje podle konstrukce C1; konečný stav energie je nezáporný i při zaokrouhlení. Osy jsou−1 až1 a klimatické kruhy mají poloměry1 /0,65 /0,3. Překročení meze, vyčerpání energie nebo úspěšný odlet vypnou nástroj, včetně okamžitého vyčerpání při skenu/odběru před dalším framem. OFF nezpůsobuje další změny. Ekologický drift a stabilizační zpětná vazba přijdou až s C3a2.

V2 přidává původní klima a čtyři kumulativní účinné zásahy ke každé planetě. Součet práce je omezen skutečným aktivním časem a dohromady s původním klimatem přesně vysvětluje uložené osy. U nákladu/obyvatel přibude pás a prázdná ekologická metadata. Pás zakladatele je stabilně odvozen z jeho původního čísla, nikoli z aktuálního pořadí po odběru; migrace checkpointu a live tedy nepřehází přeživší. Nové vysazení zaznamená vybraný pás v placeném dokladu. V2 closed-prefix se porovnává celý včetně tohoto údaje; historický C2 validator dostává pouze čtenou projekci bez nových metadat.

Přesná hranice starých a nových akcí je `activatedAction`, nikoli samotný timestamp. Starý checkpoint se aktivuje nad vlastním uloženým časem a pořadím, které mohou být starší než live. Odpovídající aktivační výjimka dovolí jen nutné rozdíly počátečních časů/pořadí u ještě nezpracovaného checkpointu; původní klimatická baseline zůstane neměnná i zde. Předchozí invalidní bypass baseline má negativní regresi. Narození, úmrtí, drift a nenulová ekologická metadata jsou v tomto prvním řezu výslovně odmítané, dokud navazující simulace nedodá jejich skutečný účet.

UI přidává graf obou os, čtyři nástroje a OFF, skutečně obsazené role všech tří pásů a volbu pásu vysazení. Povrch, atmosféra a glóbus se mění ze stejného uloženého klimatu bez nových WebGL alokací při každém zásahu. Navštívená planeta v mapě ukazuje aktuální T a obě osy; původní profil se zobrazuje jen před návštěvou. Části potrava/reprodukce/stabilita/kolonie zůstávají dalšími závislostmi, tento řez se nevydává za celé C3 nebo SP-012.

## Navazující řez C3a2 · konkrétní smlouva

Expedice zůstane v2. Její vnořená biosféra dostane explicitně aktivovanou verzi2 s `ecology: { activatedAt, activatedAction }`; každá již navštívená planeta získá `ecologyElapsed` ze svého skutečného uloženého času. Aktivace live a staršího checkpointu proběhne nezávisle a idempotentně. Nezmění původní klima, klimatickou práci, starší aktivační hodnoty ani exempláře. Parser zachová přesné větve expedicev1, expedicev2/biosférav1 a nová biosférav2. Staré klimatické fixtures tak nadále ověřují přesné původní snapshoty. Nová větev nesmí použít projekci do C2 k povolení ztrát nebo změn zdraví.

Fyziologie běží jen na aktivním povrchu v běžném simulačním kroku. Zdravý zdroj má rezervu růstu rostlin a obnovy kořisti; tato rovnováha se ověří skutečným dlouhodobějším unit během, ne pouze výpočtem. Narození převezme originální model, skutečný pás a rodiče; zaplatí rodičem0,2 výživy a5 zdraví. Každý kandidát znovu atomicky ověří živého rodiče, limit3 stejné role/pásu a celkových96. Potomek začíná zdravím70/výživou0,45. Nemá automaticky placený sken. Odnožování rostlin40s, zvířat60s; čas se plní jen při vhodném klimatu, zdraví≥75, výživě≥0,7 a u predátora nedávném skutečném lovu.

Doklady narození i úmrtí nesou pás; narození také rodiče, úmrtí příčinu. Nový odběr zaznamená zdrojový pás. To dovolí fyzicky přehrát rodiče i po jeho pozdějším úmrtí a přesunu při shodných timestampech. Vratné přehrání nesmí zaměnit cílový pás vysazení za předchozí pás v nákladu. Kumulativní počty narození/úmrtí podle původu a role spolu s platbami vysvětlují společné pořadí akcí.

Paměť skeneru trvale zachová skenované zakladatele, dále všechny živé/naložené jedince a ID zmíněná v posledních128 akcích. Nepoužívaný sken dávno mrtvého potomka se po odrolování odstraní; placené kumulativní počty neklesnou. Znalost modelu zůstává u původní planety. Validator i checkpoint připustí pouze toto odvozené odstranění, nikoli ztrátu skenu živého nákladu. Počet mrtvých generací nesmí neomezeně zvětšovat save.

Pás se stabilizuje po10 souvislých aktivních sekundách vhodného klimatu, všech šesti živých rolí, zdraví/výživy a skutečné dostupné potravy podle genomů; predátor musí skutečně nedávno lovit. Kapacita vychází ze souvislých stabilních pásů1→3. Při ztrátě role je daný čas ihned0; stabilita není jen přítomnost zelených ikon. Bez jediného stabilního pásu se klima pomalu vrací k původnímu stavu, nejvýše0,0004/s na každé ose; účinný posun je zaznamenaný v driftu. Alespoň jeden stabilní pás tento návrat zastaví. OFF neznamená vypnutí života. Plný ekosystém obou odlišných planet musí vydržet OFF, export/import a skutečný odlet/návrat.
