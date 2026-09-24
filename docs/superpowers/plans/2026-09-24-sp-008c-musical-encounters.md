# SP-008.C — rozšířená hudební setkání

> Realizace v této relaci přes superpowers:executing-plans; zadání výslovně žádá pokračovat až k ověření. Zachovat necommitnutou B. Implementační průchod bez commitu/pushe/deploye; následný výslovný pokyn uživatele žádá commit a push C do `main`.

**Cíl:** vybrat členy a nástroje, navštívit skutečného souseda, rozpoznat výzvu, odpovědět a porozumět vlivu sestavy na vztah.
**Architektura:** volitelný `tribe.music` v kampani v3/kmeni v2; samostatný deterministický automat v `game/tribe-music.ts`, validátor, společné požadavky pro HUD/renderer/zvuk. SP-008.A hostitel zůstává skutečnou jednotkou. Existující diplomatický kontakt a boj fungují mimo aktivní setkání; během něj se vztah z pasivního kontaktu u téhož souseda nepřičítá.
**Technologie:** TypeScript, Three.js, Web Audio, Vitest, Playwright, bez nových závislostí.
**Specifikace:** zadání v této relaci, docs/spore/BRIEF.md, ROADMAP.md SP-008.C, SP-008A/B-REPORT.md, SP-007A-CONTRACT.md.

## Pravidla a datová smlouva

- Buben + nová píšťala/chřestidlo sdílejí existující slot `tool` s košem/oštěpem/měchem. Dílna 22, vybavení 6 za změněného člena. Kulturní výstroj zůstává samostatná. Hudební nástroje se mění mimo aktivní účast.
- Tři čitelné požadavky podle identity souseda: sady buben/píšťala/chřestidlo po jednom, terasa dva bubny/chřestidlo/píšťala, poutníci píšťala/chřestidlo/buben po jednom. Náhled uvádí skutečné obsazení a chybějící nástroje.
- Vybraní vlastní členové jdou za konkrétním živým hostitelem k jeho osadě. Symbionti nehrají. Kontakt vyžaduje vzdálenost i průchodnou spojnici; žádné hudební odměny na dálku. Cesta nejvýše 90 s.
- Při příchodu platba 4 jídla za návštěvu + dosud nepředaný dar (8/12/16), bez vratky. Dar se předá jen jednou jako dosud; truce odvolá expedici. Nedostatek při příchodu návštěvu ukončí.
- Výzva 3 s → odpověď nejvýše 18 s → odezva 2.5 s. Volba ze tří nástrojů, bez nároků na přesné rytmické stisky. Správný nástroj a dostatek skutečných účastníků = úspěšné kolo. Chyba i vypršení času jsou neúspěšné kolo; dvě chyby ukončí návštěvu.
- Nejméně dvě úspěšná kola ze tří: vztah +20 za úspěšné kolo, násobený průměrem kulturního sociálního účinku skutečných odpovídajících členů a jednou dědictvím SP-007.A. Bonusy nenahradí chybějící nástroj. Vyhodnocení až na konci, žádné pasivní sčítání. Neúspěch −10; přerušení po příchodu −5, na cestě 0. Opakování po 30 s. Spojenectví až při 100, stávajících +8 jídla jednou.
- Ústup/nový rozkaz/zastavení účastníka ukončí návštěvu; při pouhé ztrátě fyzického kontaktu tolerance 3 s, bez běhu odpovědního času a bez přijímání odpovědí. Ztráta člena/hostitele nebo boj ukončí ihned. Zbytek společnosti dál žije.
- Save/load/export/import/checkpoint zachovají přesnou fázi, zbývající čas, členy, hostitele, odpovědi, poslední výsledek a cooldown. Load nic nepřičítá; zastaralý kontakt řeší další simulační tick. Pauza zastaví čas. Staré savey nemají marker a parser jej nedoplňuje. Terminální výsledek smí odkazovat na zemřelé účastníky, aktivní také (úmrtí může nastat po kmenovém ticku); další tick bezpečně ukončí setkání. Historická ID musejí být menší než nextId.
- Náhled nástrojů používá stejnou geometrii jako svět; vizuální výzva/odpověď a syntetická zvuková odezva čtou stejnou fázi a výsledek. Reduced motion respektováno, text nezávisí na barvě nebo sluchu.
- D/F/E a civilizační dědictví SP-007.B1 mimo rozsah. Genom, jídelníček a odměny historie beze změny.

## Úkoly

- [x] 1. Regrese → automat a integrace: `tests/tribe-music.test.ts`, `game/tribe-music.ts`, `era-types.ts`, `tribe.ts`, `tribe-society.ts`, `tribe-neighbours.ts`. Pokrýt fyzický příchod, platbu, vhodnou/nevhodnou skupinu, chybnou volbu, timeout, odchod, smrt, konflikt a jednorázovou odměnu. Spustit cílený test nejprve červený, potom zelený.
- [x] 2. Přísná persistence: `game/tribe-music-validation.ts`, `persistence.ts`, `tests/tribe-music-persistence.test.ts`. Roundtrip každé fáze a checkpointu, přesné klíče/verze/enumy/limity, historické fixtures. Aktivní stav nesmí umožnit opakovanou odměnu ani falešné skóre.
- [x] 3. Produkční ovládání a SP-017: `ui/tribe-music.ts`, `ui/tribe.ts`, `tribe.css`, `main.ts`, `render/settlement.ts`, `render/audio.ts`, katalog kopií; `tests/tribe-music-presentation.test.ts`. Tři nástroje, cena, požadavky, sestava, čas, důvod výsledku, ukončení, animace hostitele/hudebníků, odlišné tóny. Ověřit generovanou geometrii a audio recepty, bez tvrzení o lidském poslechu.
- [x] 4. Produkční průchod `scripts/music-browser.mjs`: přiznaný připravený kmen, zásoby a dílny, žádný připravený výsledek. Běžné kliky, klávesy, import/download; jen čtení `render_game_to_text`, žádný setter ani advanceTime. Úspěch/nevhodná sestava/chybná reakce/přerušení/save-load, snímky včetně 1280×720 a jejich prohlídka.
- [x] 5. Celá sada `pnpm test`, typecheck, build; diagnostika případných timeoutů bez oslabení assertions. Závěrečné nezávislé review podle executing-plans. Aktualizovat ROADMAP/PROGRESS, SP-008C-REPORT. Úklid jen vlastních artefaktů s manifestem a kontrolou disku.

## Review focus

- Překryv pasivního setkání a aktivní hudby: test nulového pasivního vztahu během návštěvy stejného souseda.
- Změna vybavení po náhledu: vyhodnocení z aktuálních účastníků, vybavení aktivních účastníků odmítnuto atomicky.
- Úmrtí během wildlife fáze po kmenovém kroku: save načitatelný, další krok ukončí bez odměny.
- Obnovení uložené odezvy posledního kola: odměna právě jednou.
- Společnosti bez živého hostitele, překážka a cizí symbiont: start či pokračování odmítnuté s důvodem.

## Záznam

- Výchozí pracovní strom obsahoval SP-008.B (14 upravených tracked souborů a 13 nových souborů); uchována kontrolní kopie src a diff v /tmp/sp008c-baseline pro review. Disk 241 GiB. Rozšíření existujícího systému, zadání poskytuje rozsah i autorizaci pokračovat bez další schvalovací zastávky.

- Úkoly 1–3: první test červený (chybějící modul), poté automat 14/14; persistence první běh odmítal marker, po implementaci 18/18; prezentace 7/7. Rozšířené opravy 42 hudebních kontrol. Typecheck prošel.
- Nezávislé review: tři důležité nálezy. Aktivní skóre přijímalo podvržené nástroje/násobky; skutečný zásah faunou nebo třetím kmenem neukončil píseň; synchronizace HUD zavírala details. První dva doloženy červenými regresními testy, třetí červeným nativním browser průchodem. Opravy: kontrola zamčených nástrojů a skutečného dědictví, přerušení na reálném zásahu, opt-in uchování native open atributu. Review opravy nezávisle znovu nekontrolovalo, nové testy a finální sada je ověřují.
- První browser pokus selhal v ovladači (skrytý input zaměněn za nepřítomnost save menu); opraven count() místo isVisible(). Žádný hraný výsledek z tohoto pokusu není započten.
- Během práce se HEAD vně této relace posunul na 2aa7afe (commit SP-008.B). Tato relace nevytvořila commit, změny B zůstaly zachované.

- Doplněno skutečné SP-007.A sociální i smíšené dědictví přes původní hrané akce testu; násobek pro hudbu ověřen jednou. Celkem 53 nových regresí (21 automat, 22 persistence, 8 prezentace, 2 historie).
- Drobné připomínky review povýšeny na opravy čitelnosti pro výslovný požadavek zadání: konkrétní příčina chybné odpovědi a odmítnutí zjevného konfliktu už při přípravě; obě doplněné regrese nejprve červené, poté zelené.
- Browser časová kontrola po importu zpřesněna: původní předpoklad návratu do pauzy pod 1 s neplatil, skutečně uběhlo 82 ticků = 1,3667 s a čas byl správný. Nová assertion vyžaduje přesný úbytek podle rozdílu ticků (tolerance 1e-8), nikoli volnější časový limit. Další pokus zastavil SIGTERM samostatného preview serveru; ovladač nyní vlastní Vite production preview ve stejném procesu a ve finally jej zavře.
- Vizuální kontrola odhalila zakrytí skupiny prostřední kartou. Finální karta nahradí levý panel výstroje; centrum krajiny zůstane viditelné. Finální kontrola rozložení použije skutečné UI exporty předchozího průchodu, znovu odehraje úspěšnou odpověď a načte skutečná selhání/přerušení, bez změn herního stavu.
- Finální produkční průchod 9/9, bez chyb; poslední rozložení znovu odehrálo všechny tři vítězné odpovědi, ostatní výsledky načetlo ze skutečných UI exportů. Všech sedm finálních snímků prohlédnuto. V 1280×720 se nejdelší výsledek posouvá o 33 px; běžné kolečko a kliknutí ověřily dostupné zavření.
- Výchozí celá sada měla dva timeouty (2 415/2 417); sériová tři jiné (2 414/2 417). Všechny problémové případy izolovaně prošly s původními limity. Finální `pnpm test --maxWorkers=1 --testTimeout=30000`: 128 souborů / 2 417 testů za 173,19 s. Očekávání, kroky ani vlastní 20sekundový limit přesného replaye nezměněny. Typecheck/build prošly, JS 1 187,83 kB / gzip 363,81 kB; známé upozornění >500 kB.
- ROADMAP a PROGRESS aktualizované; [report](../../spore/SP-008C-REPORT.md) rozlišuje přípravu vstupů, automatické zvuky a chybějící lidský poslech/porozumění. Hotová jen C, navazující D–F a SP-007.B1 otevřené.
- Úklid dle AGENTS: 166 souborů / 8 632 382 B odstraněno včetně dočasné výchozí kopie B; manifest v `evidence/sp-008c/cleanup-manifest.json`. Zůstalo 26 souborů / 4,60 MiB kompaktní evidence, vstup a skutečné savey. Žádné trace/video, cizí artefakty zachované; disk před i po 241 GiB volných.
