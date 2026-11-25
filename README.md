# Idle Draft

A procedural city drawn on a white drafting table: glossy white buildings with ink outlines and floor lines, a hatched river, safety-orange accents, and traffic moving through the streets. Leave it open and watch it, or fly around and inspect buildings.

The Anno-style economy from v0.1 is paused for now. It is kept on the `v0.1-anno` branch.

## Play

Open `index.html` through any static web host. On GitHub Pages: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.

Every city comes from a seed number, and the address bar link includes it (`?seed=1234`), so a city can be shared or revisited.

## Styles

The **Style** button cycles three looks:

- **Draft**: the white drafting sheet.
- **Night**: the same sheet at night, with floor lines lit like windows.
- **Neon**: the same seed redrawn as a cyberpunk vertical city. Towers are about 1.5× taller, two blocks become stepped arcologies, the terraces become crooked stacked housing with pods bolted on, and the streets get skybridges, pipes, walkways at three levels, an elevated train loop, flying traffic, neon and holographic signs, searchlights, rain and bloom.

## Drone deliveries

Three rooftop drone depots (DP-001 to DP-003) each run 12 quadcopters. A drone loads a package, takes off, picks the lowest safe flight path (straight, along the grid, or round the side of a supertall tower), lowers itself to the kerb outside the address, leaves the package and flies home. Packages sit on the kerb for a while before they are collected.

- **Follow a drone** rides along with one that has just set off, showing its route as a dashed line and the drop spot as a ring. Click any drone to follow it instead.
- The panel shows where it is going, distance left, altitude and its trip count.
- The top bar counts every delivery, saved in this browser.

## Performance

- The city is split into 16 tiles of 4×4 blocks. Tiles off screen, past the fog, or outside the shadow area are skipped, so a close-up (like following a drone) draws about a fifth of the city.
- Nothing is drawn beyond the fog line.
- Auto resolution (on by default, in Settings) lowers the render resolution when the frame rate drops below about 42 fps and raises it again when there is headroom.

## Version 0.2 contents

- A 16 × 16 block city, about 2,900 buildings, split into districts: Civic Core (towers and a domed rotunda), Midtown, the Terraces (row houses), River Works (sheds, tanks and chimneys) and parks.
- One landmark tower per city, with a turning ring and a spire.
- A river with bridges, cars on every road, and blinking beacons.
- Click any building for its spec sheet and a height dimension line.
- Drafting furniture: title block, north arrow and a live scale bar.
- Light mode (drafting sheet) and dark mode (night, floor lines glow like windows).

## Controls

| Input | Action |
|---|---|
| Left-click | Select a building, or click a drone to follow it |
| Left-drag | Pan |
| Mouse wheel | Zoom (the camera tilts as you zoom) |
| Middle-drag, or Q / E | Rotate |
| Right-click or Esc | Deselect |
| WASD or arrows | Pan |

## Code layout

- `js/city.js`: the city generator (plain data, seeded)
- `js/world.js`: three.js scene, merged geometry, traffic, selection, and the neon layer (window shader, signs, bloom, rain)
- `js/camera.js`: Anno-style camera
- `js/drones.js`: delivery drones: trip planning, flight, parcels and the follow route
- `js/main.js`: input, panels, labels, follow camera and settings

The design sheet this follows is sheet NW-02 (Cityscape).
