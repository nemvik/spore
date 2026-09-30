# Lidské přijetí A–D

Stav 30. září 2026: **čeká na lidské provedení**. Nativní automatizované hraní, kontrola obrázků a měření RAF nejsou lidským playtestem ani poslechem. E / kapitán / dobrodružství jsou mimo aktuální schválený cíl. Technické výsledky a aktuální export uvádí [závěrečný report](FINAL-CAMPAIGN-REPORT.md).

Spuštění: `pnpm build`, potom `pnpm preview --port 5220`. Otevřít `http://127.0.0.1:5220` v běžném prohlížeči se zvukem. Pro zkoušky uložených etap používat nový profil nebo importovanou kopii; původní soubor aktivní kampaně zachovat. Nastavení zvuku začít přibližně uprostřed, ověřit i vypnutí zvuku a klidný obraz.

Technické opravy28. září dokládá [review report](FINAL-REVIEW-REPORT.md). Při poslechu také vyvolat efekt, ihned pozastavit, nastavit „Zvuk interakcí“ na0 a pokračovat: předchozí efekt nesmí doznívat. V pauze ověřit dostupnost všech sedmi tlačítek včetně knihovny lodí při1024×640.

| Scénář | Konkrétní provedení | Očekávaný výsledek | Přijetí |
| --- | --- | --- | --- |
| První kontakt, hypotéza 3–5 min | Nová linie; najít potravu, vyrůst po 2/4/7 soustech, prozkoumat schránku, použít orgán a vybrat jeho dědictví v editoru, potom přejít G. Měřit od nové linie až do útesu včetně čtení a editoru, bez rad testujícího. | Cíl i použitelné klávesy jsou pochopitelné. Vlastní tělo, potrava a překážka jsou rozeznatelné; zvuk odběru a objevu není zaměnitelný ani rušivý. | Čeká |
| Útes a proud, 5–10 min | Import [organism/04-cell-complete.save.json](../../evidence/final-campaign/organism/04-cell-complete.save.json), potom přejít G; při nošení porostu sledovat odstup od konzumentů. V severním průduchu zkusit boční sestup, odběr a výstup. | Rada vysvětluje strach z ostnů i proud. Hloubka, kyslík a směr pohybu jsou čitelné; varování je slyšet bez nepřetržitého překrývání. | Čeká |
| Vlastní tvor, 5–10 min | Import [organism/13-creature-ready.save.json](../../evidence/final-campaign/organism/13-creature-ready.save.json); prohlédnout vlastní tělo v terénu i editoru, vyzkoušet společenské a bojové ovládání při 1024×640. | Tělo zůstává viditelné, čtyři akce jsou rozlišitelné. Pohyb končetin, projev a zásah odpovídají stisku; kamera nevyžaduje boj s panelem. | Čeká |
| Kmen, 5–10 min | Import [organism/14-tribe-arrival.save.json](../../evidence/final-campaign/organism/14-tribe-arrival.save.json); vybrat tři členy, poslat je sbírat, postavit dílnu a rozlišit nástroje. | Výběr, potvrzení příkazu, stavba a návrat nákladu mají srozumitelnou odezvu. Zvuky se při třech jednotkách nehromadí do nepříjemné smyčky. | Čeká |
| Civilizace, 5–10 min | Import [civilization/24-domestic-complete.save.json](../../evidence/final-campaign/civilization/24-domestic-complete.save.json); přečíst zbývající podmínky sjednocení. Import [civilization/26-own-city-functioning.save.json](../../evidence/final-campaign/civilization/26-own-city-functioning.save.json); najít skutečný hospodářský výsledek a navštívit cizí město. | Je zřejmé, proč samotné regiony neukončily etapu. Vlastní tvor, tank, letoun, budovy a vlastníci jsou rozlišitelní. Hráč najde příjmy, náklady, obchod a návrat. | Čeká |
| Loď a živý svět, 5–10 min | Importovat [space/32-first-launch.save.json](../../evidence/final-campaign/space/32-first-launch.save.json) nebo [space/34-first-contact.save.json](../../evidence/final-campaign/space/34-first-contact.save.json). Vlastní lodí změnit měřítko, vybrat cíl na mapě, snížit výšku a získat exemplář. V přehledu Dědictví linie vlastními slovy vysvětlit, proč vznikl Tkadlec cest a kdy se projeví bonus+2 za výrobek. | Hráč pozná rozdíl povrch/orbita/soustava a důvod neaktivní akce; u filozofie najde skutečný původ ve stravě, tvorovi, kmeni a civilizaci i podmínku obchodní dohody. Vybraný organismus i loď zůstávají viditelné; motory a nástroje jsou slyšitelně odlišné. | Čeká |
| Kolonie a jádro, 10–15 min | Import [space/36-foreign-stable-band-1.save.json](../../evidence/final-campaign/space/36-foreign-stable-band-1.save.json) pro živý pás, [space/37-colony-production.save.json](../../evidence/final-campaign/space/37-colony-production.save.json) pro náklad, [space/45-galactic-core.save.json](../../evidence/final-campaign/space/45-galactic-core.save.json) pro odměnu a [space/49-first-expedition-home.save.json](../../evidence/final-campaign/space/49-first-expedition-home.save.json) pro další odlet. | Je pochopitelné, co odemyká pás a kolonii, odkud pochází zboží a jaká platba proběhla. Odměna má viditelný trvalý účinek a hra po cíli pokračuje. | Čeká; nová kampaň technicky dokončená |

Cesty v tabulce jsou vůči `evidence/final-campaign/`. Pro každý provedený scénář zaznamenat člověka, datum, zařízení/rozlišení, nastavení zvuku, výsledek a konkrétní místo nejasnosti. Při problému stačí jeden snímek a krátká reprodukce. Nepřejmenovávat „čeká“ na „přijato“ podle automatických logů.

## Nové krátké scénáře dědictví · čekají na člověka

Technické výsledky nejsou lidské přijetí. [Report](EVOLUTION-OPENING-REPORT.md), [přesné checkpointy](../../tests/fixtures/evolution/README.md).

| Scénář | Kroky | Očekávání / co zapsat |
| --- | --- | --- |
| Nová buňka | Nová linie, bez návodu od testujícího najít jídlo, objevit část, upravit tělo, vybrat dědictví, vstoupit do útesu. | Změřit skutečný čas včetně čtení. Hypotéza 3–5 minut, žádné přijetí z botových 24–27 s. Zapsat nejasnosti a chuť pokračovat. |
| Zvídavost | Import `antenna-reef.save.json`, X, J. | Sonar a rozšířený radar fungují i bez tykadel v aktuálním těle; hráč vysvětlí proč a pozná cenu/obnovu. |
| Ostražitost | Import `spines-reef.save.json`, přiblížit se k lovci a X. Pro okamžitý výsledek `spines-used.save.json`. | Lovec ustoupí bez ztráty zdraví; skutečný cooldown a jeho save jsou čitelné. Porovnat výhodu s průzkumem, žádná univerzální větev. |
| Tvor → kmen | `creature-social-tribe-start.save.json`, vybrat vlastní členy a navštívit prvního souseda. | Pochopit původ silnější diplomacie z odehraných hnízd; ověřit krátké první oznámení. |
| Méně obchodního opakování | `earned-civilization-budget.save.json`, N → cizí město → sjednat spojení → dopravce → společné zásilky. Zkusit i jednotlivou porci, přerušení a návrat. | Cena odpovídá počtu porcí, 60 je záloha, nikoli sleva navíc. Rozlišit náklad a dokončené dodávky. `batch-city-purchased.save.json` už obsahuje skutečný doklad koupě. |
| Civilizace → vesmír | Tři `native-*-campaign.save.json` v `civilization/`; J, rozbalit podrobné dějiny a porovnat skutečné městské metody. | Hráč vysvětlí příspěvek vojenské/obchodní/konverzní cesty k filozofii i kombinaci s předchozí historií. Tělo není důkaz minulých voleb. |

U každého řádku zaznamenat člověka, datum, zařízení, nastavení zvuku, čas a výsledek. Nové řádky dosud **neprovedeny člověkem**; poslech zůstává otevřený.
