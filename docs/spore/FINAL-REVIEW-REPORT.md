# Nezávislé review a opravy A–D · 28. září 2026

Tři nezávislí agenti dokončili kontrolu civilizace, jádra galaxie a knihoven/prezentace. Dřívější limit účtu už review neblokoval. Nalezené tři P2 jsou opravené; následné nezávislé čtení oprav nenašlo další blokující chybu. [Plán oprav](../superpowers/plans/2026-09-28-final-review-fixes.md). Rozsah, akceptační kritéria a [původní hraná kampaň](FINAL-CAMPAIGN-REPORT.md) se nemění. E zůstává odložené.

## Konkrétní opravy

- **Plný registr blokoval civilizaci.** Po 64 výpravách nezaložil žádný soupeř první město, které požaduje dokončení etapy. Nově mají nejvýše čtyři skutečně zaplacená státní města vlastní rezervu. Hráčovy nové pěší i námořní výpravy stále respektují původní limit64; navštívené světy se nepřepisují. Parser přijme nejvýše68 lokalit a každý záznam nad64 musí patřit městu založenému státem, s následně ověřenou účtenkou. Stejná pravidla platí samostatně pro checkpoint. Sjednocené jsou také návštěvy, města, civilizační uzávěr a pozdní námořní aktivace. Mapa vysvětluje rezervu.
- **Opožděný import přepínal jinou kampaň.** Zděděný závod po `File.text()` mohl nahradit mezitím založenou linii nebo vykreslit chybu nad běžící hrou. Číslo importu, změna režimu a identita relace nyní chrání úspěšnou i chybovou větev před jakýmkoli uložením či přepnutím.
- **Efekty0 neumlčely již naplánované zvuky.** Společný effects gain nyní řídí běžné efekty i hlasy, včetně not pozastavených před změnou nastavení. Nulová hlasitost stále nevytváří nové noty; dokončené uzly se odpojují. Při prohlížení finálních snímků se navíc opravilo zalamování sedmi tlačítek pauzy: knihovny už nepřetékají vodorovně mimo panel.

## Důkazy a meze

Všechny cesty jsou pod `evidence/final-campaign/review/`.

| Ověření | Výsledek |
| --- | --- |
| Regrese před opravou | `capacity-before.log`: platná kopie se64 výpravami nezaložila města. `import-before.log`: dokončený starý import přepsal seed700001 na8675309. `audio-before.log`: již naplánovaný efekt po změně effects0 stále vedl do nenulového výstupu. První pracovní unit pokus navíc odhalil chybu přípravy testu — chyběl návrat domů před výpravami; není vydáván za herní chybu. |
| Cílené unit regrese | **71/71**, včetně68 lokalit, placení, návštěv, pozdní aktivace námořní vrstvy, obnovy checkpointů a odmítání nedoloženého nadlimitního místa. |
| Import přes UI | **5 kontrol/0chyb**. Opuštění panelu, nová linie, opětovné otevření, dvě souběžné volby, opožděná chyba i úspěšný aktuální import. Řízené je pouze dokončení skutečného `File.text()`, nikdy herní stav nebo hodiny. `import/result.json`. |
| Zvuk a pauza přes UI | **6 kontrol/0chyb**. Skutečný nedokončený zvuk → pauza → effects0 → návrat, plus samostatné master0/mute, ukončení a odpojení not. Všech sedm tlačítek se vejde vodorovně a je dostupných při1024 i1280px. Pasivní pozorování WebAudio není lidský poslech. `audio/result.json`. |
| Civilizační kapacita přes UI | **3 skupiny kontrol/0chyb**. Přiznaná offline regresní kopie historického save, naplněná veřejným `enterField`, byla importována veřejným UI. Za20skutečných sekund oba státy zaplatily město60 a stráž40; rezervy400→300, původních64 světů beze změny. Následovala návštěva města a veřejný export/import/save/reload/load. `capacity/result.json`. Nejde o novou kompletní kampaň. |
| Celá sada | `pnpm exec vitest run --maxWorkers=2 --testTimeout=30000`: **206souborů/4 641testů/exit0**,231,07s. `full-suite.log`. |
| Typecheck/build | `pnpm typecheck` i `pnpm build` včetně typechecku **exit0**,261modulů. Zůstává známé upozornění na velikost JS chunku. `build-final.log`. |
| Dokončená kampaň na finálním buildu | **5kontrol/0chyb**, přesný milník49 přes veřejný import/save/reload/load/export. Izolovaná kopie odehrála48skutečných domácích ticků; trvalé jádro, použitá odměna, zahraniční světy, platby, tělo a checkpoint zachované. `release-final/result.json`. |
| Offline uložené kampaně | **58exportů/0chyb**, přesný parse/serialize a checkpoint recovery pouze na kopiích. Zdrojové hashe zachované. `save-audit.json`. Vite při sandboxovaném startu vypsal nefatální zamítnutí HMR socketu; samotný offline audit doběhl s exit0. |

Finální JS `index-DOekh6f0.js`: SHA256 `610a393f9f928612d0cc2a613f9554e8e69333b191d61cc21ca96340db4ae94b`. CSS `index-CkaaICuV.css`: `b4a0fec6a55075eeb1decc0f68f35b26b82675e992cb2e8a9a65c94af75f58d7`. Celá původní kampaň se na tomto buildu znovu nehrála; provedly se výše vymezené regrese a kompatibilita. Import race prošel na mezibuildu před čistě prezentačním zalomením pauzy; finální audio/kapacita/release na uvedeném buildu.

Nové město:90nativních RAF, p95 **16,7ms**, maximum16,8ms. Krátký vzorek na tomto hostu, nikoli záruka výkonu všech zařízení. Osobně prohlédnuty výsledné snímky mapy, saveů, nulového zvuku a zalomených ovladačů; čitelné při1024×640.

## Review, úklid a zbývající přijetí

Nezávislá kontrola jádra nenalezla P1/P2 v obou přístupech, trvalé odměně, cestovní bráně, návratu ani legitimním checkpointu. Civilizační a knihovnový reviewer následně přečetli opravy; upozornění na starý čítač64 i chyby browser ovladačů byly opraveny. Review agenti neupravovali soubory ani nespouštěli browser/build. Bounded paměťová reprodukce civilizačního problému je oddělená od hraných důkazů. Vstupní a výsledné SHA manifesty: `input-manifest.json`, `final-manifest.json`.

`cleanup.json` eviduje odstranění4 zastaralých diagnostických artefaktů/882 013B; kompaktní finální důkazy a regresní fixtures zůstaly. Žádné trace/video/ZIP se nezaznamenávaly, `.playwright-mcp/traces/` není přítomné. Review důkazy přibližně1,9MiB; volné místo po úklidu20GiB. Vlastní browsery skončily, lokální preview5220 zůstává pro lidské přijetí.

**Aktivní původní kampaň je beze změny:** `evidence/final-campaign/organism/active-campaign.save.json`, SHA256 `7f357263d7c2666ce0bb545c6313eee3bbb46df2ace92b106efe084f68ee8aa6`. Nový finální export izolované kopie má SHA256 `2bf95cfc12b1d762bf273c2a0510c6fd2fd36e4ec910124ef8666c9e2e222f86`.

Sedm [lidských scénářů](A-D-HUMAN-ACCEPTANCE.md), porozumění dědictví a skutečný poslech stále čekají. SP-007/SP-017 ani celý goal se proto neoznačují za dokončené. Žádný commit, push ani deploy.
