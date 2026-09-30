# Skutečné konverzní a vojenské alternativy L

Fixture jsou byte-identické exporty dokončené nativní konverzní větve `scripts/civilization-paths-browser.mjs`:

| Fixture | Původ | SHA-256 |
| --- | --- | --- |
| `native-conversion-campaign.save.json` | `evidence/sp-009l/conversion/active-campaign.save.json` | `f5cfd8b95ba9abea969bfa822e14acd524c7bba8648f97086807653d25f6b1c7` |
| `native-conversion-before-space.save.json` | `evidence/sp-009l/conversion/before-space-checkpoint.save.json` | `e1edfa12e42284ec4518add042eae3bff04bb29c510555847a727778f388454d` |

Výchozí export byl nezměněný `evidence/sp-009j/browser/paid-carriers.save.json`, SHA-256 `3f43b7406d6cc68ae33659ee7aa813aad27c64b0624d2f24ed6fc3677fc9e2ee`. Tato odehraná předobchodní větev už měla vlastní zaplacená vozidla a čtyři cizí města. Navazovala na historickou D kampaň; nejde o novou souvislou linii od buňky.

Hráč skutečně došel k obřadům a dokončil čtyři převody měst pouze konverzí. Doklady účtují 80, 80, 100 a 100 jantarů; poslední dvě konverze se týkají posledních měst obou solventních států. Každý placený obřad i závěrečné potvrzení má samostatný záznam po 20. Původní obrana zůstala zachována; nejsou přítomny vojenské převody, výpady, obchodní smlouvy ani kupní příjmy. Všech pět skutečných měst patří linii.

`before-space` je export doma před běžnou klávesou G, stage 4, po všech konverzích. Jeho vnitřní generační checkpoint je starší strojový začátek s 168,66 jantaru, bez měst a bez dokončení B2. Aktivní export je stage 5 po průchodu skutečnou branou: completion zahrnuje všech pět měst a snímek fungujícího převzatého města na 1542. Jeho vnitřní checkpoint je bezprostřední vstup do stage 5; dokončení B2 už zachovává, později vysazený život ještě neobsahuje.

Čistá konverzní cesta dává `power=1`, `consumption=1`, `recovery=1.2`. Hráč skutečně získal a vysadil `culture:6` v prvním biomu po dosažení T1. Kořen 4 odkazuje na existující zdroj 206; zaznamenaný nativní vzorek ověřil vitalitu 75→75,48 za 1,6 sekundy podle `.25 × 1.2 × čas`. Finální export zachovává jeho následnou vitalitu 75,54. Vzorek 90 RAF je krátká diagnostika skutečné scény, nikoli izolované měření výkonu.

Starší uzavřená regionální historie `lineageHistory.stages[4]` zůstává byte-ekvivalentní předobchodnímu základu i zachované D fixture: SHA-256 jejího `JSON.stringify` je `dde95742870a07a2b3ac4a8f6c1746775824c1d5425b082b4e8b85cba28a37b3`. Nové konverzní skutky jsou evidovány odděleně v civilizační historii B2.

Browser průchod používal běžné UI a nativní čas, bez živých zápisů, připravených peněz nebo přeskočení postupu. Import/export a následné uložení/reload/load zachovaly stav. Lidská srozumitelnost a poslech zůstávají samostatným čekajícím přijetím.

Regrese: `pnpm exec vitest run tests/civilization-paths-fixtures.test.ts --maxWorkers=1`. Testy kontrolují přesné bajty, účty, dědictví, checkpointy a importní rekey; následný krok `stepPlanet` nad skutečným kořenem je jednotková kontrola, nikoli další odehraný browser průchod.

## Dokončená vojenská alternativa

| Fixture | Původ | SHA-256 |
| --- | --- | --- |
| `native-military-campaign.save.json` | `evidence/sp-009l/military-resume/active-campaign.save.json` | `13b5b1cc96161b0412b4a3d97e070282952fff4c389e2ebceb7cec69d0c9df5d` |
| `native-military-before-space.save.json` | `evidence/sp-009l/military-resume/before-space-checkpoint.save.json` | `56aa2ea057f6baba58f9bb042f8f7e3e11f06863f98b479e50a63c4979e5a11c` |

Obě kopie jsou byte-identické finální exporty navázaného nativního běhu. Původní běh `military` začal stejným výše uvedeným nezměněným `paid-carriers.save.json`, skutečně vyrobil nový tank **Strážce sjednocení** za 56 jantarů a dobyl dvě města Svazu. Při čekání driveru na fyzický návrat poškozeného tanku z 1470 vypršel timeout. Driver zachoval celý skutečný stav běžným exportem `evidence/sp-009l/military/failure-campaign.save.json`, SHA-256 `aa46280dcab5ff4dd740b20547088871fe7c8e5a7789da4aababf13aa49e8bb8`.

Běh `military-resume` importoval právě tento export, zachoval tank 16 s poškozením, předchozí dvě okupace i účetnictví a dokončil zbývající města Ligy. Nezačínal znovu a nedostal připravené peníze ani postup. Původní hlášení `evidence/sp-009l/military/failure.json` má SHA-256 `25ca8dbb2658c42b44133e19febf952b51e167d79b20eb6908cb82b0261fcce0`; navazující `evidence/sp-009l/military-resume/result.json` má SHA-256 `b4d0ee4ab71ebb931cbe01c8ead25af89905d5b176560a0a82fcb9ba738957c7`. Přerušení a návaznost jsou součástí původu, nikoli tvrzení o nové kampani od buňky.

Finální ledger obsahuje čtyři vojenská převzetí tankem 16, turn 75/104/97/112 v pořadí měst 1542/1615/1470/1543. Původní vojenský formát má `method` nepřítomné; B2 z něj odvozuje `military`. Neobsahuje konverzní obřady ani obchodní převody. Stráže a opevnění všech čtyř měst byly poraženy. Dva skutečně zaplacené výpady systému F (`state-0:tx-76`, `state-1:tx-105`) a jedna nově financovaná armáda K2 (`state-0:army-1`, turn 88, cena 40 z pokladny 49 při rezervě 8) skončily jako `destroyed` se zdravím 0. Všechny závazky jsou uzavřené a tank je doma se zdravím 88.

Skutečné domácí opravy tanku 16 zachycují browser platební záznamy:

| Běh | Turn | Zdraví před→po | Cena |
| --- | --- | --- | --- |
| `military` | 77 | 41,8→88 | 10 |
| `military` | 78 | 57,2→88 | 10 |
| `military` | 91 | 57,2→88 | 10 |
| `military-resume` | 101 | 41,8→88 | 10 |
| `military-resume` | 105 | 41,8→88 | 10 |
| `military-resume` | 108 | 41,8→88 | 10 |
| `military-resume` | 114 | 41,8→88 | 10 |

Výroba 56 a sedm oprav po 10 byly ověřeny proti skutečnému domácímu zůstatku s odečtením příjmu během kliknutí. Existující formát strojů nemá historický ledger těchto hráčských plateb; jejich důkazem jsou uvedené browser reporty. Fixture zachovává jedinou novou konstrukci 15, jednotku 16, úplné další účetnictví a finální stav. Jednotkový test nepředstírá, že ze samotného save dokáže zrekonstruovat všechny starší nákupy a opravy.

Běžná brána G při tick 71792 / turn 114 zaznamenala B2 dokončení všech pěti měst a fungující správní město 1542. Dědictví je `power=1.2`, `consumption=1`, `recovery=1`. Nativní kontrola na původní vrtné jednotce 8 ověřila atmosféru −0,8504344511523458→−0,7296801353352611 během 100 skutečných kroků (1,6667 sekundy), včetně výkonu ×1,2 a klimatického útlumu. Také tento RAF vzorek je diagnostický, nikoli izolovaný benchmark.

Vojenské jednotkové regrese ověřují stejnou konkrétní vrtnou jednotku přes veřejné zapnutí nástroje a `stepPlanet`, zachování starší regionální historie a obě generace checkpointů. `before-space` stále obsahuje původní checkpoint před městy a novým tankem; finální checkpoint už drží celou vojenskou civilizaci na začátku stage 5. Obnovy a rekey musí vracet celý odpovídající stav bez míchání pozdějších peněz, armád nebo práce na planetě.
