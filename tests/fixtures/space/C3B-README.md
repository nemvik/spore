# C3b · skutečné kolonie, zboží a placený obchodní okruh

Obě kopie jsou byte-identické s veřejnými exporty úspěšného nativního průchodu v `evidence/sp-013c/browser/`. Při kopírování nebyl změněn účet, tělo, model, čas ani checkpoint.

| Fixture | Zdroj | SHA-256 |
| --- | --- | --- |
| `native-c3b-campaign.save.json` | `active-campaign.save.json` | `01f1c07ae53847a4b4a2d4938d1d22782bb5529ea1696a7e5f05268f242aff5a` |
| `native-c3b-carried-production.save.json` | `carried-production.save.json` | `70e080b7bc57671a4ab06dae6c4919f1c105d5123bc546ce743e29699dab4f87` |

Vstupem byl přesný A2 export `evidence/sp-012a2/continuation/active-campaign.save.json`, SHA `5745841b9804cf2e6871e096e8df215cab66fc6ba8ac34ebaa7866fb1006c175`. Produkční assety byly `index-DeLU6dE0.js` a `index-CALd-fV6.css`. Browser skončil exit 0, pět skupin kontrol, žádná browser/runtime chyba. Běh používal běžné UI a nativní RAF, žádný přepis živého stavu, grant, umělý čas, vložený organismus ani import produkčních helperů. Jde o pokračování historické kampaně, nikoli průchod od nové buňky.

Přepravní export vznikl nad živým zdrojovým světem před první nabízenou transakcí: tři skutečné domácí vklady po 20, zaplacená kolonie na horké planetě za 40, účet 20, výroba 10, naloženo 8 kusů měsíční soli a sklad 2. Ve skutečné lodi je všech osm kusů a žádný organismus. Následný veřejný import/rekey zachoval tento účet a fyzický náklad. Prodej na zdrojovém trhu zaplatil viditelných 10 za kus, celkem 80.

Finální export je doma v tick 67140, domácí jantar `14.284999999410301`. Obě zaplacené kolonie mají úroveň 2: horká vyrobila 32 kusů soli a odvezla 16, studená vyrobila 24 kusů vlákna a odvezla 8; každá drží 16 kusů ve skladu. Tři skutečné prodeje jsou `8×10 + 8×10 + 8×19 = 312`. Vklady 60, stavby 80, rozšíření 40 a jedno dobití za 3 dávají přesný lodní zůstatek `60 + 312 − 80 − 40 − 3 = 249`. Placené dobití obnovilo `15.791666666667709` energie. Placená oprava odolnosti v tomto průchodu neproběhla; její účet zůstává nula. Náklad po posledním prodeji je prázdný.

Native běh také skutečně odebral tři predátory prvního pásu, zaznamenal zastavení výroby při zachování kolonie a skladu, vrátil stejné jedince a dočkal se další výroby. Výroba vzdálené kolonie pokračovala, zatímco její uložená biosféra zůstala ve stasis. Celý domácí stav se měnil až po docku. Tento širší průběh dokládá `evidence/sp-013c/browser/result.json`; samotné dvě fixture nejsou kompletním záznamem všech mezikroků.

Oba skutečné checkpointy jsou stále před koupí lodi: tick 66066, domácí jantar `155.76499999940776`, žádná loď, prázdné světy a nezávisle aktivovaný účet v1 s nulovým zůstatkem i doklady. Další export kolonie by nepřinesl nativní úplný checkpoint, proto nebyla přidána třetí kopie. `space-economy-fixtures.test.ts` samostatně připraví úplný checkpoint přepravované zásoby a provede veřejný prodej/obnovu; druhý připravený checkpoint ověří domácí výrobní čas, plné sklady a stasis. Tyto dva případy jsou jednotkové regrese, nikoli dodatečný nativní doklad checkpointu.

Parser musí zachovat původní ekonomiku v1 a absenci diplomatického registru i cenového aktivačního řezu. Staré prodeje nadále používají původní místní ceny. Testy kontrolují exact parse/export, lokální uložení, import/rekey, obnovu starého i připraveného úplného checkpointu, skutečné účty a odmítnutí padělané ceny, domácího debetu, nakládky, rozšíření a dobití. Původní zaplacená loď, B2 i regionální dědictví zůstávají zachovány.

Reprezentativní studený povrch měl 54 organismů a kolonii úrovně 2. Vzorek 90 RAF při 1024×640 dosáhl p95 přibližně 16.7 ms, max 16.8 ms; čtyři párové návraty na orbitu obnovily 212 geometrií, 0 textur a 21 programů, bez zbylé geometrie v těchto cyklech. Nejde o obecný důkaz všech scén ani lidského playtestu či poslechu. Říše, diplomacie, celý milník D a souvislá nová kampaň jsou další závazky.
