# Image prompts for ChatGPT

The game already runs with built-in placeholder art. Each image you generate replaces one placeholder. Images that are still missing keep using the built-in art.

## How to use

1. Open ChatGPT and paste the **style block** below as your first message. Ask it to remember the style for all images in this chat.
2. Generate **`car.png` first**. For every later image, add *"same art style as the car"* to the prompt.
3. Download each image as PNG and save it as **`assets/images/<filename>`**, using the exact filename from the list.
4. Reload the game. The browser console shows which custom images were loaded.

The game cleans images up automatically:
- **Margins:** empty space around the object is trimmed.
- **Size:** big images are scaled down.
- **Ground tiles:** these are made seamless.
- **Backgrounds:** a plain one-colour background is removed, as is the fake grey-and-white checkerboard ChatGPT sometimes draws.

You can still help it:
- If you get a checkerboard or white background, reply: *"Make the background truly transparent (real alpha channel), not a checkerboard."*
- If transparency still fails, ask for *"a solid flat magenta (#FF00FF) background"*. The game removes it.

### Style block (paste this first)

```
For every image in this chat, use this style:
Flat 2D cartoon game asset for a top-down racing game. Clean vector look with
soft, simple shading. Strict top-down orthographic view (camera looking straight
down, no perspective, no tilt, no 3D angle). Bright, saturated colours.
Transparent background (PNG with real alpha). No text, letters, numbers, logos
or watermarks unless I ask. No drop shadow, no border, no frame. The object is
centred with a small empty margin around it.
```

---

## 1. Car (most important)

**`car.png`** — portrait, 1024×1536

```
A modern open-wheel formula race car seen from directly above, nose pointing
straight UP to the top of the image. Wide front wing at the top, four exposed
black tyres, narrow nose, sidepods, open cockpit with a driver helmet, rear wing
at the bottom. IMPORTANT: the whole body, nose, sidepods and both wings are PURE
WHITE (light grey only for soft shading). Tyres, cockpit, suspension arms and
small details are black or dark charcoal. Thin dark outline around the whole
car. No other colours, no sponsor logos, no numbers. Car is perfectly
symmetrical left-to-right and fills about 85% of the image height.
```

> The game paints the white parts in the colour chosen in the Garage, so the car **must** be white and dark grey only. A coloured car can't be repainted.

---

## 2. Ground tiles (square, 1024×1024)

These have no transparency. They fill the whole square.

**`tile_grass.png`**
```
Seamless tileable texture of short, healthy green grass seen from directly
above. Even colour across the whole square, subtle darker and lighter patches,
tiny blades. No objects, no flowers, no shadows, no lighting gradient.
Fills the entire image edge to edge, no transparency.
```

**`tile_sand.png`**
```
Seamless tileable texture of warm desert sand seen from directly above, light
golden-beige with soft wind ripples and fine grain. No objects, no shadows, no
lighting gradient. Fills the entire image edge to edge, no transparency.
```

**`tile_concrete.png`**
```
Seamless tileable texture of light grey city concrete pavement slabs seen from
directly above, large square slabs with thin joints, subtle stains and speckles.
No objects, no shadows, no lighting gradient. Fills the entire image edge to
edge, no transparency.
```

---

## 3. Scenery (transparent background)

**`tree_round.png`** — 1024×1024
```
A single round leafy deciduous tree seen from directly above: a fluffy circular
canopy made of clustered rounded leaf clumps, darker green at the edges and
lighter green highlights on top. Only the canopy is visible (no trunk).
```

**`tree_pine.png`** — 1024×1024
```
A single pine / fir tree seen from directly above: a star-shaped layered canopy
of dark green needle branches radiating from the centre, lighter green in the
middle. Only the canopy is visible.
```

**`bush.png`** — 1024×1024
```
A small leafy green bush seen from directly above, a cluster of 4-5 rounded
leaf clumps with a few tiny yellow and pink flowers.
```

**`grandstand.png`** — landscape, 1536×1024
```
A long rectangular race-track grandstand seen from directly above, very wide
(about 5:2 proportions) and filling the image width. The top third is a blue
corrugated metal roof. The rest is rows of seats packed with a colourful
cheering crowd (tiny heads and bright shirts). The front edge with a white
railing is at the BOTTOM of the image (that side faces the track).
```

**`tire_stack.png`** — 1024×1024
```
A small square cluster of four stacked black racing tyres (tyre barrier) seen
from directly above, two of them with red painted rims and two with white
painted rims.
```

**`pit_building.png`** — landscape, 1536×1024
```
A long, low pit garage building at a race track seen from directly above, about
4:1 proportions, filling the image width. Flat light grey roof with air
conditioning units, vents and a few skylights. A red and white stripe runs along
the front edge at the BOTTOM of the image (the side facing the pit lane).
```

**`cactus.png`** — 1024×1024
```
A desert saguaro cactus seen from directly above: a round green centre with
three thick arms reaching outwards, small light spines.
```

**`rock.png`** — 1024×1024
```
A single desert boulder seen from directly above, angular faceted shape in warm
greys and browns with lighter top facets.
```

**`building_roof_1.png`** — landscape, 1536×1024
```
The flat roof of a modern city office building seen from directly above,
rectangular, slate blue-grey roof with a darker border, several light grey air
conditioning units, vents and a round water tank.
```

**`building_roof_2.png`** — 1024×1024
```
The flat roof of a city apartment building seen from directly above, roughly
square, terracotta orange-brown roof with a darker border, light beige rooftop
structures and a small rooftop garden.
```

**`sign_curve.png`** — 1024×1024
```
A yellow diamond-shaped road warning sign lying flat on the ground, seen from
directly above, thick dark border, black arrow that goes up and then curves to
the RIGHT. No text.
```

---

## 4. Menu and interface

**`logo.png`** — landscape, 1536×1024
```
Bold racing game logo with the text "APEX RUSH". Heavy italic sporty letters,
"APEX" in white and "RUSH" in an orange-to-yellow gradient, thick dark navy
outline, slight speed lines and a small chequered flag accent. Transparent
background. The text must be spelled exactly A-P-E-X R-U-S-H.
```
> If you rename the game (`GAME_TITLE` in `src/config.js`), change the text in this prompt too.

Use the same base prompt for all upgrade icons and swap in the last line. Each is 1024×1024.
```
Game UI icon: a rounded-square badge with a glossy gradient background and a
single bold white symbol in the centre, thin darker edge. No text.
<symbol line>
```

| File | Symbol line |
|---|---|
| `icon_engine.png` | Orange badge, white race engine / piston symbol. |
| `icon_turbo.png` | Yellow badge, white lightning bolt symbol. |
| `icon_tires.png` | Teal badge, white racing tyre seen from the side. |
| `icon_brakes.png` | Red badge, white brake disc with a caliper. |
| `icon_aero.png` | Blue badge, white rear wing (spoiler) with air-flow lines. |

**`icon_coin.png`** — 1024×1024
```
A shiny gold game coin seen from the front, raised rim and a simple star
embossed in the centre. No text.
```

**`icon_trophy.png`** — 1024×1024
```
A shiny gold racing trophy cup with two handles on a dark base, front view.
No text.
```

---

## Optional: home-screen icon

**`app_icon.png`** — 1024×1024
```
App icon for a racing game: a white-and-orange formula race car seen from above,
driving diagonally on a dark navy rounded-square background with a curved white
track line. No text.
```
This one isn't loaded automatically. To use it:
1. Save it as `assets/images/app_icon.png`.
2. In `index.html` and `manifest.webmanifest`, change `assets/icon.svg` to `assets/images/app_icon.png`.
3. In `manifest.webmanifest`, change the icon `type` to `image/png` and `sizes` to `1024x1024`.

---

## Checklist

| File | Size | Background |
|---|---|---|
| car.png | 1024×1536 | transparent, white car |
| tile_grass.png / tile_sand.png / tile_concrete.png | 1024×1024 | full, no transparency |
| tree_round.png, tree_pine.png, bush.png | 1024×1024 | transparent |
| grandstand.png, pit_building.png | 1536×1024 | transparent, front at bottom |
| tire_stack.png, cactus.png, rock.png, sign_curve.png | 1024×1024 | transparent |
| building_roof_1.png | 1536×1024 | transparent |
| building_roof_2.png | 1024×1024 | transparent |
| logo.png | 1536×1024 | transparent |
| icon_engine / turbo / tires / brakes / aero / coin / trophy .png | 1024×1024 | transparent |
