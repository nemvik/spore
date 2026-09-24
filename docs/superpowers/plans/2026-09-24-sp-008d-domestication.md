# SP-008.D — domestikace: implementační plán

> **For agentic workers:** Use superpowers:executing-plans. Implementace v této relaci, závěrečná nezávislá kontrola; žádný commit/push podle výslovného zadání.

**Goal:** Najít skutečného zvonkonoše, zaplatit získání, fyzicky ho dovést domů, pečovat o něj a využít placený autonomní sběr se skutečným nákladem.

**Architecture:** Zvíře zůstává právě jednou ve `world.creatures`. Volitelné `tribe.domestication.version=1` vlastní pouze reference, získávání, péči/náklad a poslední výsledek. Společné odvození vhodnosti/stavu používají příkazy, HUD, renderer a zvuk. Samostatný modul obstará navigaci zvířete, nikoli nový člen nebo bond.

**Tech Stack:** TypeScript, Three.js, Vitest, stávající Playwright a Vite; bez dependencies.

**Spec:** Zadání SP-008.D v této relaci; `docs/spore/BRIEF.md`, `ROADMAP.md`, `SP-008{A,B,C}-REPORT.md`, `SP-007A-CONTRACT.md`.

## Global Constraints

- Výchozí čistý strom / HEAD `488e4cb`; zachovat A/B/C, tělo/jídelníček, ekologii, symbionty, historii a boj. Bez commitu/pushe.
- Pouze D, E/F a nové dědictví SP-007.B1 zůstávají otevřené. Jeden skutečný existující druh je ucelený první rozsah D.
- Produkční UI, nativní čas, žádný live setter ani advanceTime. Připravené vstupy přiznat. Finální snímky prohlédnout i 1280×720. Zvukový automat není poslech.
- Přesné validace, historické fixtures, společný rollback checkpointu. Úklid podle AGENTS.md.

## Návrh a rozhodnutí

Zvonkonoš (`bell`, skutečný pobřežní grazer) je vhodný pro samostatný sběr řasy/nektaru. Prachokřídlík je symbiont, korunoplaz lovec a žrout invazní fauna; jejich dosavadní role se nemění. Alternativa univerzálního ochočení všech druhů by vyžadovala nové role/krmivo a vyvážení; pasivní produkce vajec by nevyužila současnou ekologii. Volíme sběr skutečných zdrojů, který používá existující ekonomiku 1 porce → 4 jídla a soupeří s NPC/faunou.

Kapacita dva jedinci na dokončený přístřešek, nejvýše tři. Jeden aktivní pokus; rezervuje místo. Pečující je právě jeden zdravý vlastní člen (ne symbiont), bez oštěpu, bez nákladu, s hladem <65 a mimo hudební návštěvu. Přiblížení do 4 m bez překážky; při prvním kontaktu jednorázová nevratná cena 6 jídla. Osm sekund klidného kontaktu, pak doprovod domů; člen čeká, když zvíře nestačí nebo je za překážkou. Celkem nejvýše 90 s, ztráta kontaktu po zaplacení nejvýše 4 s. Další rozkaz/zastavení, zásah, ztráta reference/člena, nedostatek jídla nebo timeout ukončí pokus bez zvířete/odměny. Zaplacené krmení sníží skutečný hlad jen jednou.

Po příchodu: odpočinek nebo zadaný zdroj řasy/nektaru do 32 m od domova, nejvýše šest porcí po 3 s. Odečet pouze při kontaktu, doručení pouze doma a náklad se nuluje. Pečující může dělat jiné věci, ale krmí pouze doma v dosahu zvířete; 3 jídla při hladu ≥30, −32 hladu. Hlad roste 0,65/s; od70 není sběr, od90 škodí. Sytá kontaktní péče obnovuje důvěru a zdraví; hlad/absence pečujícího snižuje důvěru. Při nule odchod do divočiny, náklad ztracen bez grantu. Přidělení nového pečujícího je hráčova akce. Útok zvíře vyplaší, zastaví práci a snižuje důvěru; smrt vytvoří právě jednu běžnou mršinu. Uvolnění ponechá stejného jedince v krajině. Žádný spawn, rozmnožování, DNA, fakta historie ani odměna za ochočení.

Save drží fázi, čas, platbu, navigaci, hlad/zdraví původního zvířete, péči, náklad a zdroj. Stale reference jsou přijaty jen v odpovídající ID doméně; příští tick pokus ukončí / uvolní místo / odpojí pečujícího. Reference na existující nesprávný typ se odmítají. Přechod do strojů ukončí aktivní pokus, vlastněná zvířata/jejich práci zmrazí, bez bonusu další etapy. Staré savey se parserem neaktivují.

## Review Focus

1. Stejný jedinec nesmí souběžně běžet divokou i domácí AI; smrt/uvolnění/import neduplikuje jídlo.
2. Kámen mezi zvířetem/členem/domovem/zdrojem brání kontaktu i při malé vzdálenosti.
3. Save na hranici smrti a ztracená reference musejí skončit bezpečně bez odměny.
4. Sběr hladového zvířete a chybějící krmivo musejí skutečně zastavit ekonomický výstup.
5. Zámky získávání nesmějí rušit hudbu/výstroj nebo povolit cizího vlastníka.

## Task 1 — získání a identita

Files: nový `src/game/tribe-domestication.ts`, `tests/fixtures/domestication.ts`, `tests/tribe-domestication.test.ts`; `era-types.ts`, `tribe.ts`, `tribe-wildlife.ts`, `tribe-society.ts`, `tribe-music.ts`.

Produces: `domesticationQuote(s, ids, creature)`, `startDomestication(s, ids, creature)`, `cancelDomestication(s, reason?)`, `stepDomestication(s, dt)`, `stepAcquisitionMember(s,u,dt,positions)`, `managedAnimal(s,id)`, `interruptDomesticationOnDamage(s,memberId)`, `damageDomesticAnimal(s,creatureId)`. Všechny příkazy vracejí stávající `TribeAction`; členové i zvířata používají moveUnit/tribeContact.

- [x] Nejprve červené scénáře ceny/kontaktu/stejné identity, pohybu domů, přerušení a atomického odmítnutí.
```ts
expect(startDomestication(s,[u.id],c.id).ok).toBe(true);
stepDomestication(s,1/60);
expect(t.food).toBe(94); // skutečný kontakt, výchozích100
expect(s.world.creatures.filter(v=>v.id===c.id)).toHaveLength(1);
```
- [x] Doplnit typy, příkazy/automat a integraci do skutečného step; červená → zelená.
- [x] Kontrolovat členovy nové rozkazy, hudbu, oštěp, útok/mrtvou kořist a oddělené ID domény.

## Task 2 — péče, práce a konec života

Files: stejný game modul a test; `tribe-wildlife.ts`. Produces: `assignAnimalCaretaker`, `orderDomesticAnimal(s,id,resource|null)`, `releaseDomesticAnimal`, sdílené `animalStatus` pro potřeby/účinek.

- [x] Červená regrese fyzického odběru, nákladu a doručení +24 po šesti skutečných porcích; bez kontaktu0. Hlad70 zastaví práci, nulový sklad nekrmí, důvěra0 vrací tutéž entitu.
- [x] Implementovat péči a route; útok/domov/náklad/ztráta pečujícího. Snížit zdroj a půdu jako stávající sběr, žádný grant na timer.
- [x] Ověřit s překážkou a v plném step, po smrti jedinou mršinu, po release žádnou vratku.

## Task 3 — persistence a přechody

Files: nový `src/game/tribe-domestication-validation.ts`, `tests/tribe-domestication-persistence.test.ts`; `persistence.ts`, `simulation.ts`.

- [x] Přísné chybné vstupy a uložené approach/lure/escort/care/cargo nejprve červené. Duplicity, cizí vlastník, špatná fáze/cena, NaN/meze/unknown keys; stale reference samostatně.
```ts
const loaded = parseGame(serializeGame(s));
expect(loaded.tribe).toEqual(s.tribe);
expect(() => parseGame(malformed)).toThrow();
```
- [x] Implementovat optional validaci a kontext vůči coast světu; historická absence se nemění. Checkpoint vrátí svět/náklad/platbu společně. Pokus se před přechodem ukončí, péče dál nesimuluje.
- [x] Načíst/roundtripovat všech11 historických fixtures, starší checkpoint bez markeru i běžné pozdější etapy.

## Task 4 — ovládání, čitelnost, vizuál a zvuk

Files: nový `src/ui/tribe-domestication.ts`, `src/render/domestication.ts`, `tests/tribe-domestication-presentation.test.ts`; `main.ts`, `ui/tribe.ts`, `tribe.css`, `renderer.ts`; zvuk přes společnou metodu voice.

- [x] Regrese sdílených indikátorů a observeru nejprve červené; skutečný stav krmení/nákladu, reduced motion, nevydávat načtení za novou událost.
- [x] Tlačítko Zvířata otevře panel nahrazující levý výběr; seznam skutečné fauny s vhodností a focus, výběr pečujícího, přesná cena/kapacita/potřeby, zrušení, úkol sběru/odpočinku/uvolnění a výsledek. Žádný výběr zvířete jako člena vlastního druhu.
- [x] Původní model zvířete + značka vlastnictví/náklad/progress; vazba na skutečný pohyb/krmení. Zvuk odlišuje získání, jídlo, doručení a problém, respektuje settings.

## Task 5 — doložení a úklid

Files: nový `scripts/domestication-browser.mjs`, script package; report, ROADMAP, PROGRESS.

- [x] Produkční připravená kmenová fixture (zásoby/rozmístění skutečné fauny/zdroj); úspěch/placená péče/sběr, přerušení po platbě, neúspěch nebo zanedbání, export/import a reload uprostřed získávání i péče. Výhradně UI a nativní RAF, malá evidence.
- [x] Typecheck, celý `pnpm test`, build; případné timeouty izolovat a každou změnu parametrů přiznat. Žádná změna očekávání pro zelený běh.
- [x] Jeden nezávislý reviewer dle executing-plans; důležité nálezy reprodukovat a opravit. Prohlédnout finální screenshoty, i1280×720.
- [x] Aktuální report s přesnými výsledky/mezerami, pouze D dokončeno; úklid vlastních artefaktů/manifest, kontrola disku. Commit/push čeká.

## Záznam práce

- Průzkum dokončen: wildlife běží před stepTribe a také v dalších etapách, proto managedAnimal musí odpojit domácí jedince i po přechodu. Světová a kmenová ID jsou odlišné domény. Kapacita se nezapočte mezi vlastní členy.
- Ruling: pracovat v uživatelem určeném čistém workspace bez nového worktree/commitu; zadání požaduje zachovat strom a žádá dokončení v této relaci. Plán slouží i jako trvalý záznam, bez pomocné git historie.
- Disk před běhy241 GiB; trace/video vypnuté.
- Implementace získávání/péče/persistence/UI dokončena; první47 trvalých regresí prochází. Nezávislý reviewer ověřil168 trvalých testů a5 reprodukcí. Opraveno: zdravé původní zvíře má32, min vhodnost nyní60% skutečného maxima; léčení respektuje stejné maximum. Mrtvá aktivní reference je odstraněna s jednou mršinou. Zmrazená péče chráněna i před uloženým cílem predátora. Lov nyní kontroluje LoS. Nulová důvěra se řeší před příjmem z nákladu/péčí.
- Prostředí: sandbox blokuje globální databázi pnpm a listen localhostu. Schválené lokální spuštění mimo sandbox funguje. Přímý Vitest používal tutéž nainstalovanou verzi3.2.4, žádné dependency změny.
- První browser pokus: helper vybral skryté duplicitní tlačítko select; upraven na viditelné UI prvky. Druhý: build odmítl TS chyby v dočasném reviewerově testu, takže původní starý build stále odmítal přirozeně zdravého bell; tento pokus není finální evidence. Reviewer temp test uklidil, build se opakuje.
- Produkční průchod našel rendererovou integrační chybu: přepsání stage na2 pro krajinu odpojilo domácí značky. Screenshot s nákladem byl prohlédnut a chyba reprodukována regresí skutečného GameRenderer.render (červené undefined marker). Předání původního campaignState opravilo zobrazení, regrese zelená. Finalizace vyžaduje nový vizuální replay. Aktuálně53 nových trvalých testů zelených.

- Finální celá sada na konečném herním kódu prošla: 131 souborů / 2 470 testů, 79,67 s. Po pěti původních timeoutech prošlo izolovaných 83/83 s jedním pracovníkem a původními limity; celá sada pak s `--maxWorkers=1 --testTimeout=30000`. Očekávání/kroky/hash i explicitní 20s timeout beze změny. Finální typecheck/build prošly; pouze známá velikost hlavního JS chunku.

- Finální produkční replay prošel 7 skupinami kontrol bez chyb; předchozí úplný UI průchod 8. Skutečný UI mid-save znovu pokračoval až domů, péče s nákladem došla do skladu. Hladové zvíře se zadaným dostupným zdrojem nesbíralo dalších 482 ticků a ztrácelo důvěru; přidělený pečující se vrátil a skutečné krmení obnovilo výživu. Přerušení a uvolnění proběhly přes UI, beze změny počtu původních entit.
- Otevřeno/prohlédnuto osm finálních 1280×720 snímků a jeden přípravný 1440×900. Viditelné balíčky/značka používají původního tvora; po release zmizí. Audio ověřeno přes skutečná volání Web Audio, bez lidského poslechu. Konkrétní výsledky a meze v SP-008D-REPORT.md.
- ROADMAP/PROGRESS/report aktualizovány; pouze D hotovo. Úklid vlastních 7,63 MB podle cleanup-manifest.json, zachováno přibližně 6,14 MB včetně active-campaign a skutečných replay vstupů. Žádné trace/video, žádný vlastní běžící server/browser, disk 241 GiB volných. Commit/push nebyly provedeny.
