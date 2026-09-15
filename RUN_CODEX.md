# Jak spustit benchmark LUMAVORA v Codexu

Připraveno 13. září 2026. Toto je návod pro uživatele, ne další povinný workflow dokument pro agenta. Vlastní zadání je `GAME_BRIEF.md`.

## Doporučená konfigurace

Pro hlavní ambiciózní běh bych zvolil Astra + Ultra, pokud tvůj aktuální klient tuto kombinaci skutečně nabízí. Ultra využívá automatickou delegaci na subagenty, zatímco Extra High / xhigh označuje úroveň reasoning. Nejde o záruku, že Ultra v této konkrétní hře dosáhne vyšší kvality.

Pokud u Astry vidíš pouze xhigh, použij Astra xhigh. Nepřepínej na starší model jen kvůli názvu Ultra a nevkládej do konfigurace neověřené hodnoty. Dostupnost se může lišit klientem, účtem a rolloutem.

Použij přímo Codex v samostatném projektu. Pro tento benchmark není potřeba Superset, n8n, Linear ani další orchestrátor. Běžný sandbox ponech zapnutý a dovol práci v projektovém adresáři. Nespouštěj to přes `--yolo`. Připrav prohlížeč nebo dovol instalaci lokálních browser testovacích komponent v mezích oprávnění.

## 1. Připrav samostatný adresář

Rozbal sem soubory z balíčku. Pokud vytváříš novou složku ručně:

```bash
mkdir lumavora
cd lumavora
git init
```

Do této složky zkopíruj především `GAME_BRIEF.md`. Pro opakovatelné srovnání sem přidej také `BENCHMARK_SCORECARD.md` a před startem je commitni jako společný výchozí stav:

```bash
git add GAME_BRIEF.md BENCHMARK_SCORECARD.md
git commit -m "Freeze evolution game benchmark brief"
```

## 2. Spusť Codex

V terminálu, nikoli jako zprávu agentovi:

```bash
codex --version
codex features enable goals
codex -m gpt-6-astra
```

Použij svou současnou autentizaci přes ChatGPT subscription. Při přihlášení přes API by šlo o jiné účtování; pro tento benchmark žádný API klíč nepotřebuješ.

Když příkaz pro goals tvoje verze nezná, nejprve aktualizuj Codex běžným způsobem, kterým jej máš nainstalovaný, a zkontroluj dostupné příkazy. Nevymýšlej náhradní konfigurační hodnoty. Dokumentovanou alternativou je `goals = true` v existující sekci `[features]` souboru `config.toml`; nevytvářej duplicitní sekci.

V Codexu použij `/model` a vyber Astra s požadovaným dostupným režimem. Pomocí `/status` zkontroluj model a aktivní konfiguraci. Nastavení reasoning nenechávej záviset jen na větě „přemýšlej na maximum“ uvnitř herního promptu.

V desktopové aplikaci můžeš použít stejné zadání a model picker v samostatném projektu. Názvy a dostupnost slash příkazů ověř přímo v daném klientovi. CLI postup je zde hlavní reprodukovatelná varianta.

## 3. Nastav goal

Do vstupu Codexu vlož následující zprávu. Dlouhý brief nevkládej celý za `/goal`; cíl odkazuje na soubor.

```text
/goal V tomto repozitáři vytvoř a dokonči originální 3D webovou evoluční hru LUMAVORA podle GAME_BRIEF.md. Implementuj všechny tři propojené etapy, skutečný editor organismu, funkční ekologii a symbiózu. Pokračuj přes implementaci, hraní v prohlížeči, opravy a finální doladění až ke splnění ověřitelných akceptačních kritérií; nekonči u MVP. Začni pracovat hned. Výsledek dolož testy, screenshoty, záznamem hraní nebo trace a BENCHMARK_REPORT.md. Používej pouze povolené prostředky z briefu. Limit znamená checkpoint, ne splněný cíl. Žádné placené API, push ani deploy.
```

Pokud klient cíl pouze nastaví a čeká, pošli obyčejnou zprávu:

```text
Přečti GAME_BRIEF.md a začni jej realizovat. Nezůstávej v režimu pouze plánování. Máš povolení dělat implementační a tvůrčí rozhodnutí v mezích briefu, spouštět lokální testy i hru a opravovat problémy bez potvrzování každého kroku. Pokračuj podle aktivního goal až k doloženému výsledku nebo konkrétnímu blokéru.
```

Pokud už pracuje, další startovací zpráva není potřeba. Samostatný dlouhý `/plan` předem bych zde nepoužíval; krátké plánování je součástí zadání, ne důvod čekat na další schválení.

## 4. Kontrola a pokračování

```text
/goal
/status
```

Tím zkontroluješ stav cíle a konfiguraci/spotřebu dostupnou v daném klientovi. Cíl lze ovládat pomocí `/goal pause`, `/goal resume` a `/goal clear`. Goal nezaručuje nekonečný běh, pokračování po každém druhu přerušení ani automatické vyčerpání celého předplatného. Může skončit splněním, blokérem, přerušením nebo limitem.

Při pokračování obnov původní thread, pokud je dostupný, a ověř stav goal. Po obnovení dostupného rozpočtu můžeš pokračovat zprávou:

```text
Pokračuj podle GAME_BRIEF.md a posledního PROGRESS.md. Nejprve ověř aktuální spustitelnost a skutečné důkazy, pak řeš nesplněné body. Nepřepisuj hotové části bez konkrétního důvodu. Nedokončené položky nezamlčuj ani neměň zadání.
```

## 5. Jak z toho udělat srovnání Ultra versus xhigh

Použij dvě oddělené pracovní kopie stejného výchozího commitu, nový thread pro každý běh a stejné zadání. Nepředávej druhému běhu opravy, plán ani screenshoty prvního běhu. Udrž shodné prostředí, nástroje, dostupnost assetových služeb, oprávnění a stav paměti/skills. Do pracovního projektu netahej konfiguraci z firemních repozitářů.

Předem si zvol, zda srovnáváš výsledek při stejném přiděleném čase/rozpočtu, nebo nejlepší dosažitelný výsledek až do splnění. Zaznamenej skutečně dostupné metriky; nedopočítávej náklady nebo tokeny z pouhých dojmů. Nepovažuj běh zahájený s téměř vyčerpaným limitem za rovnocenný čerstvému běhu.

Ultra může delegovat, takže takové srovnání hodnotí konfiguraci celého systému, nikoli jen izolovanou inteligenci jednoho modelu. Pro čistý test reasoning bys musel samostatně kontrolovat i delegaci a další nastavení.

Výsledky ohodnoť pomocí `BENCHMARK_SCORECARD.md`. Jako rozhodující ber hru a její důkazy, ne sebevědomí závěrečné zprávy.
