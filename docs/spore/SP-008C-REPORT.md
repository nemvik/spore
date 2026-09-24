# SP-008.C — rozšířená hudební setkání

24. září 2026. Implementace navazuje na zachovanou SP-008.B; při zahájení byla B necommitnutá nad `18346fb`, během práce byla mimo tuto relaci commitnuta jako `2aa7afe`. Implementační průchod skončil bez commitu, pushe a deploye; následný výslovný pokyn uživatele žádá commit a push C do `main`. [Plán a záznam](../superpowers/plans/2026-09-24-sp-008c-musical-encounters.md), [smlouva SP-007.A](SP-007A-CONTRACT.md).

## Herní pravidla

Hudební příprava je v panelu každého nevyřešeného souseda. Ukazuje požadavky všech kol, skutečné počty vybraných hudebníků, cenu a důvod případné blokace. Vybraní potomci jdou za konkrétním živým členem sousední společnosti. Hostitel jde ke své osadě; ostatní společnost dál sbírá, spotřebovává a brání se. Prázdná společnost hudební návštěvu nepřijme. Symbionti zůstávají členy kmene, hudebníky nejsou.

| Soused | Tři požadavky |
| --- | --- |
| Pramenné sady | 1 buben → 1 píšťala → 1 chřestidlo |
| Jantarová terasa | 2 bubny → 1 chřestidlo → 1 píšťala |
| Severní kruh | 1 píšťala → 1 chřestidlo → 1 buben |

Píšťala a chřestidlo rozšiřují dosavadní pracovní slot `tool`: každé potřebuje dokončenou dílnu za 22 jídla, změna vybavení stojí 6 za člena. Nahrazují koš/oštěp/měch/buben, kulturní oděv SP-008.B zůstává oddělený. Během účasti se nástroj ani oděv nepřevléká. Náklad je nutné před návštěvou vyložit, hladové či vážně zraněné členy připravit doma. Tělo, jeho jídelníček a symbionti se nemění.

Návštěva čeká na skutečný kontakt celé skupiny s hostitelem do 9 m, hostitel musí být do 12 m od osady; spojnice nesmí procházet překážkou. Cesta má limit 90 sekund. Až při příchodu se zaplatí **4 jídla + dosud nepředaný dosavadní dar 8/12/16**. Dar jde do sousedova skladu, vyvolá příměří a odvolá jeho expedici. Po cestě se zásoby znovu kontrolují. Opakovaná návštěva už dar neplatí. Zaplacené jídlo se nevrací.

Každé kolo: **3 s výzva → nejvýše 18 s na volbu → 2,5 s odezva**. Hráč volí mezi třemi nástroji; nejde o test přesnosti rytmického stisku. Úspěch vyžaduje zvolený požadovaný nástroj a dost skutečně přítomných hudebníků. Nedostatek správného nástroje může hráč vědomě zkusit; odezva vysvětlí chybějící počet. Jiná volba nebo vypršení času jsou chyba. Dvě chyby ukončí setkání se ztrátou 10 vztahu. Dvě nebo tři správná kola z celkových tří uspějí.

Každé úspěšné kolo přispívá **20 × průměrný sociální účinek oděvu odpovídajících hráčů × dědictví SP-007.A**. Chochol tedy zůstává ×1,25, přátelská minulost ×1,15 a smíšená ×1,075. Nenahradí chybějící nástroj. Vztah se přičte až při úspěšném konci, omezí na 100. Pasivní kontaktní diplomacie u stejného souseda je během návštěvy vypnutá i pro jiné členy. Běžný smír a boj mimo setkání zůstávají dostupné.

Společná funkce vyřešení spojenectví zachovává jednorázových **+8 jídla**, `resolved`, fakt historie podle identity souseda a dosavadní postup do strojů. Nový civilizační bonus nebo další grant nevzniká. Výsledek vypíše odpovědi, skutečné hráče, přesný důvod selhání, příspěvky úspěšných kol, výslednou změnu vztahu a zaplacenou částku. Další návštěva stejného souseda je možná po 30 sekundách.

## Přerušení a datová smlouva

Kampaň zůstává v3 a kmen v2. Volitelné `tribe.music.version = 1` vznikne první zahájenou návštěvou; parser historickým saveům marker nedoplňuje. Obsahuje aktivní návštěvu, poslední výsledek a nejvýše tři cooldowny sousedů. Návštěva ukládá ID souseda a skutečného hostitele, seznam účastníků, fázi, zbývající čas, dobu ztraceného kontaktu, platbu a dosavadní odpovědi s hráči/násobky/úspěchem.

- **Save/load, export/import:** přesně zachovají fázi, čas, odpovědi, zaplacení i cooldown. Načtení samo neuděluje vztah ani odměnu a nepřehrává již zaznělou fázi zvuku. Následující skutečný tick ověří kontakt a život účastníků.
- **Pauza, save menu, kulturní editor:** simulace stojí, včetně časovače odpovědi a tolerance kontaktu. Návštěva pokračuje po návratu do hry.
- **Checkpoint:** svět, zásoby, hudba a historie se vracejí společně. Checkpoint před první hudební akcí legitimně neobsahuje marker. Obnova neponechá výdaje ani výsledek opuštěné větve. Pozdější etapa zachová terminální výsledek, aktivní hudba mimo kmen je neplatná.
- **Ústup, zastavení, nový rozkaz účastníka, tlačítko ukončení:** ihned ukončí návštěvu; na cestě bez platby a ztráty vztahu, po příchodu −5 a bez vratky. Nový rozkaz se následně normálně provede. Nepřipojuje další účastníky k probíhající skupině.
- **Přerušení fyzického kontaktu:** odpovědi a čas kola stojí; po 3 s bez kontaktu konec s −5. Včasný návrat dovolí pokračovat. Překážka je součástí této kontroly.
- **Ztráta člena nebo hostitele:** konec bez hudební odměny. Stale reference na skutečně ztraceného člena/hostitele zůstávají načitatelné, aby byla obnovitelná i hranice mezi fázemi simulace; další tick bezpečně ukončí setkání. Terminální výsledek smí uchovat historické ID mrtvého člena.
- **Boj:** útok na hostitelský kmen i skutečné zásahy do účastníků od fauny či jiného kmene návštěvu ukončí. Hlad se za boj nepovažuje; smrt hladem je ztráta člena. Příprava odmítne už probíhající konflikt před založením cooldownu.

Validace kontroluje přesné klíče, verze, enumy, konečná čísla a jejich meze, jedinečná ID a vlastníky, počet/úspěšnost kol, soulad fází a plateb. U aktivních živých účastníků navíc kontroluje skutečné zamčené nástroje, přesné seznamy odpovídajících hráčů, kulturní účinky a odvozené dědictví. Terminální výsledek je historický otisk; jeho nástroje se nesrovnávají s později změněným vybavením. Import je atomický jako dosud.

## Vizuál, zvuk a SP-017

Svět i kulturní náhled používají stejnou geometrii nástrojů. Skutečný hostitel při výzvě nese požadovaný nástroj a nad ním je jeho model; při odpovědi hrají pouze členové uvedení ve skutečném výsledku kola. Pohyb nástroje a barevná odezva reagují na tuto fázi, při ztrátě kontaktu se zastaví; omezený pohyb animaci potlačí. HUD je textově použitelný bez sluchu a rozlišení barev.

Lokální Web Audio rozlišuje buben, píšťalu, chřestidlo, otevření odpovědi, chybu a konečný výsledek. Sdílené recepty respektují mute, hlasitost i effects. Automatické testy ověřují odvození a plánování zvuku; případný browser záznam frekvencí není skutečný poslech ani lidské posouzení srozumitelnosti.

## Ověření

Prostředí: Linux 6.8.0-138-generic, Node 24.15.0, pnpm 11.24.0, Playwright 1.55.0, Google Chrome 154.0.8037.57, produkční Vite preview, výchozí střední kvalita. Bez nových závislostí a změny lockfilu.

### Produkční UI

Celý scénář prošel **9/9 skupin kontrol, 0 console/pageerror**. Připravený vstup je výslovný: historické dokončené pobřeží → založený kmen, **220 jídla**, tři dokončené hudební dílny a vlastní členové u domova. Tato cesta, výstavba ani zásoby nejsou odehrané. Ve vstupu není oblečený chochol, vybavený nástroj, rozběhnutá návštěva ani výsledek. Běžné UI poté zaplatilo tři nástroje a tři chocholy (sklad **220 → 190**). Stejný UI export sestavy sloužil pro nezávislé větve s odlišnými nástroji nebo rozhodnutími; nejde o přepis živého stavu.

| Průchod | Doložený výsledek |
| --- | --- |
| Vhodná skupina | Buben/píšťala/chřestidlo + chocholy, tři správné odpovědi, vztah **30 → 100**, spojenectví. Tři příspěvky po 25, uplatněný strop vztahu; platba **12**, odměna za spojenectví jednou. |
| Nevhodná skupina | Přes UI přezbrojeno na tři bubny, stejné volby buben/píšťala/chřestidlo; poslední dvě odpovědi mají **0 hráčů**, vztah **30 → 20**. |
| Chybné rozhodnutí | Všechny tři nástroje dostupné, volby píšťala místo bubnu a buben místo píšťaly: dvě chyby, **−10** vztahu. |
| Přerušení | Běžný **Ústup domů** při rozběhnuté odpovědi: konec ihned, **−5** vztahu, žádná vratka ani hudební odměna. |
| Save/load | Export/import v `respond`, pauza drží hudbu přesně, reload a načtení pokračují se stejnými členy, kolem, platbou a zbývajícím časem. Po reloadu zbývalo **10,4833 s**, odpověď se stihla běžnými kliky. |
| Terminální načtení | Načtení ukončené návštěvy zachová výsledek a nic nepřipíše znovu. Genom se shoduje se vstupem. |
| Zvuk | Pozorováno skutečné volání Web Audio plánování frekvencí bubnu **120 Hz**, píšťaly **660 Hz**, chřestidla **1 800 Hz**, chyby **85 Hz** a úspěchu **784 Hz**. Nejde o poslech. |

Ovladač používá skutečné kliknutí, klávesy, systémové souborové vstupy a download. `render_game_to_text` je pouze čtecí; produkční nepřítomnost `advanceTime` je ověřena. Žádný setter, úprava localStorage za běhu ani zrychlení simulace. Pozorování Web Audio obaluje pouze skutečné `setValueAtTime`, přeposílá stejné argumenty a zapisuje malý diagnostický seznam; nemění hru ani zvukový recept. Pauza a obnovení jsou běžné UI akce.

Po tomto plném průchodu se finálně změnilo rozložení hudební karty a vysvětlení zahazovaných příspěvků. Karta nahrazuje levý panel výstroje, aby střední krajina a účastníci zůstali viditelní. Finální vizuální replay prošel bez console/pageerror: používá výhradně skutečné UI exporty celého průchodu, znovu odehrál tři správné odpovědi a zobrazil uložená skutečná selhání i ústup. Všech **7 finálních snímků bylo prohlédnuto**: příprava v 1440×900 a šest snímků aktivní odpovědi/výsledků v **1280×720**. U nejdelšího výsledku s chybějícími nástroji je potřeba posun panelu o **33 px**; samostatný nativní wheel a kliknutí ověřily dostupnost patičky i skutečné zavření výsledku. Ostatní výsledky, volby a ukončení aktivní návštěvy se vejdou bez tohoto posunu.

Lokální důkazy: [celý UI průchod](../../evidence/sp-008c/production-v4/results.json), [finální replay](../../evidence/sp-008c/final-visual/results.json), [ověření posunu](../../evidence/sp-008c/final-visual/scroll-result.json), [aktivní odpověď 1280×720](../../evidence/sp-008c/final-visual/loaded-response-1280.png), [úspěch](../../evidence/sp-008c/final-visual/success-1280.png), [patička neúspěchu](../../evidence/sp-008c/final-visual/result-footer-1280.png). Evidence je záměrně ignorovaná Gitem; reprodukovatelný ovladač a regresní fixtures jsou součástí zdrojů.

### Regrese a diagnostika

**53 nových regresí**: 21 automat, 22 persistence, 8 prezentace, 2 v existující historii. Pokrývají počty hráčů, skutečný kontakt a překážku, ceny a opakovaný dar, nesprávnou volbu/nástroj/timeout, odchod, smrt hostitele i hráče, zásahy fauny a třetího kmene, kulturní/děděné násobky, jednorázové spojenectví, každou uloženou fázi, checkpointy, pozdější etapu, historické fixtures, geometrii, omezený pohyb a zvukové recepty/pozorovatele. Starší zvuková regrese kontroluje mute/master/effects a uvolnění uzlů společné metody `voice`.

První finální `pnpm test` bez browseru: **2 415/2 417**, dva timeouty, **65,31 s**. Terénní test kombinovaného posunu/rotace trval 9,263 s nad limitem 5 s; starší test přesných otisků simulace 27,513 s nad vlastním limitem 20 s. Žádná assertion hodnoty neselhala. Zátěž systému dosahovala 25,39. Izolovaný příkaz `pnpm test tests/creature-terrain.test.ts tests/step-phases.test.ts --maxWorkers=1` prošel **21/21**, 11,53 s; stejné problémové testy trvaly **2,225 s / 5,545 s** se svými původními limity. Celá sada s jedním pracovníkem a původním timeoutem měla **2 414/2 417**, 191,58 s: původní dva případy prošly, ale timeout měly jiné starší testy SP-006 a dva seedy simulace (13,077 / 8,893 / 7,694 s nad 5 s). Izolované opakování těchto dvou souborů prošlo **69/69**, 5,87 s; problémové případy trvaly **1,336 / 0,490 / 0,441 s** při původním limitu.

**Finální celá sada: 128/128 souborů, 2 417/2 417 testů, 173,19 s**, příkaz `pnpm test --maxWorkers=1 --testTimeout=30000`. Změny parametrů jsou výslovné: nejvýše jeden pracovník a globální 30sekundový timeout namísto 5 s. Vlastní 20sekundový limit staršího testu otisků zůstal beze změny a test prošel za 5,298 s. Očekávání, počty kroků, testované otisky ani zdrojové timeouty se neměnily. Zelený finální běh s výchozími parametry není doložen; z proměnlivých časů sdíleného stroje nevyvozujeme výkonový benchmark.

`pnpm typecheck`, `pnpm build` a `git diff --check` prošly. Finální JS **1 187,83 kB**, gzip **363,81 kB**; známé upozornění Vite na 500 kB zůstává.

Nezávislé review nalezlo tři důležité problémy, všechny opravené: podvržené skóre aktivního save, neukončení při skutečném zásahu zvenčí, zavírání nativní přípravy HUD aktualizací. První dva měly červené reprodukce včetně plného `step()`, třetí červenou browser kontrolu otevřeného `details`. Opravy mají trvalé regrese; reviewer je nezávisle znovu nekontroloval. Dvě připomínky k čitelnosti (konkrétní příčina chyby, předběžné odmítnutí konfliktu) jsou také opravené a kryté červená→zelená testy.

Předchozí neúspěšné browser pokusy se do výsledků nepočítají: chyba ovladače při záměně skrytého file inputu za chybějící save menu; reprodukce zavírání přípravy; příliš hrubý předpoklad pauzy do 1 s po načtení; ukončení samostatného preview serveru signálem SIGTERM. Časová kontrola nyní vyžaduje přesně `uložený čas − rozdíl ticků / 60` (tolerance 1e-8): naměřených **82 ticků = 1,3667 s** bylo správné pokračování, ne chyba hry. Herních 18 s na odpověď ani 90 s na cestu se kvůli ovladači neprodlužovalo. Test nyní vlastní produkční preview ve stejném procesu a zavírá jej ve `finally`.

## Reprodukce

```sh
pnpm test
# Finální ověřený běh ve zdejším zatíženém prostředí:
pnpm test --maxWorkers=1 --testTimeout=30000
pnpm typecheck
pnpm build
# Scénář spustí vlastní produkční preview na 127.0.0.1:5196:
LUMAVORA_BROWSER_CHANNEL=chrome pnpm test:music
# S Playwright Chromium není channel nutný.
# Externí preview lze zvolit LUMAVORA_URL; výstupy přes MUSIC_OUTPUT.
# Finální rozložení lze zopakovat ze zachovaných skutečných UI exportů:
LUMAVORA_BROWSER_CHANNEL=chrome MUSIC_OUTPUT=evidence/sp-008c/final-visual MUSIC_VISUAL_INPUT=evidence/sp-008c/production-v4 node scripts/music-browser.mjs
```

## Úklid a zachované důkazy

Odstraněno **166 souborů / 8 632 382 B** vlastních mezivýstupů včetně dočasné kontrolní kopie zdrojů B, neúspěšných browser větví, nahrazených snímků a dočasné review regrese. [Manifest](../../evidence/sp-008c/cleanup-manifest.json) zaznamenává odstraněné cesty; [kompaktní souhrn předchozích běhů](../../evidence/sp-008c/earlier-runs.json) zachovává důvody selhání. Neodkazujeme na odstraněné snímky jako na současnou evidenci.

Zůstává **26 souborů / 4 824 833 B (4,60 MiB)**: sedm finálních snímků, malá výsledková data/logy, připravený vstup a šest skutečných UI exportů včetně aktivní kampaně a rozehrané odpovědi. Zdrojové regrese a historické save fixtures zachované. Trace, video ani screencast se nezapínaly; `.playwright-mcp/traces/` neexistuje. Cizí evidence, starší `.playwright-mcp` logy a neurčené globální browser profily se nemazaly. Vlastní browser/preview procesy se uzavřely. Disk před dlouhými běhy i po úklidu: **241 GiB volných**.

## Meze

Plný produkční průchod je u pramenných sadů, s historickým zděděným tělem. Požadavek dvou bubnů terasy pokrývá regrese; nové plné UI kampaně všech sousedů nebo všech šest etap nejsou doložené. Tato práce znovu neodehrává celou bojovou cestu A; původní regrese boje, kultur, společnosti a přechodů běží v celé sadě. Přerušení fyzické spojnice/tolerance a úmrtí jsou ověřené simulací a persistencí; UI průchod přerušuje kontakt hráčovým skutečným ústupem.

Neproběhl lidský playtest porozumění/zábavnosti, skutečný lidský poslech, dlouhý výkonový soak, Safari ani mobil. Automaticky plánované frekvence nedokazují výslednou slyšitelnost nebo hudební kvalitu na zařízení uživatele. Rozvržení a snímky nejsou lidský uživatelský test. Známé upozornění Vite na bundle nad 500 kB zůstává.

Část **SP-008.C je v popsaném rozsahu dokončená a ověřená**. Domestikace **D**, náčelník **E**, pět sousedů **F** a civilizační dědictví **SP-007.B1** jsou navazující práce. Celé SP-008 ani průřezová SP-017 se tímto bodem neuzavírají.
