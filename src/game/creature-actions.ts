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
