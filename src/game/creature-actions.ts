import type { CreatureCapabilities } from './creature-capabilities';

export interface CreatureActionState {
  version: 1;
  jumpRecharge: number;
  communicationRecharge: number;
  communicationTime: number;
  communicationSerial: number;
}

export const emptyCreatureActions = (): CreatureActionState => ({
  version: 1,
  jumpRecharge: 0,
  communicationRecharge: 0,
  communicationTime: 0,
  communicationSerial: 0,
});

/** Hold the gesture, then fade during the last .3 seconds in world and preview. */
export const creatureCommunicationPhase = (remaining: number): number => Math.min(1, Math.max(0, remaining / .3));

export function advanceCreatureTimers(state: CreatureActionState, dt: number): CreatureActionState {
  return { ...state, jumpRecharge: Math.max(0, state.jumpRecharge - dt),
    communicationRecharge: Math.max(0, state.communicationRecharge - dt),
    communicationTime: Math.max(0, state.communicationTime - dt) };
}

export function creatureActionAvailability(caps: CreatureCapabilities, state: CreatureActionState, energy: number, grounded: boolean) {
  return {
    jump: !caps.jump.enabled ? 'structure' : !grounded ? 'support' : energy < caps.jump.energy ? 'energy' : state.jumpRecharge > 0 ? 'recharge' : null,
    communicate: !caps.communicate.enabled ? 'structure' : state.communicationRecharge > 0 ? 'recharge' : null,
  } as const;
}
