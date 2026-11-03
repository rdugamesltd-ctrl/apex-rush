# Apex Rush

A top-down formula racing game for the web, built with Phaser 3. It runs on PC (keyboard) and phones/tablets (on-screen pedals).

- **Quick Race:** choose the track, laps (1/3, 5 with Endurance) and opponents (3–7, 11 with Full Grid). Difficulty is fixed per track.
- **Garage:** upgrade Engine, Turbo, Tyres, Brakes and Aero (5 levels each), paint the car any colour, and set the driver name and number.
- **4 tracks, one difficulty each:** Harbor Loop (Easy, free), Pine Valley (Medium), Dune Circuit (Hard) and Metro Streets (Insane). Every track except the first is bought with coins; a new track is paid by default (its difficulty's `trackPrice`) unless its def sets `price: 0`.
- **Shop:** tracks, perks (Coin Booster, Full Grid, Endurance, Drift King, Paint Mixer), tyre smoke colours and premium paints. Catalog in `src/shop.js`.
- **Coins:** earned by finishing position, difficulty, laps, overtakes and drift points.
- **Race features:** start lights, slipstream, live standings, minimap, best laps, live lap delta, drift scoring, brake lights, wrong-way warning and auto-reset when stuck.
- **Driving assists** (Settings, or the pause menu during a race):
  - **Racing line:** arrows along the ideal line. Green = accelerate, yellow = hold speed / lift, red = brake. "Braking only" shows just the yellow and red parts.
  - **Corner hints:** a card with the next turn's number, direction, severity, distance and target speed. It flashes **EASE OFF** or **BRAKE!** (with a beep) when you're coming in too fast. 3-2-1 marker boards also stand before the braking point of every slow corner.
  - **Camera:** "Top-down" (north up) or "Follow car" (rotates so the car always points up the screen).
  - **Camera motion:** the camera always looks ahead into the next corner. "Full" adds lean, inertia on launch and braking, kerb/grass rumble, impact jolts, a start-grid pan and a finish orbit. "Reduced" leaves those out (default when the OS asks for reduced motion).
- **Graphics:** soft sun shadows, drifting cloud shadows, mowing stripes, gravel traps, rubbered-in brake marks, a start-light gantry that counts down with the race, colour grading, motion blur at top speed and a tilt-shift look behind the menus. Harbor Loop has a lake with boats, Dune Circuit a palm oasis. Graphics default to **Auto**: if a race keeps dropping frames, the game lowers its render resolution step by step, and as a last resort turns the extra effects off. "High" keeps full quality, "Low (faster)" turns the extras off straight away.
- **Mobile:** on-screen pedals, a reset button, fullscreen and landscape lock when a race starts (Android), pause when the app goes to the background, safe-area aware layout, and offline play once installed (**Add to Home Screen**).
- **Saving:** progress is stored in the browser (localStorage).

## Run it

The game has no build step, but browsers block game files opened directly from disk, so it needs a small local web server.

```bash
npm start            # serves the game at http://localhost:8080
```

`npm start` also prints a network address such as `http://192.168.1.20:8080`. Open it on a phone connected to the same Wi-Fi to test on mobile. Windows may ask you to allow Node.js through the firewall.

Any other static server works too, for example `python -m http.server 8080`.

## Controls

| | PC | Touch |
|---|---|---|
| Gas | ↑ or W | GAS pedal (bottom right) |
| Brake / reverse | ↓ or S | BRAKE pedal |
| Handbrake (drift) | Space or Left Shift | (keyboard only) |
| Steer | ← → or A D | arrow pads (bottom left) |
| Reset car | R | reset button under pause (also automatic when stuck) |
| Pause | Esc or P | pause button (top left) |

To put steering on the right and pedals on the left, open Settings and set **Touch layout** to "Steer on right".

## Adding your own art

All art is drawn in code until you add images. **[ASSET_PROMPTS.md](ASSET_PROMPTS.md)** has a ready-to-paste ChatGPT prompt for every image, with the exact filenames and sizes.

To use an image, save it as `assets/images/<name>.png` and run **`npm run optimize`**. Backgrounds are removed, empty margins trimmed and ground textures made seamless, and the result is saved as a small WebP in `assets/game/` (the 1–4 MB PNGs from ChatGPT become 10–120 KB). The game loads only those WebPs, so always re-run `npm run optimize` after adding or replacing a PNG; `npm run check` fails if you forgot. (On a local or Wi-Fi dev server, a brand-new image also shows up without optimizing, but more slowly; `?raw` forces the original PNGs.) The browser console lists which custom images were loaded.

## Deploy

Run **`npm run build`** and upload the contents of **`dist/`** (about 2.3 MB, 1.4 MB with compression). The build bundles all game code into one minified file, gives Phaser, code and CSS content-hashed names (so they can be cached for a year and still update), copies only the optimized art, and writes a service worker with the exact file list. It also writes `_headers` (Netlify, Cloudflare Pages) and `.htaccess` (Apache) with caching and compression rules. Check the build locally with `npm run serve:dist`.

The project folder itself also runs on a server without building, but it loads ~50 separate code files, so use `dist/` for real players. Never upload `assets/images/` (the source PNGs, ~31 MB) or `node_modules/`.

Load time on a phone-like setup (10 Mbps, 4× slower CPU): menu after about 2.5 s from `dist/` (it was 34 s before the art was optimized). Measure with `npm run loadtime -- --dist` (`--mbps=3 --rtt=150` for a weak connection).

- **GitHub Pages:** push the contents of `dist/` to a repository (or a `gh-pages` branch) and enable Pages.
- **Vercel:** import the Git repository; `vercel.json` already sets the build command (`npm run build`), the output folder (`dist`) and caching. Build servers have no Chrome, so run `npm run optimize` on your computer after changing art and commit `assets/game/` and `src/assets/built.js`.
- **Netlify:** drag the `dist/` folder onto app.netlify.com/drop.
- **itch.io:** zip the contents of `dist/` and upload it as an HTML game.
- **Your own server:** copy `dist/` to the web root. Make sure the server compresses `.js`/`.css` (gzip or brotli); `.htaccess` does this on Apache. `npm run serve:dist` is a small Node server that does it too.

On phones, use **Add to Home Screen** to get fullscreen landscape play. Over https the service worker (`sw.js`) caches the game, so the installed app also starts offline. Bump `CACHE` in `sw.js` when you want installed copies to drop their old files (they refresh from the network anyway whenever online).

If you change `assets/icon.svg`, run `node tools/make-icons.mjs` to regenerate the PNG app icons.

## Project layout

```
index.html, css/style.css      page shell and all UI styling
assets/fonts/                  Exo 2 display font (SIL Open Font License, see OFL.txt)
lib/phaser.min.js              Phaser 3.90 (vendored)
src/config.js                  game name, car stats, upgrade prices, rewards, AI names
src/game/tracks/*.js           track layouts (corner points + radius)
src/game/Track.js              track geometry, barriers, racing line, AI speed profile
src/game/TrackRenderer.js      draws ground layers, road, kerbs, walls, gravel, lakes, gantry, scenery
src/game/Geometry.js           GPU vector layers: static track shapes uploaded once, skid ring buffer
src/perf.js                    frame pacing per screen and the adaptive "Auto" graphics
src/game/Atmosphere.js         cloud shadows and the post-processing pass (grade, vignette, blur)
src/game/themes.js             per-theme colours, ground grading, scenery mix
src/game/Car.js                car physics (grip, drift, handbrake)
src/game/RaceGuide.js          corner notes, player speed profile, brake / ease-off advice
src/game/DrivingLine.js        coloured racing-line arrows drawn on the road
src/game/LapDelta.js           live gap to the best lap
src/game/DriftScore.js         drift points and multiplier
src/game/AIDriver.js           AI drivers
src/game/RaceManager.js        race rules: lights, laps, collisions, standings, results
src/scenes/RaceScene.js        Phaser scene: camera, effects, sound, HUD wiring
src/ui/                        menus, HUD, touch controls (HTML/CSS)
src/audio/Sfx.js               engine and effect sounds (synthesized, no audio files)
src/assets/                    image list, placeholder art, image clean-up, generated textures
tools/                         dev server and test scripts
```

### Common tweaks

- **Rename the game:** change `GAME_TITLE` in `src/config.js`, plus the `<title>` and loading text in `index.html` and `manifest.webmanifest`.
- **Change car handling:** edit `BASE_STATS` in `src/config.js`.
- **Change a track's look:** edit its theme in `src/game/themes.js` (ground colour, stripes, gravel, clouds, colour mood). To put a lake in a track's infield, add `lake: { margin: 400, style: 'harbor' }` (or `style: 'oasis'`) to its file in `src/game/tracks/`. `margin` is the gap between the inner wall and the shore.
- **Change prices and rewards:** edit `UPGRADE_COSTS`, `POSITION_REWARDS` and `DIFFICULTIES` (incl. `trackPrice`) in `src/config.js`; shop items and their prices in `src/shop.js`.
- **Add a track:**
  1. Copy a file in `src/game/tracks/` and change its `id`, `name` and `points`. Each point is `[x, y, cornerRadius]` and cars drive through the points in order.
  2. Add the track to `TRACK_DEFS` in `src/game/tracks/index.js`.
  3. Run `node tools/check-tracks.mjs` to check the layout for overlapping sections.

## Testing

```bash
npm install          # one time: installs puppeteer-core for the browser test
npm run check        # optimized images up to date, track geometry valid, AI race simulation on every track
npm run smoke        # opens the game in headless Chrome/Edge and plays through menus and a race on each track
npm run smoke -- --dist   # the same against the dist/ build
```

`npm run smoke` saves screenshots to `tools/screenshots/`.

```bash
npm run profile -- harbor --phone --throttle=4   # frame-time breakdown on a phone-sized screen with a slowed CPU
npm run devices                                  # screenshots of every screen on phones, portrait and tablet
```

Performance notes: draw static shapes through `this.geo.seg(depth)` in TrackRenderer (not `scene.add.graphics()`); Phaser Graphics re-process every triangle on the CPU each frame. A new depth used with `seg()` must fall inside one of the groups listed in the TrackRenderer constructor.

Useful URL options while developing:
- `?race=pine&laps=1&opp=5&diff=hard` jumps straight into a race.
- `&autopilot` lets the AI drive your car.
- `&timescale=4` runs the game at 4× speed.
- `?debug` shows the racing line and an FPS counter.
