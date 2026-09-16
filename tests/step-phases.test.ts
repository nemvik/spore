import type { WorldStage as Stage } from '../src/game/stage';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cloneGenome } from '../src/game/genome';
import { initializeJourneyStage } from '../src/game/journey';
import { createGame, statsFor, step } from '../src/game/simulation';
import { EMPTY_INPUT } from '../src/game/types';
import type { GameState, Input, } from '../src/game/types';
import { createWorld, surfaceY } from '../src/game/world';

const SEEDS = [481516, 20260913, 8675309];

/** Prepared stage arrivals retain the complete generated ecology and authored
 * journey. They characterize tick ordering, not campaign progression. The two
 * extra food nodes exercise feeding and preserve an explicitly depleted node. */
function fixture(seed: number, stage: Stage, legacy: boolean): GameState {
  const state = createGame(seed, legacy, !legacy, !legacy);
  for (let visited = 1; visited <= stage; visited++) {
    state.stage = visited as Stage;
    state.world = createWorld(seed, state.stage);
    state.worlds[state.world.stage] = state.world;
    initializeJourneyStage(state);
  }
  state.player.genome = cloneGenome(state.player.genome);
  if (stage === 2) {
    for (const kind of ['legs', 'lungs'] as const) {
      state.player.genome.parts.push({ id: `phase-${kind}`, kind, axial: 0, angle: 1.25, scale: 1, mirrored: false });
    }
  }
  state.player.health = statsFor(state.player.genome).maxHealth;
  state.player.pos = { x: 0, y: surfaceY(stage, 0, 0), z: 0 };
  state.player.energy = 65;
  state.player.oxygen = 75;
  state.player.moisture = 80;
  state.world.resources.push(
    { id: state.world.nextId++, kind: 'algae', pos: { ...state.player.pos }, amount: 2, max: 2, patch: 0, regen: 0 },
    { id: state.world.nextId++, kind: 'detritus', pos: { ...state.player.pos, x: 40 }, amount: .25, max: 2, patch: 0, regen: 0 },
  );
  return state;
}

function controls(frame: number, stage: Stage): Input {
  const direction = Math.floor(frame / 75) % 4;
  return {
    ...EMPTY_INPUT,
    x: direction === 0 ? 1 : direction === 2 ? -1 : 0,
    z: direction === 1 ? 1 : direction === 3 ? -1 : 0,
    vertical: stage === 1 ? (frame % 160 < 60 ? 1 : frame % 160 < 120 ? -1 : 0) : 0,
    sprint: frame % 120 < 35,
    feed: frame % 41 < 8,
    bond: frame % 109 === 20,
    tend: frame % 83 === 0,
    pulse: frame % 137 === 0,
    offer: frame % 127 === 25,
  };
}

function fingerprint(state: GameState): string {
  // Exclude only nondeterministic run identity and metadata, not entity IDs.
  // Unlike summary(), this includes world RNG and food below one portion, plus
  // all visited worlds, messages, player, campaign and complete journey state.
  const { id, version, checkpoint, ...deterministic } = state;
  return createHash('sha256').update(JSON.stringify(deterministic)).digest('hex');
}

describe('step phase ordering characterization', () => {
  it('preserves every tick of the pre-refactor simulation in all habitats and journey modes', () => {
    const reference: Record<string, { state: string; trace: string; ecology: string }> = {};
    for (const legacy of [true, false]) for (const seed of SEEDS) for (const stage of [0, 1, 2] as const) {
      const state = fixture(seed, stage, legacy);
      const trace = createHash('sha256').update(fingerprint(state));
      for (let frame = 0; frame < 600; frame++) {
        step(state, controls(frame, stage));
        trace.update(fingerprint(state));
      }
      expect(state.tick).toBe(600);
      expect(state.deathReason).toBeNull();
      reference[`${legacy ? 'legacy' : 'current'}:${seed}:${stage}`] = {
        state: fingerprint(state),
        trace: trace.digest('hex'),
        ecology: `rng=${state.world.rng}; resources=${state.world.resources.length}; depleted=${state.world.resources.filter(food => food.amount < 1).length}; creatures=${state.world.creatures.length}; meals=${state.player.meals}; births=${state.world.births}; deaths=${state.world.deaths}`,
      };
    }
    // Recorded against the original monolithic step(). Update only when an
    // intentional simulation behavior change has been independently reviewed.
    expect(reference).toMatchInlineSnapshot(`
      {
        "current:20260913:0": {
          "ecology": "rng=2246381005; resources=79; depleted=2; creatures=10; meals=6; births=0; deaths=0",
          "state": "b2b18aff0f4ea85186dba7180e1957c40a0c100627f906c2f30a5c3ee90df6ae",
          "trace": "59330723e1baa67e42eb99e1b59b372d384e030184e4e7bd2b2857d7dbe81081",
        },
        "current:20260913:1": {
          "ecology": "rng=2622529124; resources=90; depleted=2; creatures=13; meals=7; births=2; deaths=0",
          "state": "437325e2c28f05fa209f4888918a6300f3a7b69d20a3b3158be167c307e1d044",
          "trace": "edebd475019e9ed5c5685b225ebc0921b95d67776829e197a149199d5366e6bd",
        },
        "current:20260913:2": {
          "ecology": "rng=2558665164; resources=88; depleted=2; creatures=22; meals=7; births=0; deaths=0",
          "state": "9a1bdf88b58f2739f23ecac40e8277c1033c1ae405e3456d31d40262cdc5c8e4",
          "trace": "dc47925016996de0551bcb2bd93f596c888a8582113cc01604c72b760052c540",
        },
        "current:481516:0": {
          "ecology": "rng=3490272948; resources=78; depleted=2; creatures=10; meals=6; births=0; deaths=0",
          "state": "dc0296a49747730c68439ad3520a49df42388c4af072aadd610d6124afede566",
          "trace": "c85aeb6e939765f466ed965a24f42c264d0a59d39dd8e76b1a415a1581a2c3a8",
        },
        "current:481516:1": {
          "ecology": "rng=1466960781; resources=88; depleted=2; creatures=11; meals=7; births=0; deaths=0",
          "state": "d6e4682ce9deac7ba7e7a21669c31f37aa767841f1bbc165bfd076c54d5057d4",
          "trace": "b84e3c644b035ab62cc0e9fba01913aae6972bbf35a5eb531b9aa8c8640426e4",
        },
        "current:481516:2": {
          "ecology": "rng=3738615910; resources=91; depleted=2; creatures=22; meals=7; births=0; deaths=0",
          "state": "ede9e407bbb681979e72ee16cb00689d9c67091a2146e5be497d025941445c76",
          "trace": "05ab88ae13b4a8ea770b512145c7ee0d27b7f20f2ccb0aa0d929ccf926164262",
        },
        "current:8675309:0": {
          "ecology": "rng=467170785; resources=75; depleted=2; creatures=10; meals=6; births=0; deaths=0",
          "state": "b1510719326276599aa0f5b13619929977eecb753a83b172cf165f4ebe381e32",
          "trace": "018510d7e2842467e48d6de65ea65473e6f3ecad6f9cfc1dee20de0711b0ed1b",
        },
        "current:8675309:1": {
          "ecology": "rng=3306720387; resources=89; depleted=2; creatures=11; meals=7; births=0; deaths=0",
          "state": "5e9dd6ac8b3e5669997a176c545929e4e4c6e53e062d21163d81709faea1e92c",
          "trace": "697e2b236dce39b54eb4849143f2db662768abad0f58ecf52ac62a4c7d4dc67b",
        },
        "current:8675309:2": {
          "ecology": "rng=1915243890; resources=90; depleted=2; creatures=22; meals=7; births=0; deaths=0",
          "state": "67147d19add13ee5458e1494e9c68ed19e99c81b9bd3c5ae455a7449908a97fc",
          "trace": "f03a665c9e08eddba5f206b3f709ef1ebfb40bbd697b3d9773a4b715bbe39069",
        },
        "legacy:20260913:0": {
          "ecology": "rng=2246381005; resources=88; depleted=2; creatures=21; meals=6; births=0; deaths=0",
          "state": "da21cd955f0263c84892d402fe83627077175474b57bf7f5e3d2942d0a6f6d69",
          "trace": "4df547659bce7b924e8f11a8495168f932d11360610807666f72a9a147d0169d",
        },
        "legacy:20260913:1": {
          "ecology": "rng=854904508; resources=85; depleted=2; creatures=21; meals=6; births=0; deaths=0",
          "state": "4d60604e2f77eed273d28a0fdbff017b5ec06a53dacd98d587cd19d14ce11804",
          "trace": "f3741ca7ffee45cf135cdff0ae85cc7a71ea90f03f06dce613936cc03ccd26c4",
        },
        "legacy:20260913:2": {
          "ecology": "rng=2558665164; resources=85; depleted=2; creatures=33; meals=7; births=0; deaths=0",
          "state": "20b368ba3f5aeb853df76385818741cc7154ab47e239610d04be5a33ee224370",
          "trace": "6e62766bc9f69718f0bd9ff53e2ec91d2586b26d950992f146a90a25311024b9",
        },
        "legacy:481516:0": {
          "ecology": "rng=3490272948; resources=84; depleted=2; creatures=21; meals=6; births=0; deaths=0",
          "state": "d8572bda06f0783c9e0af09d25270cfb68234cccc3bf467ed023186419cb91cd",
          "trace": "0e916c9c288a5a508a9be664ec6ca61e676ff04395b152d6942e74d50339a690",
        },
        "legacy:481516:1": {
          "ecology": "rng=1466960781; resources=83; depleted=2; creatures=21; meals=6; births=0; deaths=0",
          "state": "867d93df1b681fce8425de803f47608cb59d772d99e6904e067a3a0dcc33ddf6",
          "trace": "3ae3f22f0775ba4c3c4a55c5adb5003fa47e40ca8411506a3484941158113b31",
        },
        "legacy:481516:2": {
          "ecology": "rng=3738615910; resources=88; depleted=2; creatures=33; meals=7; births=0; deaths=0",
          "state": "5760a4098631a82664677a59c9d3cf150e3413229cc17419c803d05516c57c4f",
          "trace": "dc8e12f6e98a3577f173833e458396562779cbc2ab03c6f86c3e5ba4837643c3",
        },
        "legacy:8675309:0": {
          "ecology": "rng=467170785; resources=81; depleted=2; creatures=20; meals=6; births=0; deaths=1",
          "state": "9b883e98915a00c8993f6f97d9076e1524e3cabebe932ab2325bede3d5f8058e",
          "trace": "412392d9a0a96e3deeb5e7abf1e5296db1da35a97f9fcd71843922d42455bb52",
        },
        "legacy:8675309:1": {
          "ecology": "rng=3306720387; resources=84; depleted=2; creatures=21; meals=6; births=0; deaths=0",
          "state": "16b2406d9e18b6565998515cf0f9f2af80f5c23dc566c88829e0c9787e54bf8e",
          "trace": "8567e59d192e6620bdee9b420d7eefcb5f03a6c733e17a5f042415990d881a6f",
        },
        "legacy:8675309:2": {
          "ecology": "rng=1915243890; resources=88; depleted=2; creatures=32; meals=7; births=0; deaths=1",
          "state": "38ab1dc8cecf63dab88b1f5478898e43de766dc7cd279ef8dd97f0db01e49481",
          "trace": "a0e107459ada420f08244f0adb4d6adbbfece9c9b7a6945929220ebabe84db94",
        },
      }
    `);
  }, 20_000);
});
