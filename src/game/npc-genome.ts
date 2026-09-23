import { SPECIES, speciesById } from './content';
import { cloneGenome, computeStats, has, initialGenome } from './genome';
import { upgradeCreatureGenome } from './creature-body';
import { creatureCapabilities } from './creature-capabilities';
import { prepareInstalledCreatureAnatomy } from './creature-anatomy';
import { organismGroundClearance } from './anatomy';
import { bodyCollisionRadius } from './body-shape';
import { newCreation, validateCreation, type CreatureCreation } from './creature-library';
import { distance } from './random';
import type { Creature, Vec3, FoodKind, Genome, Species, World } from './types';

export interface NpcDesign { species: string; source: 'library' | 'generated'; creation: CreatureCreation }
export interface GenomeSpecies extends Species { genome?: Genome; creationId?: string; libraryOrigin?: boolean; damage?: number; armor?: number; maxHealth?: number; clearance?: number; radius?: number }
export function landEligible(g: Genome): boolean {
  return has(g, 'lungs') && (g.version === 2 ? creatureCapabilities(g).walk.enabled : has(g, 'legs')) && computeStats(g).diet.length > 0;
}
export function compatibleCreature(g: Genome, species: Species): boolean {
  if (!landEligible(g)) return false;
  const diet = computeStats(g).diet;
  if (species.role === 'predator') return has(g, 'jaw') && diet.includes('meat');
  if (species.role === 'partner') return species.diet.every(food => diet.includes(food));
  return !diet.includes('meat') && species.diet.every(food => diet.includes(food));
}
/** Uses the same upgrade and organs as the editor, with bounded deterministic variation. */
export function generatedNpcGenome(species: Species, seed: number): Genome {
  const g = initialGenome(); g.name = species.name; g.hue = ((seed >>> 0) % 360 + SPECIES.indexOf(species) * 53) % 360;
  g.length = .9 + (seed % 5) * .04;
  g.parts = [
    { id: 'mouth', kind: species.role === 'predator' ? 'jaw' : 'filter', axial: .9, angle: 0, scale: 1, mirrored: false },
    { id: 'legs', kind: 'legs', axial: -.2, angle: Math.PI / 2, scale: 1, mirrored: true },
    { id: 'lungs', kind: 'lungs', axial: 0, angle: 0, scale: 1, mirrored: false },
    { id: 'eyes', kind: 'eyes', axial: .7, angle: 1, scale: 1, mirrored: true },
    { id: 'shell', kind: 'shell', axial: 0, angle: 0, scale: .7, mirrored: false },
  ];
  if (species.role !== 'predator') g.parts.push({ id: 'nectar', kind: 'proboscis', axial: .8, angle: -.5, scale: .7, mirrored: false });
  const body = upgradeCreatureGenome(g); body.pattern = seed % 4;
  if (species.role === 'predator' || species.role === 'invasive') {
    const rear = body.parts.find(p=>p.kind==='legs')!; rear.axial=-.45;
    body.parts.push({...structuredClone(rear),id:'front-legs',axial:.4});
  }
  if (species.role === 'partner') {
    body.parts.push({id:'antenna',kind:'antenna',axial:.6,angle:1,scale:.8,mirrored:true});
    body.body.skin.finish='pebbled';
  }
  return body;
}
/** Prefer distinct library entries before reusing one; never mutate the library. */
export function buildNpcDesigns(entries: CreatureCreation[], seed: number): NpcDesign[] {
  const ordered = [...entries].sort((a, b) => a.id.localeCompare(b.id));
  ordered.forEach(validateCreation);
  const used = new Set<string>();
  return ['bell', 'gnaw', 'gloom', 'crest'].map((id, index) => {
    const spec = speciesById(id), candidates = ordered.filter(c => compatibleCreature(c.genome, spec));
    const fresh = candidates.filter(c => !used.has(c.id)), pool = fresh.length ? fresh : candidates;
    const creation = pool.length ? pool[((seed >>> 0) + index) % pool.length] : newCreation(generatedNpcGenome(spec, (seed + index) >>> 0), 'Původní obyvatel krajiny', `wild-${seed >>> 0}-${id}`, 0);
    used.add(creation.id);
    return { species: id, source: pool.length ? 'library' : 'generated', creation: structuredClone(creation) };
  });
}
export function validateNpcDesigns(value: unknown): asserts value is NpcDesign[] {
  if (!Array.isArray(value) || value.length !== 4) throw new Error('Neplatný katalog obyvatel.');
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Object.keys(item).length !== 3 || !Object.hasOwn(item, 'creation') || !['bell', 'gnaw', 'gloom', 'crest'].includes(item.species) || !['library', 'generated'].includes(item.source) || ids.has(item.species)) throw new Error('Neplatný druh v katalogu obyvatel.');
    ids.add(item.species); validateCreation(item.creation);
    if (!compatibleCreature(item.creation.genome, speciesById(item.species))) throw new Error('Tělo neodpovídá ekologické roli.');
  }
}
const cache = new WeakMap<NpcDesign, GenomeSpecies>();
export function worldSpecies(world: World, id: string): GenomeSpecies {
  const base = speciesById(id), design = world.creatureDesigns?.find(d => d.species === id);
  if (!design) return base;
  const previous = cache.get(design); if (previous) return previous;
  const genome = cloneGenome(design.creation.genome), anatomy = genome.version === 2 ? prepareInstalledCreatureAnatomy(genome) : undefined;
  const stats = computeStats(genome, anatomy), caps = genome.version === 2 ? creatureCapabilities(genome, anatomy, stats) : null;
  const spec: GenomeSpecies = { ...base, genome, name: genome.name, description: design.creation.description, creationId: design.creation.id, libraryOrigin: design.source === 'library',
    size: 1, speed: caps?.walk.speed ?? stats.speed * stats.walk, diet: stats.diet as FoodKind[], damage: has(genome, 'jaw') ? stats.damage : has(genome, 'arms') ? 12 : 7,
    armor: stats.armor, maxHealth: Math.round(stats.maxHealth * .4), clearance: organismGroundClearance(genome), radius: bodyCollisionRadius(genome,2) };
  cache.set(design, spec); return spec;
}

/** Land NPCs forage down to their own ground contact, even with very long legs.
 * Aquatic and historical populations keep the original centre-distance rule. */
export function npcFoodDistance(world: World, creature: Creature, food: Vec3): number {
  const spec = worldSpecies(world, creature.species);
  if (!spec.genome || world.stage !== 2) return distance(creature.pos, food);
  return Math.hypot(creature.pos.x-food.x, creature.pos.z-food.z, Math.max(0,Math.abs(creature.pos.y-food.y)-(spec.clearance??0)));
}
export function canPopulateLand(genome: Genome) {
  return ['bell','gnaw','gloom','crest'].some(id=>compatibleCreature(genome,speciesById(id)));
}
