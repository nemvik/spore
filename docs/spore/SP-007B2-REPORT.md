# SP-007.B2 · městské dějiny a následky · report v1

26. září 2026. [Plán a smlouva](../superpowers/plans/2026-09-26-civilization-inheritance.md). Implementace dědictví a skutečné dokončovací brány je hotová. Následující [L](SP-009L-REPORT.md) již doložilo celé hrané vojenské/konverzní alternativy a jejich účinky. [Nová závěrečná linie](FINAL-CAMPAIGN-REPORT.md) nyní doložila celý obchod od narození včetně skutečné spotřeby0,20/s; obě nové odbočky také dokončené, s nativním výkonem×1,2 a kladnou obnovou×1,2 i uložením/načtením. B2 je technicky dokončené; vesmírná filozofie D navazuje. Žádný commit, push, deploy ani změna závislostí.

## Výsledek

Nová linie už nepřeskočí města po třech domácích regionech. Jediná brána pro tlačítko i G vyžaduje skutečné založení soupeřových měst, jejich sjednocení, fungující financované hospodářství, živé vozidlo, návrat domů a vypořádání výprav/plaveb/obchodu. Dokončení uloží neměnný řez původních městských dokladů a snímek hospodářství. Původní uzavřená regionální historie se nepřepisuje.

Dědictví vychází ze všech doložených způsobů převzetí: vojenský +20 % výkonu terraformovacího nástroje, obchodní −20 % jeho spotřeby, konverzní +20 % pouze kladné obnovy životaschopnosti. Smíšená cesta rozdělí pevný bonus; opakované dobývání jej nezvětší. Deník vysvětluje původ a konkrétní účinek. Staré kampaně již v etapě 5 zachovají přístup včetně sandboxu s neutrálními koeficienty, bez domyšleného sjednocení. Aktivace probíhá v live i checkpointu; parser sám historii nedoplňuje.

## Vykonané ověření

- **131 cílených regresí**: tři metody i kombinace, skutečné J → 5, migrace/rekey/import/obnova, neměnné prefixy a hospodářství. Testy skutečného `stepPlanet` dokládají účinek nástroje, cenu i obnovu producentů/býložravců/predátorů, hlad, nevhodné klima a limit 100. Starý sandbox má numericky shodnou simulaci. Finální hraná fixture přidává 132. test.
- `pnpm exec vitest run --maxWorkers=1`: **158 souborů / 3 566 testů**, 141,29 s, včetně historických saveů, etap, knihoven a E–J. Následná úprava je pouze kompaktnější UI; produkční build a celý nový UI průchod byly zopakovány. Finální cílená sada s fixture je v `verification/final-targeted.log`.
- Typecheck a produkční build prošly: `index-O76CEnBi.js`, 1 501,86 kB / gzip 467,39 kB; `index-CXsaDFl3.css`. Známé upozornění na velký chunk trvá.
- Nezávislé review našlo přijetí otevřeného kontraktu / obnoveného výpadu v etapě 5 a změnu posledního hospodářského cyklu. Opraveno a negativně otestováno; legitimní pozdější financování, vypnutí/demolice dílny i další cyklus zůstávají validní. Po opravě bez dalšího P1/P2 nálezu.
- Produkční Chrome / nativní UI a RAF, **5 kontrolních skupin, 0 browser chyb**: nezměněná placená větev před J odmítne předčasné G; skutečný J export se vrátí domů a projde do 5; původní regionální historie zůstane shodná; nástroj stojí **0,20/s po 1,633 skutečných sekund simulace**, domácí příjem se měří zvlášť; export/import/rekey a save/reload/load zachovají výsledek. Samostatně historický sandbox zůstává hratelný a bez bonusu.
- Opravené chyby browser ovladače: již domácí větev nemá tlačítko návratu; pauza nemá tlačítko deníku; průběžně obnovovaný panel může odpojit locator během scrollu. Žádná z těchto chyb nevytvořila herní pokrok. Finální celý průchod prošel.

## Čitelnost a evidence

Prohlédnuty finální obrazy 1024×640 a 1280×720: blokovaná/připravená brána, dějiny, nástroj a historický sandbox. Vizuální kontrola vedla k přesunu skutečného dalšího cíle a tlačítka před rozbalitelný přehled hotových regionů. Krátký vzorek 90 nativních snímků aktivní terraformace: p50/p95 **16,7/16,7 ms**, maximum **16,8 ms**. Není to přímé GPU měření ani dlouhý soak.

[Hraná fixture a původ](../../tests/fixtures/civilization/README.md), aktivní kampaň `evidence/sp-007b2/browser/active-campaign.save.json`, checkpoint a výsledky; úklid zaznamenán v `evidence/sp-007b2/cleanup.json`. Předchozí J/I/H kampaně se nemění.

**Lidské přijetí čeká:** ze starší strojové linie najít nesplněné sjednocení, vysvětlit rozdíl domácích regionů a měst, z deníku určit zdroj úspory nástroje, po načtení pokračovat a poslechnout odezvu přechodu. Automatika nenahrazuje porozumění či poslech člověka. Ruční migrace není třeba.

Historické doporučení tohoto v1 reportu nahradilo dokončené [L](SP-009L-REPORT.md); obrana, obnova armád a obě celé alternativy už mají hrané důkazy. B2 nyní v trackeru dokončené: nové alternativy také prošly, lidské přijetí/poslech eviduje SP-017. Nový obchodní dědic skutečně měří0,20/s proti0,25; export30-inheritance-measured a kontinuita jsou v [aktuálním reportu](FINAL-CAMPAIGN-REPORT.md). Vesmírný spotřebitel D navazuje v téže linii. E je podle novějšího pokynu volitelné odložené pokračování.
