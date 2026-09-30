# SP-007.B2 · skutečné dokončení a dědictví civilizace

Navazuje na audit aktuálního kódu a obchodní spojení J. Tento plán neuzavírá chybějící prostorovou obranu ani opakovatelné armády SP-009. Cílem je odstranit nynější obejití celé civilizace po třech domácích regionech a navázat skutečné městské volby na další hru.

## Datová smlouva

Samostatný volitelný `civilization.version=1`, původ přístupu `required|legacy-stage5`, dokončení `null` nebo neměnný snímek skutečného přechodu: tick/tah/generace, přesný seřazený seznam měst s prefixem E capture a F–J transferů, snapshot jednoho doloženě fungujícího hospodářství. Žádné druhé kopie transakcí ani uložené čítače bonusů. Stávající uzavřená `lineageHistory.stages[4]` se nepřepisuje.

Fakta se odvozují z původních dokladů: založení, původní E převzetí, každé další skutečné hráčské převzetí a ztráta. E nemá čas převzetí; ten se označí neznámý. F–J mají skutečný strategický tah. Zámořský původ se smí označit jen se skutečnou předcházející plavbou, nikoli podle polohy nebo migračního času. Před dokončením jde o živý deník, po něm o neměnný řez; pozdější hra jej nezvětšuje.

## Jediná brána pro UI i simulaci

`civilizationReadiness` musí vysvětlit každou nesplněnou podmínku: dokončené původní regiony, živá linie a vlastní vozidlo, aktivovaní soupeři se skutečně doloženým založením alespoň jednoho města každým státem, žádné město vlastněné státem, alespoň jedno vlastní provozuschopné město s obydlím/pěstírnou/dílnou, občany a skutečným placeným cyklem s výrobou i příjmem. Získané město se počítá stejně jako vlastní založení.

Před přechodem být doma a vypořádat všechny vojenské/navázané námořní/obchodní závazky. Prázdný registr není sjednocení, čekající aktivace není porážka. Tlačítko i klávesa G používají stejný výsledek. Přechod, dokončení a checkpoint vzniknou společně.

Historické savey před etapou 5 dostanou prázdnou povinnou větev v live i checkpointu. Již dosažená etapa 5 si zachová přístup včetně lokální T3 a sandboxu, ale bez smyšleného sjednocení a bez B2 bonusu. Samotné parsování původní data nemění. Obnova bez checkpointu zachová povinná pravidla, nevytvoří historickou výjimku.

## První skuteční spotřebitelé B2

- Vojenská cesta: +20 % účinku aktivního terraformovacího nástroje.
- Obchodní cesta: −20 % spotřeby jantaru tohoto nástroje.
- Konverzní cesta: +20 % pouze kladné obnovy životaschopnosti v příhodném klimatu s potravou.

Smíšená historie rozdělí pevný 20% rozpočet mezi všechny doložené metody. Opakované získání nezvyšuje násobek; vojenský čin pozdější obchod nevymaže. Založení a ztráty jsou skutečná fakta, ne automatická odměna. Žádné snížení ekologických požadavků, výroba peněz ani doplnění zdraví. Další vesmírný spotřebitel musí používat stejnou odvozenou smlouvu.

## Ověřitelné výsledky

Cílené regrese prázdných/nezaložených států, tří čistých a smíšené historie, ztráty/opětovného získání, přesných prefixů checkpointu, zpětných změn hospodářství, efektů jen ve správné etapě a neutrálního historického stage5. Hraný J průchod už poskytne skutečný obchodní městský vstup; v jeho UI se rozvine fungující město a projde nová brána. Samostatné vojenské/konverzní pokračování a finální souvislá nová kampaň zůstávají nutné. Typecheck/build, relevantní regrese, nezávislé review, prohlédnuté snímky a kompaktní report/tracker bez změny přijatých kritérií.
