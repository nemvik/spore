import { speciesCollisionRadius } from './anatomy';
import { worldSpecies } from './npc-genome';
import { creatureMouths } from './creature-anatomy';
import { queryCreatureBite } from './creature-capabilities';
import type { Creature, FeedSelection, GameState, Vec3 } from './types';
import { computeStats, functionalProfile, has } from './genome';
import { mouthWorldPosition } from './locomotion';
import { distance } from './random';
import { journeyAction } from './journey';
import { jawContacts } from './anatomy';
import { obstacleSegmentEntry } from './obstacle-geometry';
import { SELECTION_COPY } from './selection-copy.cs';

export type InteractionReason = 'ready' | 'distance' | 'above' | 'below' | 'blocked' | 'cooldown' | 'diet' | 'mouth' | 'symbiote' | 'capacity' | 'energy' | 'complete' | 'depleted' | 'ally';
export interface InteractionTarget {
  action: 'feed' | 'bond' | 'tend';
  kind: 'food' | 'prey' | 'partner' | 'spring' | 'culture';
  id: number | string;
  pos: Vec3;
  distance: number;
  range: number;
  ready: boolean;
  reason: InteractionReason;
  label?: string;
  detail?: string;
  /** Unfinished culture work or a carried sample is the player's current intent. */
  priority?: boolean;
  deliberate?: boolean;
}

export function primaryInteraction(targets: (InteractionTarget | null)[]): InteractionTarget | null {
  const present = targets.filter((t): t is InteractionTarget => !!t);
  return present.find(t => t.deliberate) ?? present.find(t => t.kind === 'culture' && (t.priority || t.ready || t.reason === 'cooldown')) ?? present.find(t => t.ready && (t.action === 'feed' || t.kind === 'spring')) ?? present.find(t => t.ready) ?? present[0] ?? null;
}

/** A narrow collision query shared by the physical action and its visible affordance. */
export function lineBlocked(s: GameState, start: Vec3, end: Vec3): boolean {
  if (s.stage !== 0) return s.world.obstacles.some(obstacle => obstacleSegmentEntry(start, end, obstacle) !== null);
  const dx = end.x - start.x, dz = end.z - start.z, length2 = dx * dx + dz * dz;
  if (length2 < .001) return false;
  return s.world.obstacles.some(o => {
    const centerT = ((o.pos.x - start.x) * dx + (o.pos.z - start.z) * dz) / length2;
    const separation2 = (start.x + dx * centerT - o.pos.x) ** 2 + (start.z + dz * centerT - o.pos.z) ** 2;
    if (separation2 >= o.radius ** 2) return false;
    const half = Math.sqrt((o.radius ** 2 - separation2) / length2);
    const enter = Math.max(0, centerT - half), leave = Math.min(1, centerT + half);
    if (enter >= leave) return false;
    // Check the entire interval inside the cylinder, including an ascending side entry.
    const firstY = start.y + (end.y - start.y) * enter, lastY = start.y + (end.y - start.y) * leave;
    return s.stage === 0 || Math.min(firstY, lastY) <= o.pos.y + o.height + .2 && Math.max(firstY, lastY) >= o.pos.y;
  });
}

function projected(s: GameState, origin: Vec3, target: Omit<InteractionTarget, 'distance' | 'ready' | 'reason'>, requirement?: InteractionReason, blockFromBody = true): InteractionTarget {
  const d = distance(origin, target.pos);
  let reason: InteractionReason = requirement ?? 'ready';
  if (reason === 'ready' && d > target.range) reason = s.stage === 1 && target.pos.y - origin.y > 2.5 ? 'above' : s.stage === 1 && origin.y - target.pos.y > 2.5 ? 'below' : 'distance';
  if (reason === 'ready' && (lineBlocked(s, origin, target.pos) || blockFromBody && lineBlocked(s, s.player.pos, target.pos))) reason = 'blocked';
  if (reason === 'ready' && s.player.cooldown > 0) reason = 'cooldown';
  return { ...target, distance: d, ready: reason === 'ready', reason };
}

function targetRank(t: InteractionTarget): number {
  return t.ready ? 0 : t.reason === 'cooldown' ? 1 : ['distance', 'above', 'below'].includes(t.reason) ? 2 : t.reason === 'blocked' ? 3 : 4;
}
function targetOrder(a: InteractionTarget, b: InteractionTarget): number {
  return targetRank(a) - targetRank(b) || a.distance - b.distance;
}

const packMember=(s:GameState,id:number)=>s.stage===2&&!!s.creatureStage?.pack.includes(id);
const autoPreyAllowed=(s:GameState,c:Creature)=>!packMember(s,c.id)&&!(s.stage===2&&s.creatureStage?.nests.some(n=>n.species===c.species&&n.relationship>=60));

/** The chosen target is also used by simulation; HUD/marker cannot promise another meal. */
export function feedTarget(s: GameState, selection?: FeedSelection | null): InteractionTarget | null {
  if (s.player.genome.version === 2) return creatureFeedTarget(s, selection);
  const p = s.player, profile = functionalProfile(p.genome), stats = computeStats(p.genome);
  const origin = mouthWorldPosition(profile, p.pos, p.heading);
  const jaws = !s.journey.legacy ? jawContacts(p.genome) : [];
  const preyTarget = (c: Creature, deliberate = false): InteractionTarget => {
    const requirement = packMember(s,c.id)?'ally':!has(p.genome, 'jaw') ? 'mouth' : p.energy < 1.6 ? 'energy' : undefined;
    const target = { action: 'feed' as const, kind: 'prey' as const, id: c.id, pos: c.pos, ...(deliberate ? { deliberate: true } : {}) };
    if (!jaws.length) return projected(s, origin, { ...target, range: profile.feedReach + 1 }, requirement);
    const contact = jaws.map(jaw => projected(s, mouthWorldPosition(jaw, p.pos, p.heading), {
      ...target, range: jaw.reach + speciesCollisionRadius(worldSpecies(s.world,c.species)),
    }, requirement)).sort(targetOrder)[0];
    return contact.reason === 'distance' ? { ...contact, detail: SELECTION_COPY.jawApproach(contact.distance) } : contact;
  };
  if (selection) {
    // Missing, stale-stage and dead identities deliberately do not fall back to
    // a carcass or a bystander while the player is still holding the same intent.
    if (selection.stage !== s.stage) return null;
    if (selection.kind === 'creature') {
      const c = s.world.creatures.find(c => c.id === selection.id && c.health > 0);
      return c ? preyTarget(c, true) : null;
    }
    const r = s.world.resources.find(r => r.id === selection.id);
    return r ? projected(s, origin, { action: 'feed', kind: 'food', id: r.id, pos: r.pos, range: profile.feedReach, deliberate: true }, r.amount < 1 ? 'depleted' : !stats.diet.includes(r.kind) ? 'diet' : undefined) : null;
  }
  const searchRange = Math.max(12, profile.feedReach + 5);
  const foods = s.world.resources.filter(r => r.amount >= 1 && stats.diet.includes(r.kind) && distance(origin, r.pos) < searchRange);
  const targets: InteractionTarget[] = foods.map(r => projected(s, origin, { action: 'feed', kind: 'food', id: r.id, pos: r.pos, range: profile.feedReach }));
  if (has(p.genome, 'jaw')) for (const c of s.world.creatures.filter(c => autoPreyAllowed(s,c)&&(s.journey.legacy ? distance(origin, c.pos) < searchRange : c.health > 0))) {
    const prey = preyTarget(c);
    // Filter in the jaw's frame before ranking: a distant unobstructed animal
    // must not hide a nearby blocked contact just because distance ranks first.
    if (prey.distance < searchRange) targets.push(prey);
  }
  // Reachable alternatives take precedence over an occluded but slightly nearer item.
  targets.sort(targetOrder);
  if (targets[0] && targets[0].distance < Math.max(12, profile.feedReach + 5)) return targets[0];
  const incompatible = s.world.resources.filter(r => r.amount >= 1 && !stats.diet.includes(r.kind)).sort((a, b) => distance(a.pos, origin) - distance(b.pos, origin))[0];
  return incompatible && distance(incompatible.pos, origin) < 9 ? projected(s, origin, { action: 'feed', kind: 'food', id: incompatible.id, pos: incompatible.pos, range: profile.feedReach }, 'diet') : null;
}

/** V2 keeps each mouth's origin and diet together for both hints and actual feeding. */
function creatureFeedTarget(s: GameState, selection?: FeedSelection | null): InteractionTarget | null {
  const p=s.player,g=p.genome;if(g.version!==2)return null;
  const mouths=creatureMouths(g);
  const foodTarget=(r:GameState['world']['resources'][number],deliberate=false):InteractionTarget=>{
    const target={action:'feed' as const,kind:'food' as const,id:r.id,pos:r.pos,...(deliberate?{deliberate:true}:{})};
    const compatible=mouths.filter(m=>m.diet.includes(r.kind));
    if(!compatible.length)return projected(s,p.pos,{...target,range:0},r.amount<1?'depleted':mouths.length?'diet':'mouth');
    return compatible.map(m=>projected(s,mouthWorldPosition(m,p.pos,p.heading),{...target,range:m.feedReach},r.amount<1?'depleted':undefined,false)).sort(targetOrder)[0];
  };
  const preyTarget=(c:Creature,deliberate=false):InteractionTarget=>{
    const contact=queryCreatureBite(g,p.pos,p.heading,{pos:c.pos,radius:speciesCollisionRadius(worldSpecies(s.world,c.species))},(from,to)=>lineBlocked(s,from,to));
    const reason:InteractionReason=packMember(s,c.id)?'ally':contact.reason==='mouth'?'mouth':p.energy<1.6?'energy':contact.reason??(p.cooldown>0?'cooldown':'ready');
    return {action:'feed',kind:'prey',id:c.id,pos:c.pos,range:contact.range,distance:contact.distance,ready:reason==='ready',reason,...(reason==='distance'?{detail:SELECTION_COPY.jawApproach(contact.distance)}:{}),...(deliberate?{deliberate:true}:{})};
  };
  if(selection){
    if(selection.stage!==s.stage)return null;
    if(selection.kind==='creature'){const c=s.world.creatures.find(c=>c.id===selection.id&&c.health>0);return c?preyTarget(c,true):null;}
    const r=s.world.resources.find(r=>r.id===selection.id);return r?foodTarget(r,true):null;
  }
  const searchRange=Math.max(12,...mouths.map(m=>m.feedReach+5));
  const targets=s.world.resources.filter(r=>r.amount>=1).map(r=>foodTarget(r)).filter(t=>t.distance<searchRange);
  if(g.parts.some(p=>p.kind==='jaw'))targets.push(...s.world.creatures.filter(c=>c.health>0&&autoPreyAllowed(s,c)).map(c=>preyTarget(c)).filter(t=>t.distance<searchRange));
  return targets.sort(targetOrder)[0]??null;
}

export function bondTarget(s: GameState): InteractionTarget | null {
  const p = s.player;
  const requirement = !has(p.genome, 'symbiote') ? 'symbiote' : p.bonds.length >= 2 ? 'capacity' : p.energy < 25 ? 'energy' : undefined;
  return s.world.creatures.filter(c => worldSpecies(s.world,c.species).role === 'partner' && !(s.stage===2&&s.creatureStage?.nests.some(n=>n.residents.includes(c.id))) && distance(c.pos, p.pos) < 13)
    .map(c => projected(s, p.pos, { action: 'bond', kind: 'partner', id: c.id, pos: c.pos, range: 7 }, requirement)).sort(targetOrder)[0] ?? null;
}

export function tendTarget(s: GameState): InteractionTarget | null {
  if (!s.journey.legacy) {
    const action = journeyAction(s);
    const food = action?.operation === 'take-food' || action?.operation === 'take-meat';
    return action ? { action: 'tend', kind: food ? 'food' : 'culture', id: action.resourceId ?? action.site?.id ?? 'offer', pos: action.pos, distance: action.distance, range: 4, ready: action.ready, reason: action.ready ? 'ready' : s.player.cooldown > 0 ? 'cooldown' : 'distance', label: action.label, detail: action.detail, priority: !food && (!!s.journey.cargo || !action.site?.resolved) } : null;
  }
  const p = s.player;
  const springs = s.world.landmarks.filter(l => l.kind === 'spring' && distance(l.pos, p.pos) < 12)
    .map(l => projected(s, p.pos, { action: 'tend', kind: 'spring', id: l.id, pos: l.pos, range: 7 }, l.charge >= 10 ? 'complete' : p.energy < 15 ? 'energy' : undefined));
  const sources = s.world.resources.filter(r => r.kind !== 'meat' && distance(r.pos, p.pos) < 10)
    .map(r => projected(s, p.pos, { action: 'tend', kind: 'food', id: r.id, pos: r.pos, range: 6 }, p.energy < 15 ? 'energy' : undefined));
  return [...springs, ...sources].sort((a, b) => targetRank(a) - targetRank(b) || Number(b.kind === 'spring') - Number(a.kind === 'spring') || a.distance - b.distance)[0] ?? null;
}
