import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { initialVehicle, SEA_PARTS, seaBlueprint, validateSeaBlueprint, validateVehicle, vehicleCost, vehicleStats } from '../src/game/blueprint';
import { animateMachine, createMachine } from '../src/render/machine';
import { disposeObject } from '../src/render/organism';

describe('first maritime construction v2',()=>{
  it('uses the shared 16 + 8 + 32 price and has propulsion without a work or combat module',()=>{
    const design=seaBlueprint(),before=JSON.stringify(design);
    expect(design.version).toBe(2);expect(design.carrier).toBe('boat');
    expect(SEA_PARTS.map(p=>[p.id,p.cost,p.carriers])).toEqual([['hull',16,['boat']],['cabin',8,['boat']],['propeller',32,['boat']]]);
    expect(validateSeaBlueprint(design)).toEqual([]);expect(vehicleCost(design)).toBe(56);
    expect(vehicleStats(design)).toMatchObject({mass:15,durability:80,module:null,power:0,capacity:24});
    expect(vehicleStats(design).speed).toBeGreaterThan(0);
    expect(JSON.stringify(design)).toBe(before);expect(seaBlueprint()).not.toBe(design);
    expect(seaBlueprint().parts[0]).not.toBe(design.parts[0]);
    expect(validateSeaBlueprint(JSON.parse(before))).toEqual([]);
  });

  it('keeps v1 editor designs separate and rejects boat parts in the historical validator',()=>{
    expect(validateVehicle(seaBlueprint())).not.toEqual([]);
    for(const carrier of ['tank','air'] as const){
      const original=initialVehicle(carrier,'restoration');
      expect(validateVehicle(original)).toEqual([]);expect(validateSeaBlueprint(original)).not.toEqual([]);
      expect(validateVehicle({...original,parts:[...original.parts,seaBlueprint().parts[2]]})).not.toEqual([]);
    }
  });

  it('rejects missing, additional and modified construction fields without mutating the input',()=>{
    const base=seaBlueprint();
    for(const key of Object.keys(base)){
      const missing={...base} as Record<string,unknown>;delete missing[key];
      expect(validateSeaBlueprint(missing),key).not.toEqual([]);
      if(key!=='parts')expect(validateSeaBlueprint({...base,[key]:null}),key).not.toEqual([]);
    }
    const invalids:unknown[]=[null,[],{}, {...base,free:true},{...base,parts:[]},{...base,parts:null},
      {...base,parts:[...base.parts].reverse()}, {...base,parts:[...base.parts,base.parts[2]]},
      {...base,length:NaN},{...base,width:Infinity},{...base,name:'Another boat'}];
    for(let i=0;i<base.parts.length;i++)for(const key of Object.keys(base.parts[i])){
      const missing=structuredClone(base) as unknown as {parts:Record<string,unknown>[]};delete missing.parts[i][key];invalids.push(missing);
      const changed=structuredClone(base) as unknown as {parts:Record<string,unknown>[]};changed.parts[i][key]=null;invalids.push(changed);
    }
    invalids.push({...base,parts:[{...base.parts[0],free:true},...base.parts.slice(1)]});
    for(const invalid of invalids){
      const before=structuredClone(invalid);expect(()=>validateSeaBlueprint(invalid)).not.toThrow();
      expect(validateSeaBlueprint(invalid)).not.toEqual([]);expect(invalid).toEqual(before);
    }
    const reordered=Object.fromEntries(Object.entries(base).reverse());
    expect(validateSeaBlueprint(reordered)).toEqual([]);
  });

  it('renders a deck, cabin and animated stern screw with independently disposable resources',()=>{
    const model=createMachine(seaBlueprint()),other=createMachine(seaBlueprint());
    try{
      const deck=model.getObjectByName('boat-deck'),screw=model.getObjectByName('propeller')!;
      expect(deck).toBeDefined();expect(model.getObjectByName('machine-cabin')).toBeDefined();expect(screw).toBeDefined();
      expect(model.getObjectByName('rotor')).toBeUndefined();expect(model.getObjectByName('track-tread')).toBeUndefined();
      expect(model.getObjectByName('machine-propeller')!.position.z).toBeLessThan(-1.5);
      const geometries=new Set<THREE.BufferGeometry>();
      model.traverse(node=>{if(node instanceof THREE.Mesh)geometries.add(node.geometry);});
      other.traverse(node=>{if(node instanceof THREE.Mesh)expect(geometries.has(node.geometry)).toBe(false);});
      animateMachine(model,2,3,true);expect(screw.rotation.z).toBe(24);
      animateMachine(model,2,3,true);expect(screw.rotation.z).toBe(24);
      animateMachine(model,3,0,false);expect(screw.rotation.z).toBe(0);
      animateMachine(model,NaN,Infinity,true);expect(Number.isFinite(screw.rotation.z)).toBe(true);
      const after=new Set<THREE.BufferGeometry>();model.traverse(node=>{if(node instanceof THREE.Mesh)after.add(node.geometry);});
      expect(after).toEqual(geometries);
      const disposals=[...geometries,...model.userData.ownedMaterials as THREE.Material[]].map(resource=>vi.spyOn(resource,'dispose'));
      disposeObject(model);for(const spy of disposals)expect(spy).toHaveBeenCalledTimes(1);
    }finally{disposeObject(other);}
  });
});
