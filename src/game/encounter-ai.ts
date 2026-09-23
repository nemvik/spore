import { worldSpecies } from './npc-genome';
import { isNestResident, speciesNest } from './creature-stage';
import { recordEcologyMeal } from './ecology-catalog';
import type { Creature, GameState, Obstacle, Vec3 } from './types';
import type { HunterMemory, Journey } from './journey-types';
import { TEXT } from './content';
import { computeStats, has } from './genome';
import { lineBlocked } from './interactions';
import { speciesGroundClearance } from './anatomy';
import { clamp, distance, groundHeight, horizontalDistance } from './random';
import { WORLD_BOUND } from './world';
import { hasActivePartner } from './symbiosis';
import { hunterThreatening } from './hunter-appetite';
import { reproduceAfterMeal } from './demography';

type EncounterState = GameState & { journey: Journey };
export const HUNTER_TIMING = { windup: 1.05, commit: .3, lunge: .75, recover: 2.2, feeding: 3.5 } as const;
const LUNGE_MULTIPLIER = 2.6;

export interface HunterCue {
  phase: HunterMemory['phase'];
  progress: number;
  aim: Vec3;
  targetPlayer: boolean;
  feeding: boolean;
}

/** Read-only telegraph: early windup tracks a projected position; the final .3 s and lunge commit to it. */
export function hunterCue(s: EncounterState, id: number): HunterCue | null {
  if (s.journey.legacy) return null;
  const memory = s.journey.hunters.find(h => h.stage === s.stage && h.id === id);
  const creature = s.world.creatures.find(c => c.id === id);
  if (!memory || !creature) return null;
  const feeding = memory.phase === 'recover' && creature.intent === 'forage';
  const duration = memory.phase === 'stalk' ? 1 : feeding ? HUNTER_TIMING.feeding : HUNTER_TIMING[memory.phase];
  return { phase: memory.phase, progress: memory.phase === 'stalk' ? 0 : clamp(1 - memory.time / duration, 0, 1), aim: { ...memory.aim }, targetPlayer: creature.target === -1, feeding };
}

function recover(c: Creature, memory: HunterMemory, duration: number = HUNTER_TIMING.recover, feeding = false) {
  memory.phase = 'recover'; memory.time = duration;
  c.velocity = { x: 0, y: 0, z: 0 }; c.intent = feeding ? 'forage' : 'rest';
}

function direction(start: Vec3, end: Vec3, speed: number, aquatic: boolean): Vec3 {
  const dx = end.x - start.x, dy = aquatic ? end.y - start.y : 0, dz = end.z - start.z;
  const length = Math.hypot(dx, dy, dz);
  return length < 1e-8 ? { x: 0, y: 0, z: 0 } : { x: dx / length * speed, y: dy / length * speed, z: dz / length * speed };
}

/** Lead a predictable path only while visibly preparing. The same stored point
 * draws the telegraph and launches the attack; no target following after lock. */
function anticipatedAim(c: Creature, target: Pick<Creature, 'pos' | 'velocity'>, windup: number, aquatic: boolean, pace: number): Vec3 {
  const velocity = { x: target.velocity.x, y: aquatic ? target.velocity.y : 0, z: target.velocity.z };
  const start = { x: target.pos.x + velocity.x * windup - c.pos.x, y: aquatic ? target.pos.y + velocity.y * windup - c.pos.y : 0, z: target.pos.z + velocity.z * windup - c.pos.z };
  const speed = pace * LUNGE_MULTIPLIER;
  const a = velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2 - speed ** 2;
  const b = 2 * (start.x * velocity.x + start.y * velocity.y + start.z * velocity.z);
  const squared = start.x ** 2 + start.y ** 2 + start.z ** 2;
  const discriminant = b * b - 4 * a * squared;
  const solutions = Math.abs(a) < 1e-8 ? (Math.abs(b) > 1e-8 ? [-squared / b] : []) : discriminant < 0 ? [] : [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)];
  const intercept = solutions.filter(t => t >= 0).sort((a, b) => a - b)[0];
  // A fast retreat can leave reach. Do not invent an unlimited chase or lead far
  // beyond this attack's actual lifetime to force a hit on every moving target.
  const horizon = windup + Math.min(HUNTER_TIMING.lunge, intercept ?? Math.sqrt(squared) / speed);
  return { x: clamp(target.pos.x + velocity.x * horizon, -WORLD_BOUND, WORLD_BOUND), y: target.pos.y + velocity.y * horizon, z: clamp(target.pos.z + velocity.z * horizon, -WORLD_BOUND, WORLD_BOUND) };
}

/** Swept circular body against finite obstacle columns; returns the first contact fraction. */
function obstacleEntry(start: Vec3, end: Vec3, o: Obstacle, bodyRadius: number, microscopic: boolean): number | null {
  const dx = end.x - start.x, dz = end.z - start.z, dy = end.y - start.y;
  const x = start.x - o.pos.x, z = start.z - o.pos.z, radius = o.radius + bodyRadius;
  const length2 = dx * dx + dz * dz;
  let enter = 0, leave = 1;
  if (length2 < 1e-12) {
    if (x * x + z * z >= radius * radius) return null;
  } else {
    const b = x * dx + z * dz, discriminant = b * b - length2 * (x * x + z * z - radius * radius);
    if (discriminant <= 0) return null;
    const root = Math.sqrt(discriminant);
    enter = Math.max(enter, (-b - root) / length2); leave = Math.min(leave, (-b + root) / length2);
  }
  if (!microscopic) {
    const bottom = o.pos.y - bodyRadius, top = o.pos.y + o.height + bodyRadius;
    if (Math.abs(dy) < 1e-12) { if (start.y < bottom || start.y > top) return null; }
    else {
      const a = (bottom - start.y) / dy, b = (top - start.y) / dy;
      enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
    }
  }
  if (enter >= leave || leave < 0 || enter > 1) return null;
  // A generated creature starting in overlap may walk out, without being teleported.
  if (enter === 0 && (x + dx) ** 2 + (z + dz) ** 2 > x * x + z * z + 1e-10) return null;
  return Math.max(0, enter);
}

function moveHunter(s: EncounterState, c: Creature, velocity: Vec3, dt: number): boolean {
  const spec = worldSpecies(s.world,c.species), previous = { ...c.pos };
  const next = { x: clamp(c.pos.x + velocity.x * dt, -WORLD_BOUND, WORLD_BOUND), y: c.pos.y + velocity.y * dt, z: clamp(c.pos.z + velocity.z * dt, -WORLD_BOUND, WORLD_BOUND) };
  if (s.stage === 0) next.y = 1.1;
  else if (s.stage === 1) next.y = clamp(next.y, groundHeight(next.x, next.z, 1) + 1.3, 12);
  else next.y = groundHeight(next.x, next.z, 2) + speciesGroundClearance(spec);
  let fraction = 1;
  for (const obstacle of s.world.obstacles) {
    const entry = obstacleEntry(previous, next, obstacle, spec.radius ?? spec.size * .55, s.stage === 0);
    if (entry !== null) fraction = Math.min(fraction, Math.max(0, entry - .001));
  }
  c.pos = { x: previous.x + (next.x - previous.x) * fraction, y: previous.y + (next.y - previous.y) * fraction, z: previous.z + (next.z - previous.z) * fraction };
  c.velocity = { x: (c.pos.x - previous.x) / dt, y: (c.pos.y - previous.y) / dt, z: (c.pos.z - previous.z) / dt };
  if (Math.hypot(c.velocity.x, c.velocity.z) > .01) c.heading = Math.atan2(c.velocity.x, c.velocity.z);
  return fraction < 1;
}

function segmentDistance(point: Vec3, start: Vec3, end: Vec3): number {
  const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
  const squared = dx * dx + dy * dy + dz * dz;
  const t = squared < 1e-12 ? 0 : clamp(((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) / squared, 0, 1);
  return Math.hypot(point.x - start.x - dx * t, point.y - start.y - dy * t, point.z - start.z - dz * t);
}

function hitPlayer(s: EncounterState, c: Creature, onKill: (creature: Creature, byPlayer: boolean, cause?: 'combat' | 'starvation') => void) {
  const p = s.player;
  if (p.invulnerable > 0 || p.health <= 0) return;
  const stats = computeStats(p.genome), shield = hasActivePartner(s, 'shield') ? .65 : 1;
  p.health -= Math.max(2, (worldSpecies(s.world,c.species).damage ?? (12 + s.stage * 3)) * (1 - stats.armor) * shield); p.invulnerable = 1.2;
  s.messages.push({ id: Math.max(s.tick, s.messages.at(-1)?.id ?? 0) + 1, text: TEXT.predatorHit(s.stage), time: s.world.time });
  if (s.messages.length > 6) s.messages.shift();
  if (has(p.genome, 'spines')) {
    const strength = p.genome.parts.filter(part => part.kind === 'spines').reduce((sum, part) => sum + part.scale * (part.mirrored ? 1.6 : 1), 0);
    c.health -= Math.min(14, 6 + strength * 4); c.fear = 1.5;
    if (c.health <= 0) onKill(c, true);
  }
}

/**
 * New-journey predators own their movement and aging here. The ordinary NPC loop
 * must skip them, while demographics and other species remain in the simulation.
 * Only HunterMemory and existing Creature fields carry phase state, so save/load
 * in a windup or lunge resumes the same attack. No random or wall-clock input.
 */
export function stepHunters(s: EncounterState, dt: number, onKill: (creature: Creature, byPlayer: boolean, cause?: 'combat' | 'starvation') => void): void {
  if (s.journey.legacy || s.deathReason || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(1 / 30, dt);
  const hunters = s.world.creatures.filter(c => c.health > 0 && !isNestResident(s,c.id) && worldSpecies(s.world,c.species).role === 'predator');
  const activeIds = new Set(hunters.map(c => c.id));
  s.journey.hunters = s.journey.hunters.filter(h => h.stage !== s.stage || activeIds.has(h.id));
  for (const c of hunters) {
    if (!s.world.creatures.some(other => other.id === c.id)) continue;
    const spec = worldSpecies(s.world,c.species), patch = s.world.patches[c.patch];
    if(s.stage===2&&s.creatureStage?.encounter?.target===c.id){c.velocity={x:0,y:0,z:0};c.intent='rest';continue;}
    // Twilight and the living land corridor carry a moving ecological signal.
    // Their local hunter may leave home, but still loses sight behind real cover.
    const luminousCargo = s.journey.cargo?.purpose === 'culture' && s.journey.cargo.vitality > 0 && c.patch === 2 && (s.stage === 0 && s.journey.cargo.site === 2 || s.stage === 2 && s.journey.cargo.site === 8);
    const leash = luminousCargo ? 115 : patch.radius + 4;
    let memory = s.journey.hunters.find(h => h.stage === s.stage && h.id === c.id);
    if (!memory) { memory = { stage: s.stage, id: c.id, phase: 'stalk', time: 0, aim: { ...c.pos } }; s.journey.hunters.push(memory); }
    // Friendship is species-wide, including attacks committed by another wild member.
    if (c.target === -1 && (speciesNest(s, c.species)?.relationship ?? 0) >= 60) {
      c.target = null; memory.aim = { ...c.pos }; recover(c, memory, 1);
    }
    const learnsFoodPlace = s.stage === 2 && s.journey.version === 3;
    const home = learnsFoodPlace && memory.feedingHome || s.journey.sites.find(site => site.stage === s.stage && site.threatIds.includes(c.id))?.source || patch.center;
    c.age += dt; c.hunger = Math.min(100, c.hunger + dt * .14); c.cooldown = Math.max(0, c.cooldown - dt); c.fear = Math.max(0, c.fear - dt);
    if (c.hunger >= 100 && c.age > 200) { c.health -= dt * .08; if (c.health <= 0) { onKill(c, false, 'starvation'); continue; } }
    if (c.fear > 0) {
      recover(c, memory, Math.max(.4, memory.phase === 'recover' ? memory.time : .4)); c.intent = 'flee';
      const away = { x: c.pos.x * 2 - s.player.pos.x, y: c.pos.y, z: c.pos.z * 2 - s.player.pos.z };
      moveHunter(s, c, direction(c.pos, away, spec.speed * .55, s.stage === 1), dt); continue;
    }
    if (memory.phase === 'recover') {
      c.velocity = { x: 0, y: 0, z: 0 }; memory.time = Math.max(0, memory.time - dt);
      if (memory.time === 0) { memory.phase = 'stalk'; c.target = null; c.intent = 'rest'; }
      continue;
    }
    // A committed lunge cannot turn toward a late offering or a dodging target.
    if (memory.phase === 'lunge') {
      const previous = { ...c.pos }, collision = moveHunter(s, c, c.velocity, dt);
      memory.time = Math.max(0, memory.time - dt);
      const target = c.target === -1 ? s.player : s.world.creatures.find(prey => prey.id === c.target);
      const touch = target && segmentDistance(target.pos, previous, c.pos) < 1.15 + spec.size * .22 && !lineBlocked(s, previous, target.pos);
      if (touch && !collision) {
        if (c.target === -1) hitPlayer(s, c, onKill);
        else if (target && 'species' in target) { target.health -= (spec.damage ?? 15) * (1 - (worldSpecies(s.world,target.species).armor ?? 0)); target.fear = 4; if (target.health <= 0) onKill(target, false); }
        // Contact is not nutrition. New food webs require a real portion from
        // the carcass; even a successful attack cannot feed on the player's HP.
        if (s.journey.version !== 3) c.hunger = Math.max(0, c.hunger - 18);
        recover(c, memory);
      } else if (collision || memory.time === 0) recover(c, memory);
      continue;
    }
    const foodWeb = s.journey.version === 3;
    const offering = s.journey.offerings.filter(o => o.stage === s.stage && o.remaining > 0)
      .map(o => s.world.resources.find(r => r.id === o.id && r.kind === 'meat' && r.amount >= (foodWeb ? 1 : .5)))
      .filter((r): r is NonNullable<typeof r> => !!r && distance(c.pos, r.pos) < 16 && (learnsFoodPlace || horizontalDistance(r.pos, home) < leash) && !lineBlocked(s, c.pos, r.pos))
      .sort((a, b) => distance(c.pos, a.pos) - distance(c.pos, b.pos) || a.id - b.id)[0];
    const meal = offering ?? (foodWeb && c.hunger > 40 ? s.world.resources.filter(r => r.kind === 'meat' && r.amount >= 1 && !s.journey.offerings.some(o => o.stage === s.stage && o.id === r.id) && distance(c.pos, r.pos) < 16 && horizontalDistance(r.pos, home) < leash && !lineBlocked(s, c.pos, r.pos))
      .sort((a, b) => distance(c.pos, a.pos) - distance(c.pos, b.pos) || a.id - b.id)[0] : undefined);
    if (meal) {
      memory.phase = 'stalk'; memory.time = 0; memory.aim = { ...meal.pos }; c.target = meal.id; c.intent = 'forage';
      if (distance(c.pos, meal.pos) < 2) {
        const hungerBefore = c.hunger;
        if (meal === offering) recordEcologyMeal(s, c, meal);
        meal.amount = Math.max(0, meal.amount - 1); c.hunger = Math.max(0, c.hunger - 42);
        // A placed lure alone changes no territory. The hunter must reach and
        // personally eat it; offspring still learn their own feeding places.
        if (learnsFoodPlace) memory.feedingHome = { ...c.pos };
        reproduceAfterMeal(s, c, meal, hungerBefore);
        recover(c, memory, HUNTER_TIMING.feeding, true);
      } else moveHunter(s, c, direction(c.pos, meal.pos, spec.speed * .7, s.stage === 1), dt);
      continue;
    }
    if (memory.phase === 'windup') {
      const target = c.target === -1 ? s.player : s.world.creatures.find(prey => prey.id === c.target);
      c.velocity = { x: 0, y: 0, z: 0 };
      if (!target || target.health <= 0 || horizontalDistance(target.pos, home) > leash || distance(c.pos, target.pos) > 16 || lineBlocked(s, c.pos, target.pos) || lineBlocked(s, c.pos, memory.aim)) { recover(c, memory, 1); continue; }
      if (memory.time > HUNTER_TIMING.commit + 1e-8) {
        memory.aim = anticipatedAim(c, target, memory.time, s.stage === 1, spec.speed);
        c.heading = Math.atan2(memory.aim.x - c.pos.x, memory.aim.z - c.pos.z);
      }
      memory.time = Math.max(0, memory.time - dt);
      if (memory.time === 0) {
        memory.phase = 'lunge'; memory.time = HUNTER_TIMING.lunge;
        c.velocity = direction(c.pos, memory.aim, spec.speed * LUNGE_MULTIPLIER, s.stage === 1);
        c.heading = Math.atan2(c.velocity.x, c.velocity.z);
      }
      continue;
    }
    const livingLand = s.stage === 2 && !s.campaign.won;
    const hungry = hunterThreatening(s, c);
    // Injury permits a close defensive response to the player who can bite it,
    // without turning a sated predator back into a hunter of native animals.
    const playerRange = !hungry && foodWeb && c.health < 55 ? 4.5 : hungry ? luminousCargo ? 24 : 13 : 0;
    const canHuntPlayer = (speciesNest(s,c.species)?.relationship??0)<60 && s.player.health > 0 && distance(c.pos, s.player.pos) < playerRange && horizontalDistance(s.player.pos, home) < leash && horizontalDistance(c.pos, home) < leash && !lineBlocked(s, c.pos, s.player.pos);
    const prey = !hungry || canHuntPlayer && !livingLand ? null : s.world.creatures.filter(other => (['grazer', 'invasive'].includes(worldSpecies(s.world,other.species).role) || livingLand && other.species === 'gloom') && other.health > 0 && distance(c.pos, other.pos) < 18 && horizontalDistance(other.pos, home) < leash && !lineBlocked(s, c.pos, other.pos)).sort((a, b) => distance(c.pos, a.pos) - distance(c.pos, b.pos) || a.id - b.id)[0];
    const targetPlayer = canHuntPlayer && (!prey || !livingLand || distance(c.pos, prey.pos) + .75 >= distance(c.pos, s.player.pos));
    const target = targetPlayer ? s.player : prey;
    if (target) {
      c.target = targetPlayer ? -1 : prey!.id; c.intent = 'hunt';
      // Close first on land: starting this long tell at 7.5 m lets a walking
      // carrier leave the entire lunge distance before the hunter can strike.
      if (distance(c.pos, target.pos) < (livingLand ? 3.2 : 7.5)) {
        memory.phase = 'windup'; memory.time = HUNTER_TIMING.windup; memory.aim = anticipatedAim(c, target, memory.time, s.stage === 1, spec.speed);
        c.velocity = { x: 0, y: 0, z: 0 }; c.heading = Math.atan2(memory.aim.x - c.pos.x, memory.aim.z - c.pos.z);
      } else moveHunter(s, c, direction(c.pos, target.pos, spec.speed * (livingLand ? 1.35 : .72), s.stage === 1), dt);
      continue;
    }
    // Patrol recognizable local territory, never the entire map. A deterministic
    // alternative bearing keeps an obstructed patrol waypoint from pinning a hunter.
    c.target = null; c.intent = 'rest';
    const phase = s.world.time * .13 + c.id * 2.39996, radius = 5 + c.id % 4;
    const waypoints = [0, 1.2, -1.2, Math.PI].map(offset => ({ x: home.x + Math.sin(phase + offset) * radius, y: home.y + (s.stage === 1 ? 1 + Math.sin(phase) : 0), z: home.z + Math.cos(phase + offset) * radius }));
    const waypoint = waypoints.find(point => !lineBlocked(s, c.pos, point));
    if (waypoint) moveHunter(s, c, direction(c.pos, waypoint, spec.speed * .38, s.stage === 1), dt);
    else c.velocity = { x: 0, y: 0, z: 0 };
  }
}
