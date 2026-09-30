# SP-009.K2 · budoucí výroba a placená obnova armád

26. září 2026. [Plán a smlouva](../superpowers/plans/2026-09-26-renewable-armies.md). **K2 hotovo v rozsahu níže.** Bez commitu, pushe, deploye nebo změny závislostí.

## Implementace

Soupeřova města nyní při běžném místním hraní hospodaří i mimo návštěvu, včetně cesty člunem a obchodní přepravy. Pěstírny, pracovníci, hlad, spokojenost, údržba a skutečná pokladna používají stejný hospodářský cyklus jako městské UI. Globál, pauza, editor, mrtvá linie a etapa 5 budoucí výrobu zastaví; žádné offline dohánění. Domov a nenavštívená hráčova města zachovávají dosavadní čas. Převzetí města uprostřed kroku nezpracuje cyklus dvakrát ani nevynechá krok.

Další tank stát kupuje za 40 přímo z pokladny konkrétního fungujícího města. Musí vzniknout nejméně 40 nového čistého příjmu po odečtení už zaplacených jednotek; dva příští cykly údržby zůstanou v pokladně. Vlastnické epochy oddělují hráčovu výrobu od pozdějšího státního zisku. Původní rezerva 400, civilní účet prodejů a historické F jednotky se nepřepisují. Každý další tank má nový doklad, stejnou fyzickou cestu a boj; vrak ani navrácená stará jednotka se neléčí.

Jeden nevyřešený výpad na stát i cílové město. Po skutečném návratu či ztrátě jednotky následuje šest strategických tahů obnovy (přibližně minuta, nikoli přesná záruka 60 sekund). Nové výpady odpovídají na vojenskou ztrátu původního města; mírové převody samy útok nezakládají. Původní mírové osídlování a rozvoj pokračují i po vyčerpaném jednorázovém F výpadu. Limit 256 nových dokladů má čitelný důvod odmítnutí.

Volitelný `mobilization` v1 vzniká bez historického příjmu a výprav. Ekonomika v5 přidává nulový účet `military`; historické v1–v4 snímky zůstanou přesně původní. První budoucí krok uloží aktuální výchozí účty. Kompaktní nákupní řez nezdvojuje kosmetické modely; přesná účetní rovnice a historické transakce dokládají zdroj. Checkpoint zachová celou větev včetně výdajů, poškození, přípravy i návratu. B2 stále vyžaduje vyřešené všechny výpady.

## Review a průběžné kontroly

Nezávislé review a testy opravily přijetí číselných řetězců v nákupním řezu, nedoloženou přednákupní pokladnu, opětovné započtení utracených 40 do baseline, historické znovu dobyté město s pozdější výrobou a pořadí převzetí přes hranici hospodářského cyklu. Samostatná aktivace staršího stage5 zachová dokončený B2 řez a neutrální historii.

301 souvisejících testů států, obrany, věží a dědictví prošlo. Celá první sada měla 3 704 úspěšných testů a jeden timeout původního jednokrokového testu kmenové hudby spolu s timeoutem workeru; zaznamenaný test trval téměř 898 sekund. Samostatných 21 hudebních testů následně prošlo za 212 ms. Příčinu přerušení času nemáme prokázanou; opakovaná celá sada následně prošla: **160 souborů / 3 706 testů**, 157,34 s. Běh použil dočasné zabránění uspání pouze po dobu testovacího procesu, bez změny systému. Finální hraná fixture poté přidala 73. cílený K2 test; všech **73/73** prošlo za 1,45 s.

První browser běh vyčerpal 300 sekund reálného čekání dříve, než se v simulaci vytvořil potřebný zisk. Zdrojové město mělo devět skutečných cyklů, příjem 63, údržbu 36 a pokladnu 31; žádný bezplatný nákup neproběhl. Opakování používá delší časový limit a stejnou nezměněnou hranou K1 kampaň. Nejde o připravený zisk ani zrychlení simulace.

## Dokončený nativní průchod a evidence

Produkční Chrome, `index-CiWwbMtf.js`: **6 kontrolních skupin / 0 browser chyb**. Build i typecheck prošly; hlavní JS 1 523,07 kB / gzip 473,71 kB, CSS `index-CXsaDFl3.css`. Upozornění na velký chunk trvá.

V nezměněném hraném K1 vstupu hráč opravil věž za 20 z40→80→100. Doma vydělával z původních pramenů, zatímco zdrojové město1470 nebylo nikdy navštíveno. První tank: tah48 / cyklus15, výroba105−údržba60=45, platba **49→9**. Druhý: tah61 / cyklus28, výroba196−údržba112−předchozí armáda40=44, platba **48→8**. Ponechaná provozní rezerva8 v obou případech. Oba nové výpady skutečně dorazily a byly zničeny původním tankem s věží. Jejich cena celkem80 zůstává v ledgeru; původní F výpad, E capture, rezervy i civilní účet jsou shodné. Vlastní tank88 a věž100 v těchto dvou střetech další opravy nepotřebovaly.

Mezi vlnami proběhl export/import/rekey a save/reload/load; řešení první armády v tahu50 umožnilo šest tahů obnovy do56, druhá byla koupena až61 po novém zisku. Finální kampaň je v tahu64, zdrojová pokladna20 má přesnou rovnici80+224−60−16−128−80. Žádné živé zápisy ani zrychlený čas. Historické východisko a cílené připravené unit stavy nejsou důkazem nového narození.

Hlavní vlákno prohlédlo všechny čtyři finální snímky 1024×640, včetně účetního přehledu. Zachovány tři rozdílné milníky: [boj](../../evidence/sp-009k2/browser-replay/army-1-combat-1024.png), [ubráněné město](../../evidence/sp-009k2/browser-replay/two-paid-armies-resolved-1024.png), [státní účty](../../evidence/sp-009k2/browser-replay/states-overview-1024.png). Téměř shodný druhý bojový snímek byl po kontrole odstraněn v manifestu. 90 nativních RAF intervalů: p50 **16.7 ms**, p95 **16.7 ms**, maximum **16.8 ms**. Jde o krátkou diagnostiku, nikoli izolovaný GPU benchmark či dlouhý soak.

[Hraná fixture a úplný původ](../../tests/fixtures/mobilization/README.md), aktivní export, checkpoint a export mezi vlnami zachovány. Úklid `evidence/sp-009k2/cleanup.json` eviduje odstraněné timeoutové mezivýstupy a duplicity; malé failure logy zůstaly pro dohledání příčiny. Trace/video nevznikaly. Disk po úklidu přibližně12 GiB volných. Ruční migrace není třeba.

**Lidské přijetí čeká:** z domácího upozornění najít ohrožené město; z přehledu vysvětlit rozdíl původní rezervy, civilního účtu a nového městského zisku; ubránit výpad, během obnovy navázat mírové jednání; po načtení rozpoznat pokračující poškození a poslechnout palbu věže. Automatické kontroly nenahrazují porozumění či poslech člověka.

K2 samo neuzavírá celé B, SP-007.B2 ani goal. Zbývají celé vojenské/konverzní průchody, konečné ověření terénních rolí, C–E, části A/SP-017 a závěrečná souvislá nová kampaň.
