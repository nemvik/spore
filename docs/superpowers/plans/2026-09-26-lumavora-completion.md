# Dokončení LUMAVORY · plán návazností

Autorita: aktuální `docs/spore/BRIEF.md` a nezkrácená kritéria `ROADMAP.md`. Výchozí pracovní strom je čistý; používáme existující TypeScript, Three.js, Vite a pnpm. Historické A–I ani lokální terraformace nedokládají celé B/C. Bez commitu, pushe nebo deploye.

**Uživatelem změněný rozsah 26. září 2026:** hlavní cíl končí D / jádrem galaxie, použitelnou odměnou a ověřeným návratem do existující galaxie. E včetně kapitána, dobrodružství, editoru a souvisejících částí SP-005/SP-017 je volitelné budoucí pokračování na samostatný pokyn. A–D a jejich úplné ověření zůstávají povinné; odložení E není jeho dokončení.

## Audit a pořadí

1. **B / knihovna vozidel:** tank a letoun existují jako placené snapshoty kampaně, člun má pevný blueprint. Chybí samostatná tvorba, revize, přenos a použití napříč liniemi. Nejdříve zpřístupnit tyto konstrukce knihovnou a zachovat původní účetnictví.
2. **B / plná civilizace:** ověřit a doplnit obnovitelné hospodaření/armády států, aktivní expanzi, terénní role a úplné vojenské, obchodní a konverzní sjednocení. `machinesReady` dosud vyhodnocuje jen tři místní regiony; nové dokončení musí vyhodnotit skutečné městské vlastnictví. Současné podmínky prodeje posledního města nemají doloženou dosažitelnou mírovou cestu. Žádné přejmenování těchto mezer na hotový obsah.
3. **B2 / dědictví:** doložená městská založení/převody → samostatná civilizační historie a konkrétní následky. Původní uzavřený výsledek strojových regionů ani B1 nepřepisovat. Dokončení B ověřit všemi třemi cestami přes UI.
4. **C:** oddělený verzovaný vesmírný stav nad identitou domova, vlastní loď/knihovna, orbita/soustavy, přenos života, obousměrné klima, ekosystém, kolonie/produkce/prodej/návrat. Zachovat původní `worlds` a místní `planet`; migrace live i checkpointu bez domyšleného pokroku.
5. **D:** rozšiřitelná galaxie, říše a jejich ekonomika/diplomacie/boj, vybavení, mise a stavové události, artefakty/červí díry/mladší civilizace, vesmírné dědictví, více cest k jádru a použitelná odměna s pokračováním.
6. **Dotažení A–D/SP-017 a závěrečné přijetí:** vizuál, animace, zvuk, kamery a kompaktní ovládání ověřovat v každém řezu; dokončit souvislý průchod od nové buňky k jádru, použití odměny a návrat. **E je odložené volitelné pokračování:** kapitán vlastního druhu, tři různé mise, výstroj/postup, editor stejného formátu a přenos závislých výtvorů se nyní neimplementují.

Každý následující řez dostane konkrétní plán před editací. Integrace/datové smlouvy zůstávají v hlavním vlákně; subagenti zajišťují nezávislý průzkum, testy a review.

## První řez · SP-005.B vozidla

- Samostatný `lumavora-vehicle` v1: stabilní ID, revize, data, popis, validovaný blueprint. Atomické localStorage zápisy, 100 návrhů / 128 KiB soubor, odmítnutí poškozených dat, zachování kolizních revizí. Kampaně drží kopie a na knihovně nezávisí.
- Znovu použít hlavní 3D editor a renderer pro tank, letoun i člun. Historický pevný člun v2 zůstane validovaný beze změny; upravitelný člun dostane vlastní verzi 3. Výroba používá skutečnou cenu/statistiky návrhu a původní kapacity/odemčení/zdroj peněz. Návrh sám nic neodemkne ani neposkytne jednotku.
- Knihovna v menu i během hry, náhledy konstrukcí, vytvoření/úprava/zrušení, zachycení placených kampanových návrhů, import/export/odstranění. Použití v kampani otevře cenové potvrzení před placenou výrobou.
- Soubory: nový `src/game/vehicle-library.ts`, `src/ui/vehicle-library.ts`; integrace `src/main.ts`, `blueprint.ts`, `renderer.ts`, `maritime.ts`, `maritime-validation.ts`, `ui/maritime.ts`. Regrese `tests/vehicle-library.test.ts`, související konstrukční/námořní testy a produkční browser scénář.
- Ověřitelné výsledky: tři odlišné návrhy, edit/revize/export/import, odmítnutí neplatného importu bez změny dat, skutečně zaplacený snapshot shodného vzhledu/statistik, pozdější úprava/smazání knihovny jej nezmění, historický save/checkpoint zůstane načitatelný. Prohlédnuté snímky editoru i hraného výsledku, typecheck/build, relevantní testy a nezávislé review.

## Druhý řez · SP-009.J obchodní sjednocení

- Nový volitelný `commerce` v1 aktivovaný bez historických dodávek v live i checkpointu. Kontrakt váže město, stát a epochu vlastnictví; tři skutečné zpáteční přepravy vlastním zaplaceným vozidlem vytvoří důvěru pro koupi i solventního posledního města. Tank používá pozemní BFS, letoun spojitou trasu přes atlas, člun vodní BFS mezi pobřežími. Vzhled a rychlost odpovídají vlastní konstrukci.
- Každý výjezd zaplatí 20 domácího jantaru do oddělené úschovy. Vyložení na cíli potvrdí hráč, vozidlo se fyzicky vrátí. Přerušená nevyložená jízda vrací přesně 20 až po návratu. Zrušení kontraktu bez rozjeté přepravy vrací vložené dodávky jednou. Náklad nemění původní `MachineUnit.cargo` a jeho starou ekonomiku.
- Nová kupní účtenka v2 započte 60 již vložených prostředků do celé ceny; stát dostane celou cenu až v atomickém převodu. Původní v1 a účetnictví F–I zůstanou platné. Změněný vlastník, cena, účet, vojenský závazek nebo nabídka odmítnou zastaralé potvrzení; uzavření kontraktu a účtenka musí odkazovat navzájem. Rozjeté vozidlo nelze nasadit, prodat, vyrábět znovu ani poslat na jinou cestu.
- Ověření: všechny tři dopravní role; 3 dodávky a poslední solventní město bez vojenské/konverzní pomoci; návrat/storno/duplicity; save uprostřed cesty, checkpoint a staré účtenky; produkční UI s nativním časem, skutečný model/kamera a prohlédnuté snímky. Nové úplné obchodní sjednocení obou států doložit odděleně od připravených cílených regresí. Celé B zůstane otevřené do dokončení dalších přijatých kritérií.

## Evidence a závěrečné přijetí

ROADMAP je jediný tracker stavu. Report každého řezu oddělí připravený vstup, odehrané akce, automatické kontroly a čekající lidské přijetí. Finále vyžaduje souvislou novou kampaň až k jádru bez debug postupu, použití/uložení odměny a návrat s možností další výpravy; cílené fixtures ji nenahrazují. Dobrodružství E nejsou podmínkou aktuálního cíle. Zachovat aktivní save a fixtures, uklidit vlastní mezivýstupy, trace jen krátce na výslovně potřebnou diagnostiku. Goal zůstává aktivní, dokud nejsou splněna všechna kritéria hlavního rozsahu A–D a jeho ověření; potom nenavazovat automaticky na E.
