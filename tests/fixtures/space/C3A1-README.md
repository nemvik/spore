# C3a1 · nativní klimatické zásahy a zachované pásy

Tyto tři kopie jsou byte-identické. Žádná hodnota, platba, organismus ani checkpoint nebyly při vytvoření fixture upraveny.

| Fixture | Zdroj v `evidence/sp-012a1/browser/` | SHA-256 |
| --- | --- | --- |
| `native-c3a1-campaign.save.json` | `active-campaign.save.json` | `c9ceea1f68c9c5d0392ee202be04046ac9792b077fbe781b468df56f345d0009` |
| `native-c3a1-climate-on.save.json` | `climate-on.save.json` | `bd6e3e82676fa2fbd6b38323f7f44b9d712044a71e337fe027bcb2d81c9f934a` |
| `native-c3a1-climate-off.save.json` | `climate-off.save.json` | `7b8c359b8c5e7286b95403bafd40bb59e03ae8fc346ae948b84cc552bd33e022` |

Skutečným vstupem byl nezměněný finální C2 export `evidence/sp-011c2/final-browser/active-campaign.save.json`, SHA-256 `3f83884800c58691f87a694750f17a32564c4d82eab6aec01285bf87439ed137`. Není totožný s dřívější C2 fixture z prvního browseru; sdílí neměnnou linii, loď, katalogy a organismy, má jiný skutečný čas průchodu. Historický původ B2/C1/C2 a jeho omezení uvádí sousední `README.md`.

Tyto exporty vytvořil produkční `index-Ho1enUAl.js` se stylem `index-Y-JqHdid.css`, běžným UI a nativními RAF. Pozdější krátký CSS replay není zdrojem těchto souborů. `result.json` původního běhu doložil pět skupin kontrol bez JS/console chyb: výslovnou migraci v1→v2, čtyři klimatické nástroje, ON/OFF veřejný export/import s novou identitou kampaně, vysazení skutečného jedince do pásu 2 a odběr zpět, automatické OFF při odletu a návrat domů. Nebyl použit debug čas, přepis živého stavu, vstřikované prostředky, trace ani video.

Horká řídká planeta má neměnný počátek `(0.8, −0.7)` a po chlazení/zahušťování a krátkém zahřátí při kontrole odletu končí `(0.0695000000000327, −0.022000000000021558)`. Studená hustá planeta začínala `(−0.75, 0.8)` a po opačných zásazích končí `(−0.02250000000002711, 0.02250000000003266)`. Obě mají klimatické T3. Jejich uložené účinné zásahy odpovídají přibližně 100.3 a 100.3333333333 energie; dobíjení lodi je samostatný fyzický tok. Nativní vzorek měřil 0.03 klimatické osy/s a 2 energie/s. Klima nevytvořilo žádný život a `stableFor` zůstává nula ve všech pásmech.

Původní žrout `home-line-481516-1789565791150:star-1:planet:life-11` zůstal jednou fyzickou instancí se stejným modelem, zdravím 100 a výživou 1. Dvě nové platby jsou release serial 6 za 2 energie do pásu 2 a collect serial 7 za 2 energie; náklad se vrací se stejným ID a pásovým přiřazením 2. Zdrojová planeta má 35 obyvatel, obě klimaticky upravené planety při závěrečném exportu nula. Původní loď je stále jednou zaplacená konstrukce za 108 jantarů.

ON a OFF exporty mají beze změny každé domácí pole mimo identitu kampaně, checkpoint a vesmírnou větev: tick 66933, jantar 69.10999999940955. Aktivní export vznikl po docku v tick 66950 s 69.53499999940965 jantarů: 17 domácích kroků a 0.425 jantaru navíc jsou skutečné pokračování po přistání. Nativní driver samostatně porovnával celý zmrazený domov až do návratu; finální soubory nejsou tvrzením, že domácí simulace zůstává zastavená i po přistání.

Všechny tři původní vnitřní generační checkpointy jsou starší **před zaplacením lodi**: tick 66066, jantar 155.76499999940776, žádná loď, prázdná v2 expedice, nulové klima i náklad. Nejsou to letové checkpointy. `tests/space-climate-fixtures.test.ts` samostatně vytvoří plné nové ON/OFF checkpointy a ověří jejich kompletní obnovu přes veřejný runtime; tato část je výslovně unit regrese.

Nativní vzorek 90 RAF měl p95 přibližně 16.7 ms; dvě párové scény uvolnily geometrii `214 → 221 → 214`. Jde o důkaz C3a1 klimatu a metadat pásů. Neprokazuje potravní síť, reprodukci, ekologickou stabilitu, kolonie, dokončení celého C3 ani souvislou kampaň od nové buňky. Lidský playtest a poslech zůstávají samostatným přijetím.
