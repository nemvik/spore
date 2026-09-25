# SP-009.G — obchodní převzetí · smlouva v1

Navazuje na F `f3b67b2bf`. **CityRegistry v7 / States v4**; Military v2,
ekonomika B/C/D, obálka save v3 a generátory 1 zachované. `enableTrade` nejprve
aktivuje F a potom explicitně migruje live i checkpoint před rekey. Zachová
všechny E/F doklady byte významově; státům přidá pouze `tradeReserve:0`.
Neexistují historické vztahy, příjmy, nabídky či prodeje. Parser nemigruje.

## Nabídka a rozhodnutí

Jediná obchodní vazba je výslovná jednorázová kupní smlouva města. Žádný trh,
reputace, procenta pokroku nebo pasivní budování vztahu. Náhled/odmítnutí nejsou
účetním dokladem. Nabídka je odpojený UI návrh; ukládá se až přijatý výsledek.

Živý hráč v etapě 4, při místní návštěvě skutečného státního města, s dosaženou
civilizací a alespoň jedním vlastním původním pramenem. Nutná pevninská cesta
od domova. Žádné hráčské nasazení kdekoli a žádný nedořešený výpad prodávajícího
(příprava, cesta, čekání, boj, obsazování, okupace, ústup i návrat). Vyřešené
zničené/navrácené/vyřazené výpady jsou historie a nebrání obchodu.

Stát s více městy přijme pouze při součtu původní a civilní rezervy ≤40;
solventní stát své území neprodá. **Poslední město prodá pouze při obou rezervách
0**: dobrovolné ukončení územního státu za plnou cenu a příplatek. Jinak odmítne
ztrátu posledního města. Toto omezené rozhodování je přímo odvozené ze současných
rezerv, počtu měst a vojenských závazků, nikoli z náhodného hodu nebo čekání.

Cena = **60 radnice + součet původních cen současných budov + 4 za současného
obyvatele + aktuální pokladna + 60 při posledním městě**. Obyvatelská položka je
cena převzetí civilních závazků, nikoli nový nábor. Jídlo, škody a vzhledy cenu
nenavyšují, stráže ani tanky se nekupují. Finální potvrzení znovu počítá cenu,
podmínky, vlastníka a revizi. Změna hospodářské revize/cyklu, vlastnické historie,
rezerv či počtu měst návrh zneplatní; dostupné peníze se ověří znovu. Zrušení
neplatí. Odchod návrh ruší. Žádný skrytý časový timeout.

## Atomické účetnictví a historie

Jediný plátce `machines.resource`, příjemce `RivalState.tradeReserve` prodávajícího.
Městská pokladna se neodečítá ani nepřevádí do domova: zůstane městu a je zahrnuta
v kupní ceně. Původní `reserve` má stále přesně 400 minus původní rezervní platby.
Nová rovnost: `tradeReserve = součet přijatých kupních cen − civilní převody`.
Civilní účet dovoluje jen stávající převod **20 do vlastního města** při skutečném
nedostatku a vyčerpané původní rezervě, s `StateTransaction.account='trade'`.
Nedovoluje výrobu stráže, výpad, založení ani vyplácení hráče. Bez města je zmrazen.
Limit jednoho placeného výpadu F a jeho původní finanční zdroj se nemění.
Dobrovolně prodané město není důvodem protiútoku; pozdější vojenská ztráta jím být může.

Společné `City.transfers` dostane variantu `method:'trade'`, verzi dokladu 1,
stabilní ID od města a pořadí převodu, from/to, strategický tah, úplný snapshot
hospodářství, cenu, účet plátce/příjemce a jejich zůstatky před/po, rozhodnutí
(počet měst, obě rezervy), zdraví původní stráže a odolnost radnice. F záznamy
zůstávají v původním přesném tvaru; jejich implicitní metoda je bojové obsazení.
Founder → případné capture E → společné pořadí F/G je jediná autorita vlastníka.
Žádná druhá kopie účetního dokladu. Civilní rezervu validátor odvodí z těchto
příjmů a státních výdajových dokladů v časovém pořadí (strategická platba v tahu
předchází následné hráčské kupní smlouvě). Limit 32 převodů/město zůstává.

Po všech kontrolách proběhnou odečet, příjem, vložení dokladu, vlastník a zvýšení
hospodářské revize synchronně bez await. Druhé potvrzení narazí na vlastníka/revizi.
Selhání validace nemění žádnou část financí/historie. Uložení poté ukládá celý stav;
selhání úložiště neprovádí druhou platbu. JSON není kryptografický audit.

## Majetek, boj a pokračování

Pokladna, jídlo, stavby, vzhledy, obyvatelé/ID, původní ceny, účetnictví a místní
čas se zachovají. Poškození radnice se neopraví. Původní stráž je po prodeji
trvale demobilizovaná: zaplacený blueprint, zdraví a doklad zůstávají v historii,
není hráčovou jednotkou, nevykresluje se jako aktivní tank a už nestřílí ani
neblokuje náměstí. Nevzniká vrak falešným snížením zdraví. Ani případné pozdější
bojové převzetí stráž neoživí. Nasazené tanky se neprodávají; jejich přítomnost
nebo nedořešený závazek prodej blokují. Minulé vraky/výpady nemají novou odměnu.

Prodej posledního města znamená porážku státu: další strategické rozhodnutí
odmítne osídlení/výpad i čerpání přijatých peněz. Hráč může hospodařit, vracet se
domů k původním pramenům, navštěvovat ostatní města a pokračovat původními etapami.
Žádný civilizační bonus B2, automatické dokončení etapy nebo nová odměna.
B místní čas, C zmrazení domova a D strategický čas zůstávají. Pauza/editor/
knihovna/globál/skrytý tab stojí. Čekání nevytváří obchodní pokrok, vlastnictví
nebo příjem; původní prameny doma a B výroba nadále pracují svými pravidly.

## Persistence a ověření

Striktní klíče/verze, konečné zůstatky, cena ze snapshotu, účetní rovnosti,
jedinečné ID, příjemce shodný s prodávajícím a souvislý vlastnický řetězec.
Checkpoint musí být společný prefix všech převodů/výdajů, ne budoucí větev.
Obnova nahrazuje celý stav včetně domova, obou rezerv, měst, jednotek a dokladů;
neslučuje ani nevrací peníze zvláštní transakcí. Save limit 8 MiB beze změny.
Historické A–F a původní etapy/B1 zůstávají byte-identické. Skutečná kopie F je
samostatná fixture; původní aktivní soubor se nepřepisuje.

SP-017: vlastník, cena/rozpis, jediný zdroj a příjemce, rozhodnutí/odmítnutí,
explicitní potvrzení/zrušení/výsledek a celá historie; stabilní fokus a nativní
Enter/mezerník, kamera města a scroll při 1024×640. Kritéria a produkční důkazy
určuje [plán v1](../superpowers/plans/2026-09-25-sp-009g-trade.md).
