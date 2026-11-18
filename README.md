[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/plenger-agent/makefun-gta6-01-v2/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/plenger-agent/makefun-gta6-01-v2/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# AZAHAR HEAT

**An original 3D open-world crime game set in Puerto Azahar, 1989** — a sun-baked
port city of neon, rum and other people's money, built with Three.js and a
synthesised WebAudio soundtrack. No assets, no downloads: every texture is
painted on a canvas at boot, every sound is an oscillator, and the whole city
is generated from a seed.

You are **Rico Ferrer**, back in town with nothing. Fixer **Marisol Vega** has
work — nine story missions that climb from a borrowed Solana to the night
Roque sails away — and Inspectora Duarte's Patrulla has opinions about how
you earn. Take the work or take cars; the city pays either way, and it always
collects.

## What's in the city

- **Six districts, one skyline each** — hilltop villas on their plateau, the
  neon strip's towers, the container port, colonial old town, the marina with
  its boardwalk, piers and bobbing boats, and the market quarter's stalls —
  under a full day arc: dawn gold, noon glare, dusk, then neon night.
- **Living traffic** — 30+ cars with lane discipline, junctions, honking and
  pile-ups, plus parked cars on every kerb waiting to be borrowed.
- **40+ pedestrians** with sidewalk routines who chat, carry shopping, flee
  gunfire and dive out of the road.
- **The Patrulla** — a 1–5 star wanted system: patrol cars that pursue and
  ram, officers who bail out and arrest, roadblocks from three stars, and a
  helicopter with a searchlight at four and five.
- **Combat** — fists and a 9mm, against Roque's crew in the story missions,
  with health, armour and a bust meter when the law lays hands on you.
- **An economy** — mission cash, pier shifts, wallets dropped by fallen men,
  and Salvatore Motors selling cars, Kevlar and ammunition off its forecourt.
- **Nine story missions** with briefings, objectives, failure and retry:
  wheels, ledgers, rum runs, a pier fight, a tail job, a chase, five minutes
  of heat, a dockside reckoning, and the lighthouse pact.
- **HUD & minimap** — wanted stars, cash, clock, district, vitals, weapon,
  speedo, and a live minimap with police blips and the objective beacon.
- **Radio** — three synthesised stations (salsa, synth, rumba) sequenced live
  in WebAudio, plus an engine note that follows the speedo.
- **Saving** — Rico's life persists in localStorage: cash, story progress,
  garage, armour and ammunition.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse | Camera (pointer lock) |
| Shift | Sprint |
| Space | Jump / handbrake |
| F | Enter / exit car |
| E | Talk, buy, rest, interact |
| Click | Punch / shoot |
| 1 / 2 | Fists / pistol |
| R | Radio station |
| M | Mute |
| P / Esc | Pause |

## Play it

```sh
node serve.ts        # then open http://localhost:8901/
```

Or serve `game/` with any static file server — it is plain files, no build.

## Hand-in

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the vendored `buildDossier` under the bounty caps.

## Layout

- `main.ts` — the hand-in program (repo root)
- `serve.ts` — local dev server
- `vendor/makefun-game.ts` — the make.fun dossier library (vendored)
- `game/index.html` — page, HUD DOM and styling
- `game/src/` — the game, one module per job: `sky` (day arc), `city` (world
  generation), `textures` (procedural paint), `vehicles`, `traffic`, `peds`,
  `police` (wanted & pursuit), `player`, `driving`, `missions` (the nine
  favours), `economy`, `audio` (synth SFX & radio), `hud` (readouts &
  minimap), `effects`, `input`, `save`, `shots` (screenshot staging),
  `config`, `rng`, `main` (the conductor)
- `screenshots/` — four real renders; the first is the cover

MIT licensed. Puerto Azahar, its people and its crimes are fictional and
original to this entry.
