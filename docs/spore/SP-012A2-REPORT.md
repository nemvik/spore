# C3a2 · živé pásy, potrava a odnože

**Stav: hratelný řez A2 doložený včetně nativního návratu.** Tento průběžný report není přijetí celého SP-012. Navazuje na [A1](SP-012A1-REPORT.md) a [smlouvu C3](../superpowers/plans/2026-09-26-foreign-terraforming.md).

## Změna a ověřené dílčí výsledky

- Explicitní biosférav2 uvnitř expedicev2 přidává ekologický čas; parser zachovává původní C2/A1 větve. Aktivace se týká live i vlastního staršího checkpointu a nehojí ani nenahrazuje uložený život.
- Skutečné rostliny vytvářejí biomasu. Býložravci ji spotřebovávají podle uloženého genomu; predátor spotřebovává zdraví skutečné kořisti. Nouzový detritus nepředstírá lov. Hlad a nevhodné klima mohou organismy zabít.
- Odnož potřebuje skutečného živého rodiče, jeho0,2 výživy a5 zdraví,40/60 sekund vhodných podmínek. Každé narození znovu ověří limit3 stejné role/pásu a96 obyvatel, dítě má samostatné ID, původní model, rodiště a rodokmenový údaj. Sken dítě nevytvoří ani jej zdarma nenaučí skener.
- Trvalá zakladatelská úmrtí a čítače každého původu/role drží bilanci `6 + narození − úmrtí = živí včetně nákladu`. Posledních128 společných akcí doplňují neměnné kumulativní platby; minulá úmrtí potomků nemají neomezený seznam. Nepoužívané skeny mrtvých potomků odrolují až mimo všechny živé a zachované akční reference.
- Stabilita potřebuje10 souvislých sekund vhodného klimatu, všech rolí, zdraví/výživy a skutečných potravních vazeb. Kapacita počítá souvislé pásy1→3. Bez stabilního pásu se klima pomalu vrací k původnímu, nejvýše0,0004 osy/s se záznamem driftu. Neaktivní světy a náklad stojí; OFF nevypíná život.
- Kompaktní panel ukazuje zdraví/výživu, důvody nestability, čas, kapacitu a poslední narození/úmrtí. Biomasu je vidět na rostlinách, skutečné krmení má jemnou animaci a stres barvu. Události spouštějí existující zvuky; lidský poslech není automaticky přijatý. Výsadba hledá oddělené místo v dosahu6; zaplněná plocha nebo výška vyžaduje běžný posun/snížení lodi.

Unitová desetiminutová simulace zdroje skončila54 živými jedinci,18 narozeními a0 úmrtími, všechny3 pásy stabilní. Jde o připravený unitový svět, nikoli důkaz dosažitelnosti v kampani. Veřejné ukládání/import/checkpointy jsou ověřené také nad skutečnými staršími exporty.

První agregát měl316/316 úspěšných testů, další dvě regrese výsadby prošly samostatně. Tři prezentační případy prošly: změna skutečné biomasy bez výměny modelu/GPU prostředků, přesná viditelnost narození/úmrtí a uvolnění modelu, rozdíl klimatického T a stability. Celá sada následně prošla: **175 souborů /4055 testů za163,11s**, bez timeoutů, vynechání nebo opakování, threads1. Log `evidence/sp-012a2/verification/full-suite.log`. Typecheck/build prošly: `index--jf2sERE.js` / `index-CzZ2axZP.css`,217 modulů. Známé upozornění na velikost chunku zůstává. Následná úzká oprava zakázala biologické události bez skutečného ekologického času, i když běžel čas na orbitě. Po ní prošlo34/34 ekologických případů a typecheck; předchozí celá sada se nevydává za znovu spuštěnou. Finální build `index-D-ccO9Eg.js` / `index-CzZ2axZP.css` prošel, log `build-final.log`.

Nezávislé review našlo a následné negativní testy ověřily opravy: staré platby nelze utratit za nový odrolovaný suffix, odběr musí následovat po skenu i při stejném timestampu, samotný přenos/orbitální čas nehojí tělo, mrtvý potomek se nemůže vrátit místo živého po odrolování historie. Review uzavřeno bez dalšího konkrétního nálezu. Omezená historie není tvrzením úplné rekonstrukce veškeré genealogie bez checkpointu; fyzická bilance, identita a dostupné doklady mají přesné meze.

## Skutečně odehraný okruh

Vstup byl přesný [A1 export](../../evidence/sp-012a1/browser/active-campaign.save.json), SHA `c9ceea1f68c9c5d0392ee202be04046ac9792b077fbe781b468df56f345d0009`. Native produkce používala `index-D-ccO9Eg.js` / `index-CzZ2axZP.css`; původní platba vlastní lodi a genomové modely zůstaly stejné. Běžný veřejný import aktivoval ekologii v live i starším checkpointu bez přepsání života.

1. Stejný exemplář #11 se vrátil do druhého pásu zdroje. Zdroj vytvořil 18 skutečných potomků a dosáhl 54 jedinců se třemi stabilními pásy. Export/import změnil jen identitu kampaně a zachoval uložený stav.
2. Tři zásilky po osmi skutečných jedincích osídlily všechny pásy dříve horké planety. Každá obsahovala tři velikosti rostlin, oba býložravce s rezervou a predátora. Zdrojové role po odběru zůstaly živé. Horký svět sám dosáhl 54 jedinců a prošel 30 souvislými sekundami stability s nástroji OFF.
3. Horký svět se stal skutečným zdrojem dalších tří zásilek na dříve chladný svět. Přenášení potomci mají trvalý původ druhu na zdroji a doložené narození na horké planetě. Chladný svět rovněž dosáhl 54 jedinců, všech 18 rolí a 30 souvislých sekund stability OFF. Veřejný export/import/rekey prošel na obou cílech.
4. Následovaly čtyři párové přechody povrch/orbita, opětovná návštěva horkého světa i zdroje a návrat do domácí dílny. Neaktivní světy a náklad čekaly ve stázi; domácí stav zůstal během letů přesně zmrazený. Běžné domácí kroky před odletem a po přistání se neoznačují za stasis.

Souhrn: **6 kontrolních skupin, 78 letových kroků, 97 fyzických přenosů, 48 skenů, 116 narození a 0 úmrtí, 0 browser chyb; úspěšné pokračování skončilo exit0 a zavřelo browser.** Finálně zdroj 49 / horký 49 / chladný 54 živých, všechny tři světy se stabilní kapacitou 3. Nižší konečný počet zdroje a horkého světa odpovídá posledním skutečným odběrům a postupnému doplňování, ne ztrátám.

První pokus skončil chybou čekací podmínky driveru: právě narozený predátor resetoval stabilitu mezi odečtem stavu a textu UI. Export `failure-campaign.save.json` zůstal přesný; pokračování jej veřejně importovalo a před měřením počkalo na doplnění populace a souvislou stabilitu. Původní chybný běh není vydávaný za zelený. Chyba, stack, akce i kompaktní diagnostika jsou zachované; duplicitní celý diagnostický stav nahradil odkaz na skutečný recovery export.

Aktivní kampaň: [active-campaign.save.json](../../evidence/sp-012a2/continuation/active-campaign.save.json), SHA `5745841b9804cf2e6871e096e8df215cab66fc6ba8ac34ebaa7866fb1006c175`. Kompletní výsledek a stručné review jsou v `evidence/sp-012a2/continuation/`. Nativní driver neměnil živý stav, neurychloval čas, nepřidával organismy ani prostředky.

## Vizuál, výkon a meze

Hlavní vlákno i nezávislý agent prohlédly čtyři snímky 1024×640: zdroj, horký svět, chladný svět a domácí návrat. V posunutém panelu jsou čitelné všechny tři pásy, šest rolí a čas stability. Mapa ani ovládání se nepřekrývají. Při nízké přepravní výšce částečně zakrývají loď blízké rostliny; snímky nejsou současným zobrazením celého dlouhého klimatického panelu.

Reprezentativní scéna s 54 organismy: **90 RAF, p95 i maximum 16,8 ms**, 2 075 draw calls / 536 106 trojúhelníků, lokální headless Chrome. Čtyři párové cykly vracejí `212 → 1201–1204 → 212` geometrií, 0 textur / 21 programů; každý návrat má rozdíl 0. První pohled po importu evidoval 2 261 geometrií a jinou viditelnost scény, proto jej neporovnáváme jako totožný pohled s pozdějšími cykly. Nejde o dlouhý soak ani obecný příslib výkonu na jiném hardwaru.

Native doložil zdravou ekologii a narození. Úmrtí hladem/klimatem, ztráta biomasy, nulová kapacita a odstranění modelu mají cílené simulované regrese. Následující C3b doplní viditelný hospodářský následek skutečného odebrání/obnovení potřebné role.

Úklid: [manifest](../../evidence/sp-012a2/artifact-cleanup.json), právě 4 milestone PNG, skutečné exporty, malá failure/success diagnostika a výsledkové logy. Žádné trace/video/screencast snímky; odstraněn vlastní prázdný dočasný typecheck log. Při kontrole po běhu bylo 18,42 GiB volných, cizí data zůstala nedotčená.

## Čekající lidské přijetí a návaznost

- Bez nápovědy vysvětlit rozdíl mezi T3, obsazenou rolí a stabilním pásem a najít důvod krátkého poklesu po porodu.
- Při letu a odběru posoudit čitelnost lodi mezi porosty, práci kamery a množství posouvání panelů.
- Poslechem ověřit příjemnost a rozlišitelnost narození, újmy, skenu a přenosu. Automatické testy lidský poslech nenahrazují.

Následují [kolonie a návratný obchod C3b](../superpowers/plans/2026-09-26-space-colonies.md). Celý SP-012 čeká na vazbu na skutečné osídlení/kolonie; D–E, nová souvislá kampaň od narození a lidské přijetí jsou otevřené. Bez commitu/pushe/deploye.
