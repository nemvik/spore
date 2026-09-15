import type { InteractionReason } from './interactions';

export const INTERACTION_COPY: Record<InteractionReason, string> = {
  ready: 'V dosahu', distance: 'Přibliž se', above: 'Q · vystoupej k cíli', below: 'C · sestup k cíli',
  blocked: 'Cestu kryje překážka', cooldown: 'Dokončuješ předchozí akci', diet: 'Tvoje ústa tuto potravu nezpracují',
  mouth: 'Vyviň ústní orgán', symbiote: 'Potřebuješ partnerské lůžko', capacity: 'Obě místa pro partnery jsou obsazena',
  energy: 'Nejprve doplň energii', complete: 'Pramen je obnovený', depleted: 'Zdroj nemá celé sousto',
};
