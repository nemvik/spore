import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createCulturalOutfit, syncCulturalOutfit } from '../src/render/culture';
import { createOrganism, disposeObject } from '../src/render/organism';
import { SettlementPresentation } from '../src/render/settlement';
import { upgradeCreatureGenome } from '../src/game/creature-body';
import { attachmentPoint } from '../src/game/anatomy';
import { cultureGame, envoy, guard } from './fixtures/culture';

function geometry(group: THREE.Object3D) {
  const result: unknown[] = [];
  group.traverse(n => { if (n instanceof THREE.Mesh) result.push([n.name, n.position.toArray(), n.scale.toArray(), Array.from(n.geometry.getAttribute('position').array)]); });
  return result;
}
it.each([1, 2])('uses the same v%i cultural geometry in preview and settlement, retaining the tool and genome', version => {
  const s = cultureGame(); if (version === 2 && s.player.genome.version === 1) s.player.genome = upgradeCreatureGenome(s.player.genome);
  const u = s.tribe.members[0]; u.outfit = envoy; u.tool = 'basket';
  const before = JSON.stringify(s), preview = createCulturalOutfit(s.player.genome, envoy), scene = new SettlementPresentation();
  try {
    scene.update(s, [], 0);
    const member = scene.group.getObjectByName(`tribe-member-${u.id}`)!;
    const worn = member.getObjectByName('cultural-outfit')!;
    expect(geometry(worn)).toEqual(geometry(preview));
    expect(worn.getObjectByName('culture-plume')).toBeDefined(); expect(worn.getObjectByName('culture-pouches')).toBeDefined();
    expect(member.getObjectByName('tool-basket')).toBeDefined(); expect(JSON.stringify(s)).toBe(before);
    const p = attachmentPoint(.64, 0, s.player.genome);
    expect(worn.getObjectByName('culture-plume')!.position.toArray()).toEqual([p.x, p.y, p.z]);
  } finally { scene.dispose(); disposeObject(preview); }
});
it('replaces and disposes changed cultural meshes without rebuilding the inherited body', () => {
  const g = cultureGame().player.genome, body = createOrganism(g);
  syncCulturalOutfit(body, g, envoy);
  const old = body.getObjectByName('culture-plume')!, mesh = old.children.find(n => n instanceof THREE.Mesh) as THREE.Mesh;
  const dispose = vi.spyOn(mesh.geometry, 'dispose'), surface = body.userData.attachmentSurface;
  syncCulturalOutfit(body, g, envoy); expect(body.getObjectByName('culture-plume')).toBe(old);
  syncCulturalOutfit(body, g, guard); expect(dispose).toHaveBeenCalledOnce();
  expect(body.getObjectByName('culture-plume')).toBeUndefined(); expect(body.getObjectByName('culture-shell')).toBeDefined();
  expect(body.userData.attachmentSurface).toBe(surface);
  syncCulturalOutfit(body, g, undefined); expect(body.getObjectByName('cultural-outfit')).toBeUndefined(); disposeObject(body);
});
