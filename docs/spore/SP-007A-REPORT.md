# SP-007.A — smlouva a záznam výsledků linie

23. září 2026, výchozí revize `1fd9f2bbd`, čistý pracovní strom. [Plán](../superpowers/plans/2026-09-23-sp-007a-lineage-history.md), [datová smlouva](SP-007A-CONTRACT.md), [roadmapa](ROADMAP.md#sp-007). Bez nových závislostí, změny lockfilu nebo deploye.

## Výsledek a rozsah

Nové linie mají verzovanou historii od narození. Úspěšně snědené jídlo se zapisuje po druzích potravy; lov až po skutečném usmrcení připsaném hráči/smečce. Vyřešená ekologická místa, hnízda, kmenoví sousedé, regiony a dokončení lokální terraformace sdílejí smlouvu s jedinečným cílem, výsledkem, původem, časem a generací. Hotová etapa se zmrazí; její sandbox historii nepřepisuje. Genom není zdrojem minulých činů.

Deník ukazuje, co linie udělala, jaký výsledek zdědila a konkrétní účinek. Kmen má stručné vysvětlení s odkazem do deníku. Nově dokončená tvorová etapa s alespoň třemi doloženými hnízdy dá příslušníkům vlastního druhu **+15 % diplomacie**, **+15 % zásahu sousedů**, nebo **+7,5 % obojího** podle přátelské, predátorské či smíšené cesty. Dary, ceny, nástroje a dostupnost obou cest zůstávají stejné. Jde o malý odvozený násobitel bez další jednorázové odměny.

**SP-007.A je hotová; SP-007 jako celek zůstává rozpracovaná.** Následují SP-007.B1 — následky řešení kmenů, SP-007.B2 — civilizační expanze a její následky, SP-007.D — vesmírná filozofie říše. Dnešní regiony používají zděděný archetyp: jejich uloženou metodu nezaměňujeme za novou samostatnou civilizační volbu. Jídelníček je evidovaný; A nepřidává samostatný bonus z potravy.

## Kompatibilita a obnova

Kampaň zůstává v3, volitelný `lineageHistory` má vlastní verzi 1. Parser zachová save bez markeru bez změny historických pravidel. UI load/import jednou doplní částečné sledování aktivní etapy, minulé etapy označí jako neznámé a převezme pouze explicitní doložené výsledky s neznámým časem. Nula neznamená vymyšlenou nečinnost. Stará již hotová etapa má neutrální nový bonus; dosavadní schopnost finále a strojový archetyp se zachovají. Rozehraný starý tvor může dokončit novou cestu i s doloženými staršími hnízdy.

Obnova generace vrací historii **společně se světem do checkpointu**; nepřenáší neúspěšnou větev přes smrt a nesčítá její odměny. Potvrzená přestavba i přechody checkpointují. Uzavřená historie musí souhlasit s checkpointem, počty nepřesahují celoživotní součty, fakta odpovídají skutečným uloženým výsledkům. Žádná migrace knihovny, NPC snapshotů, objevů SP-004 ani růstu SP-006.

## Ověření a původ scénářů

macOS / Apple M4, Node 22.23.1, pnpm 11.24.0, Playwright 1.55.0. Hlavní browser průchody používají místní Chrome / ANGLE Metal, skutečné klávesy, kliknutí, RAF a veřejný import/export. Produkční `advanceTime` je nepřítomné; žádné živé settery. Trace/video vypnuté. Lokální server a prohlížeče spuštěné mimo sandbox kvůli jeho omezením.

- `pnpm test`: **120 souborů / 2 291 testů**, včetně **24 nových regresí** SP-007.A.
- `pnpm typecheck`, `pnpm build`, `git diff --check`: prošly. Známé upozornění Vite na JS chunk nad 500 kB zůstává (1 140,69 kB, gzip 345,80 kB).
- Regrese: úspěšná versus odmítnutá potrava; všechny tři cesty vzniklé akcemi; stejný genom a skutečně různý kmenový zásah/diplomacie; nezměněný dar; zmrazení po čtvrtém hnízdě; generace a odměny po obnově; oba organismové přechody; pozdější dokončení a přechody; vratný náhled kmene; všech 11 historických fixtures; NPC snapshot, objevy a růst; vadné verze, pole, počty, časy, duplicity, výsledky a checkpoint.
- Nezávislé review nejprve provedlo 436 cílených testů a reprodukovalo dvě chyby validace: hotový výsledek mohl změnit původ pouze v checkpointu; zaznamenaná jídla/lovy mohly přesahovat skutečné součty. Obojí opraveno s regresí. Následně **440 cílených testů prošlo**, navíc byl proveden validní otevřený checkpoint → dokončený živý stav → obnova a ověření nezávislosti na pořadí JSON polí/faktů. Závěr bez otevřeného nálezu. Vlastní review zahrnulo akční hooky, přechody, ukládání, náklady, rozsah změn a UI.

### Dvě odehrané tvorové historie

Oba průchody začaly **stejnou připravenou souší, dvounohým tělem, DNA a populací** z existující fixture SP-003. Dřívější etapy nejsou odehrané; historie souše začíná částečným pozorováním s nulovými dosud zaznamenanými počty. Potrava, hnízda, export/import, dokončení G, vstup do kmene a následné kmenové příkazy jsou skutečně odehrané přes UI. Nejde o celou kampaň od buňky.

| Cesta | Doložené činy před dokončením | Skutečná diplomacie neozbrojeného člena | První zásah téhož typu člena |
| --- | --- | --- | --- |
| Přátelská | 3 porce detritu, 3 přátelství, nábor a následování smečky | **0,5175 vztahu/s** | **5** |
| Predátorská | 3 porce detritu + 9 masa, 6 lovů, 3 poražená hnízda | **0,45 vztahu/s** | **5,75** |

Sociální běh **8/8**, predátorský **6/6**, oba **0 browser chyb**. Diplomacie měřena v reálném kontaktu s jantarovou terasou podle změny vztahu a simulačních ticků, zásah z rozdílu zdraví souseda. Save/load zachoval uzavřenou historii i účinek. Smíšená cesta je doložená cílenou simulací, nikoli novým browser průchodem. Snímky dědictví a kmene byly otevřené a vizuálně zkontrolované.

### Nová linie a finální UI

Nový produkční průchod SP-006 začal tlačítkem **Nová linie, seed 481516**, bez připraveného vstupu. Prošel tři růsty, tři objevy a placené přestavby, toxin, výměnu filtru za čelist, lov bývalého predátora, snědení masa, UI export/import a knihovnu. Nová kontrola porovnala součet potravy s odehranými jídly, lovy s úlovky a úplnou historii před/po importu. **7/7 kontrol, 0 browser chyb**, generace 5, **32 jídel: 10 řas, 21 detritu a 1 masa; 1 lov**. Export/import zachoval tatáž čísla; jde o otevřenou buněčnou etapu, nikoli dokončení celé kampaně.

Finální UI kontrola znovu importovala oba **odehrané** kmenové exporty a původní historický save dokončeného spojenectví. Při 1280 × 720 ověřila dostupnost spodních příkazů, posouvání panelu sousedů, deník, neutrální výchozí bonus starého save a následný export: **3/3, 0 browser chyb**. Krátký původní klient skillu `develop-web-game` navíc ověřil nový start; jeho screenshot obsahuje pouze canvas, hlavní důkaz UI tvoří úplné průchody. Dočasná kopie klienta byla byte-identická, existující Chromium spuštěno lokálním wrapperem kvůli odlišné instalované revizi.

## Reprodukce

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm preview --port 5193
# V jiném terminálu; s Playwright Chromium lze vynechat BROWSER_CHANNEL:
LUMAVORA_URL=http://127.0.0.1:5193 LUMAVORA_PRODUCTION=1 LUMAVORA_BROWSER_CHANNEL=chrome CREATURE_STAGE_OUTPUT=evidence/sp-007a/social pnpm test:lineage-history --route=social --body=biped
LUMAVORA_URL=http://127.0.0.1:5193 LUMAVORA_PRODUCTION=1 LUMAVORA_BROWSER_CHANNEL=chrome CREATURE_STAGE_OUTPUT=evidence/sp-007a/predator pnpm test:lineage-history --route=predator --body=biped
LUMAVORA_URL=http://127.0.0.1:5193 LUMAVORA_PRODUCTION=1 LUMAVORA_BROWSER_CHANNEL=chrome CELL_OUTPUT=evidence/sp-007a/cell pnpm test:cell-growth
```

Zdrojové regrese jsou verzované; velké lokální výstupy nikoli. Výsledky, aktivní export a malá sada finálních snímků zůstávají v `evidence/sp-007a/`, úklidový manifest `evidence/sp-007a/cleanup.json`. Úklid odstranil 11,1 MB vlastních mezivýstupů a dočasné klienty/wrapper; ponecháno 5,8 MB výsledků, aktivních saveů a vybraných snímků. Trace adresář neexistuje, video nevzniklo, lokální testovací server je zastavený. Disk po úklidu: 19 GiB volných. Historické cizí artefakty zůstaly nedotčené.

## Meze a ruční kroky

Ověření dokládá funkčnost a velikost účinku, **nikoli lidské porozumění, zábavnost nebo dlouhodobou rovnováhu**. Neproběhla celá nová kampaň přes všech šest etap, nový browser průchod smíšené cesty, Safari, telefon ani výkonový soak. Pozdější výsledky jsou ověřené cílenými připravenými simulačními stavy; nejde o nově odehrané kmenové/civilizační kampaně. Existující velký bundle není řešen v A.

Pro novou úplnou historii stačí **Nová linie**. Staré hry stačí běžně načíst; nevyžadují ruční migraci ani opravu knihovny. Commit a push jsou součástí tohoto zadání; bez deploye.
