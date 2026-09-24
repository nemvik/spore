import { neighbourGift } from './tribe-neighbours';
import type { GameState } from './types';
import { creatureInheritance } from './lineage-history';
import { cultureEffects } from './culture';
import type { ActiveTribeState, TribeNeighbour } from './era-types';
import { INSTRUMENTS, MUSIC, MUSIC_REQUESTS, MUSIC_REASONS, type MusicRound } from './tribe-music';
const invalid = (): never => { throw new Error('Poškozená uložená hra (state.tribe.music): neplatné hudební setkání.'); };
function exact(v: unknown, keys: string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v,k))) invalid();
  return v as Record<string, unknown>;
}
function number(v: unknown, min: number, max: number, integer = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || integer && !Number.isInteger(v)) invalid(); return v as number;
}
function list(v: unknown, min: number, max: number): unknown[] { if (!Array.isArray(v) || v.length < min || v.length > max) invalid(); return v as unknown[]; }
export function validateMusic(value: unknown, t: ActiveTribeState): void {
  const m = exact(value, ['version','active','result','cooldowns']); if (m.version !== 1) invalid();
  const neighbour = (id: unknown) => { const n = t.neighbours.find(n => n.id === id); if (!n?.society) return invalid(); return n; };
  const memberIds = (v: unknown, min: number) => {
    const ids = list(v,min,12).map(id => number(id,1,t.nextId-1,true)); if (new Set(ids).size !== ids.length) invalid();
    // Dead visitors remain valid historical references; IDs never get reused.
    if (ids.some(id => t.members.find(u => u.id === id)?.species || t.neighbours.some(n => n.id === id || n.society?.members.some(u => u.id === id)) || t.huts.some(h => h.id === id))) invalid();
    return ids;
  };
  const rounds = (v: unknown, ids: number[], n: TribeNeighbour): MusicRound[] => list(v,0,3).map((v,index) => {
    const r = exact(v,['response','players','multiplier','success']);
    if (r.response !== null && !INSTRUMENTS.includes(r.response as never)) invalid();
    const players = memberIds(r.players,0); if (players.some(id => !ids.includes(id)) || r.response === null && players.length) invalid();
    const request = MUSIC_REQUESTS[n.identity][index], success = r.response === request.instrument && players.length >= request.count;
    if (r.success !== success) invalid(); number(r.multiplier,1,success ? 1.4375 : 1);
    return r as unknown as MusicRound;
  });
  const cooldowns = list(m.cooldowns,0,t.neighbours.length).map(v => { const c=exact(v,['neighbour','remaining']); neighbour(c.neighbour); number(c.remaining,0,MUSIC.cooldown); return c.neighbour; });
  if (new Set(cooldowns).size !== cooldowns.length) invalid();
  if (m.active !== null) {
    const e = exact(m.active,['neighbour','host','members','phase','remaining','contactLost','paid','rounds']), n = neighbour(e.neighbour), ids = memberIds(e.members,1);
    const host = number(e.host,1,t.nextId-1,true);
    if (ids.includes(host) || t.members.some(u => u.id === host) || t.huts.some(h => h.id === host) || t.neighbours.some(v => v.id === host || v.id !== n.id && v.society?.members.some(u => u.id === host))) invalid();
    const rs = rounds(e.rounds,ids,n); number(e.contactLost,0,MUSIC.contactGrace);
    if (!['travel','listen','respond','feedback'].includes(e.phase as string)) invalid();
    number(e.remaining,0,MUSIC[e.phase as 'travel'|'listen'|'respond'|'feedback']);
    if (e.phase === 'travel') { if (e.paid !== 0 || rs.length || e.contactLost !== 0) invalid(); }
    else {
      const gift = neighbourGift(n);
      if (![MUSIC.fee,MUSIC.fee+gift].includes(e.paid as number) || n.tribute < gift) invalid();
      if (e.phase === 'feedback' ? !rs.length : rs.length > 2 || rs.filter(r => !r.success).length > 1) invalid();
    }
    if (rs.slice(0,-1).filter(r => !r.success).length > 1 || cooldowns.includes(n.id) || m.result !== null) invalid();
  }
  if (m.result !== null) {
    const r=exact(m.result,['neighbour','members','reason','rounds','delta','paid']), n=neighbour(r.neighbour), ids=memberIds(r.members,1), rs=rounds(r.rounds,ids,n);
    if (typeof r.reason !== 'string' || !Object.hasOwn(MUSIC_REASONS,r.reason)) invalid();
    number(r.paid,0,20,true); const gift=neighbourGift(n);
    if (![0,MUSIC.fee,MUSIC.fee+gift].includes(r.paid as number)) invalid();
    if (r.reason === 'success') { if (rs.length!==3 || rs.filter(v=>v.success).length<2 || !r.paid) invalid(); number(r.delta,0,rs.reduce((sum,v)=>sum+(v.success?20*v.multiplier:0),0)); }
    else { number(r.delta,r.paid ? r.reason==='mistakes'?-10:-5 : 0,0); if (r.reason==='mistakes' && (rs.filter(v=>!v.success).length!==2 || !r.paid)) invalid(); }
    if (rs.length && !r.paid) invalid();
  }
}

/** Active equipment is locked. Historical result snapshots may outlive or re-equip their players. */
export function validateMusicContext(s: GameState): void {
  const t=s.tribe?.version===2?s.tribe:null, e=t?.music?.active;
  if(!t||!e)return;
  if(s.stage!==3)invalid();
  const members=e.members.map(id=>t.members.find(u=>u.id===id&&u.health>0&&!u.species));
  // A wildlife death can occur after the tribe phase; this state will cancel, never grant a reward.
  if(members.some(u=>!u))return;
  for(const r of e.rounds){
    const players=members.filter(u=>r.response!==null&&u!.tool===r.response);
    if(players.length!==r.players.length||players.some(u=>!r.players.includes(u!.id)))invalid();
    const multiplier=r.success?players.reduce((sum,u)=>sum+cultureEffects(u!.outfit).social,0)/players.length*creatureInheritance(s).social:1;
    if(Math.abs(r.multiplier-multiplier)>1e-10)invalid();
  }
}
