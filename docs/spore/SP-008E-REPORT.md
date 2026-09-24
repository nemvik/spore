# SP-008.E — náčelník

24. září 2026; výchozí čistý pracovní strom a dokončená D v HEAD `2b7b8e6`. [Plán a záznam provedení](../superpowers/plans/2026-09-24-sp-008e-chief.md), [roadmapa](ROADMAP.md#sp-008), [smlouva dědictví](SP-007A-CONTRACT.md). Bez nových závislostí, změny lockfilu a deploye. Implementační průchod proběhl bez commitu a pushe; navazující výslovný pokyn uživatele autorizoval commit a push dokončené E do `main`.

**SP-008.E dokončeno v níže doloženém rozsahu.** Hráč zvolí původního člena, pozná jej ve světě i rozhraní a vědomě použije placený kontaktní sněm. Přítomnost, úspěch, nedostupnost a přerušení mají odlišné výsledky.

## Role a pravidla

Náčelník je **jeden explicitně zvolený existující potomek vlastního druhu**. Odkazuje na původní kmenové ID; nepřidává člena, nový genom ani pracovní slot. Symbiont nemůže zastávat roli. Tělo, jídelníček, výstroj, náklad i práce zůstávají na původním členovi. Mimo vlastní činnost pracuje a bojuje jako ostatní; samotná přítomnost nedává bonus.

Volba je zdarma, u živého dokončeného domova do 10 m s volnou spojnicí. Hráč vybere právě jednoho kandidáta: zdraví ≥35, hlad <65, prázdný náklad, žádné rozkazy, hudební setkání, získávání zvířete ani přidělená péče. Při předání musí být i dosavadní živý náčelník doma, bez rozkazů/hudby/péče; jeho případný náklad zůstává původnímu členovi. Aktivní sněm předání blokuje. Zvoleného člena lze přímo vybrat a ukázat kamerou, roster i svět nesou stejný znak role.

**Smírčí sněm** dává hráči konkrétní společenskou volbu vedle běžných darů a hudebních setkání:

| Pravidlo | Skutečný účinek |
| --- | --- |
| Zahájení | Vybraný náčelník, nevyřešený živý soused se skutečným živým hostitelem, dostupné zásoby. Náčelník splňuje zdravotní/hladové/nákladové podmínky a nepečuje o zvíře. |
| Cena | **8 jídla ihned**, bez vratky při jakémkoli přerušení. Jediná aktivní činnost; opakovaný vstup znovu neplatí. |
| Cesta | Nejvýše **90 s**, sdílená skutečná navigace a kolize, rychlost vlastního těla a kulturní výstroje. Hostitel jde k vlastní osadě. |
| Řeč | **6 s** kontaktu do **4 m**, bez překážky; hostitel do 12 m od domova. Ztráta kontaktu pozastaví řeč, po **3 s** ji ukončí. |
| Úspěch | Jednou **+25 vztahu × sociální oděv × dědictví SP-007.A**, nejvýše 100; příměří alespoň **45 s** a skutečné odvolání sousedovy výpravy. |
| Odpočinek | **60 s po každém konci**, během činnosti držen na 60. Společný pro celý kmen; změna osoby ani načtení jej neobnoví. |
| Spojenectví | Použije dosavadní vyřešení souseda a jednorázovou odměnu/historii. Snem zaplacené jídlo není kredit běžného daru. |

Náhled používá tentýž multiplikátor jako akce; při zahájení se uloží a nelze vyměnit oděv uprostřed řeči. Již provedená odměna je terminální výsledek, nikoli znovu spustitelný krok. Sněm není automatický mír během cesty: skutečné nebezpečí může náčelníka zasáhnout dřív, než řeč dokončí.

## Ovládání, souběh a ztráty

- Běžný i připojený rozkaz nebo Stop sněm přeruší bez vratky a provede novou instrukci. Samostatné tlačítko přerušení ponechá člena v běžném odpočinku.
- Během sněmu nelze tomuto členovi měnit výstroj/nástroj, zadat stavbu, hudbu, získávání či péči. Před sněmem je nutné předat jeho dosavadní péči jinému členovi. Ostatní mohou dál pracovat, pečovat a hrát u jiného souseda.
- U stejného souseda se sněm nekombinuje s hudební návštěvou ani s pasivním kontaktním zvyšováním vztahu běžné diplomacie. Útoky na hostitelský kmen, včetně již čekajících rozkazů, jsou konfliktem.
- Skutečný zásah náčelníka od fauny i jiné společnosti sněm ukončí před odměnou. Hlad ≥65, zdraví <35 nebo náklad ukončí způsobilost; běžné chování potom řeší přežití a návrat.
- Smrt či chybějící vlastní člen uvolní roli bez automatického zrodu/náhrady. Hráč zvolí jiného původního potomka nebo využije dosavadní placený nábor. Globální cooldown a poslední výsledek zůstanou.
- Chybějící/mrtvý hostitel, vyřešený či ztracený soused, překážka, timeout a přechod etapy mají vlastní terminální důvod; bez vztahové odměny. Ztráta hostitele neuvolňuje živého náčelníka.

## Ukládání a návaznosti

Kampaň zůstává v3, aktivní kmen v2. Volitelné `tribe.chief.version=1` vznikne první volbou. Obsahuje ID náčelníka nebo null, společný cooldown, jednu aktivní činnost a poslední výsledek. Činnost uchovává člena, souseda a hostitele, fázi `travel`/`speak`, zbývající čas, ztrátu kontaktu, zaplacenou cenu a multiplikátor; pohyb a navigace zůstávají na skutečném členovi.

Přísná validace kontroluje přesné klíče, verzi, enumy, konečná čísla a meze, ID domény/vlastnictví, platbu, souběh, cooldown a multiplikátor proti skutečnému oděvu a historii. Existující symbiont, budova či cizí člen nejsou platným náčelníkem. Odkaz na již chybějícího člena/hostitele lze načíst jako skutečnou hranici fáze: další tick jej ukončí bezpečně bez odměny. ID souseda musí patřit dosavadní společnosti.

Save/load a export/import pokračují přesně v zaplacené cestě i řeči, včetně kontaktového přerušení. Načtení neplatí znovu, neobnovuje cooldown a nepřehrává starou zvukovou událost. Checkpoint vrací zásoby, svět, roli, činnost a historii společně; před první volbou oprávněně neobsahuje žádného náčelníka. Parser nepřepisuje historické savey/checkpointy a žádnou roli jim nedovozuje. Všech 11 historických fixtures je regresně ověřeno.

Přechod do strojů ukončí aktivní sněm před checkpointem a uloží důvod `stage`; role a cooldown jsou v další etapě zmrazené, značka se odstraní. Aktivní sněm mimo etapu 3 není validní. Nové civilizační následky nevznikají: patří do **SP-007.B1**. Mapa má nadále tři sousedy; pět patří do **SP-008.F**. Tělo, ekologie, symbionti, A–D, SP-007.A a diplomatická i bojová cesta zůstávají součástí celé regresní sady.

## Čitelnost, obraz a zvuk SP-017

Panel popisuje roli, cenu, dosah, podmínky, odpočinek a důvody odmítnutí. Během činnosti ukazuje skutečný čas, vzdálenost k hostiteli, kontakt a zaplacenou cenu. Změna fáze vrací panel nahoru a zavře rozbalené podrobnosti; při 720 px je hlavní činnost a přerušení v kompaktním panelu. Podrobnosti zůstávají dostupné běžným rozbalením/rolováním.

Znak úřadu se připojuje k původnímu modelu nad tělem, nenahrazuje kulturní oděv ani nástroj. Skutečný kontakt řídí barvu kruhu dosahu, průběh řeči řídí segmenty u nohou a drobné gesto těla/značky. Reduced motion potlačuje gesto a pohyb značky. Při předání/ztrátě/odchodu do jiné etapy se doplněk odstraní a uvolní jeho geometrie/materialy. Text zůstává použitelný bez barvy i sluchu.

Zvukový observer reaguje jednou na volbu (392 Hz), začátek kontaktní řeči (330 Hz), úspěch (880 Hz) a přerušení (98 Hz). Používá společné Web Audio `voice` s dosavadním mute/master/effects. Načtení observer pouze synchronizuje; předání role nepřehrává předchozí výsledek. Automatické pozorování plánovaných hlasů není skutečný poslech ani lidské posouzení srozumitelnosti.

## Regrese a diagnostika

**58 nových trvalých regresí**: 25 pravidel/pohybu/souběhu, 26 persistence/validace, 5 prezentace/zvuku a 2 skutečného dědictví. Pokrývají pasivní přítomnost oproti placenému kontaktu, překážky, časovou toleranci, nové/queued rozkazy, Stop, předání péče a další krmení, skutečný zásah fauny i třetího kmene, smrt a ztracené ID, předání, cenu/cooldown, jednorázové spojenectví, stage transition a přesné pokračování checkpointu. Kulturní chochol se sociálním dědictvím dává přesně 35,9375; se smíšeným 33,59375. Tělo se nemění a historie spojenectví vznikne jednou.

Červená→zelená regrese odhalila a opravila zkrácení cooldownu při ztrátě člena a opakování starého zvuku při předání role. Nezávislé read-only review nenašlo blokující závadu automatu, integrací ani ukládání; nekontrolovalo skutečnou slyšitelnost, lidskou srozumitelnost nebo vyvážení.

První celá sada s výchozími parametry: **2 518/2 519**, 133 souborů prošlo, jeden selhal; 29,70 s. Jediný starší test `creature-terrain > keeps combined translation/rotation outside several close obstacles` překročil výchozích 5 s. Izolovaný celý soubor s `--maxWorkers=1` a původním časovým limitem prošel **20/20**, problémový test **2,335 s**, běh 5,43 s. Očekávání, počet kroků ani zdrojové timeouty nebyly měněny. Potom přibylo devět okrajových regresí.

Závěrečný celý běh používá `--maxWorkers=1 --testTimeout=30000`: omezený souběh a globální limit 30 s místo 5 s. Explicitní 20s limit charakterizace kroků zůstává beze změny. **134 souborů / 2 528 testů, vše prošlo, 253,63 s.** Závěrečný `pnpm typecheck` také prošel. Parametry nemění kontrolované výsledky; delší wall time zahrnuje zatížené prostředí a část souběhu s produkčním browser průchodem.

Browser ovladač byl rovněž diagnostikován: první pokus timeoutoval na actionability po scrollu, druhý na 30s čekání na download. Třetí skutečně dokončil sněm, ale kvůli pomalému kliknutí na pauzu exportoval již hotový výsledek místo rozehrané řeči. Používá se proto běžná klávesa Escape ihned po zjištění kontaktní fáze a běžné aktivování tlačítek Enterem. Limity ovladače jsou výslovně **90 s akce / 120 s download / 240 s pozorování**; herních 6 s řeči, ceny a assertions se nemění. Čtvrtý průchod ověřil celý save/import/reload/úspěch, potom se zastavil na nadbytečném hledání Stop, které je při otevřeném panelu náčelníka skryté. Ovladač tento krok odstranil: předtím již ověřil, že návratový rozkaz skončil. Žádná z těchto větví neměla page/console chybu. Mezivýstupy jsou nahrazené finálním průchodem, odstranění zaznamenává manifest.

Prostředí: Linux, Node 24.15.0, pnpm 11.24.0, Vitest 3.2.4, Playwright 1.55.0, instalovaný Chrome, místní Vite preview. Spuštění pnpm/browseru mimo sandbox bylo schválené po chybě databáze pnpm; žádná změna závislostí. Běhy používají skutečný RAF. Zvýšené zatížení prostředí a naměřené několikasekundové až desítky sekund dlouhé browser akce jsou limitem tohoto automatického průchodu, nikoli měřením lidského času.

## Finální produkční UI a build

**7/7 skupin kontrol**, console/pageerror **0**, finální místní produkční build. Výslovně připravený vstup: historické dokončené pobřeží → založený kmen, 100 jídla, jeden dokončený košíkářský workshop, vlastní členové u domova, původní predátoři přesunutí do vzdáleného stanoviště a sytí. Překážky a původní sousedé zůstali. Žádný náčelník, sněm, zaplacený nástroj, upravený vztah ani výsledek nebyly připravené. Získání výchozích zásob a cesta od buňky nebyly odehrané.

| Kontrola | Doložený výsledek |
| --- | --- |
| Volba | UI koupilo koš za 6, sklad 94; explicitní volba člena **2**, stále čtyři členové, původní tělo i zakoupený koš. |
| Cena a save/load | Sněm odečetl 8, sklad **86**. Skutečný export během řeči s **5,7 s** zbývajícího času; save menu ji přesně drželo. Import pokračoval podle skutečně uplynulých ticků, save/reload/load načetl stále zaplacenou řeč; před snímkem zbývalo **1,8667 s**. |
| Úspěch | Vztah **30 → 55** právě jednou, skutečné příměří 45 s; genom shodný se vstupem. |
| Omezení | Tlačítko dalšího sněmu je během cooldownu nepřístupné. Žádná opakovaná platba ani odměna. |
| Předání | Běžný návrat domů a volba původního člena **3**. Cooldown ve skutečném exportu **36,6333 s**, žádný nový člen; koš zůstal členovi 2, znak přešel na 3. |
| Přerušení | Samostatná větev ze skutečného exportu rozehrané řeči. Běžný ústup vytvořil rozkaz a ukončil sněm, vztah stále **30**, odměna **0**, sklad bez vratky. |
| Zvuk a pokračování | Pozorované skutečné Web Audio plánování **392/330/880/98 Hz**; obnoven a exportován úspěšný stav s novým náčelníkem jako aktivní kampaň. |

Tabulka rozepisuje sedm skupin výsledkového logu; zvukové měření a uchování aktivní kampaně mají v logu samostatné položky, save/load a úspěch společnou. Vše po přípravě používá běžné klávesy, file input/download a skutečný RAF. Čtecí `render_game_to_text` pouze pozoruje. Žádný setter živého stavu, zápis localStorage ani `advanceTime`; jeho nepřítomnost je ověřena. Zvukový měřicí obal přeposílá původní volání beze změny. Branching obnovuje celou skutečnou uloženou větev, nepřepisuje její hodnoty.

Otevřeno a prohlédnuto všech **6 finálních snímků**: příprava volby 1440×900 a **5×1280×720** — zvolený člen, načtená řeč, úspěch, předání, přerušení. Viditelné jsou původní tělo/koš, znak role, kruh dosahu a skutečný průběh. Předání přesune znak na nový původní model. Aktivní panel má čitelnou hlavičku, vzdálenost, cenu a přerušení; delší pravidla/volby používají běžné rolování. Člen se u hostitele přirozeně překrývá s jeho osadou, přímý výběr/fokus i textová identita zůstávají použitelné. Skutečný poslech a lidské hodnocení srozumitelnosti neproběhly.

Závěrečný **`pnpm build` prošel**: Vite 7.1.5, 137 modulů, JS 1 226,13 kB / gzip 376,65 kB, CSS 42,10 kB / gzip 9,46 kB. Shodné hashe produkčních JS/CSS s browser průchodem. Pouze dosavadní upozornění na velikost hlavního chunku. `git diff --check` a syntaktická kontrola browser scénáře prošly.

## Reprodukce a evidence

```sh
pnpm test
# Omezený souběh a explicitní globální limit pro zdejší prostředí:
pnpm test --maxWorkers=1 --testTimeout=30000
pnpm typecheck
pnpm build
LUMAVORA_BROWSER_CHANNEL=chrome pnpm test:chief
# Volitelný vlastní adresář:
CHIEF_OUTPUT=evidence/sp-008e/replay LUMAVORA_BROWSER_CHANNEL=chrome pnpm test:chief
```

Scénář `scripts/chief-browser.mjs` vlastní preview na portu 5200 a zavírá jej i browser ve `finally`; existující server lze zadat `LUMAVORA_URL`. Trace je opt-in `LUMAVORA_TRACE=1`, zde vypnutý. Přípravu samotného vstupu lze spustit s `--fixtures-only`.

- `evidence/sp-008e/production-final/`: připravený vstup, výsledky, šest finálních snímků a skutečné UI exporty. **`active-campaign.save.json`** uchovává úspěšnou větev s náčelníkem 3; `mid-speech.save.json` rozehranou zaplacenou řeč.
- `evidence/sp-008e/verification/`: výchozí a závěrečný celý testový log, izolovaná diagnostika timeoutu, finální typecheck/build/browser log.
- `evidence/sp-008e/verification.json`: souhrn a hashe ověřovaných souborů. `diagnostics.json` stručně rozlišuje neúspěšné pokusy ovladače od finálního průchodu.
- `evidence/sp-008e/cleanup-manifest.json`: seznam odstraněných vlastních mezivýstupů a důvody. Zachovány zdroje, historické save fixtures, finální aktivní kampaň i artefakty předchozích úkolů.

Trace, screencast ani video nevznikaly; `.playwright-mcp/traces/` neexistuje. Disk před dlouhými běhy měl přibližně 241 GiB volných, po úklidu 239,76 GiB (`df`: 240 GiB). Odstraněno 48 vlastních souborů, 9,13 MiB; zachovaná evidence má přibližně 4,39 MiB. Odstraněné kopie/failure snímky a pomocný review diff jsou vedeny v manifestu; staré odkazy na ně neznamenají existující soubory.

## Meze

Tato E přidává jednu explicitní roli a jednu ovladatelnou společenskou činnost. Neobsahuje automatickou dynastii ani nové civilizační dědictví. Produkční scénář začíná připraveným kmenem, nejde o novou celou kampaň od buňky. Smrt, ztracené reference, zásahy, přerušení překážkou, přesný násobek kulturního oděvu/dědictví a přechod do strojů jsou doložené regresně; všechny nejsou znovu odehrané přes UI. Browser předání používá dva živé původní potomky.

Skutečný poslech, lidský playtest porozumění/zábavnosti, dlouhodobé vyvážení, dlouhý výkonový soak, Safari a mobil neproběhly. Vite upozornění na hlavní chunk nad 500 kB zůstává. **SP-008.F, SP-007.B1, celé SP-008 a celé SP-017 zůstávají otevřené.**
