# SP-008.F — pět sousedních kmenů

Pracovní změna nad dokončenou E `190f55f` na `main`; výchozí strom byl čistý. Bez commitu/pushe. [Plán a rozhodnutí](../superpowers/plans/2026-09-24-sp-008f-five-neighbours.md).

## Hratelná změna

Nová kmenová etapa zakládá pět společností: Kmen pramenných sadů, Strážce jantarové terasy, Poutníky severního kruhu, **Sběrače rákosových tůní** a **Hlídače čedičové meze** (přesná hráčská jména v `tribe-copy.cs.ts`). Každá má samostatný domov, tři skutečné počáteční obyvatele, 12 jídla, vlastní sklad, práci, hlad, náklad, placenou obnovu populace, obranu a výpravy. Nejde o dekorativní osady ani další sdílený ukazatel.

| Identita | Vztah / dar | Domov / rychlost / zásah | Čitelná odlišnost |
| --- | --- | --- | --- |
| garden | +30 / 8 | 160 / 4 / 4 | Původní přátelská zahrada, původní hudba. |
| terrace | −35 / 12 | 220 / 3,6 / 5 | Počátečně nepřátelská pevnější osada. |
| sanctuary | 0 / 16 | 180 / 4 / 4 | Sociální účinek ×1,2, původní hudba. |
| reed | +10 / 12 | 140 / 4,6 / 3 | Rychlí sběrači, přednost řasám, lehká osada, rákosové píšťaly a koše. Hudba: dvě píšťaly → buben → chřestidlo. |
| basalt | −10 / 16 | 240 / 3,2 / 6 | Pomalejší sběrači, přednost zbytkům, silnější obrana, čedičové kameny a chřestidla. Hudba: dvě chřestidla → píšťala → buben. |

Preference zdroje je pořadí výběru, nikoli zákaz ostatního sběru. Noví sousedé používají existující těla zvonkonoše a žrouta pramenů včetně případného uloženého návrhu NPC. Pravidla čerpají ze společného katalogu identit. Hudba, kulturní výstroj, náčelník ani nový výsledek nemění genom či jídelníček hráče.

## Mapa, hospodaření a tlak

Výchozí směry jsou severozápad, východ, sever, jihozápad a jihovýchod. Každá osada hledá skutečnou volnou plochu v okolí svého směru; hodnotí vzdálenost a dostupnost existujících zdrojů, drží odstup nejméně 25 m od jiných domovů. Domov vychází z původního hnízda a původního čtyřmetrového odsazení. Volný obal se přizpůsobí skutečnému zděděnému tělu/výstroji a library NPC. Pro poloměr nad 6 m navíc zakládání filtruje společný průchozí komponent tábora; samotné volné centrum uvnitř uzavřeného kruhu skal nestačí. Stejný filtr chrání umístění širokých NPC i jejich výběr zdrojů. Navigace těchto výjimečných těl rozšíří existující graf na všechny překážky a 24 vrcholů na kružnici, s cache pouze statických hran; nic z toho se neukládá jako herní výsledek.

Sklad souseda zůstává konečných 48, náklad 2 porce, jídlo stojí 2, obnova člena 12. Nové zásoby vznikají pouze skutečným odběrem a doručením ze společného světa. Oprava domova i léčení také spotřebují jídlo. Nezměněná regenerace ekologie není skrytou nekonečnou zásobou osady. Nová kampaň dovoluje nejvýše **dva skutečné účastníky výprav dohromady**, včetně varování a návratu. Každá výprava stále vyžaduje nedostatek, nepřátelský vztah, volné schopné lidi, desetisekundové varování a fyzický návrat s kořistí. Staré tříkmenové kampaně zachovávají původní chování.

V HUD je mapa všech pěti se severem a táborem, samostatné karty s identitou, vzdáleností/směrem, vztahem, cenou daru, počtem obyvatel, zásobou, aktuálním sběrem/obranou/nákladem, všemi výpravami a dostupnými akcemi. Číslo vyřešených používá skutečný počet. Mapový/kartový fokus i fokus v hlášení výpravy/kartě mají odlišné akce, ale stejný cíl kamery; průběžné překreslení nepřesouvá klávesnicový fokus z karty na mapu.

## Dokončení, ztráty a kompatibilita

- Nový `ActiveTribeState` v2 má `roster: 'five'`. Dokončení vyžaduje přesnou jedinečnou sadu garden/terrace/sanctuary/reed/basalt, všechny `allied` nebo `conquered` a alespoň jednoho živého hráčova člena. Tři výsledky nestačí ani po export/import/reload/load.
- Spojenectví dá existujících +8 jídla, dobytí +12, právě jednou. `resolved` uzamyká další řešení; úmrtí obyvatel, oprava, obnova populace, hudba a načtení jej neruší. Výsledek je uložený fakt, nikoli odměna znovu vypočítaná při importu.
- Při ztrátě jednotlivého obyvatele může přeživší společnost zaplatit obnovu z doručených zásob. Při zániku všech členů se populace zdarma nevytvoří, běžná diplomacie/hudba/sněm nemají hostitele a nejsou dostupné. Nevyřešenou prázdnou osadu lze fyzicky obsadit útokem. Samotné vyhynutí nepřidá výsledek ani odměnu.
- Ztráta účastníka či hostitele přeruší hudbu/sněm podle pravidel C/E; mrtví nejsou náhradními nositeli účinku. Ztráta všech hráčových členů nedovolí postup.
- Absence markeru znamená historickou přesnou trojici. Parser nepřidává sousedy ani nepřepisuje starou kampaň. Nový marker vyžaduje pět záznamů, hudba dovoluje pět cooldownů a checkpoint musí mít stejný marker. Chybné identity, duplicity, zkrácená sada a falešné dokončení se odmítají.
- SP-007.A ukládá pět jedinečných faktů a uzavírá allied/conquered/mixed; po přechodu zůstávají zmrazené. Strojový archetyp se dál odvozuje z organismového finále. Existující regiony gardens/terraces odkazují na identitu souseda, takže změna pořadí platného save nepřehodí jejich polohu. **Nové civilizační následky SP-007.B1 nejsou implementované.**

## Regresní ověření

Nové soubory `tribe-five*.test.ts` pokrývají založení, přesný roster, konečné hospodaření, placenou obnovu, souběžné výpravy, prázdnou osadu, všechny identity, obě cesty, kontakt a návraty, kulturní výstroj, hudbu/sněm s nezměněnými limity, odměny, rendering/picking, historii, save/checkpoint a 11 historických fixtures.

Dvě kampaně používají skutečný `step` celé hry s původními 36 jídla: fyzicky nasbírají na dílnu a výstroj, zaplatí stavbu, nábor i nástroje, vyřeší všech pět diplomacií nebo bojem, vracejí se k péči domů a po každé osadě provedou save/load. Pětiminutový běh společné ekologie na seedech 1, 42 a 8675309 kontroluje populace, konečné zásoby, náklady a skutečnou sklizeň. Navigace navíc používá seedy 481516 a 20260913. Samostatná regrese na všech pěti seedech projde všech pět osad a vrátí se s platným extrémním v2 tělem (poloměr 9,419 m), rychlostí 2,5 m/s a nezměněným limitem 90 s na cestu. Dvě široká těla z knihovny kontrolují skutečnou velikost i průchozí umístění obyvatel nových společností. To není tvrzení o všech možných seedech nebo dlouhodobém vyvážení.

Původní kulturní test izoloval všechny sousedy, takže nová kontrola živého hostitele správně odmítla diplomacii; příprava nyní ponechá skutečné hostitele. Test ekologického kontaktu nyní nasytí NPC, aby měřil výhradně hráčův odběr. Očekávání jejich účinků se neoslabovala. Změněný očekávaný počet sousedů při **novém** vstupu je pět, historické tři zůstaly.

**63 nových regresí; závěrečná celá sada: 141 souborů / 2 591 testů prošlo**, 196,73 s. Příkaz: `node node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout=60000`, Node 24.15.0 / Vitest 3.2.4. Je to tentýž runner celého `pnpm test`; přímé spuštění také obchází sandboxový problém pnpm s lokální databází, verze Node je shodná. Po zpřesnění testu přeuspořádaných sousedů o skutečný serialize/parse prošlo navíc všech 12 testů persistence (1,61 s).

| Běh / diagnostika | Výsledek a rozhodnutí |
| --- | --- |
| První celá sada při rozpracování | 2 544 / 2 547; opraveny přípravy kulturního/ekologického testu popsané výše a zachováno původní odsazení domova (rozdíl geometrie podepsané nuly ve fleet testu). |
| Souběh celé sady s browserem | 2 574 / 2 583; devět timeoutů v šesti souborech a RPC `onTaskUpdate` timeout. Žádná nová logická assertion failure. |
| Izolace všech šesti souborů, původní limity, jeden pracovník | 49 / 49, 18,89 s. Týká se creature-stage-presentation, creature-terrain, culture-presentation, obstacle-contact-regression, reef-canopy-presentation a tribe-five-navigation. |
| Celá sada sériově s globálním limitem 30 s, bez browseru | 2 589 / 2 590, 238,70 s. Starší `keeps combined translation/rotation outside several close obstacles` překročil 30 s; neběžel jiný náš browser ani test. |
| Opětovná izolace terénu a nových širokých těl s původními limity | 26 / 26, 14,39 s; uvedený test 2,033 s. |
| Celý běh s globálním limitem **60 s**, jeden pracovník, bez browseru | 2 590 / 2 590; uvedený test 8,842 s. Nezměněné kroky, scénáře, assertions i původní zdrojové timeouty. |
| Závěrečná celá sada po volbě kompatibilního těla a doplnění regrese | **2 591 / 2 591**, 196,73 s; stejné parametry jeden pracovník / 60 s. |

Rozptyl časů ukazuje na nestabilní náklad prostředí; souběh s rendererem zhoršil druhý běh, ale nevysvětluje s jistotou pozdější samostatný timeout. Neprohlašujeme neprokázanou přesnou příčinu hostitelské zátěže. Při kontrole prostředí bylo přibližně 2,2 GB dostupné RAM a load average 6,93. Delší limit je výslovná tolerance měření času, nikoli oslabení herních očekávání nebo limitů hudby/sněmu.

`pnpm typecheck`, `pnpm build` a kontrola diffu prošly. Finální produkční JS `index-DDaIel-0.js`: 1 233,26 kB / gzip 379,56 kB, CSS 42,76 kB / gzip 9,61 kB; známé upozornění Vite na bundle nad 500 kB trvá.

Čerstvé nezávislé review odhalilo duplicitní UI fokus a nedosažitelný prostor pro velké platné tělo. Opravy mají trvalé regrese; následná kontrola prověřila graf/cache, průchozí komponenty, historickou větev i umístění širokých NPC a nenašla další blokující problém. Vlastní kontrola opravila navíc pořadí strojových regionů podle identity a volbu těla čedičového kmene: původně použitý predátor neměl zbytky v nativním jídelníčku. Červená regrese toto doložila; finální identita používá stávajícího žrouta pramenů bez změny síly, ceny nebo pravidel. Předběžný bojový browser běh byl při této opravě výslovně ukončen a nebude počítán jako dokončený.

## Produkční browser průchod

Trvalý scénář `pnpm test:five-neighbours` a větev `--conquest` používají produkční build, Chrome, 1280×720, běžné klávesy/posuv/import/download a skutečný RAF. Čtení `render_game_to_text` je pouze pozorování; žádné živé settery, přepisování localStorage ani `advanceTime`. Trace a video jsou vypnuté.

**Připravený vstup:** dokončené historické pobřeží → nová pětice, 220 jídla a čtyři hotové dílny. Zdroje, překážky, fauna, vztahy, počáteční populace a polohy se v browser fixture neupravují. Nábor, nástroje, placená kulturní výstroj, hudební odpovědi, volba náčelníka, sněm, rozkazy, návraty, výsledky a přechod jsou odehrané přes UI. Ekonomická dosažitelnost z běžných 36 zásob je samostatný simulační důkaz výše, nikoli tvrzení o tomto připraveném browser vstupu.

| Průchod | Build / výsledek | Skutečně odehrané kontroly |
| --- | --- | --- |
| Celá diplomatická cesta | `index-cc17Ukvv.js`, **10 skupin kontrol / 0 chyb** | Zaplacený chochol/plášť a čtyřčlenná kapela se dvěma píšťalami; reed hudba +62,5 po export/importu aktivní návštěvy. Zvolený náčelník, basalt sněm za 8 jídla s účinkem +31,25. Všech pět spojenectví, návraty a péče, po třech výsledcích export/import/reload/load bez předčasného dokončení. Šest přeživších, konečných 70 jídla, pět faktů a přechod do strojů. |
| Celá bojová cesta | Finální `index-DDaIel-0.js`, **9 skupin kontrol / 0 chyb**, 714,725 s času běhu | Všech pět mapových cílů a kartový fokus s klávesou Tab. Zaplacený hřeben/plášť a oštěpy, skuteční obránci včetně zásahu čedičového obyvatele, pět dobytých osad s návraty. Po třech výsledcích export/import/reload/load stále nepovolí přechod. Šest přeživších, konečných 196 jídla, pět faktů a přechod do strojů. |
| Diplomatický replay | Finální `index-DDaIel-0.js`, **3 skupiny kontrol / 0 chyb**, 158,926 s času běhu | Import skutečného uloženého rozehraného `peace/music-reed.save.json`, tři odpovědi přes UI a znovu doložený účinek +62,5. Import odehraného `peace/completed.save.json`, všech pět mapových cílů a stabilní kartový fokus, přechod a export pěti faktů. |

Celá diplomatická cesta předcházela závěrečným opravám navigace širokých těl, fokusu a volbě potravně kompatibilního čedičového těla. Poslední řádek je **replay skutečných saveů, nikoli nová celá diplomatická kampaň na finálním hashi**. Obě celé simulační cesty a celá bojová UI cesta prošly finálním kódem. Obecné pole `prepared` v replay logu popisuje původní základ kampaně; jeho skutečné vstupy jsou dva právě uvedené exporty. Předběžná přerušená bojová větev se do výsledků nepočítá.

Browser čeká na běžnou akci nejvýše 60 s, na stav scénáře 240 s a na download 120 s kvůli softwarovému rendereru. Tyto limity měří čekání automatizace; herní časové limity hudby a sněmu zůstaly 90 s. Výsledky jsou v `evidence/sp-008f/{peace,conquest,peace-final}/results.json`; aktivní kampaně po přechodu jsou ve stejných adresářích jako `active-campaign.save.json`.

Prohlédnuto a zachováno osm snímků 1280×720: `conquest/map-1280.png`, `conquest/reed-1280.png`, `conquest/basalt-1280.png`, `conquest/basalt-contact.png`, `conquest/five-completed.png`, `peace/basalt-council-result.png`, `peace-final/reed-music-final.png` a `peace-final/allied-final.png`. Snímek sněmu patří původnímu diplomatickému buildu; ostatní zachované snímky finálnímu.

## Úklid důkazů

Manifest `evidence/sp-008f/cleanup-manifest.json` eviduje **45 odstraněných mezivýstupů / 4 171 712 B**: rozpracované a nahrazené diagnostické logy, přerušený bojový běh, duplicitní snímky a nepoužitou pracovní kopii replay vstupu. Souhrn dřívější diagnostiky zůstává v `verification/diagnostics.json`. Zachováno 33 souborů (přibližně 5,6 MiB): osm finálních snímků, potřebné vstupy/exporty, aktivní kampaně a malé výsledkové logy. Trace, video ani archivy se nevytvářely; `.playwright-mcp/traces/` neexistuje. Browser i preview procesy uzavřeny; dočasné výstupy tohoto úkolu byly pouze v uvedeném evidence adresáři. Disk měl před prací přibližně 240 GiB, po úklidu 240,73 GiB volných. Cizí artefakty a uživatelská data zachována.

## Meze a návaznosti

Automatizované ověření není lidský playtest ani skutečný poslech. Safari/mobil, celá nová linie od buňky a dlouhý vícehodinový soak nejsou tímto úkolem doložené. Pětiminutové hospodaření a dva průchody dokládají popsané kombinace, ne univerzální vyvážení všech těl/seedů/voleb. Soft oddělování RTS členů zůstává; těla u překážek mají fyzický obal, vzájemné skupinové procházení není nově nahrazeno rigidní kolizí všech končetin.

**SP-008.F je dokončená; všechna kritéria kmenové karty SP-008 jsou doložená napříč A–F níže a karta je uzavřená.** SP-007.B1 a celá průřezová SP-017 zůstávají otevřené. Uvedené meze lidského, platformního a dlouhodobého ověření tím nezanikají.

## Doložení kritérií napříč A–F

| Kritérium SP-008 | Důkaz a přesný rozsah |
| --- | --- |
| Samostatné společnosti, hospodaření, výpravy a obrana | [A](SP-008A-REPORT.md); F přidává skutečné obyvatele obou nových identit, tříseedové společné hospodaření, varované souběžné výpravy a celé obě cesty. |
| Kulturní editor a odlišná placená výstroj | [B](SP-008B-REPORT.md); původní regrese běží také nad novým založením pěti, F odehraje placený chochol/plášť i hřeben/plášť a jejich skutečné účinky. |
| Hudební volby, skuteční hráči, hostitel a odlišné výsledky | [C](SP-008C-REPORT.md); F prověřuje skladby všech pěti, dva flautisty reed a dva hráče s chřestidly basalt, kontakt/limity a odměny. Native UI reed se zaplaceným aktivním save/importem. |
| Skutečné domácí zvíře, doprovod, péče, práce a ztráty | [D](SP-008D-REPORT.md); všechny původní regrese získávání, sběru, přerušení/souběhu, save a přechodu prošly s aktuálním založením kmene. F neopakuje celý původní native domestikační scénář. |
| Zvolený původní náčelník, sněm, cena, kontakt, omezení a předání | [E](SP-008E-REPORT.md); F ověřuje fyzický sněm všech pěti v původním limitu, skutečný basalt UI sněm a zachování E regresí. |
| Pět dosažitelných kmenů, zdroje/cesty a oba způsoby dokončení | Tento report: více seedů, běžné zásoby, v1/v2 a široká těla, NPC z knihovny, pět výsledků/historických faktů, jednorázové odměny, staré i nové savey a produkční UI. |

Čitelnost je ověřená automatizovaným hráčem a prohlídkou uvedených snímků. Zábavnost, lidské porozumění a poslech nejsou tímto převáděny na automaticky splněný výsledek SP-017. Stejně tak uzavření kmenového rozsahu neuzavírá celý milník B (města/planeta) ani civilizační následky SP-007.B1.
