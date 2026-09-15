# LUMAVORA — návrh druhého herního průchodu

Stav: historický návrh kvalitativní iterace, následovaný implementací a několika úplnými hráčskými průchody. Aktuální skutečnost a rozdíly jsou v [BENCHMARK_REPORT.md](BENCHMARK_REPORT.md#post-benchmark-game-quality-pass). Níže uvedené časové rozpočty byly návrhové odhady: nejnovější v6b kampaň skončila za9min20,617s simulačního času. Odhady12–30min na etapu se nepotvrdily; nepovažovat je za dosažený ani změřený obsah. Cíl45–90min zůstává nesplněn.

## Problém a měřítko

- Doložený optimalizovaný průchod: 243,083 simulačních sekund. První adaptace po 4,8 s.
- Nové hraní hlavního agenta bez diagnostiky: po 63 aktivních sekundách objeveny všechny tři mikroniky, 12 jídel, 84 DNA, zdraví 100 a energie 98; adaptace nebyla potřebná. Jde o průběžné měření jednoho hráče, nikoli obecnou statistiku.
- Zdroj problému: 45 garantovaných soust u kolébky, odměna za jídlo i při sytosti, libovolné dvě reprodukce jako podmínka, stejné druhy v každé nice a příliš účinné pasivní odrazení lovců.
- Návrhový cíl prvního dokončení zůstává **45–90 minut**. Rozpočet obsahu níže není naměřená délka ani záruka; musí jej potvrdit další hraní bez znalosti souřadnic.
- Rychlejší zkušený průchod je v pořádku. Čas nesmí vytvářet čekání, zvýšené ceny, počty úkonů ani větší prázdná mapa.

## Společný herní motiv

**Linie si hledá domov a přenáší život dál.** Hráč si pamatuje konkrétní místo, které mu nejprve pomohlo a které později změnil. Obnovený zdroj začne hostit jiné tvory; využitá zkratka se stane součástí cesty potomka. Kolébka je místo bezpečí, pozorování těla a rozhodnutí, ne automatická zásobárna postupu.

Každá situace má čtyři kroky: **uvidět příčinu → zvolit postup/tělo → aktivně jej vyzkoušet → pozorovat trvalý následek**. Selhání má být lokální a opravitelné. Hráč nemusí hádat skrytý recept ani správný jediný orgán.

## Omezený rozsah společných rozšíření

1. **Nabídnout a přenést živiny.** Jeden nesený biologický vzorek; žádný inventář ani crafting. Kontextové T vezme vzorek, nabídne jej jako skutečný zdroj pro NPC nebo založí růst na vhodném povrchu. Náhled před akcí ukazuje cíl a důsledek. R zůstává navázáním vztahu.
2. **Živé zdroje a prostředí.** Rozlišit mateřský zdroj a jeho jednotlivé porce. Zdroj má konkrétní podmínky: proud, prostor pro růst, tlak konzumentů a na souši vodu/stín. Stejný odvozený stav řídí vzhled, potravu i průchodnost; obnova není globální přičtení úrodnosti stiskem T.
3. **Čitelné chování a konflikt.** NPC mají místní teritorium a reagují na nabídnutou potravu, úkryt a hrozbu. Lovec oznamuje výpad postojem a zvukem; překážka či manévr útok přeruší. Ostny odrazují a zraňují, nezakazují lovci vybrat hráče navždy.
4. **Pokrok z následků.** Stávající DNA, genom, populace a zdroje zůstávají. První významný ekologický výsledek přinese evoluční poznatek a DNA; opakování téhož zdroje nepřináší další poznatek. Deník zaznamenává důkaz, ale pravdivost živých podmínek se odvozuje ze světa.

Nezavádět univerzální quest engine, další etapu, obchod, bojový arzenál ani mnoho nových druhů. Devět situací je konkrétní obsah nad těmito společnými pravidly.

## Mikrosvět — najít způsob života

Zaměření: čitelné malé prostředí, první zranitelnost, volba potravy a vlastní tvar. Přibližný obsahový rozpočet 12–20 minut prvního hraní, zatím neověřený.

### 1. Světelná zahrada: místo u živého stolu

- **Situace:** závojníci spásají hlavní řasový porost; bezpečná startovní potrava stačí na seznámení, nikoli na financování celé etapy. Jehloúst ukazuje, proč shluk konzumentů přitahuje lovce.
- **Kroky:** sníst první potravu → sledovat spásání a lov → rozhodnout mezi rozptýlením a predací → zasáhnout → vidět odlišně fungující zahradu.
- **Řešení A:** přenést živiny k vedlejšímu chráněnému místu; závojníci následují skutečný nový zdroj a tlak na mateřský porost klesne.
- **Řešení B:** vyvinout čelist a cíleně snížit přetíženou skupinu; maso pomůže lovci, ale vyhubení všech původních konzumentů není zdravá potravní síť.
- **Pozorovatelný výsledek:** mateřský porost znovu poskytuje potravu a místní odběr nepřevyšuje jeho obnovu; část původní populace dál žije v okolí.
- **Editor:** ústní specializace mění řešení a pozdější dostupnou potravu. První rozpočet na tuto volbu získat z prvního skutečného poznání vztahu, ne z desítek soust.

### 2. Skleněný vír: použít proud

- **Situace:** minerální výživa obíhá mezi proudem a závětřím. Přímá cesta odnáší hráče; rychlost sama neřeší zatáčení s neseným vzorkem.
- **Kroky:** pozorovat pohyb částic → zkusit vstup a bezpečný návrat → změnit tělo nebo trasu → získat vzorek → založit zdroj v závětří.
- **Řešení A:** bičík, vhodné proporce a aktivní řízení dovolí protáhnout se proudem a využít jeho návratovou větev.
- **Řešení B:** postup mezi úkryty a dosah sosny umožní odebrat výživu z okraje; delší chráněná trasa vymění rychlost za bezpečí.
- **Pozorovatelný výsledek:** na chráněné straně existuje dostupný minerální zdroj, který proud neodnáší; zdroj mohou používat i konzumenti.
- **Editor:** hráč porovnává zrychlení, dosah a obratnost na konkrétní trase. Závětří a směr proudu musí být viditelné před nákupem.

### 3. Soumraková kolébka: projít živým stínem

- **Situace:** detrit živí lucerničky ve stínu; jehloúst hlídkuje na otevřené trase. Potomek potřebuje bezpečně přenést kulturu z kolébky k odtokovému proudu.
- **Kroky:** rozeznat světelné stopy partnera a hlídku → zvolit otevřenou či krytou cestu → připravit potravu/vztah → provést skutečný přesun → sledovat kulturu uchycenou u odtoku.
- **Řešení A:** navázat a krmit lucerničku; její světlo odhaluje krytou cestu a vhodné místo pro kulturu.
- **Řešení B:** vlastní smysly, úkryty a odvedení lovce nabídnutou potravou; případně aktivní střet s obranou či čelistí.
- **Pozorovatelný výsledek:** živá kultura dosáhne odtoku a přežije tam díky dostupné výživě a bezpečnému umístění. Přenos provede hráč; žádný věkový odpočet partnera.
- **Editor:** smysly, obrana nebo partner jsou odlišné přípravy stejné výpravy. Identita potomka pokračuje do útesů.

## Útesy — využít skutečný prostor

Zaměření: výška, kyslík, členité kryty a přesnější ovládání. Přibližný obsahový rozpočet 18–30 minut, zatím neověřený.

### 4. Korálové varhany: otevřený lov, chráněná potrava

- **Situace:** plachtovci vycházejí za nektarem na otevřené místo, kde útočí stužkohrot. Korálové průchody nabízejí kryt, ale objemná těla v nich musí jinak manévrovat.
- **Kroky:** sledovat čitelný výpad → najít průchod těla → zvolit zásah do potravy nebo lovu → přesunout živý zdroj / střetnout se s lovcem → sledovat novou bezpečnou trasu konzumentů.
- **Řešení A:** přenést nektarový vzorek do korálového krytu; plachtovci změní trasu podle potravy.
- **Řešení B:** lovem či aktivní obranou vytlačit stužkohrota od zdroje a využít otevřený prostor; obnovení predace později zůstává možné.
- **Pozorovatelný výsledek:** existuje fungující zdroj, ke kterému mají konzumenti přístup bez opakovaného zachycení v jedné lovecké pasti.
- **Editor:** šířka, ploutve, dosah a obrana řeší odlišné problémy; krunýř může omezit pohodlné průjezdy.

### 5. Les plovoucích stuh: zahrada nad hlavou

- **Situace:** živé stuhy drží potravu ve více výškách; část je dostupná od hladiny, část v chráněné hloubce. Vzorek je nutné přesunout svisle, ne pouze dojet na jeho X/Z souřadnici.
- **Kroky:** najít viditelnou svislou cestu → vyzkoušet kyslík a zastavení ve výšce → přestavět tělo či zvolit hladinovou trasu → přenést a uchytit stuhu → využít vzniklou mezistanici.
- **Řešení A:** žábry a vztlaková perla umožní souvislou práci pod hladinou s přesným držením výšky.
- **Řešení B:** krátké sestupy od hladiny, dosah sosny a trasa mezi výše položenými oporami; spotřeba kyslíku musí být předem čitelná.
- **Pozorovatelný výsledek:** uchycená živá stuha poskytuje potravu a skutečné krytí na dříve otevřené svislé cestě.
- **Editor:** první nutnost přemýšlet o těle jako o prostorovém plavci, nikoli o rychlejší mikrobní ikoně.

### 6. Noční průduchy: změnit cestu živin

- **Situace:** proud odnáší živiny od mělčiny do temného průduchu. Živý filtrační porost jej může zachytit, ale vhodná místa mají jinou hloubku a expozici lovcům.
- **Kroky:** pozorovat tok částic → najít místo uchycení → zvolit hloubkovou nebo pobřežní cestu → přenést a založit porost → sledovat oživení mělčiny.
- **Řešení A:** žábry se sonarem či lucerničkou zpřehlední hlubokou krátkou trasu; proud se využije pro dopravu.
- **Řešení B:** mělčí krytá trasa s delším dosahem a pomocí štítojemce nebo aktivní obranou; ponor lze rozdělit návraty ke vzduchu.
- **Pozorovatelný výsledek:** živiny se skutečně zachycují u mělčiny a tamní vegetace tvoří obyvatelný výstup na břeh.
- **Editor:** plíce a končetiny následně umožní skutečně vystoupit. Do té doby břeh není běžná choditelná plocha; potřeby vidí hráč při pokusu, před potvrzením evoluce.

## Souš — rozhodnout, co zachránit

Zaměření: hospodaření s vodou, místní důsledky a rozdílné způsoby záchrany. Přibližný obsahový rozpočet 15–30 minut, zatím neověřený.

### 7. Přílivové sady: vrátit půdě vodu

- **Situace:** sucho je patrné už při příchodu. Opuštěná zavlažovaná místa vysychají, žrouti požírají mladé porosty; existující stín a voda poskytují čitelné bezpečné opory.
- **Kroky:** porovnat vlhké a suché místo → určit příčinu ztráty porostu → zvolit přenos růstu nebo regulaci žroutů → zasáhnout → sledovat vodu i nové konzumenty.
- **Řešení A:** přenést živý vzorek pod stín a odlákat žrouty jinam nabídkou potravy; porost začne zadržovat vodu.
- **Řešení B:** odstranit místní přemnožené žrouty, ponechat původní konzumenty a umožnit existujícímu porostu obnovu.
- **Pozorovatelný výsledek:** nový či zachráněný porost opravdu snižuje vysychání půdy, poskytuje potravu a mění bezpečnou trasu hráče.
- **Editor:** zásobník vody prodlouží výpravu; lehčí tělo a vhodně rozmístěné nohy umožní rychlé přesuny mezi oporami.

### 8. Jantarové terasy: koho živí nový pramen

- **Situace:** voda sama nestačí: žrouti obsadili úzký přístup, zatímco korunoplaz loví na nevhodném místě. Nekritický lov může odstranit právě spojence obnovy.
- **Kroky:** rozeznat původní a přemnožené druhy → přečíst jejich trasy → zvolit zásah do potravy či populace → otevřít průchod → ověřit, kdo nový zdroj využívá.
- **Řešení A:** nabídnutou potravou přesunout žrouty do dosahu korunoplaza a založit chráněný zdroj pro původní druhy.
- **Řešení B:** selektivně lovit žrouty; zvládnout výpady korunoplaza a ponechat mu potravu mimo trasu migrace.
- **Pozorovatelný výsledek:** průchod není trvale okupovaný, žrouti nevyčerpávají jeho vegetaci a původní potravní vztah dál funguje.
- **Editor:** obratné úzké tělo, odolný lovec a hostitel ochranného partnera volí rozdílné trasy a střety.

### 9. Zahrada posledního deště: domov pro potomka

- **Situace:** poslední vlhké útočiště lze propojit s obnovenou krajinou, ochránit změnou potravní sítě nebo k němu dovést symbiotickou linii přes dosavadní bezpečné opory.
- **Kroky:** zhodnotit vlastní změny krajiny → zvolit řešení → připravit tělo a trasu → provést rozhodující zásah / cestu s kulturou → vidět obydlený domov a jeho cenu pro zbytek světa.
- **Řešení A:** obnovit propojenou síť živých zdrojů; voda a vegetace se vrátí do krajiny.
- **Řešení B:** obnovit místní potravní rovnováhu, aby žrouti již nespotřebovávali více růstu, než zdroje vytvářejí.
- **Řešení C:** skutečně přenést kulturu s živými partnery do útočiště; během výpravy jejich schopnosti pomohou překonat prostředí a hráč zajistí potravu.
- **Pozorovatelný výsledek:** vznikne obyvatelný domov s potravou a vodou. Migrace ochrání útočiště, ale zbytek suchého světa zůstane suchý; odlišné následky přetrvají v sandboxu.

## Progrese a ekonomika

- Učení situace přináší DNA jednou; deník popisuje dosaženou příčinu a následek. Jídlo nadále slouží přežití a partnerům, nikoli nekonečnému postupu při plném zdraví.
- Žádný povinný součet jídel, reprodukcí, zabití ani stáří partnera. Místo toho kapitola ústí do fyzicky použitelného prostředí pro potomka: obyvatelný odtok, oživená mělčina a nový domov.
- Situace nejsou devět nezávislých zaškrtávacích úkolů. Přesunutá potrava mění trasu NPC; krytá cesta usnadňuje transport; zachovaný porost mění vodu. Vyřešený vztah lze využít jiným tělem a v jiném pořadí.
- Přechod nesmí tajně kontrolovat nákup konkrétního řešení. Kromě skutečné schopnosti dýchat/chodit kontrolovat stav prostředí a provedený přesun potomka, nikoli preferovanou strategii.
- Editor ukazuje problém, který hráč právě poznal, a účinky změny. Náhled ani deník neslibují automatické vítězství orgánu; hráč musí nové tělo ovládat.
- Zachovat stávající ochranu cen, návrat změn, limity konstrukce a obnovu generace. Neúspěšný pokus nesmí spotřebovat jediný nenahraditelný vzorek ani trvale uzavřít postup.

## Implementační hranice a kompatibilita

- Zachovat TypeScript/Vite/Three, tři světy, model genomu a seedované krokování. Návrh potřebuje konkrétní katalog situací, nikoli nový engine.
- Nové persistentní údaje o přenášeném vzorku a živých zdrojích přidat přes explicitní verzovanou migraci; nezneužívat text zpráv jako skryté úložiště mechanik.
- Migrace zachová genom, DNA, etapu, populaci, zdroje, historii, uložené sloty a checkpoint. Dosažené přechody a dokončené kampaně se neodvolávají. Starší DNA se neodebírá.
- Starší rozehrané světy doplnit deterministicky pouze o chybějící obsah v ověřených volných místech; nikdy je tajně přegenerovat. Migraci testovat v každé etapě i uvnitř checkpointu.
- Zachovat testy geometrie, ekonomiky, serializace a determinismu. Testy odstraněných kvót nahradit testy nových skutečných podmínek; připravené scénáře nadále nezaměňovat za průchod.

## Pořadí práce a hráčské přijetí

1. Nejprve dodat zahradu a vír jako spojený úsek: nové zdroje, nabídka potravy, čitelný lovec a nový zisk DNA. Odehrát bez diagnostiky ještě před rozšířením všech map.
2. Pokračovat teprve, když hráč dokáže vysvětlit původ problému, zvolil řešení, potřeboval řídit či změnit tělo a ve světě poznal následek. Pouhé pomalejší plnění ukazatele je neúspěch návrhu.
3. Přidat soumrakový odtok, vertikální útesy a nakonec propojenou souš; po každém bloku znovu hrát normálními vstupy.
4. Pro každou situaci ověřit dvě různé cesty, opravitelné selhání, zachování po save/load a dostupnost při třech testovacích seedech. Nevyžadovat identickou délku ani trasu.
5. Změřit nové první hraní: aktivní čas, skutečné volby, návraty do editoru, úseky bez nového podnětu a důvody selhání. Pokud 45 minut vznikne čekáním nebo opakováním stejné činnosti, cíl kvalitativně splněn není.
6. Zachovat rychlý automatizovaný průchod jako regresní test pravidel a odděleně doložit nový hráčský průchod. Vydávat jako ověřenou pouze skutečně naměřenou délku.
