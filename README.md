# Nox Certamen

Nox Certamen is a four-faction simultaneous-action territory game. This repository is both a rules laboratory and a playable one-player field prototype against three seedable randomized bots.

## Play locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by the development server. Choose a covenant and campaign seed, assign hidden roles during Production, then select five Sequence cards and one Reaction from the queue at the top of the battlefield. Enemy card backs reveal only their Green, Yellow, or Red speed bands while you program. When one of your cards reaches the front of its slot, choose from the legal territories highlighted on the map. Attack targets show your available dice versus the enemy's minimum known defense dice (`≥` allows for hidden infrastructure). Movement asks for an origin first and then an adjacent destination. The active card effect remains visible while choosing, and each combat exchange displays every die and its resulting losses in a dismissible panel.

Reactions are defensive interrupts. When a faction is attacked, its hidden Reaction is revealed and performs the defensive opposite of its Sequence action: defense dice, evacuation, fortification, repair, forewarning, attack disruption, reinforcement, or the faction defense. A Reaction triggers at most once per round, and its card is exhausted for the entire following round before returning to the deck.

Three public round goals are drawn each round and scored before checking victory. They reward named-territory control, surviving attacks, distributed garrisons, low-resource holdings, compact domains, and stored resources. Routine goals grant 1 VP and demanding versions grant 2 VP, giving smaller defensive factions scoring routes that do not require rapid conquest. Unclaimed goals are discarded at the end of the round and the deck reshuffles when needed.

```bash
npm test
npm run build
python3 tools/combat_simulator.py --attackers 6 --defenders 3 --defense 2 --trials 10000
```

## Prototype contents

- 36 connected territories in six regions
- Four asymmetric dark-fantasy factions
- 60 physical cards with globally unique speeds 1–60
- Five program slots resolved in order; each slot resolves all factions by Speed before the next slot begins
- Hidden HQ and infrastructure roles
- Production, intel, six technologies, objectives, VP, elimination, and conquest victory
- Sorted-dice combat with persistent defense damage
- Seeded bots and versioned local autosave
- A 24-round limit with VP, territory, and troop tiebreakers
- Rules, quick reference, playtest worksheet, and probability simulator

The values in `lib/game/config.ts` are provisional v0.1 balance data. Engine behavior lives separately in `lib/game/engine.ts`.

## GitHub Pages

The Pages workflow builds the static client using the `/nox-certamen` base path whenever `main` is updated. Enable **GitHub Actions** as the Pages source in repository settings once; the workflow handles later deployments.

## Playtest reporting

Copy `playtests/session-sheet.md` for each session. Record the seed so a surprising game can be reproduced. Rules questions and balance observations should be opened as GitHub issues with the seed, faction, round, and relevant field-log entry.

This is an original prototype. No license is granted for commercial reuse of the game design or content.
