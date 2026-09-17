import { describe, expect, it } from 'vitest';
import { advanceCreature, creatureSupport, creaturePoseContext, type CreatureRuntime, type CreatureStepEnvironment } from '../src/game/creature-motion';
import { emptyCreatureActions } from '../src/game/creature-actions';
import { creatureSurfacePoint, prepareInstalledCreatureAnatomy } from '../src/game/creature-anatomy';
import { creatureBodyFixture } from './fixtures/creature-bodies';
import { sampleCreaturePose } from '../src/game/creature-motion';
import type { CreatureGenome, Obstacle } from '../src/game/types';
const command={x:0,z:1,sprint:false,jump:false,communicate:false};
const rock=(x:number,z:number,radius=1,y=-5,height=15,id=1):Obstacle=>({id,kind:'rock',pos:{x,y,z},radius,height});
function setup(kind:'biped'|'quadruped'|'longneck') {const g=creatureBodyFixture(kind),a=prepareInstalledCreatureAnatomy(g),r:CreatureRuntime={pos:{x:0,y:a.groundClearance,z:0},velocity:{x:0,y:0,z:0},heading:0,energy:50,actions:emptyCreatureActions()};return {g,a,r};}
function noOverlap(g:CreatureGenome,r:CreatureRuntime,env:CreatureStepEnvironment){const a=prepareInstalledCreatureAnatomy(g);for(const sphere of a.hull){const c={x:r.pos.x+Math.sin(r.heading)*sphere.center.z,y:r.pos.y+sphere.center.y,z:r.pos.z+Math.cos(r.heading)*sphere.center.z};expect(Math.abs(c.x)+sphere.radius).toBeLessThanOrEqual(env.bound+1e-6);expect(Math.abs(c.z)+sphere.radius).toBeLessThanOrEqual(env.bound+1e-6);for(const o of env.obstacles){const overlap=Math.hypot(c.x-o.pos.x,c.z-o.pos.z)<o.radius+sphere.radius-1e-6&&c.y>o.pos.y-sphere.radius+1e-6&&c.y<o.pos.y+o.height+sphere.radius-1e-6;expect(overlap,JSON.stringify({c,o,sphere})).toBe(false);}}}
describe.each(['biped','quadruped','longneck'] as const)('%s terrain',kind=>{
 it('walks flat and sloped terrain and keeps its full envelope within bounds',()=>{let {g,r}=setup(kind);const env={groundAt:(x:number,z:number)=>.06*x+.08*z,obstacles:[],bound:8};for(let i=0;i<240;i++){r=advanceCreature(g,r,command,env,1/60);noOverlap(g,r,env);}expect(r.pos.z).toBeGreaterThan(4);expect(creatureSupport(g,r,env).grounded).toBe(true);});
 it('slides along finite walls and corners without moving independent vertebrae',()=>{let {g,r}=setup(kind);const env={groundAt:()=>0,obstacles:[rock(0,5),rock(2,4,1, -5,15,2)],bound:50};for(let i=0;i<150;i++){r=advanceCreature(g,r,{...command,x:.3},env,1/60);noOverlap(g,r,env);}expect(r.pos.z).toBeGreaterThan(1);});
 it('lands on a finite top with grounded feet posed onto that top',()=>{let {g,a,r}=setup(kind);const env={groundAt:()=>0,obstacles:[rock(0,0,6,0,1)],bound:50};r.pos.y+=4;for(let i=0;i<120;i++)r=advanceCreature(g,r,{...command,z:0},env,1/60);expect(r.pos.y).toBeCloseTo(1+a.groundClearance);expect(r.velocity.y).toBe(0);const context=creaturePoseContext(g,r,env);expect(context.airborne).toBe(false);const pose=sampleCreaturePose(g,{time:0,speed:0,feeding:0,...context},a);for(const limb of pose.limbs.filter(l=>a.limbs.find(x=>x.partId===l.partId)!.end.kind==='foot'))expect(limb.points.at(-1)!.y+r.pos.y).toBeCloseTo(1,2);noOverlap(g,r,env);});
 it('stops ascending at the finite ceiling without letting the neck through',()=>{let {g,a,r}=setup(kind);const roof=Math.max(...a.hull.map(s=>s.center.y+s.radius))+r.pos.y+.25;const env={groundAt:()=>0,obstacles:[rock(0,0,6,roof,.5)],bound:50};let stopped=false;for(let i=0;i<60;i++){const before=r.velocity.y;r=advanceCreature(g,r,{...command,z:0,jump:i===0},env,1/60);if(before>0&&r.velocity.y===0)stopped=true;noOverlap(g,r,env);}expect(stopped).toBe(true);expect(r.pos.y).toBeCloseTo(a.groundClearance);});
});
it('substeps a long trunk rotation next to a rock',()=>{const g=creatureBodyFixture('quadruped');g.length=2.4;const a=prepareInstalledCreatureAnatomy(g);let r:CreatureRuntime={pos:{x:0,y:a.groundClearance,z:0},velocity:{x:0,y:0,z:0},heading:0,energy:50,actions:emptyCreatureActions()};const env={groundAt:()=>0,obstacles:[rock(2.4,0,.4)],bound:50};for(let i=0;i<120;i++){r=advanceCreature(g,r,{...command,x:1,z:0},env,.05);noOverlap(g,r,env);}});

it('leaves a finite support and falls to terrain rather than hovering',()=>{let {g,r}=setup('biped');r.pos.y+=1;const env={groundAt:()=>0,obstacles:[rock(0,0,2,0,1)],bound:50};let airborne=false;for(let i=0;i<240;i++){r=advanceCreature(g,r,command,env,1/60);airborne ||= !creatureSupport(g,r,env).grounded;}expect(airborne).toBe(true);expect(r.pos.z).toBeGreaterThan(5);expect(creatureSupport(g,r,env).grounded).toBe(true);});
it('keeps invalid stances unconfirmable in the world',async()=>{const {evolve}=await import('../src/game/simulation');const {parseGame}=await import('../src/game/persistence');const {readFileSync}=await import('node:fs');const s=parseGame(readFileSync('tests/fixtures/saves/won-current-coast.fixture.json','utf8'));s.player.pos={...s.world.landmarks.find(l=>l.kind==='nest')!.pos};const g=creatureBodyFixture('biped');g.parts=g.parts.filter(p=>p.kind!=='legs');const before=JSON.stringify(s);expect(evolve(s,g).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);});

it.each(['biped','quadruped','longneck'] as const)('encloses the complete %s trunk surface between sampled rings',kind=>{
 const {g,a}=setup(kind);let gap=0;
 for(let i=0;i<=512;i++)for(let j=0;j<24;j++){const point=creatureSurfacePoint(g,-1+i/256,j*Math.PI/12);gap=Math.max(gap,Math.min(...a.hull.map(s=>Math.hypot(point.x-s.center.x,point.y-s.center.y,point.z-s.center.z)-s.radius)));}
 expect(gap).toBeLessThanOrEqual(1e-8);
});

it('keeps combined translation/rotation outside several close obstacles',()=>{
 const g=creatureBodyFixture('quadruped');g.length=2.4;const a=prepareInstalledCreatureAnatomy(g);
 for(let scenario=0;scenario<12;scenario++){
  let r:CreatureRuntime={pos:{x:0,y:a.groundClearance,z:0},velocity:{x:0,y:0,z:0},heading:0,energy:50,actions:emptyCreatureActions()};
  const angle=scenario*Math.PI/6,env={groundAt:()=>0,obstacles:[rock(Math.cos(angle)*6,Math.sin(angle)*6,.6),rock(Math.cos(angle+.9)*6,Math.sin(angle+.9)*6,.6,-5,15,2)],bound:12};
  for(let i=0;i<80;i++){const direction=angle+Math.sin(i/15)*1.4;r=advanceCreature(g,r,{...command,x:Math.cos(direction),z:Math.sin(direction)},env,.05);noOverlap(g,r,env);}
 }
});

it('recognizes actual trunk support on a narrow finite top between the feet',()=>{
 let {g,a,r}=setup('biped');r.pos.y+=3;const env={groundAt:()=>0,obstacles:[rock(0,0,.2,0,1)],bound:50};
 for(let i=0;i<180;i++)r=advanceCreature(g,r,{...command,z:0},env,1/60);
 expect(r.velocity.y).toBe(0);expect(creatureSupport(g,r,env).grounded).toBe(true);expect(creaturePoseContext(g,r,env).airborne).toBe(false);noOverlap(g,r,env);
});
