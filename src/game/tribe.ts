import { initializeNeighbours, tribeContact } from './tribe-society';
import { creatureInheritance } from './lineage-history';
import { worldSpecies } from './npc-genome';
import { recordEcologyContact } from './ecology-catalog';
import type { ActiveTribeState, ToolId, TribeBuilding, TribeNeighbour, TribeUnit } from './era-types';
import type { GameState, Vec3 } from './types';
import type { UnitOrder, UnitTarget } from './unit-order';
import { MAX_UNIT_ORDERS, orderedIds, validOrderShape } from './unit-order';
import { computeStats, has } from './genome';
import { clamp, groundHeight, horizontalDistance } from './random';
import { moveUnit, openGround, unitNavigation } from './unit-motion';
import { meetNeighbour, neighbourGift, neighbourMaxHealth, stepNeighbours, strikeNeighbourUnit } from './tribe-neighbours';
import { TRIBE_COPY } from './tribe-copy.cs';
import { removeTribePrey } from './tribe-wildlife';
import { cultureEffects, memberCapacity } from './culture';

export const TRIBE_COSTS = { recruit: 12, shelter: 18, workshop: 22, equip: 6, ability: 6 } as const;
export const TRIBE_TOOLS: readonly ToolId[] = ['basket', 'spear', 'drum', 'waterskin'];
export type TribeAction = { ok: boolean; message?: string };
const fail = (message: string): TribeAction => ({ ok: false, message });
const success = (message?: string): TribeAction => ({ ok: true, message });
export const activeTribe = (s: GameState): ActiveTribeState | null => s.tribe?.version === 2 ? s.tribe : null;
export const tribeCapacity = (t: ActiveTribeState): number => Math.min(12, 2 + t.huts.filter(h => h.kind === 'shelter' && h.progress >= 1 && h.health > 0).length * 4);
export const memberDiet = (s: GameState, u: TribeUnit): readonly string[] => u.species ? worldSpecies(s.world,u.species).diet : computeStats(s.player.genome).diet;
export const tribeHome = (t: ActiveTribeState): Vec3 => t.huts.filter(h => h.kind === 'shelter' && h.progress === 1 && h.health > 0).sort((a,b) => a.id-b.id)[0].pos;
export const tribeReady = (s: GameState): boolean => { const t = activeTribe(s); return !!t && t.members.some(u => u.health > 0) && t.neighbours.length === 3 && t.neighbours.every(n => n.resolved !== null); };

function makeMember(id: number, pos: Vec3): TribeUnit {
  return { id, pos, heading: 0, health: 100, hunger: 8, tool: null, species: null, benefit: null, loyalty: 100, cargo: 0, cooldown: 0, orders: [], intent: 'rest', navigation: unitNavigation(pos) };
}
function memberSpawn(s: GameState, home: Vec3, members: readonly TribeUnit[], huts: readonly TribeBuilding[], id: number): Vec3 {
  for(let ring=0;ring<8;ring++)for(let offset=0;offset<16;offset++){
    const pos=openGround(s.world,home,id+offset,5+ring*3);
    if(members.every(u=>horizontalDistance(u.pos,pos)>=3.4)&&huts.every(h=>horizontalDistance(h.pos,pos)>=4.5))return pos;
  }
  return openGround(s.world,home,id,26);
}
export function createTribe(s: GameState): ActiveTribeState {
  const home = openGround(s.world, s.world.landmarks.find(l => l.kind === 'nest')!.pos, 0, 4);
  let nextId = 1;
  const hut: TribeBuilding = { id: nextId++, kind: 'shelter', pos: home, tool: null, progress: 1, health: 100 };
  const members:TribeUnit[]=[];
  for(let i=0;i<3;i++){const pos=memberSpawn(s,home,members,[hut],nextId);members.push(makeMember(nextId++,pos));}
  for (const bond of s.player.bonds) {
    const pos=memberSpawn(s,home,members,[hut],nextId),unit = makeMember(nextId++,pos);
    Object.assign(unit, { species: bond.species, benefit: bond.benefit, hunger: clamp(bond.hunger,0,100), loyalty: clamp(bond.loyalty,0,100) });
    members.push(unit);
  }
  const centers = [{ x: -38, y: 0, z: -28 }, { x: 42, y: 0, z: 6 }, { x: -12, y: 0, z: 46 }];
  const neighbours: TribeNeighbour[] = (['garden', 'terrace', 'sanctuary'] as const).map((identity, i) => ({
    id: nextId++, identity, pos: openGround(s.world, centers[i], i, 4), relation: identity === 'terrace' ? -35 : identity === 'garden' ? 30 : 0,
    resolved: null, health: neighbourMaxHealth({ identity }), alarm: 0, tribute: 0, cooldown: 0,
  }));
  const tribe: ActiveTribeState = { version: 2, food: 36, members, huts: [hut], unlocked: [], neighbours, legacyAbility: s.campaign.finale!, abilityCooldown: 0, abilityTime: 0, nextId, elapsed: 0, completed: false };
  initializeNeighbours(s, tribe);
  return tribe;
}

function playable(s: GameState): ActiveTribeState | null { return s.stage === 3 && !s.deathReason ? activeTribe(s) : null; }
function selected(t: ActiveTribeState, ids: readonly number[]): TribeUnit[] {
  const wanted = orderedIds(ids);
  return wanted.map(id => t.members.find(u => u.id === id && u.health > 0)).filter((u): u is TribeUnit => !!u);
}
export function issueTribeOrder(s: GameState, ids: readonly number[], kind: UnitOrder['kind'], target: UnitTarget, append = false): TribeAction {
  const t = playable(s); if (!t) return fail(TRIBE_COPY.unavailable);
  const units = selected(t, ids); if (!units.length || units.length !== orderedIds(ids).length) return fail(TRIBE_COPY.selectFirst);
  if (append && units.some(u => u.orders.length >= MAX_UNIT_ORDERS)) return fail(TRIBE_COPY.queueFull);
  if (!validOrderShape({ unit: units[0].id, kind, target })) return fail(TRIBE_COPY.badTarget);
  if (target.kind === 'food') {
    const food = s.world.resources.find(r => r.id === target.id);
    if (!food) return fail(TRIBE_COPY.badTarget);
    if (units.some(u => !memberDiet(s, u).includes(food.kind))) return fail(TRIBE_COPY.notFood);
  } else if (target.kind === 'creature') {
    if (!s.world.creatures.some(c => c.id === target.id)) return fail(TRIBE_COPY.badTarget);
    if (!has(s.player.genome, 'jaw') || units.some(u => !memberDiet(s, u).includes('meat'))) return fail(TRIBE_COPY.noHunting);
  } else if (target.kind === 'hut') {
    if (!t.huts.some(h => h.id === target.id && h.health > 0 && h.progress < 1)) return fail(TRIBE_COPY.badTarget);
  } else if (target.kind === 'neighbour-unit') {
    const n = t.neighbours.find(n=>!n.resolved&&n.society?.members.some(u=>u.id===target.id&&u.health>0));
    if (!n) return fail(TRIBE_COPY.badTarget);
    if (kind==='socialize'&&n.tribute<neighbourGift(n)&&t.food<neighbourGift(n)) return fail(TRIBE_COPY.noGift);
  } else if (target.kind === 'neighbour') {
    const n = t.neighbours.find(n => n.id === target.id && !n.resolved);
    if (!n) return fail(TRIBE_COPY.badTarget);
    if (kind === 'socialize' && n.tribute < neighbourGift(n) && t.food < neighbourGift(n)) return fail(TRIBE_COPY.noGift);
  } else if (target.kind !== 'point') return fail(TRIBE_COPY.badTarget);
  for (const [i, unit] of units.entries()) {
    const destination = structuredClone(target);
    if (destination.kind === 'point' && units.length > 1) {
      destination.pos.x = clamp(destination.pos.x + (i % 3 - 1) * 2, -75, 75);
      destination.pos.z = clamp(destination.pos.z + (Math.floor(i / 3) - Math.floor(units.length / 6)) * 2, -75, 75);
    }
    const order = { unit: unit.id, kind, target: destination };
    if (append) unit.orders.push(order); else unit.orders = [order];
    unit.navigation.rethink = 0;
  }
  return success();
}
export function stopTribeUnits(s: GameState, ids: readonly number[]): TribeAction {
  const t = playable(s); if (!t) return fail(TRIBE_COPY.unavailable);
  for (const u of selected(t, ids)) { u.orders = []; u.intent = 'rest'; }
  return success();
}
export function recruitTribeMember(s: GameState): TribeAction {
  const t = playable(s); if (!t || !t.members.some(u => u.health > 0)) return fail(TRIBE_COPY.unavailable);
  if (t.members.length >= tribeCapacity(t)) return fail(TRIBE_COPY.noRoom);
  if (t.food < TRIBE_COSTS.recruit) return fail(TRIBE_COPY.noFood);
  const pos = memberSpawn(s, tribeHome(t), t.members, t.huts, t.nextId);
  t.food -= TRIBE_COSTS.recruit; t.members.push(makeMember(t.nextId++, pos));
  return success(TRIBE_COPY.recruited);
}
export function buildTribeHut(s: GameState, kind: 'shelter' | 'workshop', tool: ToolId | null, pos: Vec3, builders: readonly number[]): TribeAction {
  const t = playable(s); if (!t) return fail(TRIBE_COPY.unavailable);
  const units = selected(t, builders); if (!units.length || units.length !== orderedIds(builders).length) return fail(TRIBE_COPY.selectFirst);
  if (kind !== 'shelter' && kind !== 'workshop' || kind === 'shelter' && tool !== null || kind === 'workshop' && !TRIBE_TOOLS.includes(tool!)) return fail(TRIBE_COPY.badTarget);
  if (t.huts.length >= 24) return fail(TRIBE_COPY.tooManyBuildings);
  if (![pos?.x,pos?.y,pos?.z].every(Number.isFinite) || Math.abs(pos.x) > 72 || Math.abs(pos.z) > 72 || horizontalDistance(pos, tribeHome(t)) > 24 ||
    s.world.obstacles.some(o => horizontalDistance(pos, o.pos) < o.radius + 2.2) || t.huts.some(h => horizontalDistance(pos, h.pos) < 4.5)) return fail(TRIBE_COPY.badPosition);
  const cost = TRIBE_COSTS[kind]; if (t.food < cost) return fail(TRIBE_COPY.noFood);
  const hut: TribeBuilding = { id: t.nextId++, kind, tool, pos: { x: pos.x, y: groundHeight(pos.x, pos.z, 2), z: pos.z }, progress: 0, health: 100 };
  t.food -= cost; t.huts.push(hut);
  for (const unit of units) { unit.orders = [{ unit: unit.id, kind: 'build', target: { kind: 'hut', id: hut.id } }]; unit.navigation.rethink = 0; }
  return success(TRIBE_COPY.founding);
}
export function equipTribeUnits(s: GameState, ids: readonly number[], tool: ToolId | null): TribeAction {
  const t = playable(s); if (!t) return fail(TRIBE_COPY.unavailable);
  const units = selected(t, ids); if (!units.length || units.length !== orderedIds(ids).length) return fail(TRIBE_COPY.selectFirst);
  if (tool !== null && (!TRIBE_TOOLS.includes(tool) || !t.unlocked.includes(tool))) return fail(TRIBE_COPY.noWorkshop);
  const changed = units.filter(u => u.tool !== tool), cost = tool === null ? 0 : changed.length * TRIBE_COSTS.equip;
  if (t.food < cost) return fail(TRIBE_COPY.noFood);
  t.food -= cost; for (const u of changed) u.tool = tool;
  return success(TRIBE_COPY.equipped);
}
export function useTribeAbility(s: GameState, ids: readonly number[]): TribeAction {
  const t = playable(s); if (!t) return fail(TRIBE_COPY.unavailable);
  const units = selected(t, ids); if (!units.length || units.length !== orderedIds(ids).length) return fail(TRIBE_COPY.selectFirst);
  if (t.abilityCooldown > 0) return fail(TRIBE_COPY.cooldown);
  if (t.food < TRIBE_COSTS.ability) return fail(TRIBE_COPY.noFood);
  t.food -= TRIBE_COSTS.ability; t.abilityCooldown = 45; t.abilityTime = 12;
  const center = units[0].pos;
  if (t.legacyAbility === 'restoration') {
    for (const r of s.world.resources) if (r.kind !== 'meat' && horizontalDistance(r.pos, center) < 18) { r.amount = Math.min(r.max, r.amount + 2); const patch = s.world.patches[r.patch]; patch.fertility = Math.min(1.5, patch.fertility + .02); }
  } else if (t.legacyAbility === 'predator') {
    for (const n of t.neighbours) if (horizontalDistance(n.pos, center) < 20) n.alarm = 0;
  } else {
    for (const u of units) { u.hunger = Math.max(0, u.hunger - 18); u.health = Math.min(100, u.health + 15); }
    for (const n of t.neighbours) if (!n.resolved && horizontalDistance(n.pos, center) < 16) n.relation = Math.min(99, n.relation + 12);
  }
  return success(TRIBE_COPY.abilities[t.legacyAbility].name);
}

export function stepTribe(s: GameState, dt: number): string[] {
  const t = activeTribe(s); if (!t) return [];
  const inheritance = creatureInheritance(s);
  const messages: string[] = [], home = tribeHome(t), stats = computeStats(s.player.genome);
  t.elapsed += dt; t.abilityCooldown = Math.max(0, t.abilityCooldown - dt); t.abilityTime = Math.max(0, t.abilityTime - dt);
  const units = [...t.members].sort((a, b) => a.id - b.id);
  const positions = [...units, ...t.neighbours.flatMap(n=>n.society?.members??[])].filter(u=>u.health>0).sort((a,b)=>a.id-b.id).map(u => ({ id: u.id, pos: { ...u.pos } }));
  for (const u of units) {
    if (u.health <= 0) continue;
    u.cooldown = Math.max(0, u.cooldown - dt);
    u.hunger = Math.min(100, u.hunger + dt * (u.species ? .22 : .15 * stats.metabolism));
    if (u.hunger >= 90) u.health = Math.max(0, u.health - dt * .55);
    if (u.health === 0) continue;
    if (u.species) u.loyalty = clamp(u.loyalty + dt * (u.hunger > 75 ? -.18 : .04), 0, 100);
    const pace = u.species ? clamp(worldSpecies(s.world,u.species).speed, 2.5, 6) : clamp(stats.speed * stats.walk, 2.5, 6);
    const cultural = cultureEffects(u.outfit);
    const travel = (target: Vec3, stop = 2) => moveUnit(s.world, u, target, positions, pace * cultural.speed, dt, stop);
    const contact = (target: Vec3, stop: number) => { travel(target, tribeContact(s.world,u.pos,target) ? stop : .5); return horizontalDistance(u.pos,target)<=stop+.05 && tribeContact(s.world,u.pos,target); };
    const atHome = horizontalDistance(u.pos, home) < 4;
    if (atHome) {
      if (u.cargo > 0) { t.food += u.cargo * 4; u.cargo = 0; }
      if (u.hunger >= 30 && t.food >= 2) { t.food -= 2; u.hunger = Math.max(0, u.hunger - 32); }
      if (u.hunger < 60) u.health = Math.min(100, u.health + dt * 1.6);
    }
    if (u.tool === 'waterskin' && u.hunger < 70) for (const other of units) if (other.health > 0 && horizontalDistance(u.pos, other.pos) < 7) other.health = Math.min(100, other.health + dt * .9);
    const order = u.orders[0], target = order?.target, capacity = memberCapacity(u);
    if (u.cargo >= capacity || u.cargo > 0 && (!order || target?.kind === 'food' && !s.world.resources.some(r => r.id === target.id && r.amount >= 1))) {
      u.intent = 'forage'; travel(home, 3); continue;
    }
    // An empty camp cannot feed a hungry gatherer. Let it secure the next meal
    // instead of trapping it in a retreat loop just outside the home radius.
    if ((u.hunger > 68 && t.food >= 2 || u.health < 18 && (t.food >= 2 || u.hunger < 60)) && !atHome) { u.intent = 'flee'; travel(home, 3); continue; }
    if (!order || !target) {
      u.intent = 'rest';
      const enemy=t.neighbours.flatMap(n=>!n.resolved&&n.society?.truce===0?n.society.members.filter(v=>v.health>0&&(v.task==='raid'||v.task==='defend')&&horizontalDistance(u.pos,v.pos)<(u.tool==='spear'?4.5:2.5)).map(v=>({n,v})):[]).sort((a,b)=>horizontalDistance(u.pos,a.v.pos)-horizontalDistance(u.pos,b.v.pos)||a.v.id-b.v.id)[0];
      if(enemy&&tribeContact(s.world,u.pos,enemy.v.pos))strikeNeighbourUnit(u,enemy.n,enemy.v,u.species?1:inheritance.combat);
      continue;
    }
    const finish = () => { u.orders.shift(); u.navigation.rethink = 0; u.intent = 'rest'; };
    if (target.kind === 'point') { u.intent = 'forage'; if (travel(target.pos, .5)) finish(); continue; }
    if (target.kind === 'food') {
      const food = s.world.resources.find(r => r.id === target.id);
      if (!food || !memberDiet(s, u).includes(food.kind) || food.amount < 1) { finish(); continue; }
      u.intent = 'forage';
      if (travel(food.pos, 2) && u.cooldown === 0) {
        const portion = Math.min(1, capacity - u.cargo);
        const mother=s.journey.sites.find(site=>site.stage===s.world.stage&&(site.sourceId===food.id||site.plantedId===food.id));if(mother)recordEcologyContact(s,`culture:${mother.id}`,'culture',s.world.stage,mother.patch as 0|1|2);
        food.amount -= portion; u.cargo += portion; u.cooldown = 1.8;
        const patch = s.world.patches[food.patch]; patch.harvested++; patch.fertility = Math.max(.15, patch.fertility - .003);
      }
    } else if (target.kind === 'hut') {
      const hut = t.huts.find(h => h.id === target.id);
      if (!hut || hut.progress >= 1) { finish(); continue; }
      u.intent = 'build';
      if (travel(hut.pos, 3)) {
        hut.progress = Math.min(1, hut.progress + dt / 14);
        if (hut.progress === 1) { if (hut.tool && !t.unlocked.includes(hut.tool)) { t.unlocked.push(hut.tool); t.unlocked.sort(); } messages.push(TRIBE_COPY.built); finish(); }
      }
    } else if (target.kind === 'neighbour-unit') {
      const n=t.neighbours.find(n=>!n.resolved&&n.society?.members.some(v=>v.id===target.id&&v.health>0));
      const v=n?.society?.members.find(v=>v.id===target.id);
      if(!n||!v){finish();continue;}
      if(contact(v.pos,order.kind==='attack'&&u.tool==='spear'?4.5:2.5)){
        if(order.kind==='attack')strikeNeighbourUnit(u,n,v,u.species?1:inheritance.combat);
        else {const message=meetNeighbour(t,u,n,'socialize',dt,u.species?undefined:inheritance);if(message)messages.push(message);}
      }
    } else if (target.kind === 'neighbour') {
      const neighbour = t.neighbours.find(n => n.id === target.id);
      if (!neighbour || neighbour.resolved) { finish(); continue; }
      const defender=order.kind==='attack'?neighbour.society?.members.filter(v=>v.health>0&&horizontalDistance(v.pos,u.pos)<9).sort((a,b)=>horizontalDistance(a.pos,u.pos)-horizontalDistance(b.pos,u.pos)||a.id-b.id)[0]:undefined;
      if(defender){if(contact(defender.pos,u.tool==='spear'?4.5:2.5))strikeNeighbourUnit(u,neighbour,defender,u.species?1:inheritance.combat);continue;}
      if (contact(neighbour.pos, order.kind === 'attack' && u.tool === 'spear' ? 4.5 : 3.5)) {
        const message = meetNeighbour(t, u, neighbour, order.kind === 'attack' ? 'attack' : 'socialize', dt, u.species ? undefined : inheritance); if (message) messages.push(message);
      }
    } else if (target.kind === 'creature') {
      const prey = s.world.creatures.find(c => c.id === target.id);
      if (!prey || !has(s.player.genome, 'jaw') || !memberDiet(s, u).includes('meat')) { finish(); continue; }
      u.intent = 'hunt';
      if (travel(prey.pos, u.tool === 'spear' ? 4 : 2) && u.cooldown === 0) {
        prey.health = Math.max(0, prey.health - (u.tool === 'spear' ? 26 : stats.damage * .65) * cultural.combat); u.cooldown = 1.2;
        if (prey.health === 0) {
          recordEcologyContact(s,`species:${prey.species}`,'hunt',worldSpecies(s.world,prey.species).stage as 0|1|2,prey.patch as 0|1|2);removeTribePrey(s,prey); finish();
        }
      }
    } else finish();
  }
  messages.push(...stepNeighbours(s, t, dt));
  t.members = t.members.filter(u => u.health > 0);
  if (!t.members.length) { s.deathReason = TRIBE_COPY.dead; messages.push(TRIBE_COPY.dead); }
  if (!t.completed && tribeReady(s)) { t.completed = true; messages.push(TRIBE_COPY.allResolved); }
  return messages;
}
