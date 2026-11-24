# Idle Draft

A procedural city drawn on a white drafting table: glossy white buildings with ink outlines and floor lines, a hatched river, safety-orange accents, and traffic moving through the streets. Leave it open and watch it, or fly around and inspect buildings.

The Anno-style economy from v0.1 is paused for now. It is kept on the `v0.1-anno` branch.

## Play

Open `index.html` through any static web host. On GitHub Pages: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.

Every city comes from a seed number, and the address bar link includes it (`?seed=1234`), so a city can be shared or revisited.

## Version 0.2 contents

- A 16 × 16 block city, about 2,900 buildings, split into districts: Civic Core (towers and a domed rotunda), Midtown, the Terraces (row houses), River Works (sheds, tanks and chimneys) and parks.
- One landmark tower per city, with a turning ring and a spire.
- A river with bridges, cars on every road, survey drones circling the tallest towers, and blinking beacons.
- Click any building for its spec sheet and a height dimension line.
- Drafting furniture: title block, north arrow and a live scale bar.
- Light mode (drafting sheet) and dark mode (night, floor lines glow like windows).

## Controls

| Input | Action |
|---|---|
| Left-click | Select a building |
| Left-drag | Pan |
| Mouse wheel | Zoom (the camera tilts as you zoom) |
| Middle-drag, or Q / E | Rotate |
| Right-click or Esc | Deselect |
| WASD or arrows | Pan |

## Code layout

- `js/city.js`: the city generator (plain data, seeded)
- `js/world.js`: three.js scene, merged geometry, traffic and selection
- `js/camera.js`: Anno-style camera
- `js/main.js`: input, panels, labels and settings

The design sheet this follows is sheet NW-02 (Cityscape).
