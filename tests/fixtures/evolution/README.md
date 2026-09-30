# Kratší buňka a dědictví · odehrané checkpointy

Všechny JSON jsou přesné veřejné exporty bez přepisování herního stavu. SHA-256 a etapa/generace jsou v `manifest.json`. Uložení zahrnuje vlastní checkpoint generace; obnova vrací skutečný dřívější stav, není to další historická odměna.

| Soubor | Původ a použití |
| --- | --- |
| `legacy-cell-complete.save.json` | Přesný export 04 původní kampaně A–D ze září. Starých 15 soust, původní tělo a ekologie, bez dodatečně vymyšlené volby. G stále dovolí pokračovat. |
| `antenna-reef.save.json` | Nová linie 30. 9., seed 8675309, normální klávesnice/editor. Zvídavost zvolená při přestavbě. Po vstupu do útesu byla tykadla normálně odstraněna. X přesto poskytne zděděný sonar. |
| `spines-reef.save.json` | Samostatná nová linie, Ostražitost z ostnů. Orgán byl po vstupu do útesu odstraněn; přibliž se k lovci a použij X. |
| `spines-used.save.json` | Tatáž větev těsně po skutečném ústupu lovce bez zranění. Save zachovává také právě běžící osmisekundovou obnovu. |
| `creature-social-tribe-start.save.json` | Přesný export 14 původní kampaně A–D: skutečná přátelská hnízda a začátek kmene. Vyber členy a navštiv prvního souseda pro zděděnou diplomacii. |
| `earned-civilization-budget.save.json` | Přesný export 27 původní kampaně A–D: dokončené regiony a vydělané prostředky. N → cizí město → obchodní spojení → přeprav zbývající zásilky společně. |
| `batch-city-purchased.save.json` | Nové pokračování posledního souboru přes veřejné UI. Jedna přerušená a plně vrácená dávka; pak tři zásilky jednou cestou, zápočet 60 a skutečná koupě města. |

Nové průchody řídí `scripts/evolution-inheritance-browser.mjs` a `scripts/evolution-later-browser.mjs`. Používají pouze skutečné vstupy, RAF a čtecí diagnostiku. Jejich rychlost není lidské přijetí. Pozdější vojenská/konverzní/obchodní dědictví a jádro mají původní odehrané fixtures v sousedních `civilization/` a `space/`.

Spusť `pnpm build && pnpm preview --port 5220`, otevři hru, **Moje linie → Import souboru**. Prohlédni **J → Dědictví druhu**. Nepřepisuj původní aktivní kampaň; import vytváří vlastní relaci.
