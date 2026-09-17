import { describe, expect, it } from 'vitest';
import { validateCreatureStructure } from '../src/game/creature-body';
import { resolveCreatureAnatomy } from '../src/game/creature-anatomy';
import { sampleCreaturePose, solveLimbPose } from '../src/game/creature-motion';
import { creatureBodyFixture } from './fixtures/creature-bodies';
import type { Vec3 } from '../src/game/types';
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
describe('articulated creature pose', () => {
  it('moves a foot without stretching its bones, including unreachable targets', () => {
    const limb = resolveCreatureAnatomy(creatureBodyFixture('biped')).limbs[0];
    for (const target of [{...limb.points.at(-1)!, z:limb.points.at(-1)!.z+.08}, {x:20,y:-20,z:20}, limb.root]) {
      const points = solveLimbPose(limb,target);
      expect(points[0]).toEqual(limb.root);
      points.slice(1).forEach((p,i) => expect(distance(p,points[i])).toBeCloseTo(limb.lengths[i],5));
      expect(points.flatMap(p=>Object.values(p)).every(Number.isFinite)).toBe(true);
      expect(solveLimbPose(limb,target)).toEqual(points);
    }
  });
  it.each([3,4])('solves a %i-bone authored chain with fixed lengths',count=>{
    const points=Array.from({length:count+1},(_,i)=>({x:i*.21,y:-i*.43,z:i%2*.12}));
    const limb={partId:'chain',side:1 as const,root:points[0],points,lengths:points.slice(1).map((p,i)=>distance(p,points[i])),radii:Array(count).fill(.1),end:{kind:'none' as const}};
    const target={...points.at(-1)!,z:points.at(-1)!.z+.08},solved=solveLimbPose(limb,target);
    expect(distance(solved.at(-1)!,target)).toBeLessThan(.001);
    solved.slice(1).forEach((p,i)=>expect(distance(p,solved[i])).toBeCloseTo(limb.lengths[i],5));
  });
  it('bends a straight resting chain toward a reachable closer target',()=>{
    const limb={partId:'straight',side:1 as const,root:{x:0,y:0,z:0},points:[{x:0,y:0,z:0},{x:0,y:-.6,z:0},{x:0,y:-1.2,z:0}],lengths:[.6,.6],radii:[.1,.1],end:{kind:'foot' as const,style:'pad' as const,scale:1}};
    const target={x:0,y:-1,z:0},points=solveLimbPose(limb,target);
    expect(distance(points.at(-1)!,target)).toBeLessThan(.001);
    points.slice(1).forEach((p,i)=>expect(distance(p,points[i])).toBeCloseTo(limb.lengths[i],5));
  });
  it('plants a valid folded stance near the shorter reachable limit without stretching',()=>{
    const g=creatureBodyFixture('quadruped'),hind=g.parts.find(p=>p.id==='hind-legs')!,front=g.parts.find(p=>p.id==='front-legs')!;
    hind.angle=Math.PI;
    hind.limb!.joints[0].offset={x:0,y:-.4,z:0};hind.limb!.joints[1].offset={x:0,y:-1.2,z:0};
    front.limb!.joints[0].offset={x:.6,y:-.05,z:0};front.limb!.joints[1].offset={x:0,y:-.1,z:0};
    expect(validateCreatureStructure(g)).toEqual([]);
    const a=resolveCreatureAnatomy(g);expect(a.stanceErrors).toEqual([]);
    const input={time:0,speed:0,airborne:false,feeding:0,communication:0,position:{x:0,y:a.groundClearance,z:0},heading:0,groundAt:()=>0};
    const pose=sampleCreaturePose(g,input);
    pose.limbs.forEach((limb,i)=>{
      const source=a.limbs[i],foot=limb.points.at(-1)!;
      expect(Math.abs(foot.y+a.groundClearance)).toBeLessThan(.001);
      expect(limb.points[0]).toEqual(source.root);
      limb.points.slice(1).forEach((p,j)=>expect(distance(p,limb.points[j])).toBeCloseTo(source.lengths[j],7));
      if(limb.partId==='hind-legs'){
        const goal={...source.points.at(-1)!,y:-a.groundClearance};
        expect(distance(source.root,goal)).toBeGreaterThan(Math.abs(source.lengths[1]-source.lengths[0]));
        expect(distance(source.root,goal)).toBeLessThan(source.lengths[0]+source.lengths[1]);
        expect(distance(foot,goal)).toBeLessThan(.001);
      }
    });
    expect(sampleCreaturePose(g,input)).toEqual(pose);
  });
  it.each(['biped','quadruped','longneck'] as const)('%s plants every sole on flat and sloping world terrain', kind => {
    const g=creatureBodyFixture(kind), anatomy=resolveCreatureAnatomy(g);
    for (const slope of [0,.055]) for (const heading of [0,.9]) for (const time of [0,.13,.45,1.1]) {
      const groundAt=(x:number,z:number)=>slope*(x+z), position={x:4,y:groundAt(4,3)+anatomy.groundClearance,z:3};
      const pose=sampleCreaturePose(g,{time,speed:0,airborne:false,feeding:0,communication:0,position,heading,groundAt});
      pose.limbs.forEach((posed,i)=>{
        posed.points.slice(1).forEach((p,j)=>expect(distance(p,posed.points[j])).toBeCloseTo(anatomy.limbs[i].lengths[j],5));
        if(anatomy.limbs[i].end.kind!=='foot')return;
        const foot=posed.points.at(-1)!, x=position.x+Math.cos(heading)*foot.x+Math.sin(heading)*foot.z,z=position.z-Math.sin(heading)*foot.x+Math.cos(heading)*foot.z;
        expect(Math.abs(position.y+pose.bodyOffset.y+foot.y-groundAt(x,z))).toBeLessThan(.03);
      });
    }
  });
  it('alternates biped feet and quadruped diagonals, folds in flight and gestures with arms',()=>{
    for (const kind of ['biped','quadruped'] as const) {
      const g=creatureBodyFixture(kind), a=resolveCreatureAnatomy(g),input={time:.18,speed:2,airborne:false,feeding:.7,communication:0,position:{x:0,y:a.groundClearance,z:0},heading:0,groundAt:()=>0};
      const pose=sampleCreaturePose(g,input), feet=pose.limbs.filter((_,i)=>a.limbs[i].end.kind==='foot');
      const heights=feet.map(l=>l.points.at(-1)!.y+a.groundClearance+pose.bodyOffset.y);
      expect(heights[0]*heights[1]).toBeLessThan(.004);
      expect(Math.max(...heights)).toBeGreaterThan(.04);
      if(kind==='quadruped') {expect(heights[0]).toBeCloseTo(heights[3],2);expect(heights[1]).toBeCloseTo(heights[2],2);}
      const flying=sampleCreaturePose(g,{...input,airborne:true});
      expect(flying.limbs[0].points.at(-1)!.y).toBeGreaterThan(pose.limbs[0].points.at(-1)!.y);
      if(kind==='biped')expect(sampleCreaturePose(g,{...input,communication:1}).limbs[2].points).not.toEqual(pose.limbs[2].points);
      expect(pose.mouthOpen).toBe(.7);
    }
  });
  it('uses relative front and rear attachments for diagonal gait on a shifted body',()=>{
    const g=creatureBodyFixture('quadruped');g.parts.find(p=>p.id==='hind-legs')!.axial=-.55;g.parts.find(p=>p.id==='front-legs')!.axial=-.1;
    const a=resolveCreatureAnatomy(g),pose=sampleCreaturePose(g,{time:.18,speed:2,airborne:false,feeding:0,communication:0,position:{x:0,y:a.groundClearance,z:0},heading:0,groundAt:()=>0});
    expect(pose.limbs[0].points.at(-1)!.y).toBeCloseTo(pose.limbs[3].points.at(-1)!.y,2);
    expect(pose.limbs[1].points.at(-1)!.y).toBeCloseTo(pose.limbs[2].points.at(-1)!.y,2);
  });
  it('returns finite resting chains for an invalid stance',()=>{
    const g=creatureBodyFixture('biped');g.parts.find(p=>p.kind==='legs')!.limb!.end={kind:'none'};
    const a=resolveCreatureAnatomy(g),pose=sampleCreaturePose(g,{time:1,speed:4,airborne:false,feeding:0,communication:0,position:{x:0,y:1,z:0},heading:0,groundAt:()=>0});
    expect(a.stanceErrors.length).toBeGreaterThan(0);
    expect(pose.limbs.map(l=>l.points)).toEqual(a.limbs.map(l=>l.points));
  });
});
