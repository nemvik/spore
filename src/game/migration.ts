import type { Creature, GameState, Vec3 } from './types';
import { has } from './genome';
import { distance, horizontalDistance } from './random';
import { lineBlocked } from './interactions';
import { hydrationAt, livingRootStrength } from './climate';
import { hasActivePartner } from './symbiosis';

/** A wild carrier is an ordinary saved creature, never an attached quest token. */
export const migrationActive = (s: GameState) => s.stage === 2 && !s.journey.legacy && !s.campaign.won;
export const wildCarriers = (s: GameState) => s.world.creatures.filter(c => c.species === 'gloom' && c.health > 0);

export function migrationTarget(s: GameState, c: Creature): Vec3 | null {
  if (!migrationActive(s) || c.species !== 'gloom' || c.health <= 0 || s.journey.cargo?.purpose !== 'culture' || s.journey.cargo.site !== 8 || s.journey.cargo.vitality <= 0) return null;
  const d = distance(c.pos, s.player.pos);
  // Scent curls around nearby cover; the distant luminous sample needs a sightline.
  if (d > 26 || d > 10 && lineBlocked(s, c.pos, s.player.pos)) return null;
  return s.player.pos;
}

/** The enticing culture overcomes a distant jaw, but not a threatening close approach. */
export function carrierFearDistance(s: GameState, c: Creature): number {
  const follows = migrationTarget(s, c) !== null;
  const home = migrationActive(s) && c.species === 'gloom' && c.health > 0
    ? s.journey.sites.find(site => site.id === 8) : undefined;
  const pasture = home && livingRootStrength(s, home) > 0
    ? s.world.resources.find(resource => resource.id === home.plantedId) : undefined;
  // Planting hands scent over to a real pasture; caring for a partner continues
  // to soothe the approach. Explicit attack/toxin fear still overrides this in npcStep.
  const approachingHome = pasture && distance(c.pos, pasture.pos) < 30;
  if ((follows || approachingHome) && hasActivePartner(s, 'recycle')) return 0;
  return follows ? 3.5 : 12;
}

export function carrierHealthRate(s: GameState, c: Creature): { health: number; sharesWater: boolean } {
  if (!migrationActive(s) || c.species !== 'gloom') return { health: 0, sharesWater: false };
  const source = s.journey.sites.find(site => site.id === 8)?.source;
  const wet = hydrationAt(s, c.pos) > 1;
  const sharesWater = !wet && distance(c.pos, s.player.pos) < 8 && s.player.moisture > 25
    && has(s.player.genome, 'reservoir') && hasActivePartner(s, 'recycle');
  if (wet || sharesWater) return { health: 2, sharesWater };
  const shade = s.world.obstacles.some(o => o.kind === 'tree' && horizontalDistance(o.pos, c.pos) < o.radius + 3);
  // The southern mother is a moist nursery. Outbound carriers use real wet areas
  // and tree shade; an abandoned animal does not become immune when scent is lost.
  if (shade || source && horizontalDistance(source, c.pos) < 18) return { health: 0, sharesWater: false };
  return { health: -(.25 + .35 * s.campaign.drought), sharesWater: false };
}

export const MIGRATION_COPY = {
  awaken: 'Probudit klidové spory',
  awakenHelp: 'T · mateřský porost uvolní prachokřídlíka. Nesenou kulturu si ponecháš.',
  awakened: 'Z mateřského porostu vyletěl prachokřídlík. Přenáší spory; světlo poslední kultury jej přiláká.',
  planted: 'Domov zakořenil, ale čeká na spory. Divoký prachokřídlík musí dojít k porostu a skutečně se nasytit.',
  arrived: 'Prachokřídlík přenesl spory do nové pastvy. Domov nyní patří i jinému životu.',
  carry: 'Světlo kultury láká divoké prachokřídlíky. Doveď je ke kořenovému kruhu; samotné zasazení nestačí.',
  water: 'Stín zastaví vysychání; živé prameny hojí. Sytý prachokřídlík v lůžku a zásobník sdílejí tvou vodu s blízkým průvodem.',
  danger: 'Sprint ztratí průvod. Čelist zblízka plaší a toxin zraní i nosiče. Maso pro lovce připrav před přenosem.',
  noWild: 'Žádný divoký nosič nezůstal. Vrať se k jižnímu mateřskému porostu: T probudí klidové spory.',
  carriers: (count: number, nearest: number, health: number) => `${count ? `Za kulturou míří ${count}.` : 'Průvod právě ztratil stopu.'} Nejbližší prachokřídlík: ${Math.round(nearest)} m · tělo ${Math.ceil(health / 32 * 100)} %.`,
  needsSupport: 'Spory dorazily. Domov ještě potřebuje dvě živé opory krajiny, nebo dva syté partnery a tělo se zásobníkem.',
};
