# Skutečná obrana města K1

`native-defense-campaign.save.json` je byte-identický export `evidence/sp-009k1/final/active-campaign.save.json` z produkčního browseru 26. 9. 2026. Vstupem byl nezměněný hraný E export `tests/fixtures/geography/sp-009e-military.save.json`. Hráč veřejným UI opravil původní tank, vydělal jantar u skutečných domácích pramenů, převedl peníze do města, postavil a zaplatil provoz věže a ubránil město věží spolu s původním tankem. Věž byla v boji zničena; po návratu tanku se skutečná oprava za 10 městského jantaru zapsala do účtu a obnovila zdraví z 0 na 40. Vlastní vzhled „Jantarová hláska“ vznikl v editoru, byl exportován a instalován bez změny bojového stavu.

SHA-256: `144ae370d542f42e1cb7babf228dfecc43b57296f4905db7279969c49a31d6ac`.

Velikost: 239 204 bytů. Kampaň zůstává v etapě 4; město 1542 patří linii, placený výpad je zničený, vlastní tank se vrátil a původní E doklad se nezměnil. Uložený checkpoint předchází stavbě věže: obnova správně vrací celou dřívější větev včetně peněz, nikoli pouze zdraví věže.

Nativní průchod použil import uprostřed boje i závěrečné save/reload/load. Dvě umístění pocházejí ze dvou importů stejné skutečně vydělané E větve: parcela 108 začala zasahovat po 3,783 s místního boje, parcela 35 po 20,917 s. Bez živých setterů či zrychlení času. Samostatná věž v prvním pokusu legitimně prohrála; finální úspěch je obrana s podporou tanku.

Tato fixture je regresní důkaz pokračování historické E kampaně, nikoli nové souvislé linie od buňky ani opakovaně financovaných armád K2. Připravené bojové vstupy v jednotkových testech jsou evidované samostatně. Lidské porozumění ovládání a poslech nadále čekají. Podrobnosti: [report K1](../../../docs/spore/SP-009K1-REPORT.md).
