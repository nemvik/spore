import { cultureGame } from './culture';
export function musicGame(tools = ['drum', 'flute', 'rattle']) {
  const s = cultureGame(), t = s.tribe, n = t.neighbours[0];
  s.world.obstacles = []; n.pos = { x: 0, y: 0, z: 0 };
  t.members = t.members.filter(u => !u.species);
  t.members.forEach((u, i) => { u.pos = { x: i * 2, y: 0, z: 1 }; u.tool = tools[i] as typeof u.tool; });
  for (const u of n.society!.members) u.pos = { x: 0, y: 0, z: 0 };
  for (const tool of ['drum', 'flute', 'rattle'] as const) { t.unlocked.push(tool); t.huts.push({ id: t.nextId++, kind: 'workshop', tool, pos: { ...t.huts[0].pos }, progress: 1, health: 100 }); }
  return { s, t, n, ids: t.members.map(u => u.id) };
}
