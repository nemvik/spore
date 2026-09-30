# D4 · byte-identické hrané exporty

Zdroj: skutečné UI/native RAF hlavní i samostatné ekologické větve v `scripts/space-discoveries-browser.mjs`. Žádné editované payloady, granty, settery nebo přeskočený čas. Nejde o novou souvislou kampaň od buňky.

| Soubor | Stav | SHA256 |
|---|---|---|
| `native-d4-campaign.save.json` | Hlavní návrat, oba relikty, patronát40, oprava5; účet263, odolnost115. | `c62b896de2e54ff1123f04e13877cf0cf32e9a864bd7781812c71bddb34e1da9` |
| `native-d4-passage.save.json` | Skutečný zaplacený6s průchod5→22, cena14, import před dokončením. | `d0cbeb59debcff26b154696154f68cab3b3b5874e1371805d0499075eeb2fbd8` |
| `native-d4-workshop.save.json` | Osobně předaná paměť; před volbou pomoci, účet308, odolnost99. | `94027584f0d517858b3039f723114393be8bdebe195b8ba8b63e86ad3015640e` |
| `native-d4-ecology.save.json` | Samostatná skutečná ekologická pomoc,6 nových placených skenů, oprava5 a návrat; účet303, odolnost115. | `e67596f4add14be415af88f8f67ad08c7f7a58e41d9cffdf0563cf1eb2be0049` |

Všechny zachovávají starý checkpoint před koupí lodi; aktivace discoveries1/economy7 proběhla zvlášť a nedoplnila dřívější výsledky. Parser/import/rekey/CP a odmítnutí falešných důkazů mají8 regresí v `tests/space-discoveries-fixtures.test.ts`. Hlavní a ekologická kampaň jsou záměrně odlišné větve; alternativní výsledek nepřepisuje hlavní.
