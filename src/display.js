// Shared display info: the canvas renders at `dpr` pixels per CSS pixel.
// `scale` is the adaptive resolution factor (1 = full quality, lowered on slow devices).
export const display = {
  dpr: 1,
  scale: 1,
  cssWidth: window.innerWidth,
  cssHeight: window.innerHeight,
};

// Media queries are evaluated once and kept up to date by listeners (they are
// read every frame, and matchMedia() itself is not cheap on phones).
const coarseMq = window.matchMedia('(pointer: coarse)');
const portraitMq = window.matchMedia('(orientation: portrait)');
let coarse = coarseMq.matches;
let portrait = portraitMq.matches;
coarseMq.addEventListener?.('change', (e) => (coarse = e.matches));
portraitMq.addEventListener?.('change', (e) => (portrait = e.matches));

export const isCoarsePointer = () => coarse;

export const isPortraitTouch = () => coarse && portrait;

// Phones and small tablets (touch-first, small screen).
export const isMobile = () => coarse && Math.min(screen.width, screen.height) < 820;
