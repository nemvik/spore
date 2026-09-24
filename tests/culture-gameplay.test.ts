import { expect, it } from 'vitest';
import { cultureGame, envoy, guard } from './fixtures/culture';
import { equipOutfit } from '../src/game/culture';
import { issueTribeOrder, memberDiet, stepTribe } from '../src/game/tribe';
import { meetNeighbour, strikeNeighbourUnit } from '../src/game/tribe-neighbours';
import { stepSociety } from '../src/game/tribe-society';
import { stepTribeWildlife } from '../src/game/tribe-wildlife';
import { horizontalDistance } from '../src/game/random';
import { spawnCreature } from '../src/game/world';
import { SPECIES } from '../src/game/content';

function isolated() {
  const s = cultureGame(); s.world.obstacles = []; s.world.resources = []; s.world.creatures = [];
  s.tribe.members = s.tribe.members.slice(0, 1);
  for (const n of s.tribe.neighbours) { n.society!.members = []; n.society!.food = 48; }
  return s;
}
it.each([false, true])('physically collects and delivers the larger bag load (basket=%s)', basket => {
  const s = isolated(), t = s.tribe, u = t.members[0];
  equipOutfit(s, [u.id], envoy); u.tool = basket ? 'basket' : null;
  const start = t.food, target = { ...u.pos, x: u.pos.x + 15 }, capacity = basket ? 7 : 4;
  const resource = { id: s.world.nextId++, kind: memberDiet(s, u)[0] as 'algae', pos: target, amount: 10, max: 10, regen: 0, patch: 0 };
  s.world.resources.push(resource); issueTribeOrder(s, [u.id], 'gather', { kind: 'food', id: resource.id });
  let largest = 0;
  for (let i = 0; i < 3600 && t.food === start; i++) { stepTribe(s, 1 / 60); largest = Math.max(largest, u.cargo); }
  expect(largest).toBe(capacity); expect(t.food - start).toBe(capacity * 4); expect(resource.amount).toBe(10 - capacity);
});
it('stacks plume with the actual drum and SP-007.A factor without discounting the gift', () => {
  const s = cultureGame(), t = s.tribe, u = t.members[0], n = t.neighbours[0];
  equipOutfit(s, [u.id], envoy); u.tool = 'drum'; const food = t.food, relation = n.relation;
  meetNeighbour(t, u, n, 'socialize', 1, { social: 1.15, combat: 1 });
  expect(n.relation - relation).toBeCloseTo(4.6); expect(food - t.food).toBe(8); expect(n.tribute).toBe(8);
});
it('stacks crest with spear and inherited combat against both a defender and settlement', () => {
  const s = cultureGame(), t = s.tribe, u = t.members[0], n = t.neighbours[1], defender = n.society!.members[0];
  equipOutfit(s, [u.id], guard); u.tool = 'spear'; const health = n.health;
  meetNeighbour(t, u, n, 'attack', 1, { social: 1, combat: 1.15 });
  expect(health - n.health).toBeCloseTo(24.84);
  u.cooldown = 0; const hp = defender.health; strikeNeighbourUnit(u, n, defender, 1.15);
  expect(hp - defender.health).toBeCloseTo(24.84); expect(u.cooldown).toBe(1.15);
});
it('shell absorbs real neighbour damage and leaves the attacker cooldown unchanged', () => {
  const s = cultureGame(), t = s.tribe, u = t.members[0], n = t.neighbours[1], v = n.society!.members[0];
  equipOutfit(s, [u.id], guard); s.world.obstacles = []; t.members = [u]; n.society!.members = [v];
  u.pos = { ...n.pos }; v.pos = { ...n.pos, x: n.pos.x + 1 }; v.cooldown = 0;
  issueTribeOrder(s, [u.id], 'attack', { kind: 'neighbour', id: n.id });
  stepSociety(s, t, n, 1 / 60, []);
  expect(u.health).toBe(96.25); expect(v.cooldown).toBe(1.8);
});
it('shell absorbs a real wildlife strike but never starvation', () => {
  const s = cultureGame(), u = s.tribe.members[0]; equipOutfit(s, [u.id], guard);
  const predator = spawnCreature(s.world, SPECIES.find(c => c.stage === 2 && c.role === 'predator')!.id, 0);
  expect(predator).toBeDefined();
  s.tribe.members = [u]; s.world.creatures = [predator]; s.world.obstacles = [];
  predator.pos = { ...u.pos }; predator.velocity = { x: 0, y: 0, z: 0 }; predator.intent = 'hunt'; predator.target = null; predator.cooldown = 0; s.tick = 1;
  const baseline = structuredClone(s); delete baseline.tribe.members[0].outfit;
  stepTribeWildlife(s, s.tribe, 1 / 60); stepTribeWildlife(baseline, baseline.tribe, 1 / 60);
  expect(100 - u.health).toBeGreaterThan(0); expect(100 - u.health).toBeCloseTo((100 - baseline.tribe.members[0].health) * .75);
  u.hunger = 99; u.pos.x += 30; u.health = 80; s.tribe.food = 0;
  stepTribe(s, 1); expect(u.health).toBeCloseTo(79.45);
});
it('shell slows actual travel by ten percent while genome, diet and orders stay the same', () => {
  const s = isolated(), u = s.tribe.members[0]; equipOutfit(s, [u.id], guard);
  const baseline = structuredClone(s); delete baseline.tribe.members[0].outfit;
  const start = { ...u.pos }, dest = { ...start, x: start.x + 20 };
  for (const v of [s, baseline]) issueTribeOrder(v, [u.id], 'move', { kind: 'point', pos: dest });
  stepTribe(s, .1); stepTribe(baseline, .1);
  expect(horizontalDistance(start, u.pos)).toBeCloseTo(horizontalDistance(start, baseline.tribe.members[0].pos) * .9);
  expect(s.player.genome).toEqual(baseline.player.genome); expect(memberDiet(s, u)).toEqual(memberDiet(baseline, baseline.tribe.members[0]));
});
it('crest increases a permitted hunt but never grants a herbivore permission to hunt', () => {
  const s = isolated(), u = s.tribe.members[0]; equipOutfit(s, [u.id], guard); u.tool = 'spear';
  const prey = spawnCreature(s.world, SPECIES.find(c => c.stage === 2 && c.role === 'grazer')!.id, 0);
  s.world.creatures = [prey]; prey.pos = { ...u.pos, x: u.pos.x + 1 }; prey.health = 100;
  expect(issueTribeOrder(s, [u.id], 'attack', { kind: 'creature', id: prey.id }).ok).toBe(false);
  s.player.genome.parts.push({ id: 'prepared-jaw', kind: 'jaw', axial: .8, angle: 0, scale: 1, mirrored: false });
  expect(issueTribeOrder(s, [u.id], 'attack', { kind: 'creature', id: prey.id }).ok).toBe(true);
  stepTribe(s, 1 / 60); expect(prey.health).toBeCloseTo(68.8); expect(u.cooldown).toBe(1.2);
});
