export const SELECTION_COPY = {
  attack: 'Zaútočit',
  jawApproach: (distance: number) => `Přilož čelist k tělu cíle · ${distance.toFixed(1)} m`,
  eat: 'Jíst',
  vitality: (health: number) => `vitalita ${Math.max(0, Math.ceil(health))}`,
  portions: (amount: number) => `soust: ${Math.max(0, Math.floor(amount))}`,
  selected: 'Vybraný cíl',
  missing: 'Vybraný cíl už není přítomen. Klikni na jiný cíl nebo do volného prostoru.',
  help: 'Klikni na tvora nebo potravu pro přesný cíl mezerníku. Klik do volného prostoru vrátí automatický výběr.',
  hud: 'Klik: vybrat cíl · volný prostor: zrušit',
  leftMouse: 'Levý klik',
};
