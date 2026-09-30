# C1 · vlastní zaplacená loď, nativní exporty R2

Tyto dvě kopie jsou byte-identické s uvedenými browser exporty. Žádná hodnota kampaně, platba, konstrukce ani checkpoint nebyla při vytvoření fixture změněna.

| Fixture | Původ | SHA-256 |
| --- | --- | --- |
| `native-c1-in-flight.save.json` | `evidence/sp-011c1/final-browser-r2/in-flight.save.json` | `e6046ab86cf64aeee2518c9fd9654d13f80071c560484fdd4887dbc8c5160861` |
| `native-c1-campaign.save.json` | `evidence/sp-011c1/lifecycle-r2/active-campaign.save.json` | `a1d2bfb8fc821621447f05d368252d8b62d79f7fdf5f9893580d4216806e7c34` |

Vstupem R2 byl nezměněný `tests/fixtures/civilization/native-civic-campaign.save.json`, SHA-256 `03de64ca7924a541205f8d337b76989781573b13b7272b46f17f6e9a72f8e53f`: skutečně dokončená historická obchodní větev B2. Její starší původ a meze jsou zaznamenané v sousedním `civilization/README.md`. Jde o nativní pokračování historické kampaně, nikoli souvislý průchod od nové buňky.

Produkční asset obou běhů: `index-4K2yx7pw.js`. Přes běžnou knihovnu/editor vznikla **Jantarová vážka** se sedmi díly, upraveným obalem, bočními ploutvemi a přidanou horní ploutví. Skutečná platba byla 108 jantarů: `159.88499999940908 → 51.884999999409075`, tick 66244. Zaplacená revize 1 zůstala oddělená od pozdější knihovní revize 2. Nativní řízení dosáhlo povrchu, orbity a domácí soustavy; ověřilo pauzu, menu, ukládání, import a návrat. Export za letu je v domácí soustavě se třemi záznamy letu. Vnitřní generační checkpoint je stále starší stage5 stav před zakoupením lodi (tick66066, jantar155.76499999940776); není to letový checkpoint.

První R2 průchod po funkční části skončil neúspěšnou přísnou globální kontrolou geometrie. Jeho domácí export `final-browser-r2/failure-campaign.save.json` měl SHA-256 `4c8971adce1a5979486e494bb14285de9cd6ab6ddf62e84415aa5809f4bb0b36` a byl beze změny veřejně importován do navazujícího lifecycle běhu. Z něj pochází aktivní fixture: doma, celkem30 řádek letu, s původní jednou platbou. R2 obsahuje opravu uvolňování `THREE.Points`; související cílená sada měla134 zelených testů.

**Omezení ověření:** funkční nativní průchody neměly JS/console chyby, ale celý proces R2 ani všech šest lifecycle cyklů neoznačujeme za úspěšné. Absolutní kontrola nulového globálního růstu geometrie selhala; zahřívání a pozdní nahrávání geometrie ovlivňovaly počítadlo. Ve čtyřech posledních párových cyklech3–6 bylo přesně `528 → 555 → 528`, tedy0 zachovaných letových geometrií. Veřejná počítadla neurčují vlastníka každé geometrie. Podrobnosti a původní neúspěšné kontroly zůstávají v `final-browser-r2/review.json` a `lifecycle-r2/result.json`. Tento výsledek není důkaz mezihvězdné C2, lidského playtestu ani poslechu.

`tests/space-fixtures.test.ts` hlídá původní bajty, skutečnou platbu/model, B2 a regionální historii, parse/export, lokální save/load, rekey a checkpoint. Jeho rychlé pokračování přes veřejné runtime metody je výslovně **unit regrese**, nikoli další nativní hraní. Samostatně: `pnpm exec vitest run tests/space-fixtures.test.ts --pool=threads --maxWorkers=1`.

## C2 · cizí soustavy a fyzicky přenesený život

Následující kopie pocházejí z prvního dokončeného C2 průchodu na assetu `index-BEGaM-dx.js` (styl `index-CPId81zN.css`). Jsou byte-identické; pozdější finální browser na jiném assetu není jejich zdrojem.

| Fixture | Původ | SHA-256 |
| --- | --- | --- |
| `native-c2-carried-life.save.json` | `evidence/sp-011c2/browser/carried-life.save.json` | `05ff632e1e378ce209cc9308ee4152ecca09a63f6fd114290b0d3c823f92c9b2` |
| `native-c2-campaign.save.json` | `evidence/sp-011c2/browser/active-campaign.save.json` | `1392669d44ae620b5b89603074aec461ee551745a4f911306733396612bba14c` |

Vstupem byla nezměněná `native-c1-campaign.save.json`, SHA-256 `a1d2bfb8fc821621447f05d368252d8b62d79f7fdf5f9893580d4216806e7c34`, tedy výše popsané historické pokračování B2/C1. `scripts/space-expedition-browser.mjs` použil běžné UI a nativní RAF: vzlet, mapu, placené šestisekundové skoky, nízký let, sken a odběr, veřejný export/import, vysazení na druhé planetě, opětovný odběr a návrat. Žádný live state zápis, připravené prostředky ani testovací hodiny. Detaily jsou v `evidence/sp-011c2/browser/result.json` a `review.json`.

Přenesen je jediný žrout `home-line-481516-1789565791150:star-1:planet:life-11`, původem z Jantarového háje. Zdroj má po odběru 35 obyvatel. Žhavá slza začínala bez života, po vysazení měla jednoho jedince a po jeho novém odběru znovu nulu; tentýž jedinec je v domácím nákladu. Zachoval ID, původ, genom, heading, zdraví100 a výživu1. Původní položka katalogu žrouta má SHA-256 `e965fce5a2976203ed2fc40743379d79d88b8d4b7286625082287f827d41f8b8`. Pět nástrojových plateb má pořadí sken/odběr/vysazení/sken/odběr a součet8 energie; mezilehlá fixture obsahuje první dvě za3 energie. Žádná druhá loď ani nová domácí platba nevznikla, zůstává původní konstrukce za108 jantarů.

Veřejný import změnil identitu kampaně `line-481516-1790417318855 → line-481516-1790417346056`, stabilní adresy planet a jedince zůstaly stejné. Obě vnitřní generační CP jsou skutečný starší stav před zaplacením lodi, tick66066, loďnull a prázdná expedice. Nesmí být označované za letové checkpointy. Fixture test samostatně vytvoří nový plný CP za letu, obnoví ho a přes veřejný runtime se vrátí s jedincem do přesně zmrazeného domova; jde o unit pokračování.

Aktivní export je po přistání tick66907 a jantar68.4599999994094. Domácí simulace po docku legitimně přidala35 ticků a0.875 jantaru oproti mezilehlému exportu; oba soubory proto nejsou byte-identickou domácí scénou. Při samotném letu původní browser kontroloval každé domácí pole, nikoli jen účty. Civilizační dědictví, B2, města a jejich doklady, původní koupě lodi a katalog zdroje zůstaly zachované.

První C2 browser dokončil všech pět skupin kontrol bez JS/console chyb; čtyři párové cykly povrch/orbita uvolnily geometrii `213 → 983 → 213`. Samostatný vzorek90 RAF nad živým povrchem měl p95 přibližně16.7 ms. Tyto výsledky nenahrazují lidský playtest, poslech, nový souvislý průchod od buňky ani C3 terraformaci/kolonie. Unit test všech32 soustav s396 proskenovanými jedinci, nákladem4 a plnými ledgery má export1,232,880 UTF-8 bajtů včetně CP575,157 bajtů; používá výslovně připravené pozice a není nativním důkazem této dlouhé cesty ani mezí pro libovolně velké vlastní genomy.
