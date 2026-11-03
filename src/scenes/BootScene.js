// Loads every image in the manifest. Images prepared by `npm run optimize` come
// as small, already cleaned-up WebPs; other PNGs in assets/images/ are cleaned
// up here (background removed, trimmed, scaled). Missing ones get a placeholder.
//
// ?raw loads the original PNGs and also looks for images added since the last
// optimize (on a local/LAN dev server this happens for MISSING images anyway).
import { ASSETS, IMAGE_DIR } from '../assets/manifest.js';
import { BUILT, BUILT_DIR, MISSING } from '../assets/built.js';
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
    performance.mark('apex:preload');
    this.missing = new Set();
    this.load.on('loaderror', (file) => this.missing.add(file.key));
    // decode each image off the main thread as it arrives (otherwise the first
    // drawImage of every texture decodes it synchronously during create)
    this.decodes = [];
    this.load.on('filecomplete', (key, type, data) => {
      if (data?.decode) this.decodes.push(data.decode().catch(() => {}));
    });
    const bar = document.querySelector('#loading .ld-bar i');
    this.load.on('progress', (p) => {
      if (bar) bar.style.transform = `scaleX(${p})`;
    });
    const raw = new URLSearchParams(location.search).has('raw');
    const dev = !new URLSearchParams(location.search).has('prod') && /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
    this.prebuilt = new Set();
    for (const a of ASSETS) {
      if (BUILT[a.key] && !raw) {
        this.prebuilt.add(a.key);
        this.load.image(a.key, `${BUILT_DIR}${BUILT[a.key].file}`);
      } else if (MISSING.includes(a.key) && !raw && !dev) {
        this.missing.add(a.key); // known to have no file: don't ask the server
      } else {
        this.load.image(a.key, `${IMAGE_DIR}${a.key}.png`);
      }
    }
  }

  create() {
    const wait = new Promise((resolve) => setTimeout(resolve, 3000));
    Promise.race([Promise.all(this.decodes), wait]).then(() => this.setup());
  }

  setup() {
    performance.mark('apex:create');
    const icons = {};
    let logo = null;
    const custom = [];
    for (const a of ASSETS) {
      let canvas = null;
      if (!this.missing.has(a.key) && this.textures.exists(a.key)) {
        try {
          if (this.prebuilt.has(a.key)) {
            // already cleaned up; UI images can use the file's URL directly
            canvas = a.kind === 'ui' ? null : this.textures.get(a.key).getSourceImage();
            if (a.kind === 'ui') {
              const url = `${BUILT_DIR}${BUILT[a.key].file}`;
              if (a.key === 'logo') logo = url;
              else icons[a.key] = url;
            }
          } else canvas = normalizeTexture(this, a);
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
    performance.mark('apex:boot-done');
    bus.emit('boot:done');
  }
}
