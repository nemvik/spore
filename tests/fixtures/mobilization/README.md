# Skutečně obnovené armády K2

`native-renewal-campaign.save.json` je byte-identický export `evidence/sp-009k2/browser-replay/active-campaign.save.json`, produkční build `index-CiWwbMtf.js`, 26. 9. 2026. Vstup je nezměněná hraná [K1 kampaň](../city-defense/README.md); nejde o novou linii od narození.

SHA-256 `144cf05598e3cdfe136511dd1aca89a82e0eae8497d37c383b3c147708452000` · 243689 bytů.

Hráč skutečně zaplatil dvě opravy vlastní věže 40→80→100 za 20 místního jantaru, vrátil se domů, získával domácí příjem a nechal soupeřovo zdrojové město pracovat bez návštěvy. První nový tank v tahu 48 / cyklu 15 zaplatil 40 z pokladny 49→9 (výroba105−údržba60=45). Druhý v tahu61 / cyklu28 zaplatil z48→8 (196−112−užzaplacených40=44). Oba vyrazily po skutečné pozemní trase a padly ve fyzickém střetu proti původnímu tanku a věži. Mezi vlnami uplynulo šest strategických tahů obnovy; proběhl běžný export/import/rekey i save/reload/load.

Originální E převzetí a F výpad, původní rezerva i civilní účet se nezměnily. Finální zdrojová pokladna20 dokládá ledger80+224−60−16−128−80. Oba nové výpady mají health0 a phase destroyed; vlastní tank88 a věž100 se nemusely po těchto soubojích opravovat. Přiložený starší checkpoint zůstává celou dřívější větví, bez nových nákupů.

Veškerý hraný pokrok vznikl veřejným UI a nativním RAF. Žádné živé zápisy, přidání peněz ani zrychlený čas. Původní 300s browser timeout vytvořil jen devět skutečných ekonomických cyklů; opakování s900s limitem dokončilo obě vlny. Příčina zpomalení nebyla prokázána. Připravené bojové/unit stavy slouží pouze regresím a lidský playtest/poslech zůstává čekající. [Report](../../../docs/spore/SP-009K2-REPORT.md).
