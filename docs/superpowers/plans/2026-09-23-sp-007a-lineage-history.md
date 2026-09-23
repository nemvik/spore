# SP-007.A — smlouva a záznam výsledků linie

23. září 2026. Výchozí pracovní strom čistý. Podklady: BRIEF, ROADMAP a reporty SP-003–006; pnpm/Vite/TypeScript, save v3 s volitelnými verzovanými rozšířeními.

## Přesný rozsah a kritéria

- [x] Volitelný `lineageHistory.version = 1`, jeden záznam na etapu; původ a rozsah pozorování oddělené od výsledku. Skutečně snědené druhy potravy a lov, výsledky hnízd, sousedů a obsazených regionů. Terraformace zachytí doložené dokončení; není to vesmírná filozofie.
- [x] Nová UI linie sleduje činy od narození. Staré UI savey začnou částečné pozorování, zachovají explicitní staré výsledky, nevytvářejí chybějící počty ani dietu z těla. Samotný parser nepřepíná historické simulace.
- [x] Uzavření etapy zmrazí záznam. Save/load a návrat ke checkpointu obnovují svět i historii společně; nesčítají větve po smrti. Editor/generace pokračují ve stejném záznamu. Žádná nová jednorázová měna/odměna.
- [x] Doložený nově dokončený výsledek tvora dá kmeni +15 % diplomacie, +15 % poškození sousedů nebo +7,5 % obojího. Všechny cesty zůstávají dostupné, ceny/dary a stávající schopnost finále se nemění. Neznámá/stará dokončená historie má neutrální nový bonus.
- [x] Deník a kmen srozumitelně vysvětlí činy → dědictví → účinek, včetně neznámých dat a obnovy checkpointu.
- [x] Přímé regrese akcí, zmrazení, obnovy, migrace/validace a účinku; historické fixtures, SP-004 objevy, SP-005 knihovna/NPC, SP-006 růst beze změny významu.
- [x] Dvě rozdílné cesty přes normální produkční UI ze stejného připraveného těla/souše, záznam jídla a skutečný účinek v kmeni. Žádné zápisy do živého stavu/časové hooky; připravené podmínky výslovně odlišené od odehraných akcí. Skill smoke a prohlédnutí snímků.
- [x] Testy, typecheck, build, vlastní i nezávislé review datové kompatibility, úklid vlastních artefaktů, report/roadmapa. Následuje uživatelem požadovaný commit/push; SHA a výsledek vzdáleného odevzdání uvádí závěrečná odpověď a Git.

## Pořadí práce

1. Smlouva + pozorování a uzavírání skutečných výsledků, UI zapnutí u nových/starých linií.
2. Striktní validace včetně checkpointů; přímé regrese.
3. Odvozený účinek v kmeni a společný přehled dědictví.
4. Produkční browser průchody, nezávislé review, opravy, celá sada, dokumentace a úklid.

## Zjištění z průzkumu a hranice

SP-003 už mapuje výsledek hnízd na finale a kmenovou schopnost. Tuto kompatibilní mapu zachováme. Kmen ukládá `allied/conquered`, stroje `region.method` podle existujícího archetypu (nejde o nově nezávisle volenou civilizační strategii). Planeta má lokální T3/stabilní dokončení. Obnova dnes vrací celý checkpoint; historie bude mít shodnou časovou osu, ne samostatnou nevratnou větev.

Navazující **SP-007.B1 — následky řešení kmenů**, **SP-007.B2 — civilizační expanze a její následky**, **SP-007.D — vesmírná filozofie říše** zůstávají otevřené. SP-007 jako celek nebude označena za hotovou. Lidská zábavnost/rovnováha, celá nová kampaň, Safari a mobil nejsou tímto strojovým ověřením doložené.

## Ověřený výsledek

[Report](../../spore/SP-007A-REPORT.md) a [smlouva](../../spore/SP-007A-CONTRACT.md): 24 nových regresí, celá sada 120 souborů / 2 291 testů, typecheck/build/diff-check. Dvě historie stejného připraveného těla vedou přes skutečné UI k diplomacii 0,5175 versus 0,45/s a zásahu 5 versus 5,75. Nová buňka bez fixture: 7/7, 32 jídel (10 řas, 21 detritu, 1 masa), 1 lov, 5 generací. Finální malé UI a historický save: 3/3.

Nezávislé review opravilo a následně ověřilo dva nálezy validace (checkpoint/provenance a součty), závěr bez otevřených nálezů. Obnova znamená původní rollback světa i historie, nikoli nevratnou historii všech zemřelých pokusů. Jídelníček zatím nemá samostatný bonus. B1/B2/D, lidský playtest, Safari/mobil a kompletní šestietapová kampaň zůstávají mimo A.
