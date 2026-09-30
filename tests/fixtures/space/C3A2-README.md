# C3a2 · skutečné zdravé ekosystémy a jejich potomci

Obě kopie jsou byte-identické s veřejnými produkčními exporty. Žádný exemplář, model, stav, účet ani checkpoint při kopírování nebyl změněn. Třetí kopie zdroje není potřeba: oba soubory již obsahují všechny tři navštívené ekosystémy.

| Fixture | Zdroj v `evidence/sp-012a2/continuation/` | SHA-256 |
| --- | --- | --- |
| `native-c3a2-campaign.save.json` | `active-campaign.save.json` | `5745841b9804cf2e6871e096e8df215cab66fc6ba8ac34ebaa7866fb1006c175` |
| `native-c3a2-cold-stable.save.json` | `cold-stable.save.json` | `c47435be89e18899275cff7f8d2862e06cde6385e94cf57e478ff29f3fbfbec6` |

Původním vstupem byl nezměněný A1 export `evidence/sp-012a1/browser/active-campaign.save.json`, SHA `c9ceea1f68c9c5d0392ee202be04046ac9792b077fbe781b468df56f345d0009`. První A2 browser skončil na závodu testovacího driveru: skutečné narození predátora mezi kontrolami dočasně přerušilo stabilitu pásu. Pokračování importovalo přesný veřejný `evidence/sp-012a2/browser/failure-campaign.save.json`, SHA `efc83ac3625e7653b4e57a8b25c8e7c9f83966b53362e4f44f14bbc550f597a9`. Původní neúspěšný výsledek zůstává neúspěšnou evidencí; úspěšné pokračování není přepsaný první běh.

Oba soubory vznikly na `index-D-ccO9Eg.js` / `index-CzZ2axZP.css` běžným UI a nativními RAF. Pokračování skončilo exit 0, šesti skupinami kontrol a bez browser/runtime chyb. Nepoužilo přepis živého stavu, umělý čas, vstřikované organismy nebo prostředky, import produkčních helperů, trace ani video. Jde o historické pokračování, nikoli souvislou kampaň od nové buňky.

Studený export má populace 46/46/54 a celkem 110 narození. Finální export po návratu a skutečných návštěvách všech tří světů má 49/49/54 obyvatel, narození `[21,21,21,17,17,19]` (celkem 116), nulová úmrtí a žádné zakladatelské tombstony. Všech 36 původních zakladatelů žije na zdrojovém světě. Každý exemplář má jedinečné ID; součet `36 + narození − úmrtí` odpovídá všem živým tělům, náklad je prázdný. Všechny tři světy mají skutečnou stabilní kapacitu 3 a úplné role v každém pásu.

Studený svět obsahuje 24 přivezených potomků narozených na horkém světě a 30 potomků narozených přímo na studeném světě. Všichni nadále odkazují na původní uložené genomy zdrojového světa. Placené kumulativní počty jsou 50 skenů a 102 přesunů, tedy 254 energie; skener zná 49 jedinečných exemplářů. Posledních 128 biologických akcí je skutečně odrolovaná historie, nikoli celý rodokmen. Originální modely a všichni živí rodiče umožňují další přímé kontroly původu.

Studený export je stále nad cizím povrchem v tick 66980, jantar 70.28499999940982. Finální export je doma v tick 67030, jantar 71.5349999994101. Padesát domácích kroků a 1.25 jantaru navíc nastalo po skutečném přistání. Nativní driver samostatně porovnal celý domácí stav do docku; rozdíl těchto dvou souborů se nevydává za změnu během letu. Jednou zaplacená loď za 108 jantarů, B2 a starší regionální dědictví zůstaly zachovány.

Oba původní vnitřní checkpointy jsou stále před koupí lodi: tick 66066, jantar 155.76499999940776, žádná loď a prázdná ekologická expedice. Nejsou to letové checkpointy. `space-ecology-fixtures.test.ts` odděleně připraví úplný letový checkpoint nad studeným světem a ověří veřejnou obnovu. Tato dodatečná část je unit regrese, nikoli nativní doklad vytvoření checkpointu.

Parser historickým exportům nepřidává ekonomiku. Samostatně testovaná výslovná aktivace C3b přidá live i staršímu checkpointu pouze vlastní prázdný účet s nulovými prostředky, bez kolonií, zboží nebo transakcí; všechny dřívější větve zůstanou přesné.

Nativní vzorek studeného světa se 54 skutečnými organismy měl 90 RAF, p95 přibližně 16.8 ms při 1024×640. Čtyři párové návraty na orbitu skončily vždy na původních 212 geometriích, 0 texturách a 21 programech. Rozdílné povrchové pohledy mají různý viditelný obsah, jejich absolutní počty geometrií se neporovnávají jako totožné scény. Důkaz zahrnuje zdravou potravu, reprodukci a stabilitu; vyvolaná úmrtí mají unit/render pokrytí, nikoli tento nativní průchod. Kolonie, celé C, lidský playtest a poslech jsou samostatné závazky.
