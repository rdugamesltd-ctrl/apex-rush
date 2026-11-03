// Every image the game can use. Files live in assets/images/<key>.png.
// Missing files are replaced by procedural fallbacks (see fallbacks.js).
//   kind 'sprite' - background removed, trimmed, scaled to `max` px
//   kind 'tile'   - scaled to `max`; mirrored 2x2 only if its edges don't already tile seamlessly
//   kind 'ui'     - like sprite, also exported as a data URL for the DOM menus
export const IMAGE_DIR = 'assets/images/';

export const ASSETS = [
  { key: 'car', kind: 'sprite', max: 256 },
  { key: 'tile_grass', kind: 'tile', max: 512 },
  { key: 'tile_sand', kind: 'tile', max: 512 },
  { key: 'tile_concrete', kind: 'tile', max: 512 },
  { key: 'tree_round', kind: 'sprite', max: 384 },
  { key: 'tree_pine', kind: 'sprite', max: 384 },
  { key: 'bush', kind: 'sprite', max: 160 },
  { key: 'grandstand', kind: 'sprite', max: 1024 },
  { key: 'tire_stack', kind: 'sprite', max: 128 },
  { key: 'pit_building', kind: 'sprite', max: 1024 },
  { key: 'cactus', kind: 'sprite', max: 192 },
  { key: 'rock', kind: 'sprite', max: 192 },
  { key: 'building_roof_1', kind: 'sprite', max: 512 },
  { key: 'building_roof_2', kind: 'sprite', max: 512 },
  { key: 'sign_curve', kind: 'sprite', max: 128 },
  { key: 'logo', kind: 'ui', max: 1024 },
  { key: 'icon_engine', kind: 'ui', max: 128 },
  { key: 'icon_turbo', kind: 'ui', max: 128 },
  { key: 'icon_tires', kind: 'ui', max: 128 },
  { key: 'icon_brakes', kind: 'ui', max: 128 },
  { key: 'icon_aero', kind: 'ui', max: 128 },
  { key: 'icon_coin', kind: 'ui', max: 128 },
  { key: 'icon_trophy', kind: 'ui', max: 128 },
];
