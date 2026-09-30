import { describe, expect, it } from 'vitest';
import { creatureVoiceRecipe, CreatureCommunicationObserver } from '../src/render/audio';
import { creatureBodyFixture } from './fixtures/creature-bodies';
describe('shared voice feedback',()=>{
 it('derives timbre from mouths, pitch from volume and intensity from voice strength without RNG',()=>{
  const g=creatureBodyFixture('biped'),before=JSON.stringify(g),jaw=creatureVoiceRecipe(g)!;
  expect(jaw.wave).toBe('triangle');expect(JSON.stringify(g)).toBe(before);
  const large=structuredClone(g);large.width=1.8;expect(creatureVoiceRecipe(large)!.frequency).toBeLessThan(jaw.frequency);
  g.parts.find(p=>p.kind==='jaw')!.scale=1.6;expect(creatureVoiceRecipe(g)!.gain).toBeGreaterThan(jaw.gain);
  g.parts.find(p=>p.kind==='jaw')!.kind='filter';expect(creatureVoiceRecipe(g)!.wave).toBe('sine');
  g.parts.find(p=>p.kind==='filter')!.kind='proboscis';expect(creatureVoiceRecipe(g)!.wave).toBe('sawtooth');
  g.parts=g.parts.filter(p=>p.kind!=='proboscis');expect(creatureVoiceRecipe(g)).toBeNull();
 });
 it('seeds loaded serial, emits exactly once on change including wrap, and resets on changed genome',()=>{
  const observer=new CreatureCommunicationObserver(),g=creatureBodyFixture('biped');
  expect(observer.observe(g,999999999)).toBeNull();expect(observer.observe(g,999999999)).toBeNull();
  expect(observer.observe(g,1000000000)).not.toBeNull();expect(observer.observe(g,1000000000)).toBeNull();
  expect(observer.observe(g,0)).not.toBeNull();expect(observer.observe(g,0)).toBeNull();
  const loaded=structuredClone(g);expect(observer.observe(loaded,3)).toBeNull();expect(observer.observe(loaded,4)).not.toBeNull();
  const gesture=structuredClone(g);gesture.parts=gesture.parts.filter(p=>p.kind!=='jaw');expect(observer.observe(gesture,0)).toBeNull();expect(observer.observe(gesture,1)).toBeNull();
 });
});

import { vi } from 'vitest';
import { Soundscape } from '../src/render/audio';
import type { Settings } from '../src/game/types';
it('updates a shared effects bus for already scheduled notes and voices while paused',()=>{
 const param=()=>({value:0,setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()});
 const gains:any[]=[],oscillators:any[]=[];
 const context={currentTime:0,destination:{},resume:vi.fn(),suspend:vi.fn(),
  createGain:()=>{const node={gain:param(),connect:vi.fn(),disconnect:vi.fn()};gains.push(node);return node;},
  createOscillator:()=>{const node={frequency:param(),connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn()};oscillators.push(node);return node;}};
 vi.stubGlobal('AudioContext',function(){return context;});
 try{
  const settings={muted:false,master:.6,effects:.4,ambience:.2} as Settings;
  const sound=new Soundscape(settings);sound.start();
  const firstEffectGain=gains.length;sound.play('evolve');sound.voice({wave:'sine',frequency:400,gain:.08,duration:.8});
  const effects=gains[firstEffectGain].connect.mock.calls[0][0];
  expect(effects).not.toBe(gains[0]);expect(effects.gain.value).toBe(.4);
  for(const gain of gains.slice(firstEffectGain))expect(gain.connect).toHaveBeenCalledWith(effects);
  sound.pause(true);sound.update({...settings,effects:0});sound.pause(false);
  expect(context.suspend).toHaveBeenCalledOnce();expect(effects.gain.value).toBe(0);
  expect(gains[0].gain.value).toBe(.6);
  sound.update({...settings,effects:.7});expect(effects.gain.value).toBe(.7);
 }finally{vi.unstubAllGlobals();}
});
it('honors mute/master/effects, schedules the shared envelope and disconnects completed voices',()=>{
 const settings={muted:false,master:.6,effects:.4,ambience:.2} as Settings;
 const sound=new Soundscape(settings),oscillators:any[]=[],gains:any[]=[];
 const param=()=>({value:0,setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()});
 const context={currentTime:12,createOscillator:()=>{const o={frequency:param(),connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),onended:null};oscillators.push(o);return o;},createGain:()=>{const g={gain:param(),connect:vi.fn(),disconnect:vi.fn()};gains.push(g);return g;}};
 Object.assign(sound,{context,master:{gain:{value:0}},ambient:{gain:{value:0}},effects:{gain:{value:0}}});
 const recipe=creatureVoiceRecipe(creatureBodyFixture('biped'))!;
 for(const setting of [{...settings,muted:true},{...settings,master:0},{...settings,effects:0}]){sound.update(setting);sound.voice(recipe);expect(oscillators).toHaveLength(0);}
 sound.update(settings);sound.voice(recipe);expect(oscillators).toHaveLength(1);expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(recipe.frequency,12);
 expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(recipe.gain,12.04);expect(oscillators[0].stop).toHaveBeenCalledWith(12.82);oscillators[0].onended();expect(oscillators[0].disconnect).toHaveBeenCalledOnce();expect(gains[0].disconnect).toHaveBeenCalledOnce();
});

it('keeps ordinary effects silent at zero volume and releases every completed note',()=>{
 const settings={muted:false,master:.6,effects:.4,ambience:.2} as Settings;
 const sound=new Soundscape(settings);
 const param=()=>({value:0,setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()});
 const oscillator=()=>({frequency:param(),connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),onended:null as null|(()=>void)});
 const gain=()=>({gain:param(),connect:vi.fn(),disconnect:vi.fn()});
 const context={currentTime:12,createOscillator:vi.fn(oscillator),createGain:vi.fn(gain)};
 Object.assign(sound,{context,master:{gain:{value:0}},ambient:{gain:{value:0}},effects:{gain:{value:0}}});
 for(const setting of [{...settings,muted:true},{...settings,master:0},{...settings,effects:0}]){
  sound.update(setting);sound.play('evolve');expect(context.createOscillator).not.toHaveBeenCalled();expect(context.createGain).not.toHaveBeenCalled();
 }
 sound.update(settings);sound.play('evolve');expect(context.createOscillator).toHaveBeenCalledTimes(4);
 for(let i=0;i<4;i++){
  const o=context.createOscillator.mock.results[i].value,g=context.createGain.mock.results[i].value;
  expect(g.gain.linearRampToValueAtTime).toHaveBeenCalledWith(.1,12+i*.09+.014);
  expect(o.stop).toHaveBeenCalledWith(12+i*.09+.55);expect(o.disconnect).not.toHaveBeenCalled();
  expect(o.onended).toBeTypeOf('function');o.onended!();expect(o.disconnect).toHaveBeenCalledOnce();expect(g.disconnect).toHaveBeenCalledOnce();
 }
});
