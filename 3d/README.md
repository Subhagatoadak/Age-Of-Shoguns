# Age of Shoguns 3D

Real-time strategy in a feudal-Japan valley, built with Three.js and Vite.

## Run

With Docker (from the repository root):

```sh
docker compose up -d --build            # 3D game: http://localhost:8686   classic 2D game: http://localhost:8687
docker compose --profile dev up         # 3D game with hot reload: http://localhost:5173
docker compose down                     # stop everything
```

Ports can be changed with `SHOGUNS_3D_PORT`, `SHOGUNS_2D_PORT` and `SHOGUNS_DEV_PORT`.

Without Docker (Node 20+):

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static files in dist/
```

## What's in the game

- **A living town.** Families move into your houses; men, women and children go to market, pray at the temple, farm, chat and play by day and sleep at night. Children are born and grow up, elders pass away, newcomers arrive when the town is happy and families leave when it isn't. Click any townsperson to see who they are.
- **Time passes.** The calendar runs from 1560 month by month (old Japanese month names) through spring blossom, green summer, red autumn maples and the harvest, and winter snow.
- **Society.** The Town panel shows population, families, happiness, taxes (low / fair / heavy), food eaten and grown, and a chronicle of everything that happens. Hold matsuri festivals at the temple; recruit townsfolk as villagers.
- **Four ages.** Village → Feudal → Castle → Shogunate, researched at the castle, each unlocking buildings, units and upgrades and raising the population cap.
- **National borders.** Your territory spreads from your buildings and glows on the ground; you can only build inside it, and soldiers in enemy land suffer attrition.
- **Livestock and wildlife.** Cattle ranches feed the town, chickens peck around houses, deer roam the forests and bolt from soldiers.
- **Raid settings.** Settings lets you turn raids off, choose when the first raid comes, the gap between raids and their size, or send one at once.
- **Battle formations.** Armies march in ranks: cavalry and melee in front, archers behind, monks at the rear.
- **Save / Continue.** Autosaves every minute; Save button; Continue on the start screen.

## Controls

- **Drag the map** with the left mouse button (or one finger) to move around; it glides on release. Two-finger trackpad scroll also pans.
- Mouse wheel, trackpad pinch or the − / + buttons zoom; zoom right in for ground-level views. Q / E or middle-drag rotates, WASD pans.
- Click selects, Shift+drag box-selects, right-click moves, attacks, gathers or builds. Touch: tap to select and command, pinch to zoom, twist to rotate.
- **Battle cam** (button or T): during raids the camera films the duels up close with letterbox, slow motion on killing blows and hit shake. Any click, drag or key hands control back.
- Panel actions on Z X C V…, Ctrl+1–9 saves a group, Space jumps to the last alert, H castle, `.` idle villager, G army, F speed, P pause.
- The opening flies from the globe down to Kai Province in Japan; Skip or Esc jumps straight in.

## Code map

| Path | What it does |
| --- | --- |
| `src/game/` | Simulation only (no rendering): economy, AI, A* pathfinding, combat, raids, upgrades. |
| `src/gfx/body.js` | Skinned human bodies (one continuous mesh per character) with faces, hands and clothing. |
| `src/gfx/rig.js` | Skeletons, armour and gear, horse rig, and every animation clip including the martial-arts moves. |
| `src/director.js` | Cinematic battle camera. |
| `src/gfx/globe.js` | Opening globe sequence (coastlines: Natural Earth, public domain). |
| `src/gfx/models.js` | Procedural buildings, trees, rocks, grass and banners. |
| `src/gfx/terrain.js` | Height field, ground colouring, lake, grass and the fog-of-war texture. |
| `src/gfx/sky.js` | Sun and moon cycle, sky, fog, environment lighting and rain. |
| `src/gfx/view.js` | Keeps a 3D object in sync with each simulated entity and plays effects. |
| `src/ui/hud.js`, `src/camera.js`, `src/main.js` | HUD, minimap, RTS camera, input and the render loop. |
