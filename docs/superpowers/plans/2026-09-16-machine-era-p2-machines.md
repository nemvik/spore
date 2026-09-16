# P2 — Stroje a společný editor

Navazuje na ověřování P1 a audit `2026-09-16-machine-era-p2-editor-audit.md`. Schváleno: surovina **jantar**, pozemní a létající stroje, žádný multiplayer. Kořenový save zůstává v3; historický Genome zůstává beze změny. Cílem celého úkolu nadále zůstává hratelná P1–P3 včetně skutečného úplného průchodu nové kampaně.

## Kritéria dokončení

Jeden editor a jeho historie/výběr/tahy/rozpočet fungují pro tělo i vozidlo. Zaplacený potvrzený návrh vytvoří skutečný stroj stejného modelu a odvozených vlastností. Všechny tři pobřežní strategie dokončí etapu. Tank fyzicky získá jantarový pramen s průběžným příjmem; letoun to neumí, odemyká se po prvním vlastním regionu a skutečně překoná bariéru k poslednímu regionu. Vše se uloží a pokračuje deterministicky. Přechod 4→5 předá konkrétní vozidla další etapě.

## Pořadí práce a kontrakty

1. **Před refaktorem charakterizovat editor.** Stávající legacy browser fixture + nový `scripts/editor-characterization.mjs` pro současnou Journey. Zachovat oba cenové modely, historii input transakcí, symetrii, tahy, validaci a cancel. Spustit, uložit důkazy; potom změnit společné funkce a spustit stejné testy beze změny.
2. **Blueprint adapter.** `game/blueprint.ts`: interní union organismu (`Genome & {kind:'organism'}`) a `VehicleBlueprint`. Explicitní převod z/do historického genomu; diskriminátor nikdy neprosákne do starého player.genome. Společné rozměry/barva/vzor a attachment `id/kind/axial/angle/scale/mirrored`; vozidlo navíc `carrier:'tank'|'air'`. Historie a editace jsou jedna, katalog/cena/statistiky/commit jsou větve nad typem návrhu.
3. **Katalog a validace.** Povinný trup, kabina, správný pohon (pásy nebo rotor), právě jeden modul (vrt/setí, dělo, vysílač), volitelný pancíř. Jantarová cena celého nového stroje bez refundu; ukládání návrhu samo nikdy nevytvoří flotilu. Odolnost, výkon, rychlost a nosnost vycházejí z dílů; vzdušný má nižší nosnost. Název/rozměry/attachments validovat stejně důsledně jako genom.
4. **Renderer.** `render/machine.ts` vytvoří model pro svět i preview, se skutečným attachment povrchem, sdíleným partId picking/selection kontraktem a vlastní animací pohonu. Žádná kopie editoru nebo formulář pro náhradní stavbu. Modely flotily cachovat a dispose při výměně.
5. **Aktivní MachinesState v2.** Zachovat P0 v1 prázdný řez. V2: jantar, zaplacené návrhy, flotila s HP/polohou/frontou/navigací, tři regiony s terénem a postupem konkrétní strategie, fyzické jantarové prameny, odemčený let, odvozený pobřežní archetyp, elapsed/nextId/completed. P1→P2 jednou při živé dokončené tlupě; zapsat historii a checkpoint. P1 osada a obyvatelé jsou zachované dědictví.
6. **Prameny a regiony jsou různé cíle.** Tank zabírá dosažitelný pramen po fyzické návštěvě. Regiony vyžadují obnovu a osídlení (vrt + dovoz placených zásob), boj s aktivní odvetou (dělo), nebo opakované zásobované setkání a obchod (vysílač). Nejde o tři rychlosti téže tyče. První region otevře letouny. Poslední cíl leží uvnitř skutečného neprůchozího obvodu; pozemní navigace jej respektuje, let letí nad ním. Žádný pramen uvnitř bariéry, který by letoun musel zabrat v rozporu s asymetrií.
7. **Veřejné akce a ovládání.** Sdílený UnitOrder/výběr/formation/camera zP1. Jednotlivé akce validují celý příkaz před útratou. UI: jantar/příjem, flotila, regiony, vstup do společného editoru a kontextové příkazy. Vlastní české copy. Zánik flotily není ekonomický softlock: startovní pramen poskytne minimální obnovitelný příjem pouze po skutečném prvním tankovém záboru, checkpoint jinak umožní obnovu.
8. **Persistence.** Přesné pole/enum/čísla/ID/reference, legitimní blueprinty, vlastnictví a příjem, odemčení, archetyp/campaign soulad, checkpointerezy. Odmítnutí poškozených pozic atomicky. Výkonnostní test + determinismus 3 seedů + save/load rozpracovaných činností.
9. **Browser a review.** Všechny tři cesty normálními UI akcemi z přiznaných kmenových vstupů; editor→skutečný tank→pramen→region→odemčený letoun→bariéra→finále. Zachovat characterizační editor scénáře, historické save/regrese organismu. Prohlédnout snímky a měřit skutečné chování, nepovažovat připravené fixture za úplnou kampaň. Potom detailní plánP3, katalog skutečných kontaktů, klima a finále.

## Závislosti a rozdělení

Root vlastní typy, simulační pravidla, sdílený editor a integraci. Nezávislé bounded práce: předrefaktorová charakterizace, procedurální model po stabilizaci Blueprint kontraktu, přísný validator po stabilizaci MachinesState, behavior testy a review. Žádné paralelní editace main.ts nebo simulation.ts.

## Ověřená oprava kapacity flotily

Veřejně dosažitelná flotila osmi tanků původně blokovala výrobu letounu. P2 proto umožňuje explicitně vyřadit jeden vybraný živý stroj do12m od dílny, vrátit35% ceny a nevyužitý placený náklad. Poslední živý stroj zůstává. Přesný postup osm tanků→vyřazení→letoun→vysoká kotlina→P3 pokrývá11regresí a skutečný browser ověřuje platbu/refund/výměnu i save/import (`evidence/era-p2/retirement/result.json`).
