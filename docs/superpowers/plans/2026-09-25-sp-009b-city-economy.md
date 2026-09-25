# SP-009.B — implementační plán

25. 9. 2026. Výchozí čistý HEAD `c1b2c75b6`; skutečná A má pouze registr, zaplacené založení a kolizní radnici. C zmrazuje domov i RNG, B1 ovlivňuje pouze původní strojové sazby. Přečteny platné instrukce, brief, aktuální roadmapa/progress, smlouvy A/B/C geografie, měst A, dědictví A a reporty měst A, C, B1 a F. Bez commitu, pushe či deploye.

## Rozhodnutí a pořadí

1. Uchovat byte-identický odehraný export SP-009.A jako fixture. Sepsat [smlouvu B v1](../../spore/SP-009B-CONTRACT.md). Registr v2 výslovně migruje v1 na neaktivní ekonomiku; identita a layout v1 se nemění.
2. Samostatný `city-economy.ts`: placené otevření pokladny, převody, příchozí civilní obyvatelé, čtyři funkční provozy, místní zásoby a cykly. Čisté odvození výhledu, atomické příkazy s revizí, bez vratek. Oddělená validace přesných polí a účetních invariantů.
3. `city-spatial.ts`: volitelné očíslované parcely, terén/hranice/dekorace, bezpečný prostor náměstí/radnice/příchodu a odstupy podle těla. Stav staveb je overlay; generátory ani World se nepřepisují. Renderer drží jen jeden detail a z něj vytvořené aktivní budovy/obyvatele.
4. `main.ts`, městský HUD a CSS: ceny, kapacita, pracovníci, skutečný poslední výsledek i výhled, příčiny spokojenosti, mapa parcel, potvrzení před cenou/demolicí, trvalý fokus, srozumitelná obnova provozu. Přesně vymezený místní čas; pauzu řeší původní UI hodiny.
5. Regrese od ekonomiky k persistenci: deficit, duplicity, neplatné hodnoty, dvě města, více seedů, staré fixtures/A/B/C/městská A, rekey/checkpointy, parity původních systémů a B1. Úzké testy, celá sada sériově, typecheck/build.
6. Produkční browser: import přiznaného odehraného A → otevřít pokladnu → placené budovy a obyvatelé → skutečně vyčkat na kladný výsledek → změnit provoz → pauza/globál/domov/jiné město/návrat → export/import/save/load. Bez živých setterů a bez zrychlení času. Měřit 20 návratů, RAF, heap/GPU; prohlédnout 1280 a malé rozlišení.
7. Vlastní diff review a nezávislý subagent nad dokončenou změnou, opravit nálezy a opakovat dotčené ověření. Report v1 s konkrétními čísly, mezerami a dalším krokem; aktualizovat tracker/progress, uklidit vlastní artefakty.

## Měřitelná kritéria dokončení

- UI zaplatí obydlí, pěstírnu, dílnu a příchod 4 obyvatel; po 10 s aktivního místního času zaúčtuje skutečné potraviny, výdaje a kladný čistý jantar. Rozmístění dílny/zahrady odpočinku mění spokojenost a produkci; provoz bez pracovníků nebo údržby nevyrábí.
- Žádná platba při odmítnutí ani opakovaném potvrzení téže revize; demolice nevrací nic a nesmí odebrat obsazenou kapacitu. Nedostatek má hratelnou cestu přes původní obsazené prameny a placený převod/zásobení.
- Simulace posune pouze aktivní hospodářství, žádná offline kompenzace. Pauza/globál/neaktivní města stojí; původní systém mění jen explicitní převod jantaru. Jednotky, historie/B1 a terraformace zůstávají původní.
- Migrace nevytváří lidi/stavby/příjem/čas; skutečná města A zachovají doklad. Opakovaný save/import/rekey/checkpoint projde bez slučování větví. Historické otisky zachovány.
- Produkční okruh, 20 návratů s měřením, klávesnice/fokus/kamera/pauza a menší okno prohlédnuté. Relevantní testy, celá sada, typecheck/build a obě review bez neopraveného blokujícího nálezu.

SP-009.B neuzavírá celou SP-009/SP-010/SP-017. Editor vzhledu/knihovna, obrana a státy, převzetí/konverze, moře/vesmír a SP-007.B2/D zůstávají mimo rozsah.

## Závěrečné doložení — 25. 9. 2026

Všech pět vymezených kritérií splněno a ověřeno v [reportu v1](../../spore/SP-009B-REPORT.md). 66 ekonomických regresí; celý běh 2 925 testů, následně 168 finálních dotčených, typecheck/build; hlavní browser 5/5 + šest obyvatel a zahrady 4/4 + historický 12/12. Dvě města a sedm seedů jsou simulační regrese, browser používá jedno skutečné A město a střídá také poušť/domov. Review opravilo nativní klávesnici a uvolňování instančních bufferů; následný průchod bez nálezů. Otevřené navazující oblasti a meze automatického ověření jsou v reportu, B není blokované. Dále SP-009.C editor vzhledu/knihovna.
