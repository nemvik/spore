import { acquisitionCaretaker } from './tribe-domestication';
import type { ActiveTribeState, TribeNeighbour, TribeUnit } from './era-types';
import type { GameState } from './types';
import { clamp, horizontalDistance } from './random';
import { cultureEffects } from './culture';
import { creatureInheritance } from './lineage-history';
import { neighbourGift, resolveNeighbourAlliance } from './tribe-neighbours';
import { recallExpedition, tribeContact } from './tribe-society';

export const INSTRUMENTS = ['drum', 'flute', 'rattle'] as const;
export type Instrument = typeof INSTRUMENTS[number];
export const MUSIC = { fee: 4, travel: 90, listen: 3, respond: 18, feedback: 2.5, contactGrace: 3, cooldown: 30 } as const;
export const INSTRUMENT_NAMES: Record<Instrument, string> = { drum: 'Buben', flute: 'Píšťala', rattle: 'Chřestidlo' };
export const INSTRUMENT_SYMBOLS: Record<Instrument, string> = { drum: '◉', flute: '♪', rattle: '⋮' };
export interface MusicRequest { instrument: Instrument; count: number }
export const MUSIC_REQUESTS: Record<TribeNeighbour['identity'], readonly MusicRequest[]> = {
  garden: [{ instrument: 'drum', count: 1 }, { instrument: 'flute', count: 1 }, { instrument: 'rattle', count: 1 }],
  terrace: [{ instrument: 'drum', count: 2 }, { instrument: 'rattle', count: 1 }, { instrument: 'flute', count: 1 }],
  sanctuary: [{ instrument: 'flute', count: 1 }, { instrument: 'rattle', count: 1 }, { instrument: 'drum', count: 1 }],
};
export type MusicReason = 'success' | 'mistakes' | 'cancelled' | 'contact' | 'lost-member' | 'host-lost' | 'conflict' | 'travel-timeout' | 'food';
export const MUSIC_REASONS: Record<MusicReason, string> = {
  success: 'Společná píseň se podařila.', mistakes: 'Dvě nezdařené odpovědi ukončily píseň.', cancelled: 'Návštěva ukončena hráčem.',
  contact: 'Skupina ztratila kontakt s hostitelem na 3 sekundy.', 'lost-member': 'Skupina ztratila člena.', 'host-lost': 'Hostitel už není živý nebo soused není dostupný.',
  conflict: 'Boj přerušil hudební setkání.', 'travel-timeout': 'Skupina nedorazila do 90 sekund.', food: 'Při příchodu chybělo jídlo na návštěvu a dar.',
};
export interface MusicRound { response: Instrument | null; players: number[]; multiplier: number; success: boolean }
export interface MusicEncounter {
  neighbour: number; host: number; members: number[]; phase: 'travel' | 'listen' | 'respond' | 'feedback';
  remaining: number; contactLost: number; paid: number; rounds: MusicRound[];
}
export interface MusicResult { neighbour: number; members: number[]; reason: MusicReason; rounds: MusicRound[]; delta: number; paid: number }
export interface TribeMusic { version: 1; active: MusicEncounter | null; result: MusicResult | null; cooldowns: { neighbour: number; remaining: number }[] }
export function musicRequest(n: TribeNeighbour, e: MusicEncounter): MusicRequest { return MUSIC_REQUESTS[n.identity][e.phase === 'feedback' ? e.rounds.length - 1 : e.rounds.length]; }
export function musicMembers(t: ActiveTribeState, e: MusicEncounter): TribeUnit[] { return e.members.flatMap(id => { const u = t.members.find(u => u.id === id && u.health > 0 && !u.species); return u ? [u] : []; }); }
export function musicContact(s: GameState, t: ActiveTribeState, e: MusicEncounter): boolean {
  const n = t.neighbours.find(n => n.id === e.neighbour), host = n?.society?.members.find(u => u.id === e.host && u.health > 0);
  return !!n && !!host && horizontalDistance(host.pos, n.pos) <= 12 && musicMembers(t, e).length === e.members.length && musicMembers(t, e).every(u => horizontalDistance(u.pos, host.pos) <= 9 && tribeContact(s.world, u.pos, host.pos));
}
export const musicParticipant = (t: ActiveTribeState, id: number): boolean => !!t.music?.active?.members.includes(id);
export function quoteMusic(s: GameState, ids: readonly number[], neighbour: number) {
  const t = s.tribe?.version === 2 ? s.tribe : null, n = t?.neighbours.find(n => n.id === neighbour);
  const cost = MUSIC.fee + (n && n.tribute < neighbourGift(n) ? neighbourGift(n) : 0);
  const fail = (message: string) => ({ ok: false, cost, message });
  if (s.stage !== 3 || s.deathReason || !t || !n || n.resolved || n.health <= 0) return fail('Hudba vyžaduje živý kmen a nevyřešeného souseda.');
  if (n.alarm > 0 || t.members.some(u => { const o=u.orders[0], target=o?.target; return !ids.includes(u.id) && u.health>0 && o?.kind==='attack' && (target.kind==='neighbour'&&target.id===n.id || target.kind==='neighbour-unit'&&n.society?.members.some(v=>v.id===target.id)); })) return fail('U souseda probíhá boj. Odvolej útočníky a vyčkej na uklidnění.');
  if(ids.some(id=>acquisitionCaretaker(s,id))) return fail('Pečující nejprve dokončí nebo přeruší získávání zvířete.');
  if (t.music?.active) return fail('Nejprve dokonči nebo ukonči probíhající návštěvu.');
  if ((t.music?.cooldowns.find(c => c.neighbour === neighbour)?.remaining ?? 0) > 0) return fail(`Soused odpočívá: ${Math.ceil(t.music!.cooldowns.find(c => c.neighbour === neighbour)!.remaining)} s.`);
  const members = [...new Set(ids)].map(id => t.members.find(u => u.id === id));
  if (!members.length || members.some(u => !u || u.health <= 0)) return fail('Vyber živé členy své skupiny.');
  if (members.some(u => u!.species)) return fail('Hudební nástroje hrají potomci. Symbionty z výběru vynech.');
  if (members.some(u => u!.cargo > 0 || u!.hunger > 68 || u!.health < 18)) return fail('Nejprve doma vylož náklad, nakrm a ošetři vybrané členy.');
  if (!n.society?.members.some(u => u.health > 0)) return fail('Soused nemá živého hostitele.');
  if (t.food < cost) return fail(`Na návštěvu a zbývající dar potřebuješ ${cost} jídla.`);
  return { ok: true, cost, message: `Při příchodu ${MUSIC.fee} jídla + ${cost - MUSIC.fee} dar. Bez vratky.` };
}
export function startMusic(s: GameState, ids: readonly number[], neighbour: number) {
  const quote = quoteMusic(s, ids, neighbour); if (!quote.ok) return quote;
  const t = s.tribe as ActiveTribeState, n = t.neighbours.find(n => n.id === neighbour)!;
  const host = n.society!.members.filter(u => u.health > 0).sort((a,b) => horizontalDistance(a.pos,n.pos)-horizontalDistance(b.pos,n.pos)||a.id-b.id)[0];
  const members = [...new Set(ids)].sort((a,b) => a-b);
  t.music ??= { version: 1, active: null, result: null, cooldowns: [] };
  t.music.active = { neighbour, host: host.id, members, phase: 'travel', remaining: MUSIC.travel, contactLost: 0, paid: 0, rounds: [] }; t.music.result = null;
  for (const u of musicMembers(t, t.music.active)) { u.orders = [{ unit: u.id, kind: 'socialize', target: { kind: 'neighbour', id: neighbour } }]; u.navigation.rethink = 0; }
  return { ok: true, message: 'Skupina jde za hostitelem. Píseň začne až při skutečném kontaktu.' };
}
function finishMusic(s: GameState, reason: MusicReason): void {
  const t = s.tribe as ActiveTribeState, m = t.music!, e = m.active!;
  const n = t.neighbours.find(n => n.id === e.neighbour)!;
  const paid = e.paid;
  const gain = reason === 'success' ? e.rounds.reduce((sum, r) => sum + (r.success ? 20 * r.multiplier : 0), 0) : paid ? reason === 'mistakes' ? -10 : -5 : 0;
  const before = n.relation; if (!n.resolved) n.relation = clamp(n.relation + gain, -100, 100);
  m.result = { neighbour: e.neighbour, members: [...e.members], reason, rounds: structuredClone(e.rounds), delta: n.relation - before, paid };
  m.cooldowns = [...m.cooldowns.filter(c => c.neighbour !== e.neighbour), { neighbour: e.neighbour, remaining: MUSIC.cooldown }];
  for (const u of musicMembers(t, e)) { u.orders = []; u.intent = 'rest'; }
  m.active = null;
  resolveNeighbourAlliance(t, n);
}
export function cancelMusic(s: GameState) {
  if (s.stage !== 3 || s.tribe?.version !== 2 || !s.tribe.music?.active) return { ok: false, message: 'Žádná hudební návštěva neprobíhá.' };
  finishMusic(s, 'cancelled'); return { ok: true, message: MUSIC_REASONS.cancelled };
}
function interruption(s: GameState, t: ActiveTribeState, e: MusicEncounter): MusicReason | null {
  const n = t.neighbours.find(n => n.id === e.neighbour);
  if (musicMembers(t,e).length !== e.members.length) return 'lost-member';
  if (!n || n.resolved || n.health <= 0 || !n.society?.members.some(u => u.id === e.host && u.health > 0)) return 'host-lost';
  if (n.alarm > 0 || t.members.some(u => {
    const order = u.orders[0], target = order?.target;
    return u.health > 0 && order?.kind === 'attack' && (target.kind === 'neighbour' && target.id === n.id || target.kind === 'neighbour-unit' && n.society!.members.some(v => v.id === target.id));
  })) return 'conflict';
  return null;
}
function recordAnswer(s: GameState, response: Instrument | null) {
  const t = s.tribe as ActiveTribeState, e = t.music!.active!, n = t.neighbours.find(n => n.id === e.neighbour)!, request = musicRequest(n, e);
  const players = musicMembers(t,e).filter(u => u.tool === response && response !== null);
  const success = response === request.instrument && players.length >= request.count;
  const multiplier = success ? players.reduce((sum, u) => sum + cultureEffects(u.outfit).social, 0) / players.length * creatureInheritance(s).social : 1;
  e.rounds.push({ response, players: players.map(u => u.id), multiplier, success }); e.phase = 'feedback'; e.remaining = MUSIC.feedback;
}
export function answerMusic(s: GameState, response: Instrument) {
  const t = s.tribe?.version === 2 ? s.tribe : null, e = t?.music?.active;
  if (s.stage !== 3 || s.deathReason || !t || !e || e.phase !== 'respond' || !INSTRUMENTS.includes(response)) return { ok: false, message: 'Počkej na výzvu k odpovědi.' };
  const reason = interruption(s,t,e); if (reason) { finishMusic(s,reason); return { ok: false, message: MUSIC_REASONS[reason] }; }
  if (!musicContact(s,t,e)) return { ok: false, message: 'Skupina není u hostitele. Obnov kontakt do 3 sekund.' };
  recordAnswer(s,response); return { ok: true };
}
export function stepMusic(s: GameState, dt: number): void {
  if (s.stage !== 3 || s.tribe?.version !== 2 || !s.tribe.music) return;
  const t = s.tribe, m = t.music!;
  for (const c of m.cooldowns) c.remaining = Math.max(0,c.remaining-dt);
  m.cooldowns = m.cooldowns.filter(c => c.remaining > 0);
  const e = m.active; if (!e) return;
  const reason = interruption(s,t,e); if (reason) { finishMusic(s,reason); return; }
  const n = t.neighbours.find(n => n.id === e.neighbour)!;
  const contact = musicContact(s,t,e);
  if (e.phase === 'travel') {
    e.remaining = Math.max(0, e.remaining-dt);
    if (!contact) { if (e.remaining === 0) finishMusic(s,'travel-timeout'); return; }
    const gift = n.tribute < neighbourGift(n) ? neighbourGift(n) : 0;
    if (t.food < MUSIC.fee + gift) { finishMusic(s,'food'); return; }
    t.food -= MUSIC.fee + gift; e.paid = MUSIC.fee + gift; n.tribute += gift;
    n.society!.food = Math.min(48,n.society!.food + gift); n.society!.truce = 20; recallExpedition(n.society!);
    e.phase = 'listen'; e.remaining = MUSIC.listen; return;
  }
  if (!contact) { e.contactLost = Math.min(MUSIC.contactGrace,e.contactLost + dt); if (e.contactLost >= MUSIC.contactGrace) finishMusic(s,'contact'); return; }
  e.contactLost = 0; n.society!.truce = 20;
  e.remaining = Math.max(0,e.remaining - dt); if (e.remaining > 1e-8) return;
  if (e.phase === 'listen') { e.phase = 'respond'; e.remaining = MUSIC.respond; }
  else if (e.phase === 'respond') recordAnswer(s,null);
  else if (e.rounds.filter(r => !r.success).length >= 2) finishMusic(s,'mistakes');
  else if (e.rounds.length === 3) finishMusic(s,'success');
  else { e.phase = 'listen'; e.remaining = MUSIC.listen; }
}

/** Shared read-only performance for world motion and sound; silence during broken contact. */
export function musicPerformance(s: GameState, id: number): { instrument: Instrument; role: 'host' | 'player'; success: boolean } | null {
  const t = s.tribe?.version === 2 ? s.tribe : null, e = t?.music?.active;
  if(s.stage!==3||!t||!e||e.phase==='travel'||!musicContact(s,t,e))return null;
  const n=t.neighbours.find(n=>n.id===e.neighbour)!;
  if(e.phase==='listen'&&e.host===id)return {instrument:musicRequest(n,e).instrument,role:'host',success:true};
  const last=e.rounds.at(-1);
  if(e.phase==='feedback'&&last?.response&&last.players.includes(id))return {instrument:last.response,role:'player',success:last.success};
  return null;
}

/** Called by actual incoming strikes, never by starvation or render animation. */
export function interruptMusicOnDamage(s: GameState, id: number, health: number): void {
  if(s.stage===3&&s.tribe?.version===2&&s.tribe.music?.active?.members.includes(id))finishMusic(s,health<=0?'lost-member':'conflict');
}
