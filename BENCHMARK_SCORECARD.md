# LUMAVORA — hodnoticí list benchmarku

Tento list vyplňuje uživatel nebo nezávislý hodnotitel až nad výslednou hrou. Implementující agent může dodat odkazy na důkazy, ale jeho vlastní skóre není nezávislé hodnocení. Kritéria před během neměň.

## Identifikace běhu

| Údaj | Hodnota |
|---|---|
| Označení běhu | |
| Model a reasoning/režim | |
| Klient a verze | |
| Povolená a skutečně použitá delegace | |
| Modely subagentů, pokud jsou známé | |
| Výchozí commit / hash briefu | |
| Výsledný commit | |
| OS, prohlížeč, GPU nebo softwarový renderer | |
| Nástroje, skills a nastavení paměti | |
| Povolené assetové nástroje | |
| Přidělený limit / pravidlo zastavení | |
| Skutečná doba běhu, pokud měřitelná | |
| Skutečná spotřeba, pokud dostupná; jinak N/A | |
| Počet a obsah zásahů člověka | |
| Stav: dokončeno / částečné / blokováno / limit | |

## Nejprve ověřitelné minimum

- [ ] Instalace a produkční build jsou reprodukovatelné z předaných souborů.
- [ ] Hru lze skutečně ovládat, nejde o video, menu nebo pasivní simulaci.
- [ ] Všechny tři etapy jsou přítomné a existuje důkaz legitimního průchodu mezi nimi.
- [ ] Editor mění viditelné tělo i odpovídající funkci ve hře.
- [ ] Uložení, refresh a načtení zachovají postup a organismus.
- [ ] Ekologický vliv a symbióza jsou funkční, ne jen deklarované v UI.
- [ ] Není známá chyba blokující běžné hraní nebo poškozující save.
- [ ] Testy, screenshoty a záznam/trace skutečně existují a odpovídají předanému buildu.

Neúspěch některého základního bodu označ viditelně. Vysoké vizuální skóre neznamená, že je zadání dokončené. Skóre a stav dokončení jsou dvě odlišné informace.

## Bodování: 100 bodů

Každý řádek níže ohodnoť 0–5: 0 = chybí, 1 = pouhá naznačená implementace, 2 = částečné nebo výrazně rozbité, 3 = funkční s citelnými slabinami, 4 = kvalitní s menšími slabinami, 5 = výborné a přesvědčivě ověřené. U každého skóre zapiš pozorování či důkaz; nepotvrzenou vlastnost neboduj jako prokázanou.

### Hratelnost a progrese — 30 bodů

| Kritérium | 0–5 | Pozorování / důkaz |
|---|---:|---|
| Srozumitelný začátek a první smysluplná adaptace | | |
| Příjemný pohyb a kamera | | |
| Krmení, nebezpečí, průzkum a férová smrt | | |
| Smysluplné podmínky a návaznost všech tří etap | | |
| Různé životaschopné strategie, ne jeden dominantní build | | |
| Zakončení, tempo a chuť pokračovat nebo hrát znovu | | |

### Evoluce a editor — 25 bodů

| Kritérium | 0–5 | Pozorování / důkaz |
|---|---:|---|
| Skutečná 3D úprava těla a použitelnost editoru | | |
| Shoda podoby v editoru a ve hře | | |
| Viditelný a měřitelný dopad adaptací na hraní | | |
| Animace a lokomoce odpovídající konstrukci těla | | |
| Smysluplné náklady, omezení, trade-offy a návaznost linie | | |

### Vizuál a zvuk — 20 bodů

| Kritérium | 0–5 | Pozorování / důkaz |
|---|---:|---|
| Soudržná výtvarná identita a kvalita scén při hraní | | |
| Siluety, materiály, prostředí a rozlišitelnost druhů | | |
| Čitelné UI a zpětná vazba interakcí | | |
| Animace, efekty, zvuk a atmosféra | | |

### Ekologie a vlastní identita — 10 bodů

| Kritérium | 0–5 | Pozorování / důkaz |
|---|---:|---|
| Skutečné důsledky hráčova vlivu na svět a jejich persistence | | |
| Symbióza jako odlišná strategie se skutečnými důsledky | | |

### Spolehlivost a výkon — 15 bodů

| Kritérium | 0–5 | Pozorování / důkaz |
|---|---:|---|
| Build, testy a poctivost ověřování včetně úplného průchodu | | |
| Save/load, restart, pauza a odolnost vůči hraničním situacím | | |
| Stabilita dlouhého hraní a naměřený výkon v popsaném prostředí | | |

**Součet: ____ / 100**

**Stav zadání:** ____

**Tři největší slabiny:** ____

## Stejný úvodní herní test pro každý výsledek

Spusť čistý save se seedem 481516 a hraj deset minut bez konzole a debug zkratek. Zaznamenej čas do první interakce, první pochopitelné volby a první adaptace. Vyzkoušej změnu těla, návrat do světa a skutečný dopad úpravy. Na konci proveď save, refresh a reload. Jestli se k některému kroku za deset minut nedostaneš, poznamenej to; neskákej tajně na připravený stav.

Tento krátký test není důkazem dohratelnosti celé kampaně. Zkontroluj také úplný průchod a reprezentativní scénáře dalších strategií. Připravené scény jsou vhodné pro jejich kontrolu, nikoli pro předstírání, že fungují přechody.

Při porovnávání výkonu použij stejný stroj, prohlížeč, rozlišení, kvalitu a srovnatelnou zátěž. Nedávej vedle sebe softwarový renderer jednoho běhu a hardwarový renderer druhého bez výrazného upozornění. Sleduj i p95 frame time a záseky, ne jen průměrné FPS.

## Závěr srovnání

| Oblast | Astra Ultra | Astra xhigh |
|---|---|---|
| Stav dokončení | | |
| Skóre / 100 | | |
| Zásahy člověka | | |
| Ověřená doba a spotřeba | | |
| Největší přednost | | |
| Největší problém | | |

Jedno dvojité spuštění je případová studie, ne univerzální důkaz nadřazenosti režimu. Pro silnější závěr zopakuj nezávislé běhy a ponech zadání i podmínky stejné.
