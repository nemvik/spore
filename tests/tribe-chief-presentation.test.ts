import { it,expect } from 'vitest';
import { chiefGame } from './fixtures/chief';
import { electChief,startChiefCouncil,stepChief,cancelChiefCouncil } from '../src/game/tribe-chief';
import { chiefMarkup } from '../src/ui/tribe-chief';
import { SettlementPresentation } from '../src/render/settlement';
import { ChiefObserver } from '../src/render/chief';
it('explains absence, election, selected chief, actual cost, contact and cooldown',()=>{
 const g=chiefGame();let html=chiefMarkup(g.s,[g.u.id]);expect(html).toContain('Zvolit náčelníka');expect(html).toContain('8 jídla');
 electChief(g.s,[g.u.id]);html=chiefMarkup(g.s,[g.other.id]);expect(html).toContain(`Vyber náčelníka ${g.u.id}`);expect(html).toContain(`data-action="tribe-chief-council:${g.n.id}" disabled`);
 startChiefCouncil(g.s,[g.u.id],g.n.id);g.u.pos={...g.n.pos};stepChief(g.s,.1);html=chiefMarkup(g.s,[g.u.id]);expect(html).toContain('Řeč');expect(html).toContain('Kontakt navázán');
 g.u.pos.x=60;expect(chiefMarkup(g.s,[g.u.id])).toContain('Kontakt přerušen');cancelChiefCouncil(g.s);expect(chiefMarkup(g.s,[g.u.id])).toContain('60 s');
});
it('marks only the original body without replacing body or equipment; removes the marker on succession',()=>{
 const g=chiefGame(),scene=new SettlementPresentation();g.u.tool='basket';
 try{scene.update(g.s,[],0);const original=scene.group.getObjectByName(`tribe-member-${g.u.id}`)!,body=original.children[0],tool=original.getObjectByName('tool-basket');
 electChief(g.s,[g.u.id]);const before=JSON.stringify(g.s);scene.update(g.s,[],1);expect(original.getObjectByName('chief-marker')).toBeDefined();expect(original.children[0]).toBe(body);expect(original.getObjectByName('tool-basket')).toBe(tool);expect(JSON.stringify(g.s)).toBe(before);
 electChief(g.s,[g.other.id]);scene.update(g.s,[],2);expect(original.getObjectByName('chief-marker')).toBeUndefined();expect(scene.group.getObjectByName(`tribe-member-${g.other.id}`)!.getObjectByName('chief-marker')).toBeDefined();
 }finally{scene.dispose();}
});
it('animates speech only in actual contact, respects reduced motion and removes cues outside tribe',()=>{
 const g=chiefGame(),scene=new SettlementPresentation();electChief(g.s,[g.u.id]);startChiefCouncil(g.s,[g.u.id],g.n.id);g.u.pos={...g.n.pos};stepChief(g.s,.1);
 try{scene.update(g.s,[],.2);const group=scene.group.getObjectByName(`tribe-member-${g.u.id}`)!,body=group.children[0];expect(group.getObjectByName('chief-marker')!.userData.status).toBe('speaking');expect(body.rotation.z).not.toBe(0);
 scene.update(g.s,[],.4,true);expect(body.rotation.z).toBe(0);g.u.pos.x=60;scene.update(g.s,[],.5);expect(group.getObjectByName('chief-marker')!.userData.status).toBe('contact');expect(body.rotation.z).toBe(0);
 g.s.stage=4;scene.update(g.s,[],.6);expect(group.getObjectByName('chief-marker')).toBeUndefined();
 }finally{scene.dispose();}
});
it('plays election, speech, success and interruption once and never replays on load',()=>{
 const g=chiefGame(),o=new ChiefObserver();expect(o.observe(g.s)).toBeNull();electChief(g.s,[g.u.id]);expect(o.observe(g.s)?.frequency).toBe(392);expect(o.observe(g.s)).toBeNull();
 startChiefCouncil(g.s,[g.u.id],g.n.id);o.observe(g.s);g.u.pos={...g.n.pos};stepChief(g.s,.1);expect(o.observe(g.s)?.frequency).toBe(330);expect(o.observe(structuredClone(g.s))).toBeNull();o.observe(g.s);
 stepChief(g.s,6);expect(o.observe(g.s)?.frequency).toBe(880);expect(o.observe(g.s)).toBeNull();stepChief(g.s,60);startChiefCouncil(g.s,[g.u.id],g.n.id);o.observe(g.s);cancelChiefCouncil(g.s);expect(o.observe(g.s)?.frequency).toBe(98);
});
it('succession after a result plays the election cue instead of replaying the old result',()=>{
 const g=chiefGame(),o=new ChiefObserver();o.observe(g.s);electChief(g.s,[g.u.id]);o.observe(g.s);startChiefCouncil(g.s,[g.u.id],g.n.id);o.observe(g.s);cancelChiefCouncil(g.s);o.observe(g.s);
 expect(electChief(g.s,[g.other.id]).ok).toBe(true);expect(o.observe(g.s)?.frequency).toBe(392);
});
