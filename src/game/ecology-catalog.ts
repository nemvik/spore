import { SPECIES } from './content';
import { SITE_STORIES } from './journey-content';
import type { EcologyContact, EcologyLedger, EcologySite } from './journey-types';
import type { WorldStage } from './stage';
import type { FoodKind, GameState } from './types';

export interface EcologyTaxon {
  key: string;
  name: string;
  role: 'producer' | 'herbivore' | 'predator' | 'partner';
  stage: WorldStage;
  /** The culture's resource kind, or one real compatible meal for an animal. */
  food: FoodKind;
  species: string | null;
  site: number | null;
}

// These are the nine living mothers, not arbitrary mineral/detritus resources.
const CULTURE_NAMES = [
  'Světelná mateřská řasa', 'Živá minerální kolonie', 'Soumraková kultura',
  'Korálový nektarový porost', 'Plovoucí řasová stuha', 'Živý filtr průduchů',
  'Nektarové pobřežní kořeny', 'Řasové terasové kořeny', 'Spórová kultura posledního deště',
] as const;

export const ECOLOGY_CATALOG: readonly EcologyTaxon[] = [
  ...SITE_STORIES.map((story, site): EcologyTaxon => ({
    key: `culture:${site}`, name: CULTURE_NAMES[site], role: 'producer',
    stage: Math.floor(site / 3) as WorldStage, food: story.kind, species: null, site,
  })),
  ...SPECIES.map((species): EcologyTaxon => ({
    key: `species:${species.id}`, name: species.name,
    role: species.role === 'grazer' || species.role === 'invasive' ? 'herbivore' : species.role,
    stage: species.stage as WorldStage, food: species.diet[0], species: species.id, site: null,
  })),
];

export function ecologyTaxon(key: string): EcologyTaxon | null {
  return ECOLOGY_CATALOG.find(taxon => taxon.key === key) ?? null;
}

function addContact(ledger: EcologyLedger, key: string, method: EcologyContact['method'], stage: WorldStage, patch: EcologyContact['patch']): boolean {
  const taxon = ecologyTaxon(key);
  if (ledger.version !== 1 || !taxon || taxon.stage !== stage
    || patch !== null && patch !== 0 && patch !== 1 && patch !== 2
    || !(['culture', 'feeding', 'hunt', 'bond'] as const).includes(method)
    || (method === 'culture') !== (taxon.role === 'producer')
    || method === 'bond' && taxon.role !== 'partner'
    || taxon.site !== null && patch !== null && patch !== taxon.site % 3
    || ledger.contacts.some(contact => contact.key === key)) return false;
  ledger.contacts.push({ key, stage, patch, method });
  return true;
}

/** Hooks call this only after success; old simulations without a ledger are inert. */
export function recordEcologyContact(s: GameState, key: string, method: EcologyContact['method'], stage: WorldStage, patch: EcologyContact['patch']): boolean {
  return s.journey.ecology ? addContact(s.journey.ecology, key, method, stage, patch) : false;
}

/** Conservative historical inference. Nothing is written into the imported state. */
export function inheritEcologyContacts(s: GameState): EcologyLedger {
  const ledger: EcologyLedger = { version: 1, contacts: [] };
  // An explicit recorded origin wins over a less precise historical inference.
  for (const contact of s.journey.ecology?.contacts ?? []) {
    addContact(ledger, contact.key, contact.method, contact.stage, contact.patch);
  }
  const sites = s.journey.sites.filter(site => {
    const taxon = ecologyTaxon(`culture:${site.id}`);
    return taxon && taxon.stage === site.stage && site.patch === site.id % 3 && !!s.worlds[taxon.stage];
  });
  const culture = (site: EcologySite) => addContact(ledger, `culture:${site.id}`, 'culture', site.stage as WorldStage, site.patch as 0 | 1 | 2);
  const feeding = (site: EcologySite, species: string) => addContact(ledger, `species:${species}`, 'feeding', site.stage as WorldStage, site.patch as 0 | 1 | 2);

  for (const site of sites) {
    const taxon = ecologyTaxon(`culture:${site.id}`)!;
    const world = s.worlds[taxon.stage]!;
    const cargo = s.journey.cargo;
    if (s.journey.insights.includes(`carry:${site.id}`)
      || site.plantedId !== null && world.resources.some(r => r.id === site.plantedId && r.kind === taxon.food)
      || cargo?.purpose === 'culture' && cargo.site === site.id && cargo.kind === taxon.food) culture(site);

    if (!site.resolved) continue;
    if (site.method === 'cultivate' && site.id === 0) feeding(site, 'veil');
    if (site.method === 'cultivate' && site.id === 3) feeding(site, 'sail');
    // Earlier reef rules resolved this site at planting, without an animal meal.
    if (site.method === 'cultivate' && site.id === 4 && s.journey.version === 3
      && s.journey.canopy && s.journey.canopy.releasedAt !== null) feeding(site, 'sail');
    if (site.method === 'guide' && (site.id === 6 || site.id === 7)) feeding(site, 'bell');
    if ((site.method === 'guide' || site.method === 'cultivate') && site.id === 8 && site.phase >= 5) feeding(site, 'gloom');
  }

  for (const taxon of ECOLOGY_CATALOG) {
    if (taxon.species === null || !s.worlds[taxon.stage]) continue;
    if (s.journey.insights.includes(`hunt:${taxon.species}`)) addContact(ledger, taxon.key, 'hunt', taxon.stage, null);
    if (s.player.bonds.some(bond => bond.species === taxon.species)) addContact(ledger, taxon.key, 'bond', taxon.stage, null);
  }

  // A surviving transported fragment records a real meal from a planted mother.
  const coast = s.worlds[2];
  if (coast) {
    for (const fragment of s.journey.rootDispersal?.carried ?? []) {
      const site = sites.find(site => site.id === fragment.site && (site.id === 6 || site.id === 7));
      if (site && coast.creatures.some(c => c.id === fragment.carrierId && c.species === 'gnaw' && c.health > 0)) feeding(site, 'gnaw');
    }
    for (const root of s.journey.rootDispersal?.roots ?? []) {
      const site = sites.find(site => site.id === root.site && (site.id === 6 || site.id === 7));
      if (site && coast.resources.some(r => r.id === root.resourceId && r.kind === SITE_STORIES[site.id].kind)) feeding(site, 'gnaw');
    }
  }
  return ledger;
}

/** A naturally occurring meal is not a relationship with the player's lineage. */
export function recordEcologyMeal(s: GameState, creature: import('./types').Creature, resource: import('./types').Resource): boolean {
  if (!s.journey.ecology) return false;
  const playerPlant = s.journey.sites.some(site => site.stage === s.world.stage && site.plantedId === resource.id);
  const offering = s.journey.offerings.some(item => item.stage === s.world.stage && item.id === resource.id && item.remaining > 0);
  const root = s.world.stage === 2 && s.journey.rootDispersal?.roots.some(item => item.resourceId === resource.id);
  if (!playerPlant && !offering && !root) return false;
  const taxon = ecologyTaxon(`species:${creature.species}`);
  return !!taxon && recordEcologyContact(s, taxon.key, 'feeding', taxon.stage, creature.patch as 0 | 1 | 2);
}
