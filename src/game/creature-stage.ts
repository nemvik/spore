import type { Creature, FeedSelection, GameState, Genome, Vec3 } from './types';
import { SOCIAL_ACTIONS, type CreatureStageState, type SocialAction, type SpeciesAction, type SpeciesNest } from './creature-stage-types';
import { speciesById } from './content';
import { computeStats, has } from './genome';
import { creatureCapabilities, queryCreatureBite } from './creature-capabilities';
import { jawContacts, speciesGroundClearance } from './anatomy';
import { mouthWorldPosition } from './locomotion';
import { clamp, distance, groundHeight, horizontalDistance } from './random';
import { lineBlocked } from './interactions';
import { steerToward } from './navigation';
import { spawnCreature, WORLD_BOUND } from './world';
import { resolveObstacleMotion } from './obstacle-geometry';

export const CREATURE_SPECIES = ['bell', 'gnaw', 'gloom', 'crest'] as const;
export const SPECIES_ACTION_LABELS: Record<SpeciesAction, string> = {
  sing: 'Zpěv', dance: 'Tanec', charm: 'Okouzlení', pose: 'Póza',
  bite: 'Kousnutí', charge: 'Výpad', strike: 'Úder', spit: 'Plivnutí',
};
const preferred: Record<string, SocialAction> = { bell: 'sing', gnaw: 'dance', gloom: 'charm', crest: 'pose' };
export const emptyCreatureStage = (): CreatureStageState => ({ version: 1, nests: [], pack: [], encounter: null, recharge: 0, attack: null, guards: [], cue: null, completed: null });
export const activeCreatureStage = (s: GameState) => s.stage === 2 && s.creatureStage?.nests.length ? s.creatureStage : null;
export const speciesNest = (s: GameState, species: string) => activeCreatureStage(s)?.nests.find(n => n.species === species);
export const nestForResident = (s: GameState, id: number) => activeCreatureStage(s)?.nests.find(n => n.residents.includes(id));
export const isNestResident = (s: GameState, id: number) => !!nestForResident(s, id);
export const creatureIntelligence = (s: GameState) => (s.creatureStage?.nests.filter(n => n.outcome !== null).length ?? 0);
export const packCapacity = (s: GameState) => Math.min(3, creatureIntelligence(s));
type OnKill = (creature: Creature, byPlayer: boolean) => void;

function notice(s: GameState, text: string) {
  if (s.messages.at(-1)?.text === text && s.world.time - s.messages.at(-1)!.time < 3) return;
  s.messages.push({ id: Math.max(s.tick, s.messages.at(-1)?.id ?? 0) + 1, text, time: s.world.time });
  if (s.messages.length > 6) s.messages.shift();
}

/** Same organs as the editor; no second purchasable set of ability stats. */
export function speciesAbilities(g: Genome) {
  const caps = g.version === 2 ? creatureCapabilities(g) : null;
  const mouth = g.parts.filter(p => ['jaw', 'filter', 'proboscis'].includes(p.kind)).reduce((n, p) => n + p.scale, 0);
  const legs = caps ? caps.walk.enabled : has(g, 'legs');
  const hands = g.parts.some(p => p.kind === 'arms' && (g.version === 1 || p.limb?.end.kind === 'hand'));
  return {
    sing: { enabled: mouth > 0, power: 1 + Math.min(1, mouth * .35), range: 9, energy: 2, recharge: 1.8, reason: 'Zpěv potřebuje ústa.' },
    dance: { enabled: legs, power: 1 + (caps?.walk.stride ?? 1) * .3, range: 7, energy: 3, recharge: 1.8, reason: 'Tanec potřebuje opěrné nohy.' },
    charm: { enabled: has(g, 'eyes') || has(g, 'antenna'), power: 1.3 + (has(g, 'antenna') ? .4 : 0), range: 6, energy: 3, recharge: 2.2, reason: 'Okouzlení potřebuje oči nebo tykadla.' },
    pose: { enabled: hands || has(g, 'shell') || has(g, 'spines'), power: hands ? 1.7 : 1.2, range: 6, energy: 2, recharge: 2, reason: 'Póza potřebuje ruce, krunýř nebo ostny.' },
    bite: { enabled: has(g, 'jaw'), power: computeStats(g).damage, range: 3, energy: 1.6, recharge: .65, reason: 'Kousnutí potřebuje čelist.' },
    charge: { enabled: legs, power: 8 + Math.min(8, (caps?.walk.speed ?? computeStats(g).speed) * 1.2), range: 8, energy: 6, recharge: 3.2, reason: 'Výpad potřebuje opěrné nohy.' },
    strike: { enabled: hands, power: 12 + Math.min(8, g.parts.filter(p => p.kind === 'arms').reduce((n, p) => n + p.scale * 3, 0)), range: 4, energy: 4, recharge: 2, reason: 'Úder potřebuje ruce.' },
    spit: { enabled: has(g, 'toxin'), power: 10, range: 14, energy: 5, recharge: 3, reason: 'Plivnutí potřebuje toxinovou žlázu.' },
  };
}

function clearPosition(s: GameState, x: number, z: number): Vec3 {
  for (let i = 0; i < 80; i++) {
    const radius = i === 0 ? 0 : 2 + Math.floor(i / 12) * 2, a = i * 2.39996;
    const pos = { x: clamp(x + Math.sin(a) * radius, -70, 70), y: 0, z: clamp(z + Math.cos(a) * radius, -70, 70) };
    if (!s.world.obstacles.some(o => horizontalDistance(pos, o.pos) < o.radius + 5)) return { ...pos, y: groundHeight(pos.x, pos.z, 2) };
  }
  return { x: 0, y: groundHeight(0, 0, 2), z: 0 };
}

function addResidents(s: GameState, nest: SpeciesNest) {
  const patch = s.world.patches.reduce((a, b) => horizontalDistance(a.center, nest.pos) < horizontalDistance(b.center, nest.pos) ? a : b).id;
  for (let i = 0; i < 2; i++) {
    const c = spawnCreature(s.world, nest.species, patch);
    c.pos = { x: nest.pos.x + (i ? 2 : -2), y: 0, z: nest.pos.z };
    c.pos.y = groundHeight(c.pos.x, c.pos.z, 2) + speciesGroundClearance(speciesById(c.species));
    c.health = nest.species === 'crest' ? 48 : 36; c.hunger = 25; c.intent = 'rest';
    nest.residents.push(c.id); s.world.creatures.push(c);
  }
}

/** Only called when entering land for an explicitly opted-in new lineage. */
export function initializeCreatureStage(s: GameState) {
  if (!s.creatureStage || s.stage !== 2 || s.creatureStage.nests.length) return;
  const positions = [[-16, -5], [-39, -31], [8, 29], [36, -21]];
  s.creatureStage.nests = CREATURE_SPECIES.map((species, i) => ({ species, pos: clearPosition(s, ...positions[i] as [number, number]), residents: [], relationship: 0, outcome: null, defeats: 0, discovered: i === 0 }));
  for (const nest of s.creatureStage.nests) addResidents(s, nest);
  notice(s, 'Život druhu · západně žijí zvonkonoši. V zahájí setkání, 1–4 odpovídá; B přepne boj. Tři hnízda otevřou cestu ke kmeni.');
}

export function encounterTarget(s: GameState, selection?: FeedSelection | null): Creature | null {
  if (!activeCreatureStage(s)) return null;
  if (selection) return selection.stage === 2 && selection.kind === 'creature' ? s.world.creatures.find(c => c.id === selection.id && c.health > 0 && !s.creatureStage!.pack.includes(c.id)) ?? null : null;
  const current = s.creatureStage!.encounter;
  if (current) return s.world.creatures.find(c => c.id === current.target && c.health > 0) ?? null;
  return s.world.creatures.filter(c => c.health > 0 && isNestResident(s, c.id) && !s.creatureStage!.pack.includes(c.id) && horizontalDistance(c.pos, s.player.pos) < 18)
    .sort((a, b) => horizontalDistance(a.pos, s.player.pos) - horizontalDistance(b.pos, s.player.pos) || a.id - b.id)[0] ?? null;
}

function requestFor(s: GameState, nest: SpeciesNest, round: number): SocialAction {
  const abilities = speciesAbilities(s.player.genome), available = SOCIAL_ACTIONS.filter(a => abilities[a].enabled);
  const order = [preferred[nest.species], ...SOCIAL_ACTIONS.filter(a => a !== preferred[nest.species])].filter(a => available.includes(a));
  return order[round % order.length] ?? 'dance';
}

export function startEncounter(s: GameState, selection?: FeedSelection | null): boolean {
  const life = activeCreatureStage(s), target = encounterTarget(s, selection), nest = target && speciesNest(s, target.species);
  if (!life || !target || !nest) { if (life) notice(s, 'Vyber živého tvora u hnízda nebo se přibliž k sousedům.'); return false; }
  if (life.attack || life.recharge > 0) { notice(s, 'Nejdřív dokonči akci.'); return false; }
  if (horizontalDistance(s.player.pos, target.pos) > 9 || lineBlocked(s, s.player.pos, target.pos)) { notice(s, 'Přibliž se na 9 m s volným výhledem.'); return false; }
  if (nest.relationship <= -40) { notice(s, 'Druh brání hnízdo. Ustup a u hnízda nabídni usmíření.'); return false; }
  if (nest.relationship >= 60) { notice(s, 'Přátelský druh · R u obyvatele hnízda přidá člena do smečky.'); return false; }
  life.encounter = { species: nest.species, target: target.id, requested: requestFor(s, nest, 0), round: 0, progress: 0, mistakes: 0, remaining: 12 };
  target.velocity = { x: 0, y: 0, z: 0 }; target.intent = 'rest'; target.target = null;
  const hunter = s.journey.hunters.find(h => h.stage === s.stage && h.id === target.id);
  if (hunter) { hunter.phase = 'recover'; hunter.time = 1; hunter.aim = { ...target.pos }; }
  life.guards = life.guards.filter(g => !nest.residents.includes(g.id));
  notice(s, `${speciesById(nest.species).name} čeká: ${SPECIES_ACTION_LABELS[life.encounter.requested]}. Odpověz 1–4.`); return true;
}

function resolveNest(s: GameState, nest: SpeciesNest, outcome: 'friend' | 'predator') {
  if (nest.outcome) return;
  nest.outcome = outcome;
  s.player.dna += 12; s.player.totalDna += 12;
  notice(s, `${speciesById(nest.species).name}: ${outcome === 'friend' ? 'přátelství' : 'obránci poraženi'} · +12 DNA · inteligence ${creatureIntelligence(s)}/3. Kapacita smečky ${packCapacity(s)}.`);
}

export function recordSpeciesAggression(s: GameState, c: Creature) {
  const life = activeCreatureStage(s), nest = speciesNest(s, c.species);
  if (!life || !nest) return;
  nest.relationship = Math.max(-100, nest.relationship - 40);
  if (life.encounter?.species === c.species) life.encounter = null;
  life.pack = life.pack.filter(id => s.world.creatures.find(c => c.id === id)?.species !== nest.species);
  nest.discovered = true;
}

export function recordSpeciesDeath(s: GameState, c: Creature, byPlayer: boolean) {
  const life = activeCreatureStage(s), nest = nestForResident(s, c.id);
  if (!life) return;
  life.pack = life.pack.filter(id => id !== c.id); life.guards = life.guards.filter(g => g.id !== c.id && g.target !== c.id);
  if (life.encounter?.target === c.id) life.encounter = null;
  if (nest) {
    nest.residents = nest.residents.filter(id => id !== c.id);
    if (byPlayer) { nest.defeats = Math.min(2, nest.defeats + 1); nest.relationship = -100; if (nest.defeats === 2) resolveNest(s, nest, 'predator'); }
  }
}

function nearbyPack(s: GameState, pos: Vec3) {
  return s.world.creatures.filter(c => s.creatureStage!.pack.includes(c.id) && c.health > 0 && distance(c.pos, pos) < 7 && !lineBlocked(s, c.pos, pos));
}

function hit(s: GameState, c: Creature, damage: number, onKill: OnKill, stagger = false) {
  recordSpeciesAggression(s, c); c.health -= damage;
  if (stagger) { c.fear = Math.max(c.fear, 1.2); s.creatureStage!.guards = s.creatureStage!.guards.filter(g => g.id !== c.id); }
  if (c.health <= 0) onKill(c, true);
}

export function performSpeciesAction(s: GameState, action: SpeciesAction, selection: FeedSelection | null | undefined, onKill: OnKill): boolean {
  const life = activeCreatureStage(s); if (!life || s.deathReason || s.player.health <= 0) return false;
  const ability = speciesAbilities(s.player.genome)[action];
  if (!ability.enabled) { notice(s, ability.reason); return false; }
  if (life.recharge > 0 || life.attack || s.player.cooldown > 0) { notice(s, 'Akce se obnovuje.'); return false; }
  if (s.player.energy < ability.energy) { notice(s, 'Na tuto akci chybí energie.'); return false; }
  if (SOCIAL_ACTIONS.includes(action as SocialAction)) {
    if (!life.encounter && !startEncounter(s, selection)) return false;
    const e = life.encounter!, target = s.world.creatures.find(c => c.id === e.target && c.health > 0), nest = speciesNest(s, e.species)!;
    if (!target || horizontalDistance(s.player.pos, target.pos) > ability.range || lineBlocked(s, s.player.pos, target.pos)) { notice(s, 'Odpověď nedosáhne k partnerovi. Přibliž se s volným výhledem.'); return false; }
    s.player.energy -= ability.energy; life.recharge = ability.recharge;
    const success = e.requested === action;
    life.cue = { action, target: target.id, remaining: 1.2, success };
    if (s.player.creatureActions) { s.player.creatureActions.communicationTime = .8; s.player.creatureActions.communicationSerial=(s.player.creatureActions.communicationSerial+1)%1_000_000_001; }
    if (success) {
      const pack = nearbyPack(s, target.pos);
      e.progress += ability.power + (preferred[nest.species] === action ? .35 : 0) + pack.length * .35; e.round++; e.remaining = 12;
      nest.relationship = Math.min(59, nest.relationship + 10);
      if (e.progress >= 6) { nest.relationship = 80; life.encounter = null; resolveNest(s, nest, 'friend'); }
      else { e.requested = requestFor(s, nest, e.round); notice(s, `${pack.length ? `Smečka pomáhá (+${pack.length}). ` : ''}Dobrá odpověď · nyní ${SPECIES_ACTION_LABELS[e.requested]}.`); }
    } else {
      e.mistakes++; nest.relationship = Math.max(-40, nest.relationship - 10); e.remaining = 12;
      notice(s, `Jiný projev · čeká ${SPECIES_ACTION_LABELS[e.requested]}. ${e.mistakes}/3 omylů.`);
      if (e.mistakes >= 3) { life.encounter = null; notice(s, 'Setkání skončilo. Novou návštěvu můžeš zkusit znovu.'); }
    }
    return true;
  }
  const target = encounterTarget(s, selection);
  if (!target) { notice(s, 'Vyber živého protivníka; členové smečky nejsou cílem.'); return false; }
  let ready = horizontalDistance(s.player.pos, target.pos) <= ability.range && !lineBlocked(s, s.player.pos, target.pos);
  if (action === 'bite') {
    if (s.player.genome.version === 2) ready = queryCreatureBite(s.player.genome, s.player.pos, s.player.heading, { pos: target.pos, radius: speciesById(target.species).size * .55 }, (a, b) => lineBlocked(s, a, b)).ready;
    else ready = jawContacts(s.player.genome).some(j => { const origin = mouthWorldPosition(j, s.player.pos, s.player.heading); return distance(origin, target.pos) <= j.reach + speciesById(target.species).size * .55 && !lineBlocked(s, origin, target.pos); });
  }
  if (!ready) { notice(s, `${SPECIES_ACTION_LABELS[action]}: cíl je mimo dosah nebo za překážkou.`); return false; }
  s.player.energy -= ability.energy; life.recharge = ability.recharge; s.player.cooldown = Math.max(s.player.cooldown, .65); s.player.feeding = .5;
  life.encounter = null; life.cue = { action, target: target.id, remaining: .8, success: true };
  if (action === 'charge' || action === 'spit') {
    life.attack = { kind: action, target: target.id, remaining: action === 'charge' ? 1.4 : .8, pos: { ...s.player.pos }, aim: { ...target.pos }, damage: ability.power };
    recordSpeciesAggression(s, target);
  } else hit(s, target, ability.power, onKill, action === 'strike');
  return true;
}

/** R recruits a real resident; the old symbiotic bond remains available for wild creatures. */
export function recruitPack(s: GameState, selection?: FeedSelection | null): boolean {
  const life = activeCreatureStage(s), target = encounterTarget(s, selection);
  if (!life || !target || !isNestResident(s, target.id)) return false;
  const nest = speciesNest(s, target.species)!;
  if (nest.relationship < 60) { notice(s, 'Nejdřív se s druhem spřátel pomocí V a odpovědí 1–4.'); return true; }
  if (life.pack.length >= packCapacity(s)) { notice(s, 'Smečka je plná. Další vyřešené hnízdo rozšíří kapacitu; člena můžeš propustit v přehledu.'); return true; }
  if (distance(s.player.pos, target.pos) > 7 || lineBlocked(s, s.player.pos, target.pos)) { notice(s, 'Pro nábor se přibliž na 7 m s volným výhledem.'); return true; }
  life.pack.push(target.id); target.intent = 'bonded'; target.target = null; target.fear = 0;
  notice(s, `${speciesById(target.species).name} jde s tebou. Smečka pomáhá v blízkých setkáních.`); return true;
}

export function dismissPack(s: GameState, id: number): boolean {
  const life = activeCreatureStage(s); if (!life?.pack.includes(id)) return false;
  life.pack = life.pack.filter(member => member !== id); notice(s, 'Společník se vrací ke svému hnízdu.'); return true;
}

export function reconcileNest(s: GameState, species: string): boolean {
  const life = activeCreatureStage(s), nest = speciesNest(s, species); if (!life || !nest) return false;
  if (horizontalDistance(s.player.pos, nest.pos) > 8 || lineBlocked(s, s.player.pos, { ...nest.pos, y: nest.pos.y + 1 })) { notice(s, 'Usmíření potřebuje blízkost hnízda (8 m) a volný výhled.'); return false; }
  if (life.recharge > 0 || life.attack || s.player.energy < 25) { notice(s, 'Dar potřebuje 25 energie a dokončenou akci.'); return false; }
  if (nest.relationship >= 0 && nest.residents.length) { notice(s, 'Sousedé už jsou ochotni k setkání.'); return false; }
  if (!nest.residents.length && s.world.creatures.length > 126) { notice(s, 'V krajině není místo pro nové obyvatele.'); return false; }
  s.player.energy -= 25; life.recharge = 3; nest.relationship = 0;
  if (!nest.residents.length) { nest.defeats = nest.outcome ? nest.defeats : 0; addResidents(s, nest); }
  life.guards = life.guards.filter(g => !nest.residents.includes(g.id));
  notice(s, 'Dar utišil spor. Můžeš zahájit nové setkání; již získaná odměna se neopakuje.'); return true;
}

function moveResident(s: GameState, c: Creature, destination: Vec3, dt: number, stop: number) {
  const spec = speciesById(c.species), gap = horizontalDistance(c.pos, destination);
  if (gap <= stop) { c.velocity = { x: 0, y: 0, z: 0 }; return; }
  const waypoint = steerToward(s.world, c.pos, destination, spec.size * .6, c.heading), d = horizontalDistance(c.pos, waypoint) || 1;
  const speed = Math.min(spec.speed * 1.25, (gap - stop) / dt, d / dt);
  const previous = c.pos;
  const next = { x: clamp(previous.x + (waypoint.x - previous.x) / d * speed * dt, -WORLD_BOUND, WORLD_BOUND), y: previous.y, z: clamp(previous.z + (waypoint.z - previous.z) / d * speed * dt, -WORLD_BOUND, WORLD_BOUND) };
  c.pos = resolveObstacleMotion(s.world, previous, next, spec.size * .6);
  c.pos.y = groundHeight(c.pos.x, c.pos.z, 2) + speciesGroundClearance(spec);
  c.velocity = { x: (c.pos.x - previous.x) / dt, y: 0, z: (c.pos.z - previous.z) / dt };
  if (Math.hypot(c.velocity.x, c.velocity.z) > .01) c.heading = Math.atan2(c.velocity.x, c.velocity.z);
}

function stepProjectile(s: GameState, dt: number, onKill: OnKill) {
  const life = s.creatureStage!, a = life.attack; if (!a) return;
  const origin = a.kind === 'charge' ? s.player.pos : a.pos;
  const gap = distance(origin, a.aim), travel = Math.min(gap, dt * (a.kind === 'charge' ? 18 : 22)), fraction = gap > .0001 ? travel / gap : 0;
  let next = { x: origin.x + (a.aim.x - origin.x) * fraction, y: origin.y + (a.aim.y - origin.y) * fraction, z: origin.z + (a.aim.z - origin.z) * fraction };
  if (a.kind === 'charge') {
    // Charge uses the same player movement resolver in beginStep; this is only
    // its moving aim/projectile. Player contact is checked at the real position.
    next = { ...s.player.pos };
  }
  const blocked = lineBlocked(s, origin, next); a.pos = next; a.remaining = Math.max(0, a.remaining - dt);
  const target = s.world.creatures.find(c => c.id === a.target && c.health > 0);
  if (!blocked && target && distance(next, target.pos) < (a.kind === 'charge' ? 2.6 : 1.4) && !lineBlocked(s, next, target.pos)) {
    hit(s, target, a.damage, onKill, a.kind === 'charge'); life.attack = null;
  } else if (blocked || a.remaining === 0 || (a.kind === 'spit' && gap < .05)) life.attack = null;
}

/** Owns only nest residents; ordinary ecology continues in its existing loops. */
export function stepCreatureStage(s: GameState, dt: number, onKill: OnKill) {
  const life = activeCreatureStage(s); if (!life || dt <= 0) return;
  life.recharge = Math.max(0, life.recharge - dt);
  if (life.cue) { life.cue.remaining = Math.max(0, life.cue.remaining - dt); if (!life.cue.remaining) life.cue = null; }
  stepProjectile(s, dt, onKill);
  for (const nest of life.nests) if (horizontalDistance(s.player.pos, nest.pos) < 23) nest.discovered = true;
  const e = life.encounter;
  if (e) {
    const target = s.world.creatures.find(c => c.id === e.target && c.health > 0);
    e.remaining = Math.max(0, e.remaining - dt);
    if (!target || e.remaining === 0 || horizontalDistance(s.player.pos, target.pos) > 13 || lineBlocked(s, s.player.pos, target.pos)) { life.encounter = null; notice(s, 'Setkání přerušeno · vrať se do dosahu a začni znovu pomocí V.'); }
  }
  for (const nest of life.nests) for (const id of [...nest.residents]) {
    const c = s.world.creatures.find(c => c.id === id && c.health > 0); if (!c) continue;
    c.age += dt; c.cooldown = Math.max(0, c.cooldown - dt); c.fear = Math.max(0, c.fear - dt); c.hunger = Math.min(100, c.hunger + dt * .14);
    const companion = life.pack.includes(id), hostile = nest.relationship <= -40;
    const target = companion ? s.world.creatures.find(other => speciesNest(s, other.species)?.relationship! <= -40 && !life.pack.includes(other.id) && other.health > 0 && distance(s.player.pos, other.pos) < 9 && distance(c.pos, other.pos) < 8 && !lineBlocked(s, c.pos, other.pos)) : null;
    const enemies = !companion && hostile ? [{ id:-1, pos:s.player.pos, health:s.player.health }, ...s.world.creatures.filter(other=>life.pack.includes(other.id))].filter(other=>other.health>0&&horizontalDistance(other.pos,nest.pos)<17&&distance(c.pos,other.pos)<15).sort((a,b)=>distance(c.pos,a.pos)-distance(c.pos,b.pos)||a.id-b.id) : [];
    const enemy=enemies[0];
    const guard = life.guards.find(g => g.id === id);
    if (guard) {
      c.velocity = { x: 0, y: 0, z: 0 }; guard.remaining = Math.max(0, guard.remaining - dt);
      if (!guard.remaining) {
        const victim=guard.target===-1?s.player:s.world.creatures.find(other=>other.id===guard.target);
        if (victim && hostile && victim.health>0 && c.fear <= 0 && distance(victim.pos, guard.aim) < 2.8 && distance(c.pos, victim.pos) < 3.8 && !lineBlocked(s, c.pos, victim.pos)) {
          if(guard.target===-1){if(s.player.invulnerable<=0){s.player.health -= Math.max(2, 9 * (1 - computeStats(s.player.genome).armor));s.player.invulnerable=.7;notice(s,'Obránce zasáhl. Uhni ze zářícího kruhu během přípravy útoku.');}}
          else {victim.health-=7;if(victim.health<=0)onKill(victim as Creature,false);}
        }
        life.guards = life.guards.filter(g => g.id !== id); c.cooldown = 2;
      }
      continue;
    }
    if (c.fear > 0) { c.velocity = { x: 0, y: 0, z: 0 }; continue; }
    if (target) {
      c.intent = 'hunt'; c.target = target.id; moveResident(s, c, target.pos, dt, 2.2);
      if (distance(c.pos, target.pos) < 3.2 && !lineBlocked(s, c.pos, target.pos) && c.cooldown <= 0) { c.cooldown = 2; hit(s, target, 5, onKill); }
    } else if (enemy && life.encounter?.species !== nest.species) {
      c.intent = 'hunt'; c.target = enemy.id; moveResident(s, c, enemy.pos, dt, 2.4);
      if (distance(c.pos, enemy.pos) < 3.8 && !lineBlocked(s, c.pos, enemy.pos) && c.cooldown <= 0) life.guards.push({ id, target: enemy.id, remaining: .9, aim: { ...enemy.pos } });
    } else if (life.encounter?.target === id) {
      c.velocity = { x: 0, y: 0, z: 0 }; c.intent = 'rest'; c.heading = Math.atan2(s.player.pos.x - c.pos.x, s.player.pos.z - c.pos.z);
    } else {
      const food = c.hunger > 40 ? s.world.resources.filter(r => r.amount >= 1 && speciesById(c.species).diet.includes(r.kind) && distance(r.pos, companion ? s.player.pos : nest.pos) < (companion ? 8 : 12)).sort((a, b) => distance(a.pos, c.pos) - distance(b.pos, c.pos))[0] : null;
      const index = companion ? life.pack.indexOf(id) : nest.residents.indexOf(id), anchor = companion ? s.player.pos : nest.pos;
      const destination = food?.pos ?? { x: anchor.x + Math.cos(index * 2.4 + s.world.time * (companion ? 0 : .1)) * (companion ? 3.5 : 2), y: anchor.y, z: anchor.z + Math.sin(index * 2.4 + s.world.time * (companion ? 0 : .1)) * (companion ? 3.5 : 2) };
      c.intent = companion ? 'bonded' : food ? 'forage' : 'rest'; c.target = food?.id ?? null; moveResident(s, c, destination, dt, food ? 1.3 : .5);
      if (food && distance(c.pos, food.pos) < 2.8 && !lineBlocked(s, c.pos, food.pos) && c.cooldown <= 0) { food.amount -= 1; c.hunger = Math.max(0, c.hunger - 35); c.health = Math.min(nest.species === 'crest' ? 48 : 36, c.health + 3); c.cooldown = 5; }
    }
    if (c.hunger >= 100) { c.health -= dt * .08; if (c.health <= 0) onKill(c, false); }
  }
}

export function creatureStageReady(s: GameState) { return !!activeCreatureStage(s) && creatureIntelligence(s) >= 3; }
export function completeCreatureStage(s: GameState): boolean {
  const life = activeCreatureStage(s); if (!life || !creatureStageReady(s) || s.campaign.won || s.deathReason || s.player.health <= 0) return false;
  const home = s.world.landmarks[0].pos;
  if (horizontalDistance(s.player.pos, home) > 11) { notice(s, 'Tři hnízda jsou vyřešená. Vrať se do vlastního hnízda a stiskni G.'); return false; }
  const friends = life.nests.filter(n => n.outcome === 'friend').length, defeated = life.nests.filter(n => n.outcome === 'predator').length;
  life.completed = friends && defeated ? 'mixed' : friends ? 'social' : 'predator';
  s.campaign.won = true; s.campaign.finale = life.completed === 'social' ? 'restoration' : life.completed === 'predator' ? 'predator' : 'migration';
  life.encounter = null; life.attack = null; life.guards = [];
  s.lineage.push({ generation: s.player.generation, stage: 2, time: s.tick / 60, name: s.player.genome.name, parts: s.player.genome.parts.map(p => p.kind), event: `Život druhu: ${life.completed === 'social' ? 'přátelství' : life.completed === 'predator' ? 'predace' : 'smíšená cesta'}` });
  notice(s, 'Tvůj druh je připraven založit kmen.'); return true;
}
