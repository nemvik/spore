# SP-009.C — plán implementace a přijetí

Výchozí revize `b550612f4`, čistý Git, 25. 9. 2026. Skutečný základ: `city-economy.ts`, `city-spatial.ts`, `cities.ts`, striktní parser, `PlanetFieldRenderer`, UI B a knihovna/editor tvorů SP-005.A. Přečtené smlouvy/reporty A/B, SP-010.A/B/C, SP-005, SP-007.A/B1, roadmapa, progress a brief. Bez commitu/pushe/deploye.

**Provedeno a ověřeno 25. 9. 2026:** [report v1](../../spore/SP-009C-REPORT.md) mapuje kritéria níže na testy, skutečné UI průchody, výkon, review a zachované historické kampaně. Dokončena pouze C a budovová část SP-005.B.

## Rozhodnutí

- Oddělit hospodářský druh, parametrickou geometrii, výtvor s revizí a zaplacenou instanci. `CityRegistry` v3, ekonomika v2, vzhled v1, přenos `lumavora-building` v1. Přesná smlouva v `docs/spore/SP-009C-CONTRACT.md`.
- Díly kvádr/válec/kužel/kupole; pozice XYZ, rozměry XYZ, otočení kolem Y a barva. Sdílený model pro náhled i město. Pevná viditelná základna odpovídá původní kruhové kolizi, znak hospodářského druhu zůstává čitelný. Konzervativní obal všech otočených dílů uvnitř původního radiusu; původní parcely a prostorové účinky beze změny.
- Samostatná místní knihovna podle SP-005.A: atomický zápis jedné položky, optimistická kontrola původní revize, stejné importy bez duplicity, konfliktní ID pod novým ID, vlastní snapshot v kampani. Ukládání návrhu zdarma; stavba za původní cenu B; výslovná kosmetická úprava existující instance zdarma, bez resetu provozu, času či účtů, s potvrzením a revizní ochranou B.
- Editor používá původní WebGL renderer a odpojenou scénu; žádný druhý kontext nebo ekonomické tickování. Vstupy vyčistit při otevření/zavření, výběr myší i seznamem, numerické ovládání/klávesnice, undo/redo 40 kroků, zrušení bez vedlejšího účinku. Náhledy uvolnit.

## Postup

1. Uchovat byte-identickou šestihlavou B fixture, přidat model/validaci/knihovnu a regresní testy.
2. Výslovně migrovat live/checkpoint před rekey, integrovat stavbu a kosmetickou transakci; chránit historickou ekonomiku a původní systémy.
3. Sdílené renderování, editor a knihovna, napojení placené stavby a existujících instancí. Ceny/účinky/důvody/fokus a 1024×640.
4. Úzké regrese → celá sada → typecheck/build → produkční hraní a měření → vlastní i nezávislé review → opravy a dotčené opakované ověření.
5. Doplnit report v1, roadmapu/progress/smlouvy, uklidit vlastní mezivýstupy; aktivní save a malá evidence zůstanou.

## Měřitelná kritéria

- Dvě výrazně odlišné hráčem sestavené siluety stejného typu, skutečný výběr/XYZ/rozměry/otočení/barva, návrat undo/redo a zrušení; stejný renderer v náhledu a na parcele.
- Testy striktních verzí/polí, mezí po otočení, vadných importů, limitů, revizí, konfliktů/quota; žádná změna knihovny při selhání. Uložit/pojmenovat/duplikovat/revidovat/smazat/exportovat/importovat.
- Stavba odečte původní cenu právě jednou; úprava vzhledu změní pouze snapshot + revizi příkazu. Import, smazání předlohy, zrušení a checkpoint bez grantu/duplikace/refundu. Ekonomický výhled při stejných instancích shodný pro všechny vzhledy.
- Historické SP-010.A/B/C, SP-009.A/B a původní fixtures: idempotentní migrace live/checkpoint, rekey, save/load, obnova a zachované světy/organismus/jednotky/historie/B1. B dostane jen doložený výchozí model, bez hráčských výtvorů či nákupů.
- Produkční Chrome: skutečné město → dva návrhy → placená stavba + explicitní změna → přirozený cyklus → odchod/návrat → knihovní a kampanový přenos → reload/load → checkpoint. Připravený vstup přiznat; bez živých zápisů a časového shimu.
- Alespoň 20 otevření/zavření editoru a 20 návratů; odezva p50/p95, heap po GC a GPU geometrie/buffery. Finální snímky 1280×720 a 1024×640 skutečně prohlédnout, nula neřešených console/page chyb.
- Nezávislé review dokončeného diffu subagentem; opravit nálezy a ověřit. Celé SP-005.B/SP-009/SP-010/SP-017, vozidla/lodě, státy/obrana/strategie/moře/vesmír a B2/D zůstávají otevřené.
