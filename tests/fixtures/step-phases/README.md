# Reference číselných profilů simulace

`step-phases.test.ts` kontroluje 18 scénářů × 600 kroků, včetně otisku počátečního stavu a všech mezikroků. Kontroluje úplný stav kromě již dříve vynechaného ID běhu, verze obálky a checkpointu. Počty jídel, RNG, entity, zprávy a navštívené světy zůstávají součástí kontroly.

- Původní reference z macOS/arm64 zůstává přímo v testu beze změny hodnot.
- `linux-x64.json` přidává ověřený profil zdejšího prostředí. Byl získán z **původní monolitické simulace revize `86aa3ab`**, jejíž všech 18 × 601 otisků se na Linuxu shodovalo s rodičovskou revizí `2c6d7cd` i s `4da58b6` před opravou kontaktu SP-001. Použily se stejné scénáře a vstupy jako v testu.
- `contact-slide.json` obsahuje šest úmyslně změněných útesových scénářů pro každý profil po opravě kontaktu SP-001. V obou profilech nastává první změna na stejném kroku a v poloze stejného NPC; detaily jsou v reportu. Ostatních dvanáct scénářů i všechny ekologické souhrny se zachovaly. Tyto překryvy jsou povinné: test přijímá pouze dvě úplné **opravené** sady, nikoli původní chování se zasekáváním. Výchozí hodnoty zůstávají jako doklad původu.

Příčina rozdílu je doložená číselná aproximace matematických funkcí V8. Samostatný diagnostický překlad původních funkcí fdlibm s kontrakcí násobení/sčítání (FMA) přesně obnovil všech 18 původních koncových **i průběhových** otisků. První rozdíl ve scénáři `legacy:481516:0` nastal v kroku 60: `world.creatures[5].heading`, rozdíl `2.220446049250313e-16`. Není to změna pořadí fází ani chyba nového editoru. Vyšetřovací knihovna se nepoužívá v herním kódu ani v testech.

Test přijímá pouze jednu **celou** doloženou sadu otisků. Nekombinuje libovolně výsledky z obou sad, nezaokrouhluje stav, nezvyšuje tolerance a nemaže numerická pole. Neočekávaný profil dál selže. Tato dvojice není příslibem bitové shody všech budoucích enginů a platforem.

## Reprodukce a aktualizace

```sh
node node_modules/vitest/vitest.mjs run tests/step-phases.test.ts --maxWorkers=1 --minWorkers=1
```

Při novém rozdílu nejprve izolovat první odlišný tick/pole a porovnat se zachovanou referenční revizí ve stejném prostředí. Novou sadu nepřidávat pouze výstupem neúspěšného současného testu. Úmyslná změna chování musí mít vlastní ověření a zdůvodnění. Původ a závěr SP-001 zaznamenává [diagnostický report](../../../docs/spore/SP-001-REPORT.md).
