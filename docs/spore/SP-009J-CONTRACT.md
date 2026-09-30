# SP-009.J · obchodní spojení a sjednocení · smlouva v1

Návaznost na G/I a knihovnu vozidel. Zachovává CityRegistry v8, States v4, Military v2, původní geografii a všechny historické účtenky. Nová volitelná větev `commerce.version=1` se aktivuje prázdná v live i checkpointu, bez výroby či darovaných prostředků. Samotný parser nic neaktivuje.

## Kontrakt a přeprava

Kontrakt sjednává výprava při návštěvě cizího města. Obsahuje stabilní pořadové ID, město, stát, epochu vlastníka a skutečný strategický tah. Epochu tvoří původní E capture (pokud existuje) a počet dalších transferů F–J. Vlastník v dané epoše musí být doložen původní společnou historií. Pozdější změna vlastníka zneplatní další dodávky, ale dovolí návrat a vrácení úschovy.

Tři doručené a vrácené výjezdy vytvoří obchodní spojení, které dovolí dohodu i se solventním státem a jeho posledním městem. Každý výjezd potřebuje živé vlastní vozidlo doma, bez předchozího nákladu a příkazů, a 20 domácího jantaru z původních pramenů. Historický `MachineUnit.cargo` se nepoužívá pro peníze. Tank jede pevninskou BFS, letoun spojitou BFS atlasu, člun vodní BFS mezi skutečnými pobřežími. Rychlost i vzhled určují snapshoty vlastních návrhů.

Pobřežní obchod používá již zaplacený člun pro nákladní okruh z domova. Výprava zůstává ve smluvním městě; nejde o námořní transport avatara nebo vojska, nezískává novou výpravu či návštěvu a nemění původní `maritime.journeys`. Člun musí být doma a po okruhu je opět doma. Nákladní cesta neotevírá přístup do cizího města, do něhož se výprava dosud nedostala.

Existuje nejvýše jedna rozjetá přeprava. Domov, ostatní jednotky a místní ekonomika během ní stojí; strategický čas běží. Atlas a pauza zastaví i přepravu. Platí `outbound → returning → returned`: na konci cesty hráč potvrdí vyložení, pak návrat a dokončení dojezdu. Před vyložením lze kdykoli obrátit. Nevyložených 20 se vrátí jednou až po návratu; doručených 20 zůstává v úschově. Uložený postup/čas, směr, dopravce i náklad se obnoví ze save. Zobrazení je zkrácená trasa atlasu, nikoli nová geografická simulace.

## Peníze a vlastnictví

Stát během zkušebních dodávek nedostává peníze. Úschova je samostatný nárok kampaně. Dokončený kontrakt nabídne původní G cenu odvozenou od radnice, majetku, obyvatel, pokladny a posledního města; 60 z úschovy se započte. Nová účtenka `TradeTransfer.version=2` má `contractId` a `credit=60`:

- `home.after = home.before − (price − 60)`;
- `stateCivil.after = stateCivil.before + price`;
- kontrakt přejde na `settled` a odkazuje na tuto jedinou účtenku;
- město, obyvatelé, majetek a původní demobilizace stráže pokračují podle G.

Žádná nová vojenská dotace. Civilní účet stále vychází ze součtu plných kupních cen minus doložené civilní výdaje. Staré v1 účtenky dál vyžadují původní insolvenci a plnou domácí platbu. Nabídky ověřují cenu, ekonomiku, vlastníka, závazky, stav účtu, revizi kontraktu a nejvýše jeden obchodní/konverzní převod na stát v jednom tahu.

Zrušit lze otevřený kontrakt bez rozjeté přepravy. Vrací přesně součet již doručených vkladů jednou. Nedostatek místa na účtu vratku nekrátí; zůstane čekat v úschově. Limity 128 kontraktů a 512 výjezdů zakážou pouze nové začátky; nebrání návratu/stornu. Přechod z etapy 4 vyžaduje vypořádat všechny otevřené kontrakty.

## Uložení a meze tohoto řezu

Validace kontroluje přesné tvary, účetní rovnice, trasy, historické epochy, postup, jediné využití dopravce, vzájemné odkazy dokončené smlouvy/účtenky a prefix checkpointu. Navazující obnovy nedomýšlejí žádné dodávky. Dokončené záznamy jsou neměnné; staré doklady nepotřebují stále existující vyřazené vozidlo.

Tento kontrakt nesnižuje přijatá kritéria SP-009. Dokončení celé civilizace, prostorová obrana, obnovitelné armády, B2 a návaznost C–E zůstávají součástí mateřského goalu. Historická D planeta nemá mořskou trasu k žádnému svému čtyřměstskému soupeřovu cíli; její produkční pokračování proto může doložit pozemní a letecký obchod, nikoli hranou námořní dodávku.
