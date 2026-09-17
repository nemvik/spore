# SP-001 — diagnostika testových odchylek

Navazuje na [kartu SP-001](../../spore/ROADMAP.md#sp-001) a [výchozí audit](../../2026-09-17-spore-similarity-audit.md). Rozsah: vysvětlit obě reprodukovaná selhání, opravit potvrzenou příčinu v rámci původního chování a zaznamenat ověření. Herní rozšíření SP-002 tím nezačíná.

## Postup

- [x] Zachytit aktuální revizi, prostředí a původní selhání bez změny očekávání. Výchozí revize `4da58b6`, Linux x64, Node 24.15.0 / V8 13.6.233.17-node.48. Dřívější report uvádí macOS arm64 a Node 22.23.1. Dva soubory opět vykázaly 6 průchodů a 2 selhání.
- [x] Oddělit vliv nového editoru od staršího chování porovnáním s rodičovskou revizí `2c6d7cd` ve stejném prostředí. Použít izolovaný dočasný export zdrojů a stejné závislosti; pracovní strom a fixtures zachovat.
- [x] Pro `tests/step-phases.test.ts` zaznamenat první rozdílný stav a konkrétní pole. Prověřit numerické rozdíly prostředí, metadata a význam výsledných hashů; neměnit referenci pouze kvůli zelenému testu.
- [x] Pro `tests/obstacle-contact-regression.test.ts` zaznamenat nulový pohyb, vstup, kontakt a kroky řešiče `src/game/obstacle-geometry.ts`. Zmenšit scénář na přímý regresní vstup.
- [x] Potvrdit jednotlivé hypotézy odděleným experimentem. Potvrzenou chybu pokrýt selhávající regresí a opravit u zdroje. Případnou změnu testovací strategie zdůvodnit zachovanými kontrolami chování.
- [x] Spustit dotčené regrese, úplnou sadu, typecheck/build a při změně pohybu ověření přes skutečné UI. Zaznamenat rozsah i omezení důkazů.
- [x] Zapsat závěr do verzovaného reportu, aktualizovat tracker a odstranit vlastní dočasné pracovní kopie se stručným manifestem.

## Výchozí příkazy a podklady

```sh
node node_modules/vitest/vitest.mjs run tests/obstacle-contact-regression.test.ts tests/step-phases.test.ts --maxWorkers=1 --minWorkers=1
git diff 2c6d7cd 4da58b6 -- src/game
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

Přímé příkazy používají nainstalované projektové závislosti. Lokální spouštěč `pnpm` při ověření selhával na otevření databáze ještě před spuštěním skriptu; není to selhání hry.

## Výsledek · 17. září 2026

Dokončeno v pracovním stromu nad `4da58b6`. [Report](../../spore/SP-001-REPORT.md) dokládá obě příčiny, první odlišné kroky a pole, opravu kontaktu i dvě přesné referenční sady. Úplná sada: 100 souborů / 1 957 testů; dotčené regrese také Node 22.14.0, typecheck/build, skutečné ovládání připraveného scénáře a nezávislé review prošly. Dočasné diagnostické kopie a nástroje byly odstraněny podle manifestu odkazovaného z reportu. Pokračování: plán SP-002.
