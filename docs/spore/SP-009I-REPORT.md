# SP-009.I — první omezená námořní expanze · report v1

25. září 2026; navazuje na čistý `907dd49fd`. Bez commitu, pushe, deploye,
nových závislostí nebo změny lockfilu. [Plán před implementací](../superpowers/plans/2026-09-25-sp-009i-maritime.md),
[datová smlouva v1](SP-009I-CONTRACT.md). Vymezený námořní průchod I je dokončený a ověřený.

## Skutečný vstup a proveditelnost

Lokální ignorovaný originál `evidence/sp-009h/browser/active-campaign.save.json`
existoval v původním pracovním adresáři. Nová verzovaná fixture
`tests/fixtures/geography/sp-009h-conversion.save.json` je byte-identická:
250 761 B, SHA256 `c2f0d211d71661671114f23bf8dc694124558bddac2763ddfbcd2d42ab3c88d4`.
Originál ani starší aktivní savey se nepřepisují.

H má seed 481516, etapu 4, tick 54864, aktivní lokalitu 1543 a domácích
50,705 jantaru. Původní prameny #4/#5 s B1 dávají 1,8/s pouze doma.
Pokladny pěti měst 32/74/34/30/13 nejsou zdrojem člunu.
Svaz nemá město a drží zmrazené účty 0/203; Liga nemá město a drží 40/0.
Původní fleet #8 tank 87 zdraví, #10 letoun 81, #14 tank 41,8;
nasazení žádné, jediný historický výpad zničený. Nic z toho se nedoplňuje.

Domov 1614 patří continent-756, nové pobřeží 1171 continent-588 (8 m,
deštný les); voda je ocean-0. První audit našel 17hranovou cestu uvedenou
v plánu. Implementace používá stabilní pořadí `atlasNeighbours` a mezi stejně
krátkými cestami vybere:

`1614 → 1613 → 1612 → 1611 → 1610 → 1609 → 1608 → 1607 → 1606 → 1605 → 1604 → 1603 → 1531 → 1459 → 1387 → 1315 → 1243 → 1171`.

Vnitřní buňky jsou voda a každá dvojice sdílí hranu. Atlas 72×36,
HomePlanet v3, generátor 1, původní regiony/habitaty i detailGenerator 1
zůstávají stejné. Původní detail cíle poskytuje tři měření a platné místo
pro založení za 60. Audit kandidáta nebyl vydáván za odehrané přistání.

## Implementovaný průchod

- Jeden pevný `SeaBlueprint` v2: trup 16 + kabina 8 + šroub 32 = 56.
  Sdílené konstrukční části, cena, stats a renderer původních strojů;
  původní tank/air blueprint v1 a fleet zůstávají kompatibilní.
- Objednávka doma, potvrzení jediné spotřeby z domácí zásoby, samostatný
  výběr prostředku/cíle a potvrzení nástupu/vyplutí. Jeden doklad
  before − amount = after. Bez příjemce, dotace, vratky, odměny nebo vlastnictví.
- Tentýž avatar ve viditelném člunu projíždí uloženou BFS trasu rychlostí
  jedna aktivní sekunda/hranu. Jde o strategický pobřežní přesun a schematickou
  mořskou scénu, nikoli nově vygenerovanou pláž nebo souvislý globální terén.
- Přerušení obrátí po projeté části se stejným časem zpět. Přistání je výslovné;
  teprve poté vzniká původní detail a návštěva. Avatar může chodit/měřit/založit
  město původními pravidly. Člun kotví na pobřeží a návrat používá tutéž instanci.
- Nové vzdálené pevniny vyžadují člun i po první návštěvě. Staré výpravy včetně
  místa 776 zůstávají přístupné přes explicitní migrační seznam, bez fiktivních
  lodí nebo plaveb. Na souši člun nesleduje avatara automaticky.
- Nasazená jednotka blokuje vyplutí. Nedořešený výpad blokuje další expedice,
  ale případný pozdější výpad dovoluje civilní návrat přímo domů. Na moři se
  neprovádí místní boj, převzetí, výstavba, obchod ani konverze. Nepřátelské město
  nepřijímá výsadek; plavidlo nepřepravuje tanky.
- Na moři běží námořní a strategický čas, místní světy/RNG/domácí tick/příjem,
  jednotky a ekonomiky jsou zmrazené. Pauza, editor, knihovna, atlas a skrytý tab
  nic nedohánějí. Změna kamery nebo uložení nemění cestu.

## Persistence a účetnictví

Volitelné `maritime` v1 nese jediný prostředek, platbu, kotviště, revizi,
historické přístupy a nejvýše 128 cest. Poslední záznam je vyhrazen návratu domů;
tento návrat už nelze obrátit. Další rozsah vyžaduje novou smlouvu.
Původní CityRegistry v8 / States v4 / Military v2 a save obálka v3 beze změny.

Explicitní migrace nejprve aktivuje H, potom prázdnou I větev živého stavu
**a jeho checkpointu před rekey**. Každá větev zachová své vlastní historické
lokality. Parser nemigruje; opakování nemění checkpoint string. Parser ověřuje
přesný tvar, konečná čísla, původní atlas, cenu, identitu, návštěvy, čas/fázi,
navazující kotviště a společný prefix historie. Rozpracovaný návrat nesmí
v checkpointu změnit bod obratu. Dokončené konce se normalizují přesně,
aby tolerance běžného 60Hz času nemohla vyrobit neuložitelný výsledek.

Smrt nemá samostatnou vratku nebo nový člun; obnova nahradí celou checkpointovou
větev včetně prostředků, světa, cest, měst, vlastníků a E/F/G/H. Checkpoint před
nákupem tedy obnoví původní větev bez nákupu, ne refundaci do živé historie.

## Ověření a připravené vstupy

Nové regrese zahrnují H otisk, determinismus, platné/neplatné pobřeží/vodu,
nedostatek a jedinou platbu, dvojí/zastaralé příkazy, souběh nasazení/výpadů,
zmrazení, přerušení, skutečný návrat, přesně 60Hz konce a 128 skutečně
odsimulovaných cest. Save/load, export/import/rekey, celý checkpoint i vadné
historické prefixy mají pozitivní a negativní případy. Historické A–H,
původní etapy a B1 zachovávají data a byte-identické vstupy.

Produkční scénář `pnpm test:maritime` používá původní H fixture a standardní
UI s nativním RAF. Peníze čekáním u pramenů, nákup, plavba, měření chůzí a E,
založení „Zátoky za mořem“ za 60, návraty a export jsou hrané výsledky.
Žádné živé settery, zápisy localStorage nebo zrychlení času.
Samostatně označený **offline připravený spouštěč smrti** spojuje skutečný
pozdější export s dřívějším skutečným exportem během plavby jako checkpointem.
Nejde o odehranou smrt. Jednotkové testy smějí připravit polohy/výpady pro
hraniční případy; ty nejsou prezentované jako produkční H kampaň.

První browser diagnostika opravila nesprávný referenční bod zmrazení (mezi
cestami se doma legitimně hrálo). Druhá opravila výběr starého load slotu;
finální test načítá přesné importní ID. Starší H regrese nově musí
zachovávat existující konverzní historii nové H fixture, nikoli ji pokládat
za před-H stav. Po jednom timeoutu staršího testu při souběhu s browserem byl odstraněn
souběh zátěže; celá sada znovu prošla s dvěma workery bez změny timeoutů.

Nezávislé review `/root/review_sea` odhalilo a znovu prověřilo opravy přesných
konců, rozbalených detailů, návratu při pozdějším výpadu a checkpointového bodu
obratu. Další závažný nález nemělo. Drobná závěrečná připomínka vedla k disabled
obratu na poslední cestě s předem viditelným vysvětlením a regresí. Vlastní
kontrola navíc opravila nabídku přežívající změnu výběru města; reset nabídky
a kontrola pobřeží před potvrzením prošly testy i produkčním UI. Nezávislá
závěrečná kontrola aktivního savu, účetnictví, GPU vzorků a snímků nenašla
rozpor; report upřesnil dosud neotevřené hospodářství nového města.

## Finální produkce a výkon

Build `index-Cr1vbKhY.js`, JS 1 456,65 kB / gzip 453,30 kB; známé upozornění
na velikost chunku zůstává. Typecheck, build a diff-check prošly. Úplná finální sada **155 souborů / 3 309 testů** prošla; výsledky
jsou doložené v [test logu](../../evidence/sp-009i/verification/tests-final.log);
finální úzká sada 139/139 zahrnuje 69 námořních regresí. Ověřeno 33 původních
kódových/datových fixtures proti HEAD a 34 starších exportů proti H evidenci.

[Produkční průchod](../../evidence/sp-009i/browser/results.json) **4/4, 0 chyb**:
49,783 s skutečného čekání vydělalo 89,43 před objednávkou. Platba
140,135 − 56 = 84,135 má jediný doklad. Aktivní export po založení a
20 zpátečních okruzích obsahuje 43 cest, šest měst, původní fleet,
stejnou historii E/F/G/H a domácích **26,295**. Celá účetní rovnost:
**50,705 + 91,59 skutečného domácího příjmu − 56 − 60 = 26,295**.
Svaz stále 0/203 a Liga 40/0. Žádná cesta nevydělala jantar. Krátká počáteční návštěva původní lokality 1543
před návratem domů změnila pouze její ekonomický akumulátor z 5,2333 na 5,35 s;
historie, majetek a pokladna se nezměnily.

[Historický browser](../../evidence/sp-009i/historical/results.json) **12/12, 0 chyb**
na stejném buildu zachoval původní etapy, geografii, B1 a checkpointy.
[Původní skill klient](../../evidence/sp-009i/skill/adapter.json) s popsaným nativním
adaptérem prošel, snímek prohlédnutý; SwiftShader smoke není hardwarový benchmark.

Chrome / ANGLE Metal Apple M4, viewport 1024×640, pixelRatio 1. Opakování
použilo skutečnou krátkou vodní cestu `1614 → 1613 → 1541` a zpět, 20 okruhů
bez trace/video nebo zrychlení času. Trasy do nové pevniny 1171 a zpět byly
samostatně skutečně odehrané, včetně přerušení.

| Měření | Výsledek |
| --- | --- |
| Potvrzení vyplutí → UI, 43 vzorků | p50 46,85 / p95 65,37 / max 67,23 ms |
| Potvrzení přistání → UI, 43 vzorků | p50 128,74 / p95 286,81 / max 303,25 ms |
| RAF během okruhů, 5 932 vzorků | p50/p95 16,70 ms, max 50 ms |
| JS heap po GC, 0/10/20 okruhů | 19 309 420 / 20 365 504 / 20 866 616 B |
| Backing storage, 0/10/20 | 11 017 384 / 11 023 277 / 11 023 224 B |
| Geometrie / textury / programy, 0/10/20 | vždy 242 / 1 / 14 |
| Živé WebGL buffery, 0/10/20 | vždy 960 |
| GPU timer při vykreslované zámořské plavbě | 60 vzorků, p50 0,586 / p95 0,913 / max 1,739 ms |

Timer bere pouze dostupné nedisjoint výsledky a **každý přijatý vzorek obsahuje
78–80 skutečných draw calls**; počty jsou uložené u vzorků. GPU čas je krátký
vzorek jedné plavby; stabilita prostředků je zvlášť měřená během 20 okruhů.
JS heap mírně roste, GPU prostředky v této sérii nerostou. Bez delšího soaku
neprohlašujeme obecnou absenci úniků. Přistání může krátce zabrat kolem 0,3 s.

Prohlédnuté finální snímky:
[platba1024](../../evidence/sp-009i/browser/paid-1024.png),
[plavba1024](../../evidence/sp-009i/browser/sailing-status-1024.png),
[přerušení1024](../../evidence/sp-009i/browser/returning-1024.png),
[založené město1024](../../evidence/sp-009i/browser/landed-city-1024.png),
[návrat/účty1024](../../evidence/sp-009i/browser/final-route-1024.png),
[návrat1280](../../evidence/sp-009i/browser/final-route-1280.png).
Snímky posledního load ověření ukazují 27,05 po dalším legitimním pobytu doma;
aktivní export 26,295 vznikl před tímto ověřením. Nejde o rozdíl v účtu lodě.

[Aktivní hraná I kampaň](../../evidence/sp-009i/browser/active-campaign.save.json),
[skutečný export během plavby](../../evidence/sp-009i/browser/crossing.save.json),
[odděleně připravená smrt](../../evidence/sp-009i/browser/prepared-death.save.json),
[review](../../evidence/sp-009i/verification/review.json),
[úklidový manifest](../../evidence/sp-009i/cleanup.json).
Odstraněno 31 vlastních mezivýsledků/pracovních kopií, 6,25 MB; ponecháno
přibližně 3,87 MB evidence. Disk při zahájení přibližně 17 GiB volný,
po úklidu 19,27 GiB; změna zahrnuje i vnější aktivitu, není úsporou této práce.
Žádné trace/video ani vlastní `.playwright-mcp/traces` soubory.

## Meze a přesné pokračování

Tento výsledek nepřijímá celé SP-005.B, SP-009, SP-010 ani SP-017. Nezahrnuje
flotilu, námořní boj, diplomacii, trh, knihovnu vozidel/lodí, vesmír nebo B2/D.
Neověřuje Safari/mobil, lidské porozumění/poslech ani dlouhý soak. GPU prostředky
nejsou GPU čas a krátká stabilita se nevydává za důkaz nepřítomnosti všech úniků.

Herně lze importovat finální aktivní I save, z domácího atlasu zvolit 1171
a vyplout vlastním člunem zpět k založenému městu. Nové město má zatím `economy:null`; lze v něm původními placenými pravidly
otevřít hospodářství a pokračovat rozvojem podle B/C. Automatická migrace nepotřebuje ruční zásah.

Vývojově pokračovat samostatným plánem **SP-007.B2**, nyní nad skutečnými
volbami a historií E/F/G/H/I: nejprve určit, které doložené výsledky expanze
jsou děditelné, a jak je zaznamenat bez přepsání B1 nebo domyšlené minulosti.
Nejprve smlouva a audit aktivního I save; samotné B2 se tím nezačíná ani neuzavírá.
Širší civilizační zakončení a zbývající kritéria mateřských karet zůstávají otevřená.

## Navazující publikace

Výslovný navazující pokyn uživatele autorizoval commit a push SP-009.I do `main`.
Před uložením všech 72 otisků finálního manifestu souhlasilo a vzdálený `main`
odpovídal výchozímu `907dd49fd`. Tento publikační dodatek mění pouze dokumentaci;
ověřený kód a výsledky zůstávají stejné. Bez deploye. Ignorovaná evidence včetně
aktivního I exportu zůstává v původním pracovním adresáři.
