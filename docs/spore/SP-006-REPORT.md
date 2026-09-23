# SP-006 — buněčná smyčka růstu a přestavby

Implementováno 23. září 2026 nad `a5250214b` (výchozí pracovní strom čistý). [Plán](../superpowers/plans/2026-09-23-sp-006-cell-growth.md), [roadmapa](ROADMAP.md#sp-006). SP-004 a SP-005 zachovány; bez nových závislostí, změny lockfilu nebo deploye.

## Hratelný výsledek

Nová linie začíná pokynem k jídlu. Skutečně snědená potrava postupně zvětší tělo, fyzický poloměr, ústa, ostny a toxinový dosah. Kamera používá existující plynulou interpolaci a ochranu proti překážkám; zachovává hráčovu polohu, směr pohledu a ručně nastavený zoom.

| Snědená sousta | Růst | Měřítko těla | Cílový odstup kamery při zoomu 25 |
| --- | --- | --- | --- |
| 0–2 | 0 | 0,65 | 20,5 |
| 3–7 | 1 | 0,90 | 24,5 |
| 8–14 | 2 | 1,25 | 28,5 |
| 15+ | 3 | 1,70 | 32,5 |

Každý růst přidá 10 DNA pouze jednou. Růst se nepřičítá za útok, pulz, odmítnuté jídlo ani znovunačtení a přetrvá přestavbu. Velká sousta jsou viditelně větší: minerál/maso vyžadují první růst, nektar a velké kolonie druhý. Jídelníček i skutečný dosah orgánů zůstávají další podmínkou. Malá buňka nemůže kousat většího tvora; po třetím růstu je jehloúst menší kořistí, přeruší i připravený útok a uhýbá. K lovu je potřeba v editoru vyměnit filtr za čelist.

Ústa skutečně sbírají nebo koušou v dosahu viditelného orgánu. Boční/zrcadlené ostny zraňují a odrážejí jen při lokálním kontaktu, s kontrolou překážky z těla i orgánu. Krunýř tlumí zásah bez odražení. Toxin (X) je aktivní plošná obrana za 15 energie se samostatným sedmisekundovým dobíjením; v nové buňce nezasahuje přes kámen. Barevné kontaktní kruhy a text rozlišují zásahy, jídlo a růst. Červený/zelený kruh jehloústa doplňuje výslovná nápověda hrozby/kořisti.

Tři zářící schránky ✧ se prozkoumají klávesou T do 5 m s volným výhledem. Růst 1/2/3 odemkne ostny/tykadla/toxin a každý nález jednou přidá 8 DNA. Sdílený záznam SP-004 zachová původ, tick, generaci objevu i první použití. Odemknutí se neutrácí. Editor centrálně odmítá neobjevené části; v kolébce nabídne kategorii nového dílu. Potvrzená placená konstrukce zapíše další generaci. Hlavní panel vede jídlo → objev → návrat do editoru, teprve po dokončení přenechá místo ekologickým cílům. Ekologické ovládání a přechody zůstávají funkční a dostupné i během úvodu.

## Ukládání a návaznosti

Volitelný `cellGrowth.version = 1` se zakládá jen u nové UI linie. Staré savey, historické konstruktory a přesné otisky simulace zachovávají původní pravidla. Formát kampaně zůstává v3; nové údaje mají striktní validaci polí, hranic, časů, generací, pořadí/identity schránek, odměn a shodného markeru checkpointu. Obnova generace zachová růst i objevy; stav bez checkpointu znovu založí stejný typ linie.

Na útesu se měřítko vrátí k pravidlům dané etapy, objevy zůstanou použitelné. Běžné útesové orgány, například recycler, se nezamknou. Na souši se do SP-004 přenesou i dosud nepoužité objevy včetně původních údajů; ostatní části dál odemykají tamní setkání. Knihovna SP-005 uchovává původní genetickou konstrukci, růst ji nepřepisuje. Nezávislý snapshot NPC kampaně se nemění.

## Ověření

macOS / Apple Silicon, Node 22.23.1, pnpm 11.24.0, Playwright 1.55.0 / Chromium 140, ANGLE Metal, 1280 × 720. Lokální servery a Chromium běžely s povolením mimo sandbox; trace a video vypnuté.

- **`pnpm test`: 119 souborů / 2 267 testů**, vše prošlo na finálním herním kódu.
- **26 nových regresí**: tři skoky, odměny a fyzické dosahy, dostupnost potravy, stejný predátor před/po růstu, lokální ostny a zakrytí, krunýř versus běžný zásah, toxin/recharge, tělo bez úst, objev/použití/DNA, smrt, útesové orgány, dědění na souš, save/checkpoint, SP-005 snapshot a vadné importy.
- **`pnpm typecheck`, `pnpm build`, `git diff --check`** prošly. Existující upozornění Vite na chunk nad 500 kB zůstává (hlavní JS 1 131,39 kB, gzip 342,84 kB).
- **Nezávislé review a vlastní review**: nejprve 103 relevantních testů save/knihovny; připravený modulový save/load etap 0–2 a nezměněný NPC snapshot. Geometrické review potvrdilo chybu ostnů u okraje kamene. Přímá regrese i regrese v1 těla bez úst nejprve selhaly a po opravě prošly; závěrečná kontrola nemá otevřený nález. Opraven byl také nechtěný filtr v ostatních editorech, zamčení recycleru a nápověda objevů na útesu.

Produkční SP-006 průchod začal **tlačítkem Nová linie, seed 481516**, bez připraveného save, bez změn živého stavu a bez `advanceTime`. Skript pouze čte textový výstup a posílá běžné klávesy/kliknutí; pohyb obchází existující kameny. Produkce výslovně ověřuje nepřítomnost vývojového časového hooku.

1. Kontrola zamčených ostnů; malé jídlo, první růst, T u schránky, návrat do kolébky, skutečná instalace a generace 2.
2. Další potrava, druhý a třetí růst, oba další nálezy, skutečně přidaná tykadla i toxin; generace 4.
3. Aktivace toxinu běžným X, výměna filtru za čelist v editoru, generace 5.
4. Doplutí k jižnímu jehloústovi, pozorovaný útěk, ulovení pohybem/mezerníkem a následné snědení masa.
5. UI export/import aktivní linie zachová genom, všechny objevy a maximální růst; knihovna se stále otevře.

Finální výsledek: **6/6 kontrol, 0 browser chyb**, generace 5, 24 jídel, 1 ulovený tvor a 58 zbývajících DNA. Růst 1/2/3 nastal při ticku 281/923/1764; první editor se skutečně otevřel při ticku 540. Jedná se o simulační čas (60 ticků/s), ne čas lidského hráče včetně pauz/editoru.

Samostatně prošel celý existující browser scénář **SP-005, 5/5 kontrol, 0 chyb**: oddělený editor, export/import/revize/kolize/vadný soubor, snapshot nové linie, setkání a nábor knihovního NPC a save/load po smazání knihovny. Jeho souš je výslovně připravená fixture, nikoli kampaň odehraná od buňky. Krátké měření této scény: 301 snímků, p50 16,7 ms, p95 16,8 ms, žádný nad 50 ms; nejde o dlouhý výkonový test SP-006.

Původní `develop-web-game` klient prošel v DEV i produkci (dočasná byte-identická kopie kvůli lokálnímu Playwright importu). DEV i finální produkční smoke zachytily krmení a první růst; krátký smoke nepředstavuje hlavní důkaz celé smyčky. Snímky byly skutečně otevřené a porovnané se stavem. Hlavním důkazem jsou reprodukovatelný nativní scénář a regrese, ne samotné obrázky.

## Meze a reprodukce

Ověřeno strojové následování viditelných pokynů, dostupnost ovládání a úplná buněčná smyčka. **Lidské porozumění, zábavnost a dlouhodobá rovnováha nebyly playtestovány.** Neproběhla celá nová kampaň přes útes, souš a další etapy, Safari ani telefon. Přechod dat do dalších etap byl ověřen připravenými stavy a regresní sadou, nikoli tímto hraným průchodem. Kontakt krunýře a ostnů má geometrické/simulační regrese; browser cíleně dokládá ústa, růst, objevy, editor a toxin. Příslušná čitelnost SP-017 je zahrnutá, celá průřezová karta zůstává otevřená.

První delší DEV pokus přerušil HMR při editaci. Dva rozšířené produkční pokusy o lov narazily na nedostatečnou testovou navigaci u uzavřeného východního minerálního prostoru; upravena byla cesta/testový výběr jižního jedince, žádné herní překážky, zdraví nebo rozpočet. Další kontrola snědení masa musela respektovat běžné pořadí potravy: držený mezerník nejdřív sní bližší detrit a potom skutečnou mrtvolu. Finální úplný průchod prošel včetně opravených kontaktů a snědení kořisti.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test
pnpm typecheck
pnpm build
pnpm preview --port 5192
# Ve druhém terminálu:
LUMAVORA_URL=http://127.0.0.1:5192 LUMAVORA_PRODUCTION=1 pnpm test:cell-growth
LUMAVORA_URL=http://127.0.0.1:5192 CREATURE_LIBRARY_OUTPUT=evidence/sp-006/library-regression pnpm test:creature-library
```

Pro hraní založit **Novou linii**. Historické kampaně se automaticky nepřepínají. Nevyžaduje se migrace dat ani ruční oprava knihovny.

Lokální finální evidence a aktivní export jsou v `evidence/sp-006/complete/`. Úklid vlastních mezisnímků, neúspěšných pokusů, dočasného klienta a izolovaného browseru eviduje `evidence/sp-006/cleanup.json`: odstraněno 217,2 MB, ponecháno 6,0 MiB výsledků, finálních snímků a uložených her. Trace/video nevznikly, `.playwright-mcp/traces/` neexistuje; testovací servery zastavené. Disk po úklidu má 19 GiB volných. Historické artefakty jiných bodů se nemění.
