# SP-009.E — první vojenská cesta · report v1

Dokončená omezená část nad čistým `eb3c050250e848bf7ca7becae16584b690086065`,
25. září 2026. Bez commitu, pushe nebo deploye. [Plán](../superpowers/plans/2026-09-25-sp-009e-military.md)
a [smlouva v1](SP-009E-CONTRACT.md) vznikly před implementací. Použit skill
`develop-web-game`; původní architektura TypeScript/Vite/Three a závislosti zachované.

## Výsledek a hranice

Původní placený tank skutečně dojede od vstupu města, útočí s dosahem a kontrolou
překážek, dostává zásahy od placené stráže a po jejím zničení musí fyzicky obsadit
náměstí po 5 nepřerušených sekund. Vlastnictví mění až úspěšné vyhodnocení simulace.
Zastavení/odchod obsazování přeruší. Zničený tank nic nezíská; poškození se ukládá.

Jediná autorita hráčových jednotek je původní `machines.fleet`, původní editor
platí skutečnou konstrukci. Nasazení je jeden tank s dělem, bez nákladu u domácí
dílny, obal nejvýše 4; explicitní pevninská přeprava trvá 5 místních sekund/hrana.
Stráž používá původní tankovou konstrukci, jednu konečnou platbu 40 z rezervy D,
odolnost 62 a výkon 7,7. Původní regiony, prameny, jednotky a regionální efekty B1
nejsou přepisovány; B1 nevytváří nové odměny za město. Útok sdílí původní dělový
zásah, pohyb původní kolizní navigaci. E nepřidává druhou hráčovu flotilu.

CityRegistry v5, States v2 a Military v1 oddělují `foundingOwner` od `owner`.
Capture obsahuje původního vlastníka, ID stroje, bojový čas a účetní snapshot.
Převzetí zachová pokladnu, budovy/vzhledy, obyvatele/jídlo, ledger a místní čas;
zvýší revizi oprávnění. Státní doklady včetně obranné platby zůstávají historické.
Opakovaný rozkaz nemůže převést město či zaplatit znovu. Stát po ztrátě posledního
města dále neosídluje, zbytek rezervy nedostane hráč. AI v E nenapadá hráčova města,
takže ztráta posledního hráčova města touto cestou nenastává.

B místní čas, C zmrazení domova a D strategický čas zachované. Boj/přeprava běží
jen v aktivním cílovém detailu; pauza, knihovna, editor a globál stojí. Odchod
uchová zdraví a cooldowny a vynuluje obsazování, návrat nic nedohání ani neléčí.
Migrace live i checkpointu je explicitní, opakovatelná a před rekey; historické
kampaně dostanou pouze doložený původ a prázdnou vojenskou vrstvu. Stráž se může
zaplatit až následující skutečnou strategickou akcí.

## Ověření a opravy

- Úplná sada: 150 souborů / 3 072 testů, 91,75 s, `--maxWorkers=1`. Následné dvě drobné
  opravy detailu vlastníka a výšky renderovaného tanku ověřeny finálními 29/29
  vojenskými testy; přibyla regrese výšky modelu a rozšířil se test hospodaření.
  Úplná sada po těchto posledních úpravách znovu neběžela.
- Determinismus, konečné finance/dvojí rozhodnutí, skutečné poškození/porážka,
  dosah/překážky, obsazení a přerušení, oprávnění/revize, stavba/vzhled/demolice,
  fyzický návrat, oba dobyté cíle a poražený stát, migrace/rekey/checkpoint,
  vadné vstupy a všechny geografické fixtures jsou v regresích.
- Typecheck, produkční build a diff-check prošly. Finální JS
  `index-CIODeTc_.js`: 1365,16 kB / gzip 424,65 kB. Známý warning velkého chunku
  zůstává; žádné změny limitů, závislostí nebo lockfilu.
- Vlastní kontrola diffu a nezávislý subagent `/root/sp009e_review`: opravené
  překrytí tanku stavbou, přepis původu ekonomiky, příliš malý kolizní obal,
  zastaralý vlastník v detailu a zapuštěný tank. Subagent všechny nálezy uzavřel
  a samostatně spustil 29 testů/typecheck/diff-check. Kontrola druhého dobytého
  města navíc odhalila uvíznutí u dekorace; použit úplný existující navigační graf.

## Produkční průchody a připravené vstupy

Vojenský browser používá skutečný D export, byte-identicky přidaný jako
`tests/fixtures/geography/sp-009d-states.save.json`, SHA256
`e7e6329b53e4d9688a084207b1cbd74add0b2cfec9d20569d860969560fe3bbf`.
D originál a starší aktivní B/C save ani historické fixtures nebyly přepsány.
Browser čeká na příjem původních pramenů do 90 jantaru; původním editorem odebere
vrták, přidá dělo a zaplatí tank 56. Nevkládá peníze, obranu, poškození ani dobytí.

**5/5 skupin, 0 browser chyb** na finálním buildu:

1. Import D, skutečný výdělek, zaplacený původní tank a konečné nákupy stráží.
2. Pauza/editor/knihovna/globál zmrazí všechny příslušné časy; fokus a mezerník
   aktivují rozkaz při 1024×640.
3. Tank #12 proti stráži Zeleného dvora 1 v lokalitě 1542, trasa 1614→1542.
   Stráž 62→0, tank 88→41,8. Export/import během střelby, odchod/návrat,
   přerušené a znovu dokončené obsazení. Původní founding a doklady zachované.
4. Nový vlastník provede převod 20 do města. Tank fyzicky ustoupí a vrátí se
   stejnou dopravou se zdravím 41,8. UI save/load/reload/export/import/rekey
   uchovají dobytí i původní jednotku.
5. 20 návratů; checkpoint obnoví předbojovou větev bez sloučení výsledků.

Pouze **checkpointový vstup je připravený offline**: odehraný finální export má
nulové zdraví avatara a vložený skutečný předbojový export jako checkpoint stejné
linie. Po importu hráč stiskne obnovu; kontrolují se původní stroje, stráž,
vlastník a absence capture. Není vydáván za přirozenou smrt při vojenském boji.
Všechny živé akce jsou běžné UI/native RAF, bez zápisu do živého stavu/localStorage,
bez `advanceTime` či zrychlení. Testovací driver pouze čte veřejné diagnostiky.

Historický browser **12/12, 0 chyb** na stejném buildu zahrnuje původní etapy,
přechody, kmen se třemi sousedy/B1, terraformaci a sandbox. Jeho připravené legacy
průchody a mrtvá větev jsou výslovně popsány v `historical/PREPARED.md` a výsledcích.
Nejde o nový kompletní organický průchod od buňky.

Původní skill klient používá adaptér skutečného času a běžný UI import finálního
save. Zachovává původní vstupní/snímkovou/chybovou smyčku; odstraňuje virtuální
čas a čeká na skutečné snímky. SwiftShader tohoto krátkého smoke testu není
výkonnostním důkazem. Otisky a přesné rozdíly v `skill/adapter.json`.

Finální snímky boje/převzetí 1024×640 a města po návratu 1280×720 prohlédnuté.
Při úzkém rozlišení má panel vlastní svislý posuv; scéna, vlastnictví, zdraví,
cena a rozkazy jsou dostupné. Historické stroje a sandbox 1024 rovněž prohlédnuté.
Dva předchozí evidenční snímky zachytily HUD před jeho pravidelnou obnovou;
čekání driveru bylo opravené a průchod zopakovaný, herní čas nezrychlený.

## Měření a evidence

Chrome headless, nativní RAF, produkční build, pixelRatio 1. Rozkaz útoku
od kliknutí do pozorovaného rozkazu: 34.66 ms (jeden vzorek).
Posledních 300 snímků u skutečného boje: p50 16.70 / p95 16.80 ms.
Po pozastavení boje heap po GC 20.60 MB,
570 geometrií / 24 programů / 2232 živých GPU bufferů (včetně dřívějšího editoru).

22 návštěv: p50 30.45 / p95 31.55 ms;
20 návratů domů: 48.61 / 52.00 ms.
Mezi návratem 10/20 stabilních 331 geometrií / 18 programů / 1294 bufferů;
heap po GC 20.06→21.26 MB.
Krátký vzorek nepotvrzuje nepřítomnost dlouhodobého úniku. GPU čísla jsou počty
prostředků WebGL, nikoli měření času GPU nebo obsazené VRAM. Hodnota globálního
`frames` ve výsledku pochází až z posledního checkpointového importu; výkon boje
dokládá samostatné pole `combat.frames`.

Evidence: `evidence/sp-009e/browser/results.json`, tři finální PNG, odehrané
checkpointy a `active-campaign.save.json`; historický výsledek a dva snímky;
verification logy a review. Vlastní mezisnímky, duplicity, dočasný adaptér a
historické pracovní exporty uklizeny s otisky v `cleanup-manifest.json`.
Trace/video se nezapínaly. Disk před prací 16 GiB volných; po úklidu zaznamenán
v manifestu. Cizí artefakty se nemažou.

## Opakování a přesné pokračování

```sh
pnpm exec vitest run tests/military.test.ts
pnpm typecheck
pnpm build
pnpm preview --port 5213 --strictPort
# V druhém terminálu:
LUMAVORA_URL=http://127.0.0.1:5213 pnpm test:military
HOME_PLANET_OUTPUT=evidence/sp-009e/historical LUMAVORA_URL=http://127.0.0.1:5213 node scripts/home-planet-browser.mjs --geography
```

K pokračování stačí importovat aktivní E save přes Uložené linie. Ruční migrace
není potřebná. Nový běh driveru přepíše pouze výstupní evidenci E; pro uchování
kampaně zvol `MILITARY_OUTPUT` do jiné složky.

Přesně dále: nejprve smlouva obrany hráčova města a protiútoku státu, s původními
jednotkami, konečnými náklady, ztrátou posledního hráčova města a opakovaným
převzetím. E je jeden tank a jedna stacionární stráž; neřeší multiarmády,
recapture, mlhu války ani invaze. Obchodní převzetí/konverze, knihovna vozidel/lodí,
moře/vesmír a SP-007.B2/D mimo rozsah. Celé SP-005.B/SP-009/SP-010/SP-017 zůstávají
otevřené. Neověřený je lidský playtest/poslech, Safari/mobil a dlouhý soak;
krátké automatické výsledky nejsou důkazem dlouhodobého vyvážení.

## Dodatek k uložení do Gitu · 25. září 2026

Po dokončení ověření uživatel výslovně autorizoval commit SP-009.E. Před jeho
vytvořením všech 57 otisků závěrečného manifestu souhlasilo a HEAD byl stále
`eb3c050250e848bf7ca7becae16584b690086065`. Tento dodatek a záznam v PROGRESS.md
nemění ověřený herní kód. Push ani deploy nebyly požadovány.
