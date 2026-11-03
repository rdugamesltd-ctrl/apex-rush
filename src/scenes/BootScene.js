// Loads every image in the manifest. Missing files get a procedural placeholder;
// real files are cleaned up (background removed, trimmed, scaled).
import { ASSETS, IMAGE_DIR } from '../assets/manifest.js';
import { makeFallback, makeEffectTextures } from '../assets/fallbacks.js';
import { normalizeTexture } from '../assets/normalize.js';
import { setCarSource } from '../ui/carPreview.js';
import { buildCarParts } from '../assets/carParts.js';
import { UI } from '../ui/ui.js';
import { bus } from '../events.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    this.missing = new Set();
    this.load.on('loaderror', (file) => this.missing.add(file.key));
    const bar = document.querySelector('#loading .ld-bar i');
    this.load.on('progress', (p) => {
      if (bar) bar.style.transform = `scaleX(${p})`;
    });
    for (const a of ASSETS) this.load.image(a.key, `${IMAGE_DIR}${a.key}.png`);
  }

  create() {
    const icons = {};
    let logo = null;
    const custom = [];
    for (const a of ASSETS) {
      let canvas = null;
      if (!this.missing.has(a.key) && this.textures.exists(a.key)) {
        try {
          canvas = normalizeTexture(this, a);
          custom.push(a.key);
        } catch (e) {
          console.warn(`Could not process image "${a.key}", using placeholder.`, e);
          canvas = makeFallback(this, a);
        }
      } else {
        canvas = makeFallback(this, a);
      }
      if (a.kind === 'ui' && canvas) {
        if (a.key === 'logo') logo = canvas.toDataURL();
        else icons[a.key] = canvas.toDataURL();
      }
    }
    makeEffectTextures(this);
    buildCarParts(this, custom.includes('car'));
    setCarSource(this.textures.get('car').getSourceImage());
    console.info(
      `[assets] ${custom.length} custom image(s) loaded${custom.length ? `: ${custom.join(', ')}` : ''}; ` +
        `${ASSETS.length - custom.length} using built-in placeholders.`
    );

    UI.init({ icons, logo });
    const loading = document.getElementById('loading');
    if (loading) {
      loading.classList.add('done');
      setTimeout(() => loading.remove(), 500);
    }
    bus.emit('boot:done');
  }
}
