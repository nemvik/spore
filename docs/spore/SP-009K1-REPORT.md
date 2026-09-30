# SP-009.K1 · umístitelná městská obrana · report v1

26. září 2026. [Plán a datová smlouva](../superpowers/plans/2026-09-26-city-defense.md). První část prostorové obrany je implementovaná a ověřená pokračováním skutečné E kampaně. K2 — autonomní budoucí produkce a opakovaně financované soupeřovy jednotky — zůstává otevřená. Žádný commit, push, deploy ani změna závislostí.

## Výsledek

Městské UI nabízí věž na skutečných parcelách za 40 místního jantaru. Má 100 zdraví, dosah 24 a sílu 4; údržba stojí 1 za hospodářský cyklus. Střílí teprve po zaplaceném cyklu ve fungujícím hospodářství: kladný příjem i výroba, žádný hlad. Vypnutí nebo nezaplacený provoz střelbu zastaví. Umístění, dostřel a překážky ovlivňují skutečný boj; útočník umí věž zničit a potom město obsadit. Věž nemění původní stráž ani radnici. Oprava mimo místní střet stojí 10 a přidá nejvýše 40 zdraví.

Ekonomika v4 eviduje opravy, cyklus stavby `builtCycle` a zaplacenou údržbu `maintained`. Aktivace upraví live i checkpoint, zachová finance a nedopisuje původní E–J doklady ani dokončené B2 dědictví. Parser sám nemigruje. Nově otevřená města aktivované civilizace používají v4 včetně soupeřových měst. Validace brání bezplatnému léčení, podvržené údržbě v cyklu stavby a použití historického účtu opravy z demolované věže na jinou.

Věž používá existující editor a knihovnu budov. Vlastní vzhled zachová cenu, bojové parametry, poškození i zaplacené opravy. Scéna ukazuje model, zdraví, dostřel a střelbu; vyhrazená kamera umožní prohlédnout stejnou stavbu jako v editoru. Zvuková odezva je zapojená, lidský poslech čeká.

## Vykonané ověření

- `pnpm exec vitest run tests/city-defense.test.ts --maxWorkers=1`: **66/66 testů**, 2,84 s. Ekonomika, skutečné prostorové zásahy a krytí, zničení/obsazení, opravy, knihovna, import/export, rekey, checkpointy, původní E/F a dokončené B2. Poslední test ověřuje finální nativní fixture včetně jejího SHA, původního E dokladu, vlastního vzhledu a celé dřívější větve při obnově checkpointu.
- Celá sada před přidáním tohoto posledního fixture testu: **159 souborů / 3 633 testů**, 217,92 s; [log](../../evidence/sp-009k1/verification/unit.log). Související trade/conversion/defense/commerce/buildings: **5 souborů / 273 testů**, 13,30 s; [log](../../evidence/sp-009k1/verification/related.log). Celá sada po samotném doplnění fixture nebyla znovu spuštěna.
- Typecheck a produkční build prošly; [log](../../evidence/sp-009k1/verification/build.log). JS `index-B7Ekfx2Z.js` má 1 509,26 kB / gzip 469,93 kB, CSS `index-CXsaDFl3.css` 55,00 kB / gzip 12,12 kB. Známé upozornění na velký chunk trvá.
- Regrese pokrývají odstranění tanku zabitého věží z vlastního seznamu, nepřenositelnost utracených oprav, neměnný cyklus stavby, odmítnutí falešné údržby, reset obsazování při skutečné stavbě věže a odmítnutí vojenského převzetí se živou věží. Pozdější stavby nečiní nevalidní historickou pozici vraku či vracejícího se výpadu; jejich původní terén se kontroluje dál.

Připravené jednotkové bojové stavy izolují konkrétní regrese. Jejich upravené pozice, zdraví či časování nejsou vydávány za hraný postup.

## Skutečný UI průchod

Produkční Chrome prošel **5 kontrolními skupinami, 0 browser chyb**; [výsledek a měření](../../evidence/sp-009k1/final/result.json). Vstupem byl nezměněný hraný E export. Hráč přes běžné UI opravil původní tank za 10, vydělal jantar u domácích pramenů, převedl peníze do města, zvolil parcelu, postavil věž a zaplatil její provoz. Bez přepisování živého stavu a bez zrychlení času.

Obě umístění vycházejí ze dvou importů **stejné skutečně vydělané E větve**. Blízká parcela 108 poprvé zasáhla v místním bojovém čase **3,783 s**, vzdálená parcela 35 až v **20,917 s**. Při obou prvních zásazích nebyl nasazen vlastní tank. Rozdíl tak dokládá účinek skutečného rozmístění věže.

**Samotná věž v prvním pokusu legitimně prohrála:** útočník ji zničil a město obsadil. Původní očekávání browser scénáře, že zvítězí sama, bylo nesprávné. Finální průchod po prvním zásahu a importu uprostřed boje nasadil původní opravený tank; věž s tankem ubránily město a placený výpad byl zničen. Věž přitom padla. Po návratu tanku skutečná oprava za **10 městského jantaru obnovila zdraví 0 → 40** a zapsala se do účtu. Nejde o doklad vítězství neporazitelné nebo automaticky obnovené věže.

Import uprostřed boje zachoval placené poškození, závěrečné export/import a save/reload/load zachovaly výsledek i původní E historii. Editor vytvořil „Jantarovou hlásku“, exportoval ji a instaloval na opravenou věž bez změny bojového stavu. Vlastní model je viditelný ve městě i jeho samostatné kameře.

## Čitelnost, výkon a uchování

Hlavní vlákno prohlédlo čtyři finální snímky 1024×640: [blízká střelba](../../evidence/sp-009k1/final/near-tower-firing-1024.png), [vzdálená střelba](../../evidence/sp-009k1/final/far-tower-firing-1024.png), [editor](../../evidence/sp-009k1/final/tower-editor-1024.png) a [opravený vlastní model](../../evidence/sp-009k1/final/custom-repaired-tower-1024.png).

Z 90 nativních RAF intervalů blízké bojové větve: p50 **16,7 ms**, p95 **16,8 ms**, maximum **16,8 ms**; průměr 16,667 ms, přibližně 60 FPS. Percentily jsou počítané metodou nejbližšího vyššího pořadí. Jde o krátký 1,5sekundový vzorek browseru, nikoli přímé měření GPU, dlouhý soak nebo lidský test na různém hardwaru.

[Hraná fixture a původ](../../tests/fixtures/city-defense/README.md) je byte-identická s `evidence/sp-009k1/final/active-campaign.save.json`: 239 204 bytů, SHA-256 `144ae370d542f42e1cb7babf228dfecc43b57296f4905db7279969c49a31d6ac`. Zachovává etapu 4, ubráněné město, zničený výpad, navrácený tank, opravenou vlastní věž a checkpoint před její stavbou. Obnova proto správně vrátí celou starší větev, včetně hospodářství. Předchozí fixtures se nemění.

**Lidské přijetí čeká:** najít parcelu a financování věže; vysvětlit, proč začne střílet až po placeném cyklu a proč prázdné město nestačí; zvolit krytí a včas nasadit tank; po boji provést opravu za 10 a poznat přírůstek 40 zdraví; po importu pokračovat s vlastním vzhledem; poslechnout a posoudit bojovou odezvu. Automatické kontroly nenahrazují porozumění ovládání ani poslech člověka. Ruční migrace není třeba.

K1 nedokládá opakované armády K2, dokončení celé SP-009/SP-010 ani novou souvislou kampaň od buňky. Otevřené zůstávají K2, další civilizační alternativy a terénní role, zbývající dědictví, milníky C–E a závěrečný souvislý hraný průchod.
