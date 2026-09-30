# Závěrečné A–D · souvislá nová linie a přijetí

Navazuje až na doložené D5. Autorita: aktuální BRIEF/ROADMAP, uživatelem odložené E. Dílčí připravené kampaně B–D ani stovky regresí nenahrazují níže uvedený hraný výsledek. **Dokončená skutečná nová linie:** buňka → útes → vlastní tvor → všech pět kmenových sousedů → celá obchodní civilizace → první koloniální okruh → získané vybavení/mise/dědictví → jádro/odměna → návrat → další výprava a návrat. Samostatné konverzní a vojenské pokračování přesného odehraného prefixu27 také prošlo. Celá finální sada4 637testů/205souborů a build/typecheck jsou zelené. [Podrobné výsledky](../../spore/FINAL-CAMPAIGN-REPORT.md), [průřezový audit](../../spore/SP-005-007-017-AD-REPORT.md), [čekající lidské scénáře](../../spore/A-D-HUMAN-ACCEPTANCE.md).

## Cílený audit zbývajících kritérií

- SP-005: přenos tvorů, budov, vozidel a lodí má existující implementace a reporty. Společné kritérium s dobrodružstvími zůstává otevřené kvůli odloženému E; nepřepisovat je. Ověřit současné veřejné import/export/regrese, nedodávat další formát.
- SP-007: zaznamenaná strava, sociální/bojová cesta, kmen a městská expanze již vedou k uložené vesmírné filozofii. B2 má obchodní i celé alternativní L důkazy; D1 má konkrétní vztah/cenu. Závěrečný průchod musí doložit nepřerušenou posloupnost skutečné nové linie, UI původu a numerického účinku. Připravit souhrnný report se současnými odkazy, ne vykazovat historické další kroky jako mezery.
- SP-012/SP-014: klimatické/živé/koloniální kruhy a stavové události existují. Ve finální kampani sledovat dosažitelnost, srozumitelnost, čas a počet skutečných přerušení; automatické incidenty nepřidávat jen kvůli počtu.
- SP-017/A–D: finální obrazy a reálné scény ve všech etapách, výrazný vlastní tvor/vozidlo/loď, animace/reakce, kamery a kompaktní ovládání. Opravovat konkrétní pozorované problémy. Lidské porozumění a poslech zůstávají zvlášť evidované; při čekání pokračovat v nezávislé technické práci.

## Hraný důkaz a závislosti

1. Nový izolovaný browser profil, produkční build připnutý hashem, skutečné tlačítko Nová linie; žádný import do startu, state setter, debug čas nebo přeskakování podmínek. Připravené planety/DNA/zdroje nejsou přípustné. Čtení render_game_to_text slouží jen pozorování a plánování skutečného ovládání.
2. Buňka: skutečná potrava/růst, konstrukce a postup. Pobřežní a tvorové etapy: skutečné cíle, volba těla, sociální/bojový výsledek, další generace a jejich důsledky. Aktivní kmen: vlastní zdroje, placená výstroj, vyřešení všech pěti sousedů. Civilizace: vlastní hospodářství/jednotky, skutečné městské sjednocení, návrat a běžná brána do5.
3. Vesmír: vlastní zaplacený model lodi, cizí soustava, získání života/terraformace/kolonie/produkce/prodej. Kontakty, vhodné zakázky a vybavení získané hraním. Relikty a podpora mladší společnosti nebo silová cesta k jádru. Skutečné setkání, místní odměna, export/import, fyzický návrat a další výprava v témže stavu.
4. Jeden aktivní export předávat mezi ovládacími úseky beze změny payloadu. Každý navazující úsek musí ověřit hash předchozího veřejného exportu a doložit kontinuitu identity/rekey, těla, historie, účtů a checkpointu. Smrt/záchrana jen běžnými pravidly, nikdy přepsání nebo skok fixture. Alternativní již doložené cesty ověřit nezávisle při relevantní regresi, ne zaměnit s hlavní novou linií.
5. Kompaktní milestone/failure PNG, malé výsledky, zdrojové/dokončené exporty. Trace vypnutý. Měřit reprezentativní native RAF a návraty prostředků bez souběžné CPU/GPU zátěže testů. Po každém úseku úklid vlastních mezivýstupů s manifestem; zachovat aktivní kampaň a potřebné regrese.

## Uzavření

Aktuální build/typecheck, relevantní staré savey/import/export/checkpointy/přechody a celá sada podle změn. Normální review skutečného výsledného diffu; nezávislé review pouze pokud bylo skutečně dostupné/provedené. Tracker musí spojit každé kritérium s implementací a výsledkem a jasně oddělit čekající lidské přijetí. Žádný commit/push/deploy. Goal není hotový vypršením běhu ani dokončením pouhého D5.

## Zjištěná regrese vypnutí efektů

Kontrola SP-017 odhalila, že `Soundscape.play` při `effects: 0` stále vytváří oscilátory a plánuje nenulový konec obálky. Nejde o výsledek lidského poslechu. Úspěch opravy: při mute/master0/effects0 nevznikne žádná nota; při zapnutém zvuku zůstanou původní tóny a hlasitost, po dohrání se oba uzly odpojí. Nejprve regresí reprodukovat stávající chování, potom minimální oprava stejného modulu, kontrola nativního Web Audio v odděleném prohlížeči a finální build/testy. Herní pravidla ani save formát se nemění.
