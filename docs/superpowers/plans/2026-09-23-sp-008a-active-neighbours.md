# SP-008.A — aktivní sousední kmeny

Výchozí revize `09a39247c`, čistý `main`. Podklady: ROADMAP, BRIEF, SP-007A-CONTRACT/REPORT; existující tribe/neighbours, unit-motion, persistence, lineage-history, renderer a testy. Bez nových závislostí.

## Rozsah a rozhodnutí

- Tři stávající identity; každý soused má vlastní omezenou populaci a zásoby. Sběrači odebírají skutečné zdroje, nesou náklad a uloží jej až doma. Jídlo platí krmení, léčení a obnovu populace; prázdná populace se znovu neinicializuje.
- Společná navigace a kolize, fyzický kontakt pro sběr/boj/krádež. Malá varovaná výprava reaguje na nepřátelský vztah, zásoby a přítomnou populaci; obrana reaguje na skutečné útočníky. Žádná vzdálená škoda ani časovač bezplatných zásob.
- Viditelné cizí jednotky, náklad a stav v panelu. Hráč může cílit člena výpravy, vrátit tlupu domů nebo nabídnout dar při kontaktu. Přátelští, neutrální a nepřátelští sousedé se chovají odlišně.
- Volitelný verzovaný `society` uvnitř souseda v kmeni v2. Parser staré savey nepřepisuje; explicitní aktivace UI aktualizuje jednou také checkpoint. Nové založení má společnosti rovnou. Globální ID kmene zahrnují nové členy. Výsledky `resolved` jsou trvalé a odměňují se jen jednou.
- SP-007.A a původ faktů beze změny; SP-004 objevy, SP-005 knihovna/NPC snapshoty a SP-006 růst se nepřepisují. Nové civilizační následky patří do SP-007.B1.

## Kritéria dokončení

- [x] Regrese fyzického odběru/doručení/spotřeby, konečných zásob, obnovy, kontaktu a terénu, varování, obrany, ústupu a uklidnění.
- [x] Diplomacie i dobytí všech tří sousedů; obnova nepřepíše výsledky ani neopakuje odměny.
- [x] Přesný roundtrip rozběhnuté výpravy/nákladu, pokračování, checkpoint/recovery, přechod etap a historické fixtures; přísná validace vadných dat.
- [x] Produkční browser UI: autonomní hospodářství, hráčova reakce na skutečnou výpravu, obě cesty, export/import za běhu. Připravené vstupy popsat odděleně; žádné živé settery ani časový hook.
- [x] Testy, typecheck, build, vlastní a nezávislé review, prohlídka finálních snímků, úklid vlastních artefaktů a aktualizace reportu/roadmapy.
- [x] Autorizovaný commit a push na původní `main`; zachovat cizí změny.

## Navazující části mimo A

SP-008.B — kulturní výstroj; SP-008.C — rozšířená hudební setkání; SP-008.D — domestikace; SP-008.E — náčelník; SP-008.F — pět sousedů a rovnováha mapy. Celá SP-008 i SP-007 zůstávají otevřené.

## Postup a meze

Datový model a simulace → persistence a UI → cílené regrese → produkční hraní → finální review a širší kontroly. Browser začíná z výslovně připravené kmenové situace; nepředstírá celou odehranou kampaň. Lidská zábavnost, dlouhodobá rovnováha, Safari a mobil vyžadují další playtest.

## Výsledek ověření

- 33 nových regresí, finální celek 121 souborů / 2 324 testů; typecheck/build a diff-check prošly. Dvě staré náročné regrese při souběhu s browsery překročily timeout; následně 46/46 cíleně a celý suite bez browserů zelený, beze změny limitů.
- Mír i boj produkčním UI finálně 13/13, bez browser chyb. Viditelný fyzický odběr, spotřeba/obnova, skutečná výprava a hráčova reakce, všechny tři výsledky, export/import během výpravy, po dokončení i ve strojové etapě. Snímky prohlédnuté; žádné živé změny stavu testem.
- Vlastní i dvě nezávislá review dokončená. Opravené reprodukované rohy navigace a zlomkový náklad; kompatibilitní review 295 testů bez blokujícího nálezu. Přijaté doporučení odvolat výpravu při odstranění nedostatku.
- Rozsah, původ připravených vstupů a meze lidského/ostatního ověření: [SP-008A-REPORT.md](../../spore/SP-008A-REPORT.md). SP-008 jako celek a SP-007 zůstávají rozpracované.
