# SP-008.A — aktivní sousední kmeny

23. září 2026; výchozí revize `09a39247c`, čistý `main`. [Plán](../superpowers/plans/2026-09-23-sp-008a-active-neighbours.md), [roadmapa](ROADMAP.md#sp-008), [dědictví SP-007.A](SP-007A-CONTRACT.md). Bez nových závislostí a změny lockfilu.

## Výsledek

Tři současní sousedé mají vlastní členy, nejvýše čtyři, a sklad nejvýše 48 jídla. Sběrači vyhledají existující zdroje, fyzicky k nim dojdou, odeberou porci a nesou nejvýše dvě. Jedna porce se až po návratu domů změní na čtyři jídla. Konkurují hráči a fauně o tytéž zdroje. Krmení stojí dvě jídla, obnova jednoho člena dvanáct; léčení a oprava osady také spotřebovávají zásoby. Obnova vyžaduje živého člena u domova. Úplný zánik se bezplatně nevrací.

Nové založení začíná přátelskými sady, neutrálními poutníky a nepřátelskou terasou. Starým saveům zůstávají jejich uložené vztahy. Přátelští sběrači nechávají okolí hráčova tábora hráči, neutrální sbírají a brání napadené členy/domov, nepřátelští navíc při nedostatku jídla vyšlou jednoho až dva zdravé členy. Dva zůstávají doma. Varování trvá deset sekund, je vidět v panelu i samostatně nad krajinou. Výprava se vrací při smíru, napadení domova, oslabení, doplnění vlastních zásob nebo po omezené délce cesty.

Útok i krádež nastanou jen při skutečném kontaktu. Kořist se odečte z hráčova skladu u jeho domova, zůstane v nákladu a soused ji získá až doručením. Obrana, sběr a výpravy používají společnou navigaci a kolize; interakce neprocházejí přes překážku. Původní vzdálená místní odveta a pasivní bonus zahrady jsou nahrazené jednáním členů.

Hráč může ukázat výpravu, poslat vybrané členy k zachycení nebo smíru a vydat ústup domů. Pravý klik na cizího člena útočí, Alt + pravý klik nabídne smír. Osobně předaný dosavadní dar vyvolá příměří a vrací výpravu; setkání dál zvyšuje vztah až ke spojenectví. Osady i jejich obránce lze porazit. Náklad, výstroj pro aktuální práci, barva vztahu, počet členů a zásoby jsou viditelné. Použity jsou stávající modely a rekvizity; nejde o editor kulturní výstroje.

## Data a dědictví

Kampaň zůstává v3 a aktivní kmen v2. Každý soused může mít **`society.version = 1`**, společně všichni tři, nebo žádný u historického save. Blok obsahuje zásoby, členy, cooldown obnovy/výpravy, příměří a volitelnou expedici s fází, časem a ID účastníků. Člen ukládá polohu, směr, zdraví, hlad, náklad, cooldown, práci, ID zdroje a navigaci. ID sdílí globální čítač kmene; parser kontroluje přesné klíče, meze, duplicity, vlastníky expedice a shodu aktivace checkpointu. Zaniklý zdroj může být stale cíl; AI jej znovu vyhodnotí.

Samotný parser nemění staré savey. UI load/import jednou aktivuje společnosti v rozehraném kmeni a odděleně v jeho checkpointu. Opakované načtení a prázdná populace se neinicializují znovu. Náhled v1 i již pozdější etapy zůstávají beze změny. Obnova vrací společně světové zdroje, náklad, členy, zásoby, čítače a historii z checkpointu. Přechod do strojů společnosti zmrazí.

`resolved`, `tribute` a původ výsledků jsou nezávislé na populaci. Obnovení člena, léčení osady ani její opětovné naplnění nevynulují spojenectví/dobytí a neopakují odměnu. SP-007.A nadále zaznamenává právě jeden výsledek podle identity souseda, se stejným původem `action/saved`; jeho bonus vlastních členů platí také na cizí členy. NPC sběr neuděluje hráči DNA, jídla ani lovy do historie. Objevy SP-004, knihovna a NPC snapshoty SP-005 a růst SP-006 nejsou migrovány ani přepisovány.

**SP-008.B** kulturní výstroj, **C** rozšířená hudební setkání, **D** domestikace, **E** náčelník a **F** pět sousedů zůstávají otevřené. Nové civilizační následky patří do **SP-007.B1**. Celá SP-008 ani SP-007 nejsou dokončené.

## Ověření a původ

macOS / Apple M4, Node 22.23.1, pnpm 11.24.0, Playwright 1.55.0, místní Chrome / ANGLE Metal. Produkční Vite preview, nativní kliknutí, klávesy a skutečný RAF; `advanceTime` v produkci není dostupné. Žádný živý setter, přepsání localStorage za běhu ani podstrčení rozehrané výpravy. Trace/video vypnuté.

Browser vstup je **připravený**: existující fixture dokončeného pobřeží, nově založený kmen, 160 jídla a dvě dokončené dílny. Sady začínají dvěma hladovými členy bez zásob, terasa čtyřmi jídly a místně vyčerpanou potravou. Nejsou připravená spojenectví, dobytí ani rozběhnutá expedice. Vše po prvním importu — výstroj zaplacená z připravených zásob, autonomní sběr/výprava, reakce hráče, smír/boj, všechna tři řešení, export/import a přechod — je odehrané přes produkční UI. Nepředstírá se odehraná cesta od buňky ani získání počátečních dílen.

Finální produkční průchody: mír i boj **13/13 kontrol, 0 browser chyb** (předchozí průchody 10/10). Každý začal autonomním varováním, exportoval vyraženou výpravu a po importu na ni hráč reagoval. Mír použil dar při fyzickém setkání, boj zachytil skutečného člena expedice. Sady získaly potravu, nakrmily původní členy a zaplatily třetího. Obě cesty vyřešily tři sousedy se čtyřmi přeživšími hráčovými členy, exportovaly dokončení a přešly do strojů. Finální opakování zachytilo náklad jedné porce u člena a skutečný zdroj **8 → přibližně 7** (běžná regenerace dál běží), při nulovém skladu. Později sady měly **3 členy a 46 jídla**, původní hlad 35 poklesl přibližně na 7. Export navazující kampaně je ve strojové etapě. Úplné snímky sběru, výpravy, reakce, dokončení a UI 1280 × 720 byly otevřené a prohlédnuté. Přesný roundtrip testuje simulace; browser po importu ověřuje zachování ID, fáze, výsledků a přirozené pokračování, protože do opětovného pozastavení uběhne 4–9 normálních ticků.

- `pnpm test`: **121 souborů / 2 324 testů**, včetně **33 nových regresí** SP-008.A.
- `pnpm typecheck`, `pnpm build`, `git diff --check`: prošly. Bundle 1 152,92 kB, gzip 350,54 kB; známé upozornění Vite nad 500 kB.
- První plná sada za souběhu s browsery měla dva timeouty v původních náročných testech SP-006 a terénu (limit 5 s), bez věcného assertion selhání. Samostatné opakování **46/46** prošlo, příslušné testy trvaly 1,094 s / 1,332 s. Následná celá sada bez browserů prošla za 12,27 s. Limity ani očekávání těchto testů se neměnily.
- Produkční skill klient `develop-web-game` prošel nad finálním buildem; použitá dočasná kopie byla byte-identická, bootstrap pouze volil nainstalovaný Chrome. Snímek prohlédnutý.
- Krátké renderovací vzorky míru/boje: **7 783 / 7 528 snímků, p50 i p95 přibližně 16,7 ms**. Nejde o srovnávací benchmark nebo dlouhý soak.

Nezávislé review simulace reprodukovalo dva problémy: interakce v dosahu přes roh skály mohla zůstat stát; zlomkový náklad po částečném vyložení se mohl přeplnit. Opraveno přiblížením kolem překážky a omezením odběru zbývající kapacitou, obojí kryjí regrese a reviewer znovu ověřil své reprodukce. Doporučení odvolat výpravu po odstranění nedostatku je také implementované a testované. Reviewer provedl pět běžných seedů po 120 sekundách bez překročení zásob/nákladu. Nezávislé review datové kompatibility: **295 testů v devíti sadách**, bez blokujících nálezů.

Vlastní review zahrnuje konzervaci zdrojů, řazení jednotek, přísnou validaci, idempotenci inicializace/odměn, checkpointy, oba směry přechodu, UI cílení a odebrání renderovaných NPC v pozdějších etapách. Původní testy hráčovy ekonomiky/fauny mají výslovně izolované vstupy; nová sada samostatně ověřuje konkurenci s NPC. Regrese SP-007.A porovnávají přírůstek vztahu proti novému počátečnímu vztahu a poškození připraveného nebráněného domova, nikoli poškození zaměněného obránce.

## Reprodukce

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm preview --port 5194
# V jiném terminálu; s odpovídajícím Playwright Chromium vynech BROWSER_CHANNEL:
LUMAVORA_URL=http://127.0.0.1:5194 LUMAVORA_BROWSER_CHANNEL=chrome SOCIETY_OUTPUT=evidence/sp-008a/peace pnpm test:tribe-society
LUMAVORA_URL=http://127.0.0.1:5194 LUMAVORA_BROWSER_CHANNEL=chrome SOCIETY_OUTPUT=evidence/sp-008a/conquest pnpm test:tribe-society --conquest
```

## Artefakty a úklid

Lokální důkazy zůstávají v `evidence/sp-008a/peace-verified` a `conquest-verified`: výsledky, výslovně připravené vstupy, export rozběhnuté výpravy, dokončení a aktivní kampaně po přechodu; malá sada snímků. Regrese a browser scénář jsou verzované, velké lokální soubory nikoli. Úklidový manifest `evidence/sp-008a/cleanup.json` eviduje odstraněné meziběhy, duplikáty a dočasného skill klienta. Úklid odstranil **15,5 MB**, ponecháno **5,9 MB** finální evidence a aktivních exportů. Trace ani video se nevytvářely, `.playwright-mcp/traces` neexistuje, vlastní preview server je zastavený. Disk po úklidu: **19 GiB volných**. Historické artefakty mimo vlastní `sp-008a` zůstávají nedotčené.

## Meze a ruční kroky

Neproběhla celá šestietapová kampaň, lidský playtest zábavnosti/porozumění, dlouhodobé vyvažování, Safari ani mobil. Nájezdy jsou malé výpravy za zásobami a místní obrana; A nepřidává mezikmenové války, komplexní strategický plánovač, nové hudební minihry ani pět osad. Krátké renderovací vzorky nenahrazují výkonový soak. Známé upozornění na velký JS bundle zůstává.

Není potřebná ruční migrace: nové založení i běžné načtení kmenové hry aktivují společnosti. Ověřovací vstupy a aktivní exporty jsou lokální evidence; zdrojový scénář a regrese jsou verzované. Commit/push jsou autorizované zadáním, deploy není součástí práce.
