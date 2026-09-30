# SP-009.K1 · umístitelná městská obrana

Navazuje na J a B2. Cílem první části je skutečná placená obranná stavba v běžném městském UI; následná K2 dodá autonomní budoucí produkci a opakovaně financované soupeřovy jednotky. Původní F stráž, radnice, výpad i jejich doklady zůstávají beze změny. Celá SP-009 se tím neuzavírá.

## Datová smlouva a výsledek

Nový ekonomický typ `tower` používá stejné městské parcely, editor/knihovnu vzhledu, konstrukční účet i prostorové překážky. Ekonomika v4 přidá `ledger.repairs`; pouze tower má uložený stav `{health, cooldown, repaired, builtCycle, maintained}`. `builtCycle` je neměnný cyklus skutečné stavby; `maintained` je číslo posledního zaplaceného provozního cyklu nebo `null`. Platná údržba musí následovat po `builtCycle` a odpovídat současnému hospodářskému cyklu. Ve stejném cyklu nelze oproti checkpointu dodatečně tvrdit zaplacení nové ani dříve neudržované věže.

Cena 40, dosah 24, zdraví 100, placená údržba 1/cyklus, bez nových občanů. Věž je funkční až po skutečně zaplaceném cyklu a pouze při zapnutém provozu. Vyžaduje funkční místní hospodářství s financovaným cyklem, kladným příjmem i výrobou a bez hladu; samotná věž v prázdné ekonomice nestřílí. Oprava stojí 10 a obnoví nejvýše 40 bodů, nesmí proběhnout během místního boje. `repaired` eviduje skutečně zaplacený jantar za opravy dané věže; `ledger.repairs` zahrnuje i zaniklé věže. Rozdíl účtu mezi checkpointy musí pokrýt nové opravy, takže se utracená oprava z demolované věže nepřenese na jinou. Částky mají vlastní kontrolovanou rovnici; žádné léčení staré E/F stráže nebo radnice.

Aktivace v4 je explicitní při vstupu nové UI verze po aktivaci civilizace, v live i checkpointu. Zachová současné finance a cykly, přidá nulu oprav. Historické E/F/G/H/J/B2 snímky ekonomik zůstanou přesně původní v1–v3. Čisté parsování nic neaktivuje. Nové město v aktivované civilizaci otevře v4; staré API bez civilizace zachová původní verzi.

## Boj a čitelnost

Živá zapnutá věž střílí na skutečnou nepřátelskou jednotku v dosahu a bez překážek; rozestavení proto ovlivní krytí. Útočník ji umí cílit a zničit, takže nelze vytvořit neprůstřelný softlock. Věž musí být odstraněná/neutralizovaná před obsazením. Mírové převzetí změní její příslušnost s městem, nedoplní zdraví. Vypnutí či nedostatek údržby potlačí střelbu. Zničená věž zůstane viditelná a je opravovatelná mimo střet nebo odstranitelná. Model/znak, stav zdraví, dosah a záblesk zásahu musí být viditelné. Vzhled nemění dostřel, cenu či sílu.

## Ověření

Cílené ekonomické/prostorové/bojové regrese a poison importy včetně uloženého poškození, opravy, checkpointu a historických snapshotů. Nativní pokračování skutečné E/F kampaně: vydělat cenu, převést peníze, zvolit parcelu, postavit věž, zaplatit cyklus, vidět střelbu proti původnímu placenému výpadu; samostatné rozmístění s jiným krytím. Samostatný vzhled přes existující knihovnu. Produkční build/typecheck, relevantní regrese, nezávislé review, prohlédnuté snímky a úklid. Obnovení armády je K2 a nebude zde vydáváno za hotové.
