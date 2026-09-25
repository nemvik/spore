# SP-009.H — konverzní shromáždění · smlouva v1

Výchozí `55e8f4ad1`. **CityRegistry v8**, povinné `City.conversion={version:1,
events:[]}`. States v4, Military v2, ekonomika, HomePlanet/generátory a obálka v3
zůstávají. `enableConversion` nejprve aktivuje G, potom migruje live i checkpoint
před rekey. Opakování nemění ani checkpointový string. Parser nemigruje.
Historická města dostanou pouze prázdný deník, žádnou víru/vztah/jednotku/příjem.

## Aktivní mechanismus a odpor

Obřady Souznění jsou místní cesta civilních shromáždění. Hráč musí fyzicky
navštívit původní terénní stanoviště (pořadí 0,1,2, potom opět 0,1) a do 3
místních jednotek zvolit odpověď na námitku odpůrců. Měření E není obřad.
Každý pokus stojí **20 domácího jantaru**, bez ohledu na úspěch. Čekání,
návštěva, kamera, nabídka či zrušení potvrzení nemění konverzní postup.

Tři volby: **Sdílení** odpovídá nouzi; **Smíření** odmítá násilí;
**Paměť** zachovává místní tradici/svébytnost. Situační pravidla:
na stanovišti 0 nedostatek jídla pro současné obyvatele vyžaduje Sdílení,
jinak Paměť; na 1 živá původní stráž vyžaduje Smíření, jinak Sdílení;
na 2 poslední město vyžaduje Paměť, jinak Smíření.
UI ukazuje námitku i význam odpovědí před zaplacením.
Správná volba přidá pečeť. Chybnou odpůrci odmítnou, spotřeba zůstává a
ztratí se jedna dřívější pečeť (nejméně 0); další cíl odpovídá novému postupu.
Nejde o odečet jídla, výrobu zásob, léčení nebo nákup souhlasu vlády.

Potřeba = **3 + 1 za poslední město + 1 při součtu obou rezerv >40**,
tedy 3–5 pečetí. Změna situace mění tuto potřebu, nevyrábí/neruší pečeti.
Dokončení je samostatný závěrečný obřad za **20** do 6 jednotek od náměstí.
Bezchybný průchod stojí 80/100/120 podle odporu. Náklady dřívějších neúspěchů
nebo výslovného vzdání se se nevracejí.

## Dostupnost, zachování a souběh

Živá linie v etapě 4 s dokončeným kmenem, vlastní původní pramen, pevninská
trasa, místní návštěva současného státního města s nejméně jedním obyvatelem.
Žádné hráčské nasazení kdekoli ani nedořešený výpad vlastníka (včetně přípravy,
přepravy, čekání, střetu, obsazování, okupace, ústupu a návratu).
Tyto závazky, odchod, globál či jiná etapa přeruší dostupnost; získané pečeti
zůstávají a po odstranění příčiny lze pokračovat. Pauza/editor/knihovna/skrytý
tab nemají konverzní update. B/C/D běží výhradně původními hodinami, bez catch-up.

Postup platí jen pro konkrétní **epoch = počet dosavadních společných převodů**
a současného státního vlastníka. Změna vlastníka obchodem či bojem ho nevratně
zneplatní i při návratu stejného státu. Účetní události zůstávají. Výslovné
vzdání se v místním klidu připojí nulovou událost a resetuje pečeti. Žádná vratka.
Dopředu nelze nakoupit pečeti nad současnou potřebu.

Obchod a konverze nesmějí spotřebovat tentýž zastaralý příkaz. Nabídka G ve v8
zahrnuje délku konverzního deníku; jakýkoli provedený obřad ji zneplatní.
Konverzní příkaz obsahuje owner/epoch, délku deníku, cityCommandRevision,
počet měst a obě rezervy, počet obyvatel/jídlo, zdraví stráže a fortification.
Před platbou se celý token znovu odvodí a porovná. Obyčejný neplacený UI náhled
není uložený zámek. Dokončený obchod změní epoch; dokončená konverze změní
owner/epoch/revizi a starou nabídku G odmítne. Vojenské závazky mají vždy přednost.
Jeden stát smí v jednom strategickém tahu dokončit nejvýše jeden mírový převod
G/H. Další čeká na původní aktivní 10s tah; nevzniká nový časovač. Tím jsou
finální snapshoty počtu měst a rezerv jednoznačné i při rychlém přepínání cílů.

## Jediná účetní autorita a historie

Deník nejvýše 64 událostí/město. Událost v1 nese monotónní ID, epoch, ownerId,
strategický tah, druh rite/renounce/complete, odpověď nebo null, situační snapshot,
místní pozici, pečeti před/po a `payment={source:'home',use:'consumed',amount,
before,after}`. Částka 20 pro rite/complete, 0 pro renounce. Každá platba má
`after=before-amount>=0`; nikdo ji nepřijímá. Nejde o převod do pokladny ani
civilního účtu G. Výsledný postup se odvozuje z událostí, není další autorita.

Společný `City.transfers` přidává variantu `method:'conversion',version:1`,
ID z pořadí převodu, from/to, turn, úplný snapshot ekonomiky, ID závěrečné
události, součet skutečné spotřeby této epochy, zdraví stráže a fortification.
Platba je pouze v odkazované události, nikoli ve druhé kopii. Dokončení po všech
kontrolách synchronně odečte cenu, vloží událost/doklad, změní owner a zvýší
hospodářskou revision. Bez await; druhé dokončení nemá oprávnění.
Founder → původní capture E → všechny F/G/H je jediný řetězec. Limity 32 převodů,
64 detailů a 8 MiB save zůstávají. Parser ověřuje účetnictví, pořadí/epoch,
polohy u správných míst, dosažené pečeti, situační odpor a vazbu complete↔transfer.
Snapshoty musí odpovídat doloženému založení a státním transakcím: rezervy,
historicky možný počet měst, stráž a populace (páry původních příchodů, po změně
vlastníka předchozí úplný převod). Jídlo odpovídá rozsahu místní ekonomiky;
závěrečný snapshot přesně odpovídá hospodářství v převodním dokladu.
Při 63 událostech lze zaplatit pouze hotové dokončení; nedokončená větev už
nepřijímá další obřad. Vyčerpané limity nejsou obnovitelná měna.
Checkpointové události a převody jsou přesný prefix; obnova nahrazuje celou větev
včetně postupu, peněz, vlastníků, jednotek a dokladů. Singleplayer JSON není
kryptografický důkaz proti přepsání celé kampaně.

Pokladna/jídlo, obyvatelé/ID, stavby/vzhledy, zaplacené ceny a škody zůstanou.
Původní stráž je trvale demobilizovaná jako v G; její konstrukce, zaplacený doklad
a uložené zdraví se nepřepisují. Nevzniká tank, vrak ze živé stráže, léčení,
odměna ani B2. Všechny původní tanky/vraky zůstávají. Náboženské přijetí civilní
správy stejně jako prodej samo nezakládá cíl výpadu F; pozdější bojová ztráta ano.
Poslední město může přejít i od státu se zbytkovou rezervou: pečeť svébytnosti
je dražší o jeden obřad, vláda nemá obchodní veto. Poražený stát poté své obě
rezervy zmrazí a neosídluje/neútočí. Domov, prameny, hospodaření a další hra trvají.

SP-017: cíl/vlastník, námitka, cena/zdroj/spotřeba, aktuální místo a postup,
přerušení/odmítnutí/výsledek, historie, potvrzení/zrušení, stabilní fokus,
klávesnice, původní kamera a posuvný panel 1024×640. Celé mateřské karty otevřené.
