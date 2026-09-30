# C3b · kolonie, náklad a návratný obchod

**Stav: C3b implementováno a doloženo skutečným koloniálním okruhem, importem a návratem.** [Plán a smlouvy](../superpowers/plans/2026-09-26-space-colonies.md). Tento report neuzavírá celé SP-013, říše ani milník D.

## Implementace

- Výslovná aktivace prázdného účtu v live i checkpointu. Historické C1/C2/A1/A2 kampaně nemají při samotném parsování přidanou ekonomiku. Stabilní adresy kolonií se nemění při importním přejmenování kampaně.
- Převod doma skutečně strhne 20 jantarů a připíše stejných 20 do lodní pokladny. Založení kolonie stojí 40, rozšíření o úroveň 20. Akce kontroluje aktuální polohu, živou loď, revizi nabídky a dostupné prostředky. Žádný výchozí grant.
- Vlastní kolonie vyžaduje první skutečně stabilní živý pás. Zakoupená úroveň 1–3 a aktuální stabilita společně omezují výrobu. Cyklus trvá 10 aktivních herních sekund, sklad pojme 8 kusů na aktivní úroveň. Plný sklad neukládá budoucí výrobní bonus. Ekologický propad uchová kolonii, doklady a dosavadní zásoby; další výroba čeká na obnovu.
- Měsíční sůl, Sluneční pryskyřice a Výtrusové vlákno mají stabilní původ, vzhled a odlišné místní ceny. Produkce se fyzicky přesune ze skladu do nákladu. Zboží a živé exempláře sdílejí konstrukční kapacitu; prodej na jiném obydleném světě nebo doma odstraní skutečný náklad a připíše právě jeho cenu.
- Vlastní kolonie nabízí opravu nejvýše 40 zdraví za 5 a doplnění nejvýše 60 energie za 3; účinek končí na skutečném konstrukčním maximu. Platba i účinek mají uložený doklad.
- Výroba běží pouze v běžné simulaci, během letu i domácí planetární etapy. Používá skutečný přírůstek `space.elapsed` nebo `planet.elapsed`; svět mimo aktivní scénu ani živý náklad tím ekologicky nestárnou. Načtení/menu/pauza/offline samy nic nevyrábějí.
- HUD u majáku ukazuje účet, cenu, zboží, sklad, výrobu, servis a důvod neproveditelnosti. Hvězdná mapa porovnává tržní ceny a ukazuje vlastní kolonie. Trojice modulů osady odpovídá zakoupené úrovni, fyzické krystaly počtu kusů ve skladu a světlo aktuální výrobní kapacitě; běžné aktualizace nemění GPU prostředky.

## Účty, checkpointy a review

Kumulativní vklady/tržby/útraty určují přesný zůstatek. Každá kolonie drží vyrobeno → sklad → naloženo; naložené kusy jsou právě v lodi nebo v agregovaných prodejích. Nejvýše 128 transakčních dokladů doplňují trvalé počty a finanční součty. Sdílená kapacita se ověřuje přes skutečné pořadí ekonomických i biologických akcí, včetně stejného času a mezilehlého odběru/výsadby. Dnešní zboží nezmenšuje historickou biologickou loď.

Nezávislé review a nové regrese pokrývají:

1. Legální checkpoint s osmi živými exempláři přežije jejich výsadbu, naložení zboží a pozdější odrolování ekonomického záznamu. Neúplný dokladový suffix nepředstírá známé starší pořadí.
2. Sklad nemůže překročit nejvyšší zakoupenou úroveň ×8, ale může zůstat nad kapacitou dočasně poškozené ekologie.
3. Rozšíření ukládá skutečný výrobní řez. Vyšší úroveň nedovolí zpětně připsat produkci za staré cykly.
4. Pokud je domácí stav jinak přesně stejný jako checkpoint, odečtený jantar nelze vrátit a ponechat lodní vklad. Skutečný pozdější příjem a ostatní doložené domácí akce zůstávají možné.
5. I po odrolování historie odpovídají celkové počty naložených/prodaných kusů počtu akcí a konstrukční kapacitě. Placené doplnění energie/zdraví se započítává do okamžitého checkpointu.

Historické záznamy bez úplného suffixu nemají úplný replay všech minulých výrobních podmínek. Validace používá zachované řezy, fyzickou bilanci, kumulativní účty a jejich meze; neprohlašuje neomezenou historii.

## Automatické regrese

- Typecheck prošel.
- První core běh: **19/19 testů**, 11,33 s, bez oprav nebo timeoutů po spuštění.
- První prezentace: **9/9 testů**, 1,59 s, včetně společného HUD nákladu, cen, reduced motion, zachování modelu a jednorázového disposal.
- Dvě přesné A2 native fixtures: **12/12 regresí**, 6,82 s; historické parsování, importní identita, checkpoint a nulová aktivace nové ekonomiky.
- Společný space/ship agregát: **16 souborů, 363/363 testů**, 75,47 s.
- Celá sada: **178 souborů, 4 097/4 097 testů**, 287,44 s, exit 0. Bez vynechání, zvýšení timeoutů nebo opakování.
- Produkční build včetně typechecku prošel: `index-DeLU6dE0.js` / `index-CALd-fV6.css`, 222 modulů. Známé upozornění na velký JS chunk zůstává.
- Po native přidány dvě byte-identické C3b fixtures a **15/15 regresí**, 5,07 s; [provenience](../../tests/fixtures/space/C3B-README.md) odděluje skutečný starý checkpoint od připravených plných checkpointů. Tento úzký soubor byl spuštěn samostatně; není zahrnutý v dřívějším počtu 4097.
- Logy jsou v `evidence/sp-013c/verification/`. Native použil přesně tento build.

## Skutečný hraný obchodní okruh

Produkční `test:space-colonies` pokračoval ze skutečného [A2 exportu](../../evidence/sp-012a2/continuation/active-campaign.save.json), SHA `5745841b9804cf2e6871e096e8df215cab66fc6ba8ac34ebaa7866fb1006c175`. Pouze veřejné UI, fyzický let, nativní RAF a čtení diagnostiky. Žádné přidané prostředky/život, live settery, přeskoky ani debug čas. **Pět skupin kontrol prošlo, 0 browser chyb, proces exit 0, browser/context zavřeny.**

- Tři vklady po 20 skutečně odečetly jantar doma. Aktivace live i starého checkpointu zachovala předchozí biologii, loď, konstrukci a ostatní stav.
- Na Žhavé slze zaplacena kolonie 40, vyrobeno a naloženo 8 Měsíční soli. Plná loď odmítla odběr blízkého skutečně proskenovaného života. Veřejný export/import/rekey zachoval náklad; Jantarový háj jej koupil za viditelných 8×10=80.
- Placené doplnění 3 zvýšilo skutečnou energii 89,2083→105. Oprava poškození je doložená připravenými jednotkovými testy; tento mírový native průchod poškození lodi nevytvářel.
- Všichni tři predátoři prvního pásu byli skutečně odebráni do lodi. Po deset aktivních sekund byla kapacita 0, výrobní čas/produkce/sklad beze změny a placená kolonie zůstala. Vrácení stejných ID, obnovená stabilita, naložení zachovaných osmi kusů a nový vyrobený kus doložily obnovu. Druhý skutečný prodej financoval další růst.
- Obě opačné planety mají zaplacenou kolonii a úroveň 2; chladná produkce byla odvezena domů a prodána 8×19=152. Celý účet **60 vklady +312 tržby −80 stavby −40 rozšíření −3 servis =249**. Konečný náklad je prázdný, obě kolonie uchovávají 16 kusů. Celkem 14 ekonomických akcí, 48 letových přechodů, 8 biologických akcí a tři veřejné importy/rekey.
- Neaktivní biologické světy a nesené organismy stály, koloniální výroba v běžné simulaci pokračovala. Celý domácí export kromě úložištní identity zůstal za letu stejný až do skutečného docku. Pauza nic nevyráběla. Konečné populace zdroj/horký/chladný jsou 49/54/54 a všechny mají kapacitu 3.

[Výsledek](../../evidence/sp-013c/browser/result.json), [review](../../evidence/sp-013c/browser/review.json). Aktivní další kampaň: [active-campaign.save.json](../../evidence/sp-013c/browser/active-campaign.save.json), SHA `01f1c07ae53847a4b4a2d4938d1d22782bb5529ea1696a7e5f05268f242aff5a`.

## Obraz, výkon a úklid

Hlavní vlákno i nezávislý hráč prohlédly všechny čtyři finální snímky 1024×640: [kolonie/sklad](../../evidence/sp-013c/browser/hot-colony-stock-1024.png), [ceny a plný náklad](../../evidence/sp-013c/browser/colony-markets-cargo-1024.png), [zastavená výroba](../../evidence/sp-013c/browser/colony-production-halted-1024.png), [rozšířená chladná kolonie](../../evidence/sp-013c/browser/cold-colony-expanded-1024.png). Model a počet skladových krystalů odpovídají účtu, odlišné produkty mají vlastní barvy. Rolovací panel zpřístupňuje správu bez překryvu spodního ovládání; v otevřené mapě je vidět skutečná prodejní cena. Nízký přelet hustě osídleného místa může zakrýt část modelu rostlinami; vyšší přehledový přelet je čitelný.

Chladná scéna s 54 organismy a kolonií: **90 RAF, p95 16,7 ms, max 16,8 ms**, 936 draw calls /284 034 trojúhelníků. Čtyři párované návraty orbita→povrch→orbita: **212→1 211–1 215→212 geometrií**, 0 textur, 21 programů. Jde o reprezentativní krátký vzorek a návraty scén, nikoli dlouhý soak nebo univerzální důkaz bez úniků.

[Manifest úklidu](../../evidence/sp-013c/artifact-cleanup.json): čtyři PNG, pět skutečných exportů a kompaktní log/výsledek/review, browser přibližně 3,31 MiB; žádné traces/video/dočasné kopie. Před i po kontrole přibližně 18,43 GiB volných. Cizí artefakty nedotčené.

## Přijetí a návaznost

Tento řez dokládá kolonizaci→produkci→prodej→další výpravu→návrat a vazbu skutečné ekologie na osídlení. Dřívější C1–A2 dokládají vlastní konstrukci, cizí soustavy, získání života a opačnou terraformaci stejné kampaně. Nejde o celou rozšířenou říši, válku, jádro, dobrodružství ani závěrečný souvislý průchod z nové buňky.

Čekající lidské přijetí a poslech:

1. Z domácí dílny bez instrukcí navíc najít cenu kolonie, vložit jantar a podle mapy dovézt první skutečnou produkci na jiný trh.
2. U kapacity 0 porozumět zachovanému skladu a potřebě vrátit chybějící predátory; ověřit čitelnost při řízení i zvuk potvrzení.
3. Z tržeb zaplatit rozšíření, další kolonii nebo servis a po návratu/importu rozpoznat vlastní pokrok.

Dále [D1: kontakty, odlišné zakázky, dědictví a dohody](../superpowers/plans/2026-09-26-open-galaxy.md). Goal pokračuje. Bez commitu/pushe/deploye.
