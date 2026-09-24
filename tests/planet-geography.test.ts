import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGame, makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { parseGame, serializeGame } from '../src/game/persistence';
import { enableHomePlanet, locationAddress, type HomePlanet } from '../src/game/home-planet';
import { addressGeography, atlasNeighbours, BIOMES, geographicAddress, geographicCell, localAddress, locationGeography, planetAtlas, validGeographicPoint } from '../src/game/planet-geography';
import { EMPTY_INPUT, type GameState } from '../src/game/types';
import { enableLineageHistory, tribeInheritance } from '../src/game/lineage-history';
import { groundHeight } from '../src/game/random';
import { homePlanetMarkup } from '../src/ui/home-planet';

const manifest = JSON.parse(readFileSync('tests/fixtures/saves/manifest.json', 'utf8')).files as { file: string; sha256: string }[];
const load = (file: string) => parseGame(readFileSync(`tests/fixtures/saves/${file}`, 'utf8'));
const recipe = (seed: number): HomePlanet => ({ version: 2, id: 'home-test', locations: [], currentLocationId: '', geography: { generator: 1, seed, provenance: 'birth' } });
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const raw = (s: GameState) => JSON.stringify({format:'lumavora',version:3,savedAt:1,state:s});
function removeHome(s: GameState): GameState {
  const copy = structuredClone(s); delete copy.homePlanet;
  if (copy.checkpoint) copy.checkpoint = JSON.stringify(removeHome(JSON.parse(copy.checkpoint)));
  return copy;
}
function asV1(s: GameState): void {
  enableHomePlanet(s);
  if (s.homePlanet?.version === 2) { const { geography: _, ...identity } = s.homePlanet; s.homePlanet = { ...identity, version: 1 }; }
  if (s.checkpoint) { const cp = JSON.parse(s.checkpoint); asV1(cp); s.checkpoint = JSON.stringify(cp); }
}

describe('SP-010.B deterministic atlas and topology', () => {
  const seeds = [0, 1, 42, 481516, 0xffffffff, ...Array.from({length:27}, (_,i) => Math.imul(i+5, 239871) >>> 0)];
  it.each(seeds)('seed %i retains canonical cells, regions and coastal placements after cache eviction', seed => {
    const p = recipe(seed), a = planetAtlas(p)!;
    for (let i=100; i<110; i++) planetAtlas(recipe(i));
    const b = planetAtlas(p)!; expect(b).not.toBe(a); expect(b).toEqual(a);
    expect(a.cells).toHaveLength(2592); expect(Object.isFrozen(a)).toBe(true); expect(Object.isFrozen(a.cells[0])).toBe(true);
    expect(a.regions.filter(r=>r.surface==='land').length).toBeGreaterThanOrEqual(3);
    expect(a.cells.filter(c=>c.surface==='water').length).toBeGreaterThan(1200);
    expect(a.cells.filter(c=>c.surface==='land').length).toBeGreaterThan(300);
    const [micro,reef,coast] = a.anchors;
    expect(micro.cellId).toBe(reef.cellId); expect(atlasNeighbours(coast.cellId)).toContain(reef.cellId);
    expect(a.cells[coast.cellId].biome).toBe('rainforest'); expect(a.cells[reef.cellId].biome).toBe('shelf');
    for (const anchor of a.anchors) {
      expect(validGeographicPoint(anchor)).toBe(true); expect(geographicCell(a,anchor)!.id).toBe(anchor.cellId);
      expect(Object.isFrozen(anchor)).toBe(true);
    }
    for (const c of a.cells) {
      expect(BIOMES).toContain(c.biome); expect(c.surface).toBe(c.elevationMeters>0?'land':'water');
      expect(c.moisture).toBeGreaterThanOrEqual(0); expect(c.moisture).toBeLessThanOrEqual(100);
      const region = a.regions.find(r=>r.id===c.regionId)!; expect(region.surface).toBe(c.surface);
      for (const neighbour of atlasNeighbours(c.id)) {
        expect(atlasNeighbours(neighbour)).toContain(c.id);
        if (a.cells[neighbour].surface===c.surface) expect(a.cells[neighbour].regionId).toBe(c.regionId);
      }
    }
    expect(a.regions.reduce((sum,r)=>sum+r.cellCount,0)).toBe(a.cells.length);
  });
  it('has stable generator-1 fingerprints, different per seed', () => {
    const hashes = [0,42,481516,0xffffffff].map(seed=>fingerprint(planetAtlas(recipe(seed))));
    expect(new Set(hashes).size).toBe(4);
    expect(hashes).toMatchInlineSnapshot(`
      [
        "3a876c78c8f0cb4d6c18a48e23f151f7e0495b857b46b6bb5de97d3b6fe74075",
        "7ea80ca3437f77a2361d3106dd5f9afc1c5a01ccfc71228aed2ec5aef93d711e",
        "6a926789e83d787a3f42f0b163c051ff13aca38ca3861521c894575c4afefbe6",
        "7844b89cadb98dfc07a3125196c128f362213ff3f8830613343855a653d5f665",
      ]
    `);
  });
  it('wraps longitude adjacency and handles geographic poles and invalid coordinates explicitly', () => {
    const a = planetAtlas(recipe(1))!;
    expect(atlasNeighbours(0)).toEqual([71,1,72]); expect(atlasNeighbours(2591)).toEqual([2590,2520,2519]);
    for (const id of [-1,2592,NaN,.5]) expect(atlasNeighbours(id)).toEqual([]);
    expect(geographicCell(a,{longitude:-180,latitude:90,altitudeMeters:0})!.id).toBe(0);
    expect(geographicCell(a,{longitude:179.999,latitude:-90,altitudeMeters:0})!.id).toBe(2591);
    // The last representable value below 180 rounds to 360 when adding 180.
    for (const [latitude,id] of [[90,71],[0,1367],[-90,2591]]) {
      expect(geographicCell(a,{longitude:179.99999999999997,latitude,altitudeMeters:0})!.id).toBe(id);
    }
    for (const p of [{longitude:180,latitude:0,altitudeMeters:0},{longitude:0,latitude:91,altitudeMeters:0},{longitude:NaN,latitude:0,altitudeMeters:0},{longitude:0,latitude:0,altitudeMeters:Infinity}]) expect(geographicCell(a,p)).toBeNull();
  });
});

describe('explicit local/global address bridge', () => {
  it.each([0,42,481516,0xffffffff])('seed %i round trips every habitat without moving world entities', seed => {
    const s = load('stable-sandbox.save.json'); // Keep the original seed/world contract for persistence tests below.
    enableHomePlanet(s); if(s.homePlanet?.version===2)s.homePlanet.geography.seed=seed;
    const before = structuredClone(s);
    for(const l of s.homePlanet!.locations) for(const position of [{x:0,y:0,z:0},{x:-78,y:-1024,z:78},{x:78,y:1024,z:-78},{x:21.5,y:-2.4,z:36.2}]) {
      const local = locationAddress(s,position,l.id)!, global = geographicAddress(s,local)!;
      expect(validGeographicPoint(global.point)).toBe(true);
      const back=localAddress(s,global,l.id)!; expect(back).not.toBeNull();
      for(const axis of ['x','y','z'] as const) expect(back.position[axis]).toBeCloseTo(position[axis],6);
      const query=addressGeography(s,local)!; expect(query.world).toBe(s.worlds[l.worldSlot]);
      expect(query.localGround).toBe(groundHeight(position.x,position.z,l.worldSlot));
      expect(query.groundAltitudeMeters).toBe(query.anchor.altitudeMeters+query.localGround*query.anchor.metersPerUnit);
      expect(geographicCell(planetAtlas(s.homePlanet!)!,global.point)!.id).toBe(query.cell.id);
    }
    expect(s).toEqual(before);
  });
  it('rejects foreign, absent, nonfinite and out-of-footprint addresses without creating a location', () => {
    const s=createGame(42);enableHomePlanet(s);const l=s.homePlanet!.currentLocationId;
    const local=locationAddress(s,{x:0,y:0,z:0})!, global=geographicAddress(s,local)!;
    expect(geographicAddress(s,{...local,planetId:'foreign'})).toBeNull();
    expect(localAddress(s,{...global,planetId:'foreign'},l)).toBeNull();
    expect(localAddress(s,global,'unknown')).toBeNull();
    expect(localAddress(s,{...global,point:{...global.point,latitude:global.point.latitude+1}},l)).toBeNull();
    expect(geographicAddress(s,{...local,position:{x:79,y:0,z:0}})).toBeNull();
    expect(geographicAddress(s,{...local,position:{x:0,y:NaN,z:0}})).toBeNull();
    expect(locationGeography(s,`${s.homePlanet!.id}:coast`)).toBeNull();
    expect(s.worlds[2]).toBeNull();
    asV1(s);expect(planetAtlas(s.homePlanet!)).toBeNull();expect(geographicAddress(s,local)).toBeNull();
  });
});

describe('migration from shipped A and historical campaigns', () => {
  it.each(manifest)('$file: immutable fixture, repeatable v1 migration, exact world/history/RNG parity', ({file,sha256}) => {
    expect(createHash('sha256').update(readFileSync(`tests/fixtures/saves/${file}`)).digest('hex')).toBe(sha256);
    const s=load(file);expect(s.homePlanet).toBeUndefined();asV1(s);
    const old=parseGame(serializeGame(s));expect(old.homePlanet!.version).toBe(1);
    const before=structuredClone(old), oldLocal=locationAddress(old,old.player.pos)!;
    enableHomePlanet(old);
    expect(old.homePlanet!.version).toBe(2);expect(removeHome(old)).toEqual(removeHome(before));
    expect(locationAddress(old,old.player.pos)).toEqual(oldLocal);
    const atlas=fingerprint(planetAtlas(old.homePlanet!)!);
    for(let i=0;i<3;i++) { const cp=old.checkpoint;enableHomePlanet(old);expect(old.checkpoint).toBe(cp);expect(fingerprint(planetAtlas(old.homePlanet!)!)).toBe(atlas); }
    const restored=parseGame(serializeGame(old));expect(restored.homePlanet).toEqual(old.homePlanet);
    const recovered=recoverGeneration(restored);
    expect(fingerprint(planetAtlas(recovered.homePlanet!)!)).toBe(atlas);
    // A and B consume the same simulation inputs with identical history activation.
    enableLineageHistory(before);enableLineageHistory(old);
    for(let i=0;i<120;i++) {step(before,EMPTY_INPUT);step(old,EMPTY_INPUT);}
    expect(removeHome(old)).toEqual(removeHome(before));expect(tribeInheritance(old)).toEqual(tribeInheritance(before));
  });
  it('migrates the byte-identical SP-010.A browser export before rekey and checkpoints the same recipe', () => {
    const bytes=readFileSync('tests/fixtures/geography/sp-010a-fresh.save.json');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('d1ab026239c80e0843e379984056c2b9e0b963069051a111cb27b207f5dc8ece');
    const s=parseGame(bytes.toString());
    expect(s.homePlanet!.version).toBe(1);const before=structuredClone(s),id=s.homePlanet!.id;
    enableHomePlanet(s);expect(removeHome(s)).toEqual(removeHome(before));
    expect(s.homePlanet).toMatchObject({version:2,id,geography:{provenance:'legacy-assigned'}});
    s.id='imported-slot';const cp=JSON.parse(s.checkpoint!);cp.id=s.id;s.checkpoint=JSON.stringify(cp);
    const imported=parseGame(serializeGame(s));enableHomePlanet(imported);expect(imported.homePlanet).toEqual(s.homePlanet);
    makeCheckpoint(imported);expect(recoverGeneration(imported).homePlanet).toEqual(imported.homePlanet);
  });
  it('formats habitat scale without floating point tails', () => {
    const s=load('stable-sandbox.save.json');enableHomePlanet(s);
    expect(homePlanetMarkup(s)).toContain('šířka místa 15,6 m');
    expect(homePlanetMarkup(s)).toContain('Aktuální lokalita: <strong>Dešťové pobřeží</strong>');
  });
  it('new UI construction records birth while historical activation never infers it from tick zero', () => {
    const fresh=createGame(42,true,false,false,false,false,false,undefined,false,false,true);
    expect(fresh.homePlanet).toMatchObject({version:2,geography:{provenance:'birth'}});
    const old=createGame(42);enableHomePlanet(old);expect(old.homePlanet).toMatchObject({geography:{provenance:'legacy-assigned'}});
    expect(homePlanetMarkup(old)).toContain('Geografie nově přiřazená starší kampani');
    expect(homePlanetMarkup(fresh)).toContain('Geografie založená s touto linií');
    expect(homePlanetMarkup(fresh)).toContain('aria-current="location"');
    expect(JSON.parse(fresh.checkpoint!).homePlanet).toEqual(fresh.homePlanet);
  });
  it.each([
    ['unknown generator',(s:any):any=>s.homePlanet.geography.generator=2],
    ['wrong seed',(s:any):any=>s.homePlanet.geography.seed++],
    ['fake provenance',(s:any):any=>s.homePlanet.geography.provenance='explored'],
    ['fabricated history',(s:any):any=>s.homePlanet.geography.visited=true],
    ['missing recipe',(s:any):any=>delete s.homePlanet.geography],
    ['invalid recipe',(s:any):any=>s.homePlanet.geography=null],
    ['future version',(s:any):any=>s.homePlanet.version=3],
    ['v1 with geographic fields',(s:any):any=>s.homePlanet.version=1],
    ['checkpoint provenance mismatch',(s:any):any=>{const cp=JSON.parse(s.checkpoint);cp.homePlanet.geography.provenance='birth';s.checkpoint=JSON.stringify(cp);}],
    ['checkpoint version mismatch',(s:any):any=>{const cp=JSON.parse(s.checkpoint);delete cp.homePlanet.geography;cp.homePlanet.version=1;s.checkpoint=JSON.stringify(cp);}],
  ] as const)('rejects %s', (_,change) => {const s=createGame(42);enableHomePlanet(s);change(s);expect(()=>parseGame(raw(s))).toThrow();});
});
