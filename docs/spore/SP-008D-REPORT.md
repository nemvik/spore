# SP-008.D — domestikace

24. září 2026; výchozí čistý pracovní strom a HEAD `488e4cb`. [Plán a záznam práce](../superpowers/plans/2026-09-24-sp-008d-domestication.md), [roadmapa](ROADMAP.md#sp-008), [smlouva historie](SP-007A-CONTRACT.md). Bez nových dependencies, změny lockfilu a deploye. Commit a push byly autorizovány navazujícím výslovným pokynem uživatele po dokončení implementace a ověření.

**SP-008.D dokončeno v níže doloženém rozsahu.** Hráč získá původní divoké zvíře, dovede je domů a řídí placenou péči i fyzický sběr. Zanedbání, přerušení, uvolnění a pokračování uložené hry mají skutečné následky.

## Herní rozsah

Domestikovat lze **skutečného živého zvonkonoše** pobřeží. Jeho dosavadní role býložravce a potrava řasa/nektar umožňují samostatný sběr. Prachokřídlík zůstává symbiontem, korunoplaz predátorem a žrout invazní faunou. Domácí zvíře není potomkem hráčova druhu, členem kmenového rosteru ani bondem. Není vytvořena nová kopie: pohybuje se stále původní `world.creatures` jedinec se svým ID, tělem, zdravím, hladem a světovou polohou.

V panelu **Zvířata** jsou skuteční jedinci, jejich vzdálenost, zdraví, vhodnost, důvod případného odmítnutí a tlačítko ukázání v krajině. Vybraný vlastní člen vede získávání. Další druhy s jinými rolemi, rozmnožování a editor zvířecí výstroje nejsou součástí této D.

| Pravidlo | Skutečný účinek |
| --- | --- |
| Kapacita | Dva jedinci na dokončený živý přístřešek, nejvýše tři. Jediný aktivní pokus rezervuje místo; kapacita potomků se nemění. |
| Vhodnost | Zvonkonoš bez strachu, alespoň 60 % skutečného maxima zdraví. Původní model má maximum 32, genomoví NPC používají maximum svého těla. |
| Pečující | Jeden živý vlastní člen, zdraví alespoň 35, hlad pod 65, prázdný náklad, bez oštěpu a mimo hudební návštěvu. Symbiont nemůže získávání vést. |
| Přiblížení | Člen dojde k původnímu zvířeti. Do kontaktu se neplatí. Zvíře dál používá divokou AI, vybraný klidný pečující je výjimkou z plašení vlastní čelistí. |
| Uklidnění | Při kontaktu do 4 m bez překážky se jednou odečte 6 jídla; zvíře skutečně sní nabídku (−20 hladu). Osm sekund klidného kontaktu. |
| Doprovod | Člen jde domů, čeká na zvíře; zvonkonoš fyzicky následuje s kolizemi a navigací. Vlastnictví vznikne až kontaktním příchodem obou do zázemí. Celý pokus do 90 s. |
| Péče | Doma živý pečující bez oštěpu s hladem pod 70 krmí v kontaktu. Při hladu zvířete alespoň 30 zaplatí 3 jídla za −32 hladu. Sytá péče obnovuje důvěru a zdraví do maxima druhu. Jeden člen může pečovat o více zvířat, může však dostat i jiný rozkaz. |
| Úloha | Hráč zadá skutečný zdroj řasy/nektaru do 32 m od domova. Zvíře k němu dojde, v kontaktu každé 3 s odebere nejvýše jednu porci, nese nejvýše 6 a dopraví náklad domů. Jedna doručená porce = 4 jídla. |
| Ekologie | Odběr snižuje skutečný zdroj a plodnost půdy stejně jako běžný sběr. Zvíře soutěží o potravu s faunou a sousedy. Není pasivní výrobou nebo zdrojem DNA/lovů. Sklad znamená dosavadní zpracované kmenové zásoby; ústa a jídelníček vlastního těla se nemění. |

Náklad je právě na zvířeti a nulován při doručení. Při vyčerpání zdroje se vrací domů; dostupný zdroj může obsloužit opakovanými cestami. Cena získání a opakované krmení, skutečný odběr a přítomnost pečujícího brání beznákladovému generování příjmu. Žádný spawn, jednorázová odměna za ochočení ani obnova populace nevzniká.

## Přerušení a ztráty

- Nový běžný rozkaz pečujícímu, zastavení nebo tlačítko přerušení ukončí pokus. Před prvním kontaktem zdarma; po platbě bez vratky a bez vlastnictví. Převzetí do hudby nebo oštěp během pokusu je odmítnuto.
- Po platbě je přípustná nejvýše 4 s ztráta kontaktu. Strach, viditelný blízký oštěp, skutečný zásah zvířete/pečujícího, ztráta člena/zvířete, nedostatek skladu při kontaktu a timeout mají konkrétní výsledek. Kámen brání krmení, získávání, doručení i zásahu.
- Hlad domácího zvířete roste o 0,65/s. Od 70 přestane sbírat i vyplácet náklad a vrací se; od 90 ztrácí zdraví. Při prázdném skladu se zdarma nenakrmí. Hlad nebo ztráta člena snižují důvěru o 0,7/s; při nule končí vlastnictví, náklad se ztrácí. Nulová důvěra má přednost před dalším krmením/doručením.
- Ztracený pečující se odpojí, úkol se zastaví. Hráč může vybrat a poslat nového pečujícího domů. Nikdo se zdarma nenarodí ani automaticky nenahradí.
- Zásah domácího zvířete odečte skutečné zdraví, sníží důvěru o 15, vyplaší je a ukončí jeho sběr. Po uklidnění lze práci zadat znovu. Predátoři je mohou lovit; vlastní lov domácího zvířete je odmítnut.
- Smrt odstraní původního jedince, uvolní místo a vytvoří právě jednu běžnou mršinu; náklad není další odměnou. Opakované odstranění nepřidá druhou. Platí i pro save na hranici smrti.
- **Uvolnit do divočiny** odstraní vlastnictví a náklad bez vratky. Stejné živé zvíře pokračuje jako fauna; nové získání znovu stojí celou cenu.

## Data, kompatibilita a návaznost

Kampaň zůstává v3, aktivní kmen v2. Volitelné `tribe.domestication.version=1` vzniká první skutečnou akcí. Obsahuje jediný aktivní pokus, nejvýše tři reference vlastněných zvířat a poslední výsledek. U pokusu se ukládá světové ID, kmenové ID pečujícího, fáze, zbývající čas, průběh klidu, ztráta kontaktu, platba a navigace. Péče ukládá pečujícího, režim, zdroj, náklad, důvěru a navigaci. Zdraví/hlad/pozice žijí pouze na původním světovém tvorovi.

Přísná validace kontroluje přesné klíče, verze, enumy, konečná čísla/meze, počet míst, duplicity, vlastnictví a správné ID domény. Fáze odpovídají platbě a dosaženému průběhu. Existující cizí člen, symbiont, budova nebo jiný druh nemohou být vydáváni za platnou referenci. Reference na již ztracené ID se může načíst: další tick bezpečně ukončí získávání, uvolní chybějící zvíře nebo odpojí pečujícího. Neexistující/vyčerpaný zdroj ukončí práci bez vzniku potravy.

Save/load i export/import uchovají rozběhnuté přiblížení, uklidnění, doprovod i běžnou péči s nákladem. Načtení samo neplatí, neodměňuje a nereplikuje zvuk právě načtené události. Pauza, kulturní editor a save menu zastaví simulaci. Checkpoint vrací svět, zvíře, zásoby, platbu a náklad společně; checkpoint před první domestikací oprávněně marker neobsahuje. Parser historické savey ani jejich checkpointy nepřepisuje; všech 11 verzovaných historických fixtures má regresi.

Přechod do strojů explicitně ukončí aktivní získávání před vytvořením checkpointu. Běžná péče i vlastněný tvor se zmrazí; divoká AI v pozdější etapě je neovládá ani nenapadne dříve uloženým cílem predátora. Nové ekonomické nebo civilizační dědictví nevzniká: patří do **SP-007.B1**.

A/B/C, původní tělo a genom NPC, symbionti, kulturní nástroje/oděvy, hudební návštěvy, boj, `resolved`, jednorázové odměny sousedů a SP-007.A zůstávají zachované. Plná sada ověřuje i jejich původní regrese.

## SP-017 a ověření

HUD, značka vlastnictví, náklad, varovná barva, postup uklidnění a zvuk vycházejí z téhož stavu. Značka a šest skutečně zobrazovaných balíčků jsou doplněk původního modelu, nikoli druhý tvor. Původní model animuje skutečnou rychlost. Omezený pohyb potlačuje pohyb značky. Při uvolnění se doplněk i jeho geometrie/materialy odstraní. Text funguje bez sluchu a bez rozlišení barev.

Web Audio přes společnou metodu `voice` respektuje mute/master/effects. Automat odlišuje začátek placeného kontaktu 440 Hz, úspěch 740 Hz, skutečné krmení 520 Hz, doručení 620 Hz a problém 110 Hz. Automatické pozorování plánovaných frekvencí není skutečný poslech nebo lidské posouzení zvuku.

Prostředí: Linux, Node 24.15.0, pnpm 11.24.0, Vitest 3.2.4, Playwright 1.55.0, instalovaný Chrome, místní Vite preview. Sandbox blokoval databázi pnpm a místní naslouchání; schválené spuštění mimo sandbox umožnilo kontroly bez změny závislostí.

### Produkční UI: první úplný průchod

Osm skupin kontrol prošlo, console/pageerror 0. Vstup je výslovně připravený: historické dokončené pobřeží → založený kmen, 100 jídla, členové u domova, jeden **existující** zvonkonoš přemístěný poblíž s přirozeným zdravím a hladem 45, existující nektarový zdroj 12 porcí poblíž, původní predátoři přesunutí dál a sytí. Žádný marker domestikace, ochočení, rozběhnutý proces, platba nebo výsledek se nevkládají. Překážky a populace zůstávají. Cesta od buňky, získání výchozích zásob a původní rozmístění nejsou odehrané.

| Kontrola | Doložený výsledek |
| --- | --- |
| Získání a save/load | UI zaplatilo 6; export/import v `lure`, přesný čas podle ticků, save menu drží proces, reload a běžné načtení pokračují. |
| Fyzický příchod | Původní zvíře #36 došlo domů, zůstalo právě jednou ve světě, nepřibyl potomek/bond. Genom se shoduje se vstupem. |
| Placená péče | Skutečný hlad 29,9687 → 0,0433 přes hranici30; sklad 94 → 91. |
| Práce | UI zadalo existující nektar #12. Odebrané porce neslo zvíře; export/import s nákladem 3, pokračování trasy, doručených 6 porcí dalo přesně +24 jídla. |
| Zanedbání | Běžný rozkaz poslal pečujícího k sousedovi. Zvíře dosáhlo hladu 70,0483, důvěra klesala. V této větvi už byl první zdroj vyčerpaný; sama o sobě nedokazuje příčinu zastavení aktivního odběru. |
| Přerušení | Samostatná větev ze skutečného UI mid-save; zrušení zaplaceného pokusu bez vratky/nového zvířete. |
| Zvuk | Pozorováno skutečné Web Audio plánování440/740/520/620 Hz; diagnostický obal přeposílá stejné argumenty a nemění hru. |
| Aktivní kampaň | Znovu importovaný skutečný UI výsledek běžné péče, bez chyb konzole. |

Pouze běžné kliky, klávesy, file input/download a nativní RAF. Čtecí `render_game_to_text` slouží k pozorování, žádný live setter, zápis localStorage nebo `advanceTime` (jeho nepřítomnost je kontrolována). Branching používá skutečné UI exporty.

Prohlídka snímku s nákladem odhalila chybějící doplněk: renderer měnil etapu na souš před jeho vyhodnocením. Skutečný `GameRenderer.render` má červená→zelená regresi a nyní dostává původní kampaňový stav. Původní obrázky s chybějící značkou byly odstraněny jako překonané mezivýstupy.

### Finální produkční replay a prohlídka

Na konečném buildu prošlo dalších **7 skupin kontrol, 0 chyb konzole/pageerror**. Importoval se skutečný export prvního průchodu během uklidňování; původní jedinec znovu došel domů. Import skutečné péče s nákladem pokračoval sběrem a doručením na sklad 115. Jde o samostatné větve z uložené hry, nikoli další odměnu v původní kampani.

Hladové zvíře dostalo běžným tlačítkem nový dostupný zdroj #142. Po 482 dalších ticích (8,03 s simulace) stále mělo zadanou práci, nulový náklad a nižší důvěru. UI výslovně ukazuje „Hladový · práce stojí“. Přidělení vlastního člena přivedlo pečujícího domů, tři skutečná krmení obnovila hlad na 0,0217 a zvíře znovu vyrazilo. Přerušení placeného získávání bylo znovu provedeno. Uvolnění odstranilo vlastnictví a značku, stejný jedinec #36 zůstal právě jednou ve světě. Finální aktivní export je obnovená úspěšná péče.

Skutečně otevřeno a prohlédnuto všech **8 finálních snímků 1280×720**: načtené získávání, příchod, náklad, doručení, zanedbání, obnovená péče, přerušení a uvolnění. Navíc prohlédnut přípravný panel 1440×900. Značka, jednotlivé balíčky a stavová barva odpovídají skutečnému zvířeti; po uvolnění zmizí. Levý panel při 720 px používá běžné rolování pro další příkazy/pravidla, spodní a pravý panel zůstávají použitelné. Některé scény mají přirozené zakrytí zvířete chatrčí nebo členy; náklad a značka jsou jasně doložené ve volné krajině.

Finální Web Audio pozorování obsahuje 740/620/520/110 Hz pro úspěch, doručení, péči a problém. Čtecí obal volání přeposílá beze změny. Skutečný poslech a lidské posouzení srozumitelnosti neproběhly.

### Regrese a diagnostika

Nových 53 trvalých regresí pokrývá automat, cenu a kapacitu, kontakt/překážky, skutečný sběr/doručení, smrt a jedinečnou mršinu, ztrátu pečujícího, nulovou důvěru, zastavení hladem, release, konflikt s hudbou, historické/save/checkpointy, vykreslení a zvuk. Nezávislé review ověřilo 168 trvalých testů a 5 vlastních reprodukcí po opravě. Dočasný soubor odstraněn.

První celá sada: 131 souborů, 2 465/2 470, 32,11 s podle časů JSON reportu. Pět starších timeoutů: `cell-growth` 13,764 s, dva seedy `journey-presentation` 8,959/5,125 s, `simulation` 6,065 s nad 5 s a `step-phases` 25,449 s nad vlastním 20 s. JSON report Vitestu uchoval zástupný stack `STACK_TRACE_ERROR`; místní `makeTimeoutError` potvrzuje, že tento stack připojuje k timeoutu. Izolovaný běh stejných čtyř souborů s jedním pracovníkem a původními limity prošel 83/83 za 11,45 s; tytéž případy 1,089/0,617/0,595/0,407/4,562 s. Žádná změna assertions, hashů, počtu kroků ani zdrojových timeoutů.

Finální celá sada na konečném herním kódu: **131 souborů / 2 470 testů, vše prošlo, 79,67 s**. Parametry `--maxWorkers=1 --testTimeout=30000` omezují souběh a zvyšují globální limit z 5 na 30 s; explicitní limit 20 s u charakterizace kroků zůstává beze změny. Finální `pnpm typecheck` i `pnpm build` prošly. Vite 7.1.5: 133 modulů, JS 1 209,57 kB / gzip 371,58 kB, CSS 40,51 kB / gzip 9,19 kB; pouze známé upozornění na velikost hlavního chunku.

## Reprodukce

```sh
pnpm test
# Omezený souběh a globální limit pro zdejší zatížené prostředí:
pnpm test --maxWorkers=1 --testTimeout=30000
pnpm typecheck
pnpm build
LUMAVORA_BROWSER_CHANNEL=chrome pnpm test:domestication
# Samostatný finální replay skutečných UI exportů:
DOMESTICATION_VISUAL_INPUT=evidence/sp-008d/production-v3 \
DOMESTICATION_OUTPUT=evidence/sp-008d/final-visual \
LUMAVORA_BROWSER_CHANNEL=chrome pnpm test:domestication
```

Scénář vlastní preview na portu 5198 a browser a zavírá je ve `finally`; vlastní server lze určit `LUMAVORA_URL`. Trace je opt-in `LUMAVORA_TRACE=1`, ve zdejších bězích vypnutý.

## Evidence a úklid

- `evidence/sp-008d/production-v3/`: výslovný připravený vstup, výsledky prvního úplného průchodu a skutečné mezisavy potřebné pro reprodukci.
- `evidence/sp-008d/final-visual/`: osm finálních snímků, výsledky replaye, uvolněný jedinec a **`active-campaign.save.json`** pro pokračování péče.
- `evidence/sp-008d/verification.json`, `tests-final.log`, `timeout-diagnosis.json`: souhrn kontrol, hashe ověřovaných souborů a diagnostika změny parametrů testů.
- `evidence/sp-008d/cleanup-manifest.json`: konkrétní odstraněné vlastní mezivýstupy a důvody. Předchozí úkoly, jejich artefakty a verzované save fixtures zůstávají zachované.

Trace, screencast ani video nebyly vytvářeny; `.playwright-mcp/traces/` neexistuje. Oba browser průchody zavřely vlastní browser a preview. Disk před běhy i po úklidu má 241 GiB volných. Velikost zachované evidence a odstraněných dat zaznamenává manifest.

## Meze

Jde o jeden existující druh a připravenou kmenovou scénu, nikoli novou celou kampaň. Smrt, ztracené reference, přerušení překážkou a přechod do strojů jsou především regresní důkazy, nikoli všechny znovu hrané UI větve. Celá bojová cesta, druhé plné tělo NPC, Safari/mobil a dlouhý výkonový soak nejsou tímto browser průchodem doložené. Neproběhl lidský playtest srozumitelnosti/zábavnosti nebo skutečný poslech. Vite upozornění na JS nad 500 kB zůstává.

D je hranicí této práce; E náčelník, F pět sousedů a SP-007.B1 zůstávají navazující. Celé SP-008 a průřezové SP-017 nejsou uzavřené.
