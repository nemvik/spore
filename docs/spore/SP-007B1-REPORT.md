# SP-007.B1 — následky sjednocení kmene

24. září 2026, pracovní změna nad čistým `main` / `8d009f0d1`, po dokončených SP-008.A–F. [Plán](../superpowers/plans/2026-09-24-sp-007b1-tribal-inheritance.md), [doplněná datová smlouva](SP-007A-CONTRACT.md#spotřebitel-sp-007b1-kmen--stroje). Bez nových závislostí, změny lockfilu, commitu, pushe či deploye.

## Hratelný výsledek

Dokončené řešení všech kmenových sousedů se projeví ve strojích i při identickém těle a pobřežním finále. Čisté odvození z historie nepřidává měnu nebo jednorázovou odměnu:

| Doložený výsledek kmene | Příjem obsazených jantarových pramenů | Výkon při připojování regionu |
| --- | --- | --- |
| allied — všechna spojenectví | +20 % | základ |
| conquered — všechna dobytí | základ | +20 % |
| mixed — obě metody v libovolném poměru | +10 % | +10 % |
| chybějící/neúplný/nedokončený důkaz | základ | základ |

Vyšší příjem hráč utratí ve stávající výrobě, zásobování a opravách. Regionální výkon zvýší rychlost obnovy půdy, poškození dělem nebo růst obchodního vztahu podle zachovaného archetypu. Například stejný kořenový vrt s výkonem 7 obnovuje půdu rychlostí 1,960 / 2,352 / 2,156 bodu za sekundu; stejný obsazený pramen se základem 0,60 vydělává 0,72 / 0,60 / 0,66 jantaru za sekundu pro allied / conquered / mixed.

Pobřežní finále dál určuje schopnost kmene a strojový archetyp. Tvorové dědictví A a kulturní výstroj působí na kmenové členy, nepřidávají se do stroje podruhé. Genom, jídelníček, náčelník, hudba, domestikace ani konstrukce se nepřepisují. Ceny, pohyb, odolnost, počet dodávek, zábor pramene a odvetné útoky jsou původní. Oba nové účinky platí pouze v etapě 4; terraformace má původní příjem i vlastní výkon.

Kmenový HUD vysvětluje následky před dokončením a poté ukazuje zděděný výsledek. Deník uvádí metodu každého souseda, původ saved/action a neznámé časy, součet obou metod i procenta. Strojový HUD ukazuje skutečný příjem na dvě desetinná místa, budoucí sazbu jednotlivých pramenů, základ konstrukce → regionální výkon a odkaz do deníku. Zábor hlásí skutečný příjem, připojení regionu použitý výkonový bonus; přechod používá existující zvuk evoluce. Čísla a text jsou čitelné bez závislosti na barvě.

## Datová kompatibilita a odměny

Formát kampaně v3, historie v1 a kmene v2 zůstává. Neexistuje nový uložený bonus, přepsaná základní sazba nebo claim marker. `tribeInheritance` vyžaduje dokončený kmen, přesný historický roster tří nebo nový pěti, všechny odpovídající jedinečné historické fakty a shodné uzavření. Tři výsledky z nové pětice, samotný vztah či částečná historie bonus nevytvářejí.

| Situace | Chování |
| --- | --- |
| Save bez historie, samotný parser/API | Zůstane bez historie a bez odvozeného bonusu. Parser minulost nevymýšlí. |
| UI load/import starého rozehraného kmene | Stávající aktivace A zaznamená explicitní resolved jako saved; bonus až po skutečném dokončení všech tří/pěti. |
| Starý hotový kmen / kampaň už ve strojích bez historie | UI doplní explicitní výsledky s neznámým časem; úplný důkaz dává pouze budoucí sazby. Načtení nepřidá jantar ani nezmění region/konstrukci. |
| Save s již existující úplnou historií A | Výsledek se přímo spotřebuje, nic se nemigruje ani nepřepisuje. |
| Historický kmenový náhled nebo neúplný zmrazený důkaz | Bez bonusu. Historická trojice se nerozšiřuje na pět. |
| Kampaň po strojové etapě | Historie zůstane viditelná, nové sazby B1 se neuplatňují. |

B1 výslovně spotřebovává i doložené saved kmenové výsledky; původní pravidlo A, které nepřidává tvorový bonus starému dokončenému tvorovi, se nemění. Změna sazeb starého strojového savu je úmyslná a neplatí zpětně. Například historický save se dvěma prameny má po aktivaci příjem 1,80 místo 1,50 jantaru/s, ale jeho uložený zůstatek je přesně zachován.

Opakovaný přechod se odmítne; opakovaný import/load pouze znovu odvodí stejnou sazbu. Obnova vrátí historii, svět a ekonomiku z checkpointu společně. Parser nyní chrání i uzavřený kmenový záznam s původem saved před rozdílem mezi live a checkpointem. Rozehranou neúspěšnou větev lze jako dosud vrátit, její výsledky a odměny se nesčítají.

## Regresní ověření

**52 nových regresí, celá sada 142 souborů / 2 643 testů prošla** za 77,68 s. `pnpm exec vitest run --maxWorkers=1`, Node 22.23.1, pnpm 11.24.0, Vitest 3.2.4. Běh bez souběžného browseru, s původními timeouty; žádný testový limit, herní krok ani očekávání nebyly oslabeny. `pnpm typecheck`, `pnpm build` a `git diff --check` prošly. Finální JS `index-CeSZ0Ply.js`: 1 235,72 kB / gzip 380,40 kB; CSS 42,76 kB / gzip 9,61 kB.

- Nové cílené regrese pokrývají všechny tři výsledky a oba rostery, chybějící/duplicitní/neshodné důkazy, jediné použití sazby, skutečné přírůstky všech tří strojových archetypů, přechod, export/import, lokální save/load, checkpointy, všechny historické fixtures a oddělení terraformace.
- První cílený běh: 123/124, opravená příprava testu checkpointu. Samotné nastavení vztahu na 100 není herním vyřešením; test nyní skutečně zadá placený kontakt. Druhý cílený běh: 139/139 v pěti souborech. Herní očekávání/limity se neoslabovaly.
- Nezávislé read-only review našlo P3 — chybějící okamžité oznámení výkonového bonusu při připojení regionu proti plánu. Opraveno s regresí pro tři cesty a neopakování hlášení. První review nenašlo funkční regresi a samostatně ověřilo 48/48 nových testů; následná kontrola opravy, dodatku smlouvy a browser assertions bez dalších nálezů, 52/52 testů. Vlastní diff review prověřilo i hranice etap, výpočty příjmu a výkonu, nezměněné ceny/design, UI a přesnost tvrzení.

## Produkční browser a SP-017

Chrome, 1280×720, produkční Vite build, běžné klávesy/tlačítka, file input a download, nativní RAF. Čtení `render_game_to_text` je pozorování; žádný přepis živého stavu, přímý zápis do localStorage nebo zrychlování simulace. Každý běh má izolovaný browser kontext, původní uživatelské kampaně se nemění.

**Připravené vstupy:** identické historické dokončené pobřeží/restoration/tělo → nová pětice. Čtyři sousedé mají připravené resolved před aktivací historie, a proto zdroj saved; pátý basalt je nevyřešený se vztahem 99 (allied/mixed), nebo prázdná osada se zdravím 1 (conquered). Zásoba 100 jídla. Členové začínají doma; bez připravených nástrojů, oděvů, strojů, jantaru či regionů. Zbývající svět se nemění. Toto není pět nově odehraných kmenových výsledků ani ekonomický průchod z běžného začátku; ty už doložila SP-008.F.

| Běh | Build / výsledek | Skutečný rozsah |
| --- | --- | --- |
| Tři připravené cesty od kmene | `index-BZxBXl7q.js`, **21/21 skupin**, 319,129 s, 0 browser chyb | Poslední fyzická diplomacie/obsazení, uzavření allied/conquered/mixed, přechod, placený stejný stroj, fyzický zábor pramene, měření příjmu, export/import a lokální save/reload/load, regionální práce a dvě fyzické dodávky. |
| Finální replay všech tří | `index-CeSZ0Ply.js`, **15/15 skupin** po opravě čekání ovladače, 0 browser chyb | Nezměněné UI exporty po záboru z předchozího běhu. Znovu příjem, save/import/load, skutečná rychlost práce, dvě dodávky, připojení a hlášení +20/+10 %. Nejde o nový kmenový průchod. |
| Historický save už ve strojích | Finální build, prošlo | Nativní import původní historické trojice. Příjem 1,50 → 1,80/s; zůstatek 172,98500000007212 → 176,73500000007226 odpovídá pouze nově uplynulému času (očekáváno 176,7350000000687). Tělo zachováno, původ saved, čas null. |
| Nativní načtení finálních exportů a skill smoke | Finální build, prošlo, 0 chyb | Všechny tři připojené regiony a sazby, deník se čtyřmi saved a jedním action faktem; krátké vstupy do běžící smíšené kampaně. |

| Cesta / stejný vrt 7 | Naměřený jantar/s | Naměřená obnova půdy/s | Zobrazený regionální výkon |
| --- | --- | --- | --- |
| allied | 0,7200000000000683 | 1,960000000000162 | 7,00 |
| conquered | 0,5999999999999147 | 2,3520000000001944 | 8,40 |
| mixed | 0,6600000000002046 | 2,1560000000000716 | 7,70 |

První finální replay prošel allied/conquered, ale při mixed přečetl toast ihned po simulačním dokončení před obnovou HUD. Diagnostický stav měl region player a 2 osady; následující snímek už ukazoval správné hlášení +10 %. Ovladač nyní čeká na zmizení tlačítka připojení; samostatný stejný mixed replay prošel. Herní zdroj, assertions a časové limity se neměnily. Přechodný allied snímek s předchozím stavem panelu byl nahrazen snímkem po nativním načtení finálního exportu. Nejde o oslabení očekávání ani opravu simulace podle testu.

Původní `develop-web-game` klient běžel z byte-identické dočasné kopie (SHA-256 v `verification.json`). Adaptér pouze vybral instalovaný Chrome, provedl běžné UI importy a nahradil jeho vloženou časovou pomůcku skutečným čekáním. Herní `advanceTime` zůstalo undefined. Screenshot canvasu byl otevřen a po ověření odstraněn jako duplicita; nešlo o screenshot kompletního HUD. Zvuk přechodu používá existující syntézu evoluce; **skutečný poslech nebyl proveden**.

Prohlédnuto všech **devět ponechaných finálních snímků**: tři pracovní, tři po dokončení a nativním reimportu, přehled smíšeného dědictví, jeho konkrétní fakta a historická strojová kampaň. Žádné překrytí potřebných akcí; příjem/výkon, odemčení letounu, původ i hlášení jsou čitelné. Automatická prohlídka není lidský playtest srozumitelnosti nebo zábavnosti.

## Reprodukce a evidence

```sh
pnpm exec vitest run tests/tribe-inheritance.test.ts --maxWorkers=1
pnpm exec vitest run --maxWorkers=1
pnpm typecheck
pnpm build
pnpm test:tribe-inheritance
INHERITANCE_OUTPUT=evidence/sp-007b1/final pnpm test:tribe-inheritance --replay
```

Replay vyžaduje odehrané `production/*-spring.save.json` z prvního příkazu browseru. Volba `INHERITANCE_ROUTE=allied|conquered|mixed` omezuje scénář na jednu cestu. Trace zůstává opt-in přes `LUMAVORA_TRACE=1`.

- [Souhrn ověření](../../evidence/sp-007b1/verification.json), [první tři průchody](../../evidence/sp-007b1/production/results.json), [finální allied/conquered](../../evidence/sp-007b1/final/replay-first-results.json), [finální mixed](../../evidence/sp-007b1/final/results.json), [historická kompatibilita](../../evidence/sp-007b1/skill/compatibility.json).
- Aktivní finální exporty: [allied](../../evidence/sp-007b1/final/allied-active-campaign.save.json), [conquered](../../evidence/sp-007b1/final/conquered-active-campaign.save.json), [mixed](../../evidence/sp-007b1/final/mixed-active-campaign.save.json).
- Snímky v `evidence/sp-007b1/final/`, historický v `skill/historical-machines.png`. Evidence je lokální a gitignored; tento report, plán, smlouva, testy a browser scénář jsou zdrojové soubory pro verzování.

[Manifest úklidu](../../evidence/sp-007b1/cleanup-manifest.json): odstraněno 24 vlastních mezivýstupů / 6 024 451 B, včetně duplicitních snímků/saveů, selhaného diagnostického výpisu po zápisu příčiny, podrobného testového logu a dočasného skill klienta/adaptéru. Ponecháno přibližně 5,6 MiB důkazů, devět snímků, vstupy/replay savey a nejnovější aktivní kampaně. Trace/video/screencast/archiv nevznikly, `.playwright-mcp/traces/` neexistuje. Browsery/preview uzavřené. Před během 23 GiB volných, po úklidu 22 GiB; jiná historická evidence ani uživatelská data se neodstraňovala.

**SP-007.B1 je dokončená.**

## Meze a další krok

Připravené vstupy nejsou nová kmenová kampaň od začátku. Browser porovnává stejný organismus a restoration; predator/migration a checkpointové větve jsou regresní důkazy. Lidský playtest, poslech, Safari/mobil, dlouhý soak, úplná šestietapová kampaň a globální vyvážení nejsou tímto úkolem doložené. Zůstává známé upozornění Vite na velikost hlavního chunku.

B1 nepřidává nezávisle volenou civilizační strategii: dnešní `region.method` stále odpovídá pobřežnímu archetypu. SP-007.B2/D, SP-009 a SP-010 zůstávají mimo tuto změnu. Následující vývoj má nejprve připravit planetární rozhraní SP-010 pro města SP-009, na jejich skutečné volby naváže B2. Celé SP-007 a SP-017 zůstávají otevřené. Ruční migrace kampaně není potřeba.
