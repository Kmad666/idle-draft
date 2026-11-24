# Idle Draft

A browser idle game in the spirit of Anno's integrated economy, drawn on a white drafting table with glossy, Wii-era buildings.

Houses need goods. Buildings make goods and send them along links. Fully supplied houses pay more Bits and can move up a class, which asks for longer production chains across more islands. The game keeps running in a background tab, and works out what you earned while the page was closed (up to 24 hours).

## Play

Open `index.html` through any static web host. On GitHub Pages: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.

## Version 0.1 contents

- Islands: Delos (Water, Ore) and Thera (Silica, Carbon), joined by a relay with buyable lanes.
- Classes: Drones and Techs.
- Buildings: House, Pump, Ore drill, Smelter, Silica quarry, Carbon rig, Kiln, Purifier, Mixer, Fab.
- Hybrid layout: new buildings link themselves to whatever needs their goods. You can move them, remove links and add links by hand.
- Anno 1800 style mouse controls, a 12-step guide, a glossary, light and dark modes, and save export and import.

## Controls

| Input | Action |
|---|---|
| Left-click | Select, or place while building |
| Left-drag on empty ground | Pan |
| Mouse wheel | Zoom (the camera tilts as you zoom) |
| Middle-drag, or Q / E | Rotate |
| Right-click or Esc | Cancel or deselect |
| WASD, arrows or screen edges | Pan |
| F (while building) | Place at the suggested spot |

## Code layout

- `js/data.js`: goods, buildings, classes, islands and tuning numbers
- `js/sim.js`: the economy simulation (no rendering, so it can fast-forward)
- `js/world.js`: three.js scene
- `js/camera.js`: Anno-style camera
- `js/ui.js`: panels, dock, guide, world tags and dialogs
- `js/main.js`: input, game loop, saving

The design sheet this follows is sheet NW-01 (Node Works).
