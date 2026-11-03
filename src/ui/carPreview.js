// Painted car images for the DOM (garage, main menu). Uses the same masked
// paint as the race cars (bodywork only), so the preview matches the track.
import { paintedCar } from '../assets/carParts.js';

let carSource = null;

export function setCarSource(canvas) {
  carSource = canvas;
}

export function drawTintedCar(canvas, color, height, rotation = 0) {
  const car = carSource && paintedCar(color);
  if (!car) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = (height * car.width) / car.height;
  const size = Math.ceil(Math.max(w, height));
  const box = rotation ? size : null;
  canvas.width = Math.ceil((box || w) * dpr);
  canvas.height = Math.ceil((box || height) * dpr);
  canvas.style.width = `${box || w}px`;
  canvas.style.height = `${box || height}px`;

  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.save();
  g.imageSmoothingQuality = 'high';
  g.translate(canvas.width / 2, canvas.height / 2);
  g.rotate(rotation);
  g.drawImage(car, (-w * dpr) / 2, (-height * dpr) / 2, w * dpr, height * dpr);
  g.restore();
}
