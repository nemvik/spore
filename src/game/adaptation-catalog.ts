import { GENOME_ERRORS } from './errors.cs';
import type { Adaptation, AdaptationId, Stage } from './types';

/** Historical v1 catalogue. Its order, values, and 21 entries are part of the save contract. */
export const ADAPTATIONS: readonly Adaptation[] = [
  { id: 'flagellum', name: 'Vlnivý bičík', category: 'movement', description: 'Pružný pohon pro rychlé plavání a rozjezd.', tradeoff: 'Vyšší spotřeba energie za rychlost.', cost: 10, stage: 0, max: 3 },
  { id: 'fins', name: 'Vějířové ploutve', category: 'movement', description: 'Přesné zatáčení, stoupání a plavání v proudu.', tradeoff: 'Přidávají hmotnost a spotřebu.', cost: 16, stage: 1, max: 3 },
  { id: 'tail', name: 'Kýlový ocas', category: 'movement', description: 'Silný trvalý pohon ve vodě.', tradeoff: 'Ve vodě vyšší rychlost, ale větší poloměr zatáčení. Na souši zůstává jen hmotnost.', cost: 20, stage: 1, max: 1 },
  { id: 'legs', name: 'Pružné končetiny', category: 'movement', description: 'Umožní chůzi a nesou tělo na souši.', tradeoff: 'Ve vodě přidávají odpor; souš také vyžaduje plíce.', cost: 24, stage: 1, max: 3 },
  { id: 'jet', name: 'Pulzní vak', category: 'movement', description: 'Zesiluje vodní sprint a zrychlení.', tradeoff: 'Drahý, energeticky náročný pohon.', cost: 24, stage: 1, max: 1 },
  { id: 'filter', name: 'Filtrační věnec', category: 'feeding', description: 'Zpracuje řasy, detrit a minerální živiny.', tradeoff: 'Nelze kombinovat s dravou čelistí.', cost: 12, stage: 0, max: 1 },
  { id: 'jaw', name: 'Srpková čelist', category: 'feeding', description: 'Loví tvory a tráví maso i detrit.', tradeoff: 'Ztrácí trávení řas; nelze kombinovat s filtrem.', cost: 18, stage: 0, max: 1 },
  { id: 'proboscis', name: 'Nektarová sosna', category: 'feeding', description: 'Otevírá přístup k nektaru bez lovu.', tradeoff: 'Lehce zvyšuje spotřebu a hmotnost.', cost: 14, stage: 0, max: 1 },
  { id: 'eyes', name: 'Čočkové oči', category: 'senses', description: 'Odhalí vzdálenější tvory a zdroje.', tradeoff: 'Citlivá tkáň potřebuje energii.', cost: 12, stage: 0, max: 2 },
  { id: 'antenna', name: 'Chemická tykadla', category: 'senses', description: 'Zlepší dosah vnímání a stopování živin.', tradeoff: 'Mírná metabolická režie.', cost: 12, stage: 0, max: 2 },
  { id: 'sonar', name: 'Ozvěnová koruna', category: 'senses', description: 'Pulz odhaluje život i ve tmě a za úkryty.', tradeoff: 'Aktivní pulz stojí energii.', cost: 24, stage: 1, max: 1 },
  { id: 'shell', name: 'Mozaikový krunýř', category: 'defense', description: 'Tlumení zásahů a větší zásoba zdraví.', tradeoff: 'Hmotnost snižuje rychlost i obratnost.', cost: 18, stage: 0, max: 2 },
  { id: 'spines', name: 'Pružné ostny', category: 'defense', description: 'Odrazují lovce a zraňují při kontaktu.', tradeoff: 'Přidávají odpor a náklady na údržbu.', cost: 14, stage: 0, max: 3 },
  { id: 'toxin', name: 'Hořké žlázy', category: 'defense', description: 'Obranný pulz odežene blízké predátory.', tradeoff: 'Pulz spotřebuje energii; žlázy mají stálou režii.', cost: 20, stage: 0, max: 1 },
  { id: 'gills', name: 'Korálové žábry', category: 'metabolism', description: 'Zvyšují zásobu kyslíku a účinnost plavání.', tradeoff: 'V čisté vodě doplňují dech, ale také vstřebávají plyn průduchů. Na souši nenahrazují plíce.', cost: 16, stage: 1, max: 2 },
  { id: 'lungs', name: 'Vzdušné komory', category: 'metabolism', description: 'Umožní dýchat mimo vodu.', tradeoff: 'Na souši potřebují končetiny a dostatek vláhy.', cost: 24, stage: 1, max: 1 },
  { id: 'bladder', name: 'Vztlaková perla', category: 'metabolism', description: 'Zlepšuje stoupání a vznášení v hloubce.', tradeoff: 'Zvětšuje tělo a jeho hmotnost.', cost: 16, stage: 1, max: 1 },
  { id: 'reservoir', name: 'Rosný zásobník', category: 'metabolism', description: 'Uchová více vody pro delší výpravy po souši.', tradeoff: 'Plný zásobník zatěžuje tělo.', cost: 22, stage: 1, max: 2 },
  { id: 'chloroplast', name: 'Světelné lístky', category: 'symbiosis', description: 'Získávají energii ze světla a snižují hlad.', tradeoff: 'Ve tmě fotosyntéza nepomáhá; zpomalují tělo.', cost: 20, stage: 0, max: 2 },
  { id: 'symbiote', name: 'Partnerské lůžko', category: 'symbiosis', description: 'Umožní navázat vztah s pomocným druhem.', tradeoff: 'Partner potřebuje krmení a část tvé energie.', cost: 18, stage: 0, max: 1 },
  { id: 'recycler', name: 'Recyklační uzel', category: 'symbiosis', description: 'Zpracuje detrit a minerály, účinněji využije živiny.', tradeoff: 'Snižuje obratnost a zatěžuje tělo.', cost: 20, stage: 1, max: 1 },
];

const ARMS: Adaptation = { id: 'arms', name: 'Kloubové paže', category: 'movement', description: 'Umožní gestikulaci a práci rukama.', tradeoff: 'Kloubové údy zvyšují hmotnost a spotřebu.', cost: 18, stage: 2, max: 2 };
export const CREATURE_ADAPTATIONS: readonly Adaptation[] = [...ADAPTATIONS, ARMS];
const creatureMap = new Map(CREATURE_ADAPTATIONS.map(adaptation => [adaptation.id, adaptation]));

export function getAdaptation(id: AdaptationId): Adaptation {
  const adaptation = creatureMap.get(id);
  if (!adaptation) throw new Error(GENOME_ERRORS.unknownAdaptation(String(id)));
  return adaptation;
}

export function adaptationsForGenome(version: 1 | 2, stage: Stage): readonly Adaptation[] {
  const catalogue = version === 1 ? ADAPTATIONS : CREATURE_ADAPTATIONS;
  return catalogue.filter(adaptation => adaptation.stage <= stage);
}
