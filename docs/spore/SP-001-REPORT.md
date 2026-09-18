# SP-001 — příčiny dvou testových odchylek

Diagnostika z 17. září 2026. Výchozí revize `4da58b6`; změny jsou v pracovním stromu. Navazuje na [plán](../superpowers/plans/2026-09-17-sp-001-test-discrepancies.md), [tracker](ROADMAP.md#sp-001) a [původní audit](../2026-09-17-spore-similarity-audit.md).

## Co znamenala selhání

První selhání odhalilo skutečnou chybu kontaktu: tvor mohl na jeden simulační krok ztratit pohyb podél skály včetně stoupání. Druhé selhání bylo neportabilní očekávání testu: přesný otisk celého stavu nerozlišoval změnu herního chování od rozdílu posledních bitů matematické aproximace.

Nový editor těla tyto odchylky nezpůsobil. Před opravou kontaktu se `4da58b6`, rodičovská `2c6d7cd` i původní monolitická simulace `86aa3ab` ve stejném prostředí shodovaly v **18 scénářích × 601 úplných otiscích**, včetně počátečního stavu a všech 600 kroků.

## 1. Kontakt s překážkou

Při přehrání nezměněného uloženého vstupu `worker-second-retreat.json` a původních veřejných ovládacích vstupů se problém zmenšil na jediný pohyb u sloupu 184. V úseku A+Q, snímku 33 / ticku 2709, se má tělo posunout nahoru o `0.06299024180589852` m a sklouznout po straně sloupu. Před opravou zůstane stát.

Řešič správně odstranil složku mířící dovnitř skály. Následné sestavení koncového bodu v souřadnicích světa a jeho zpětné odečtení ale ztratilo několik nejnižších bitů. Tečný směr pak vyšel jako nepatrně dovnitř mířící: skalární součin `−2.3037127760972e−15`, zatímco stará mez zaokrouhlení byla jen `4.083428974042715e−16`. Vznikl druhý kontakt v čase nula a řešič zahodil zbývající pohyb.

**Oprava:** [obstacle-geometry.ts](../../src/game/obstacle-geometry.ts) nyní do meze zahrnuje i chybu odečítání světových souřadnic. Nadále kontroluje každý další sloup, skutečný vstup dovnitř, stropy i rohy. Překážky, rozměry těla ani uložené vstupy se nemění.

**Regrese:** nový přímý případ v [obstacle-contact-regression.test.ts](../../tests/obstacle-contact-regression.test.ts) před opravou selhal na ztraceném stoupání; po opravě prošel. Původní delší replay zůstal beze změny požadavků na vzdálenost, stoupání, nehybné kroky, nepřekrývání překážek a shodu save/load. Soubory kontaktů, konečných překážek a navigace společně prošly 42 testy.

## 2. Přesné otisky simulace

Původní reference pocházela z macOS/arm64. Zdejší Linux x64 reprodukoval stejných 36 odlišných koncových/průběhových hashů jak v Node 22.14.0, tak v Node 24.15.0. Samotná hlavní verze Node tedy nebyla příčinou.

Pro izolaci matematické příčiny byly dočasně přeloženy původní funkce V8 fdlibm pomocí Clang 14 s `-O3 -mfma -ffp-contract=on`. Jejich použití v samostatné diagnostice přesně obnovilo **všech 18 historických koncových i průběhových hashů**. Do hry ani do běžných testů se tato knihovna nepřidává. Původní Mac se při této diagnostice znovu nepoužíval; jde o reprodukci jeho zaznamenaného numerického profilu.

První rozdíl scénáře `legacy:481516:0` byl v ticku 60, v `world.creatures[5].heading` a témže objektu v `worlds[0]`:

| Výpočet | Zdejší nativní matematika | Reprodukovaná historická varianta |
| --- | --- | --- |
| `atan2(-2.076288111083623, -0.7273428900957236)` | `-1.9077466031877741` | `-1.907746603187774` |
| Absolutní rozdíl | — | `2.220446049250313e-16` radiánu |

Kontrakce násobení a sčítání (FMA) zaokrouhlí kombinovaný výpočet jednou; oddělené operace mohou zaokrouhlit jinak. Kryptografický hash pak vyjde úplně jiný, přestože číslo se změnilo jen v posledním bitu. JavaScript u těchto matematických funkcí připouští implementační aproximaci. [Specifikace ECMAScript](https://tc39.es/ecma262/2025/multipage/numbers-and-dates.html#sec-function-properties-of-the-math-object).

**Oprava testu:** zachováváme historickou referenci a přidáváme doložený profil Linuxu. Test musí odpovídat jedné celé sadě otisků; neskládá volně výsledky jednotlivých scénářů z obou sad, nezaokrouhluje stav a nevynechává další pole. Nový neznámý profil nadále selže. Původ a pravidla údržby jsou v [README referencí](../../tests/fixtures/step-phases/README.md).

Samotná oprava kontaktu z bodu 1 mění pohyb NPC u útesových sloupů. Porovnání všech 18 × 601 otisků před/po opravě v obou matematických profilech ukázalo změnu pouze v šesti útesových scénářích. Jejich doložené nové reference jsou odděleně v [contact-slide.json](../../tests/fixtures/step-phases/contact-slide.json). Test přijímá pouze dvě úplné sady **po opravě**, takže návrat původní chyby neprojde. Výchozí hodnoty zůstávají jako doklad původu.

První změněný krok a pole jsou v obou profilech totožné; mění se souřadnice `x/y/z` uvedené pozice a jejího aliasu v `worlds[1]`:

| Scénář | První odlišný tick | První odlišná pozice |
| --- | --- | --- |
| `legacy:481516:1` | 71 | `world.creatures[16].pos` |
| `legacy:20260913:1` | 47 | `world.creatures[1].pos` |
| `legacy:8675309:1` | 235 | `world.creatures[9].pos` |
| `current:481516:1` | 216 | `world.creatures[4].pos` |
| `current:20260913:1` | 215 | `world.creatures[4].pos` |
| `current:8675309:1` | 364 | `world.creatures[1].pos` |

Všech dvanáct scénářů mimo útes se nezměnilo ani v jediném otisku. Ve všech scénářích zůstaly původní ekologické souhrny včetně RNG, potravy, jídel, počtů tvorů, narození a úmrtí. Přesný úplný stav se dál kontroluje bez zaokrouhlení.

## Ověření ve hře

Produkční build na `127.0.0.1:5197` načetl nezměněný připravený útesový save přes běžný import. Následovalo šest úseků ovládaných skutečnými klávesami A, A, W, A+Q, W, D. Čas se nepřeskakoval a produkce neměla funkci `advanceTime`.

- Úsek A+Q: x `26.6074 → 12.1379`, y `−4.2715 → 3.7704`; stoupání **8.04 m**.
- Následující W: z `−20.4699 → −31.5379`; pohyb pokračoval i po obcházení sloupu.
- Žádná smrt ani chyba konzole; čtyři WebGL upozornění na `ReadPixels`.
- [Finální lokální snímek](../../evidence/sp-001-2026-09-17-contact.jpg) byl prohlédnut. Jde o připravený scénář, nikoli nový průchod celé kampaně; kvůli reálnému časování nejsou hranice úseků totožné s přesně krokovaným jednotkovým replayem.

## Reprodukce

```sh
node node_modules/vitest/vitest.mjs run tests/obstacle-contact-regression.test.ts tests/step-phases.test.ts --maxWorkers=1 --minWorkers=1
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

Spouštěč `pnpm` v tomto prostředí při úvodním ověření selhal ještě před skriptem na otevření své databáze. Výše uvedené příkazy spouštějí stejné lokální projektové závislosti přímo. Stažený dočasný Node 22.14.0 měl ověřený oficiální SHA256 `69b09dba5c8dcb05c4e4273a4340db1005abeafe3927efda2bc5b249e80437ec`; systémová instalace se neměnila.

Diagnostické matematické podklady: [V8 ieee754.cc](https://raw.githubusercontent.com/nodejs/node/v22.14.0/deps/v8/src/base/ieee754.cc) (SHA256 `da01a54955911cfc550117988de91516c6f1aac343af28142dce619b433a67fc`) a [ieee754.h](https://raw.githubusercontent.com/nodejs/node/v22.14.0/deps/v8/src/base/ieee754.h) (`c968700367cc44a8255b4d44f382e704674f8f8e4bb14eb022b82f60a1e87b71`). Porovnány byly `sin`, `cos`, `atan`, `atan2`, `exp`, `expm1`, `log` a `pow`.

## Závěrečný stav

**SP-001 je hotové v pracovním stromu.** Závěrečné ověření po opravě a zapsání obou doložených profilů:

| Kontrola | Výsledek |
| --- | --- |
| Kontaktní regrese + otisky fází, Node 24.15.0 / Linux x64 | 2 soubory, 9/9 testů |
| Stejné regrese, Node 22.14.0 / Linux x64 | 2 soubory, 9/9 testů |
| Úplná sada, Node 24.15.0 | 100 souborů, **1 957/1 957 testů**, 56.95 s |
| TypeScript `--noEmit` | prošel |
| Produkční build | prošel; stávající upozornění na JS chunk nad 500 kB |
| Produkční UI, připravený útesový scénář | běžné klávesy, zachované stoupání a další pohyb, 0 chyb konzole |
| Nezávislé review | bez připomínek |

Review navíc porovnalo 7 200 posunutých a otočených kontaktů: všechny skutečné vstupy dovnitř o `1e-9` zůstaly blokované, pohyby ven a svisle prošly. Nejvyšší nově tolerovaná normálová složka v této sadě byla `4.13e-13` světové jednotky. Původní uložený vstup je nezměněný (SHA256 `98de99d0f950511ace6fad35c477d2dcdec67b547fd8d937ab98ae62138be571`).

Malý [lokální záznam ověření](../../evidence/sp-001-2026-09-17-verification.json) doplňuje tento verzovaný report a jeden snímek. Dočasné exporty starších revizí, diagnostické překlady, stažený Node a průběžné logy byly odstraněny; soupis obsahuje [manifest úklidu](../../evidence/sp-001-2026-09-17-cleanup.json). Zdrojové soubory, regresní save, aktivní kampaň a starší cizí evidence zůstaly zachovány.

Rozsah ověření: toto opravuje a vysvětluje dvě konkrétní odchylky. Neběžel nový průchod celé kampaně ani skutečný macOS/Safari; historický matematický profil byl reprodukován diagnosticky. Další práce podle trackeru je příprava SP-002.
