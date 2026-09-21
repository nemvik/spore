import { expect, it } from 'vitest';
import { CreatureStagePresentation, animateSpeciesResponse } from '../src/render/creature-stage';
import { creatureStageControlsMarkup, creatureStageMarkup } from '../src/ui/creature-stage';
import { creatureStageFixture } from './fixtures/creature-stage';
import { createGame } from '../src/game/simulation';
import { createSpeciesModel, disposeObject } from '../src/render/organism';
import { speciesById } from '../src/game/content';

it('draws real nests, inherited home bodies and finite, bounded cues without writing state',()=>{
  const s=creatureStageFixture(),view=new CreatureStagePresentation(),before=JSON.stringify(s);
  view.update(s,false);expect(view.group.visible).toBe(true);
  for(const n of s.creatureStage!.nests)expect(view.group.getObjectByName(`species-nest-${n.species}`)).toBeDefined();
  expect(view.group.getObjectByName('home-kin-0')).toBeDefined();
  const count=()=>{let result=0;view.group.traverse(()=>result++);return result;},initial=count();
  for(let i=0;i<100;i++)view.update(s,i%2===0);
  expect(count()).toBe(initial);view.group.updateMatrixWorld(true);
  view.group.traverse(node=>expect(node.matrixWorld.elements.every(Number.isFinite)).toBe(true));
  expect(JSON.stringify(s)).toBe(before);
  view.update(createGame(99),false);expect(view.group.visible).toBe(false);disposeObject(view.group);
});
it('keeps anatomical availability and requested response visible in action controls',()=>{
  const s=creatureStageFixture('quadruped');
  s.creatureStage!.encounter={species:'bell',target:s.creatureStage!.nests[0].residents[0],requested:'dance',round:0,progress:0,mistakes:0,remaining:12};
  const social=creatureStageControlsMarkup(s,false,null),combat=creatureStageControlsMarkup(s,true,null);
  expect(social).toContain('Odpověz: <b>Tanec</b>');expect(social).toMatch(/species-action:dance"\s+class="requested"/);
  expect(combat).toMatch(/species-action:strike" disabled/);expect(combat).toContain('Úder potřebuje ruce.');
  expect(creatureStageMarkup(s,false,null)).toContain('Inteligence');
});
it('gives four distinct opponent reactions and honours reduced motion',()=>{
  const s=creatureStageFixture(),id=s.creatureStage!.nests[0].residents[0];
  const signatures=[];
  for(const action of ['sing','dance','charm','pose'] as const){
    const model=createSpeciesModel(speciesById('bell'));s.creatureStage!.cue={action,target:id,remaining:.85,success:true};
    animateSpeciesResponse(model,s,id,false);signatures.push([...model.position,...model.rotation.toArray(),...model.scale]);
    const reduced=createSpeciesModel(speciesById('bell'));animateSpeciesResponse(reduced,s,id,true);
    expect(reduced.position.length()).toBe(0);expect(reduced.rotation.z).toBe(0);expect(reduced.scale.x).toBe(1.1);
    disposeObject(model);disposeObject(reduced);
  }
  expect(new Set(signatures.map(v=>JSON.stringify(v))).size).toBe(4);
});
