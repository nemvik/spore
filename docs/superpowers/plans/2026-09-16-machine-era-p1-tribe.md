# P1 — Hratelný kmen

Prováděcí plán navazuje na ověřené P0, společný machine-era spec a sekvenční roadmapu. Cílem celého aktivního úkolu zůstává dokončení P1–P3; tento plán vymezuje první prováděnou část. Žádný multiplayer, nové závislosti, commit ani deploy.

## Schválená rozhodnutí

Zadavatel 2026-09-16 potvrdil: tlupa nejvýše 12 členů s ověřením výkonu/čitelnosti, čtyři mechanicky odlišné nástroje, později surovina „jantar“, pouze pozemní a létající stroje a terraformační druhy získané skutečným ekologickým kontaktem. Rozsah nesnižovat na další náhled.

Čtyři nástroje: koš (větší náklad), oštěp (boj), buben (diplomacie), měch (léčení a péče). Každý potřebuje dokončenou příslušnou dílnu a stojí jídlo. Chýše rozšiřují kapacitu. Nástroje jsou viditelné na modelu; tělo zůstává zamčené.

## Datový kontrakt a návaznost

- Kořenový save zůstává v3. `TribeState` rozliší dosavadní P0 řez v1 a hratelný řez v2. V1 se při načtení sám nerozvine; prázdný náhled nabídne založení kmene. Nový výslovný vstup po pobřežním vítězství založí hratelný kmen v2.
- V2 nese členy s původním genomem či druhem symbionta, hladem, zdravím, nástrojem, nákladem a frontou rozkazů; dokončené/rozestavěné budovy; tři sousedy; zděděnou schopnost, její cooldown a dokončení etapy. Vše potřebné pro deterministické pokračování včetně navigačního waypointu se ukládá.
- `player.genome`, `player.bonds`, původní světy i Journey zůstávají jako skutečné dědictví. V RTS se nekreslí druhé řiditelné tělo a orbitující kopie symbiontů. Jídelníček členů linie odvozuje `computeStats`; symbiont používá svůj druh a vlastní hlad.
- `campaign.won/finale` stále znamenají pobřežní výsledek. Kmen má vlastní dokončení, další finále nesmí přepisovat pobřežní historii. Zánik všech členů používá společnou obrazovku obnovy z checkpointu.

## T1 — Rozkazy a pohyb

1. `game/unit-order.ts`: společný `UnitOrder` pro pohyb, sběr, útok, diplomacii a stavbu; omezená fronta, validované cíle, deterministické pořadí ID. Nahrazení rozkazu i Shift přidání do fronty.
2. `game/unit-motion.ts`: používat existující `steerToward` přibližně 2 Hz, následně integraci, separaci a existující kolize. Žádný nový A*. Formace přidělit podle ID. Výpočet separace ze stejného snímku pozic.
3. Testy skutečného dojití kolem překážek, rozdělení skupiny, odmítnutí neplatného cíle a determinismu po save/load.

## T2 — Ekonomika, dědictví a sousedé

1. `game/tribe.ts`, `tribe-neighbours.ts`, `tribe-copy.cs.ts`: veřejné atomické akce pro rozkaz, nábor, založení stavby, výstroj, schopnost a přechod. Vstupy pouze volají tyto funkce.
2. Tři členové + každý skutečný symbiont, startovní chýše a konečná zásoba jídla. Sběr skutečně spotřebuje kompatibilní zdroj, náklad musí člen odnést do chýše. Hlad a léčení spotřebovávají zásoby; bez jídla může kmen zaniknout. Dravá linie může získat maso skutečným lovem; filtrační linie lovit nemůže.
3. Cena budovy se odečte jednou při založení. Člen ji musí dojít postavit; výstroj se odemyká až dokončením. Není prodej ani refund smyčka. Nábor vyžaduje místo v chýších, jídlo a živého člena.
4. Dědictví obnovy oživuje místní zdroje, regulace odrazuje útočníky, migrace posiluje péči a vztahy. Jednotlivé schopnosti mají viditelný účinek, dosah a cooldown.
5. Tři sousedé mají různé prostorové podmínky a reakce: zahrada, terasy a svatyně. Spojenectví vyžaduje skutečnou návštěvu, zásoby a sociální nástroje; boj přítomné bojovníky a riskuje odvetu. Každého lze vyřešit oběma cestami. Výsledek přetrvá a mění bezpečí/podporu.
6. Kontrola všech sousedů a alespoň jeden živý člen odemknou přechod 3→4; předčasný přechod musí vrátit konkrétní chybějící podmínku. P1 končí spustitelným výsledkem a přechodovým bodem pro bezprostředně navazující P2.

## T3 — Validace a staré pozice

Přesné klíče a rozsahy obou verzí řezu, unikátní ID, platné pořadí/cíle, návaznost nástroje na dílnu, kapacita a správný zděděný závěr. Všechny řezy v checkpointu. Round trip rozpracované stavby, neseného jídla, hladového symbionta a rozkazu. Poškozený obsah odmítnout, ne tiše opravovat. Dosavadní v1/v2 pozice nesmí změnit pravidla ani automaticky vstoupit do kmene.

## T4 — Render a vstupy

1. `render/settlement.ts`: cachované procedurální modely genomu a symbiontů, chýše, čtyři dílny, sousedé, skutečná výstroj, výběrové kruhy a stav zdraví/stavby. Nezasahovat do `habitat.ts` ani `organism.ts`.
2. Společné command picking API pro jednotku/cíl, obdélník a terén. Výběr a kamera jsou lokální prezentační stav, žádné ukládání do simulace.
3. Levý klik/Shift a rámeček vybírají; pravý klik zadá kontextový rozkaz, pravý tah otáčí, WASD posouvá kameru, kolečko přibližuje, klávesa domova zaostří tábor. Cancel/lost capture nesmí vydat rozkaz.
4. Samostatný `ui/tribe.ts` a styl: zásoby, kapacita, zvolený člen/výstroj, čitelné rozkazy a sousední vztahy. Tab otevře výstroj, nikoli tělesný editor. T/E/G mají viditelně popsaný význam. Přístupné tlačítkové ekvivalenty a nápověda.

## T5 — Ověření a uzavření

- Úzké integrační testy: tři seedy, pořadí jednotek, dt, dieta/lov, jednotliví symbionti, stavby/výstroj, nedostatek zásob, obě sousední cesty, zánik/obnova, úspěšný i odmítnutý přechod, všechny save stavy.
- Browser: oba úplné kmenové průchody skutečnými vstupy (přiznané pobřežní vstupní pozice), klik a rámeček, skupinový přesun, odnesení jídla, nábor, stavba, výstroj, diplomacie/boj, save/refresh a přechod. Žádné přepisování herního stavu po vstupu.
- Prohlédnout screenshoty, opravit skutečné problémy; změřit zobrazení 12 členů a čitelnost běžného viewportu.
- `pnpm typecheck`, `pnpm test`, `pnpm build`, původní browser/fixtures/production a soak. Historické pozice znovu ověřit. Nezávislý review persistence a přechodů.
- Aktualizovat PROGRESS/README/BENCHMARK s přesnými důkazy. Tempo 20–30 min je návrhový cíl, nesmí být vydáváno za změřený výsledek. Potom detailní plán P2 a hratelné stroje; celkový cíl zůstává aktivní až do ověřeného finále P3.
