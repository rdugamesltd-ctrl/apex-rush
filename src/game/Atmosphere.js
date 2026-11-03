// Scene atmosphere: drifting cloud shadows over the world, and one post-processing
// pass on the camera - colour grade, sunlight falloff, vignette, a motion blur at
// the screen edges at high speed and a tilt-shift blur behind the menus.
// Everything here is skipped on the "Low" graphics setting.
import { DEPTH, LIGHT } from './TrackRenderer.js';
import { cloudTexture } from '../assets/worldTextures.js';

const FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uSpeed;
uniform float uTilt;
uniform float uVignette;
uniform float uGrade;
uniform vec2 uLight;
uniform vec2 uDir;
uniform vec3 uTint;
varying vec2 outTexCoord;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec2 uv = outTexCoord;
  vec3 col = texture2D(uMainSampler, uv).rgb;
  vec2 d = uv - 0.5;
  float aspect = uResolution.x / uResolution.y;
  vec2 da = vec2(d.x * aspect, d.y);
  float r = length(da);

  // edge motion blur: the middle of the screen (most pixels) skips the 7 taps
  float mb = uSpeed * smoothstep(0.42, 1.05, r);
  if (mb > 0.004) {
    vec2 st = vec2(uDir.x / aspect, uDir.y) * mb * 0.026;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 7; i++) acc += texture2D(uMainSampler, uv + st * (float(i) / 6.0 - 0.5)).rgb;
    col = acc / 7.0;
  }

  if (uTilt > 0.001) {
    float b = smoothstep(0.1, 0.45, abs(d.y)) * uTilt;
    if (b > 0.01) {
      vec2 rad = vec2(0.0055 / aspect, 0.0055) * b;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 2.39996;
        float rr = sqrt((float(i) + 0.5) / 12.0);
        acc += texture2D(uMainSampler, uv + vec2(cos(a), sin(a)) * rr * rad).rgb;
      }
      col = mix(col, acc / 12.0, min(1.0, b * 1.6));
    }
  }

  col *= mix(vec3(1.0), uTint, uGrade) * (1.0 + uGrade * 0.08 * dot(da, uLight));
  float l = luma(col);
  col = mix(vec3(l), col, 1.0 + 0.16 * uGrade);
  col = (col - 0.5) * (1.0 + 0.08 * uGrade) + 0.5;
  col += uGrade * (vec3(0.03, 0.014, -0.02) * smoothstep(0.45, 1.0, l)
                 + vec3(-0.014, 0.0, 0.022) * (1.0 - smoothstep(0.0, 0.42, l)));

  float v = smoothstep(0.5, 1.25, r);
  col *= 1.0 - uVignette * v;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class GradePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game, name: 'ApexGrade', fragShader: FRAG });
    this.speed = 0;
    this.tilt = 0;
    this.vignette = 0.42;
    this.grade = 1;
    this.lightX = -LIGHT.x;
    this.lightY = LIGHT.y;
    this.dirX = 1;
    this.dirY = 0;
    this.tint = [1, 1, 1];
  }

  onPreRender() {
    this.set3f('uTint', this.tint[0], this.tint[1], this.tint[2]);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
    this.set1f('uSpeed', this.speed);
    this.set1f('uTilt', this.tilt);
    this.set1f('uVignette', this.vignette);
    this.set1f('uGrade', this.grade);
    this.set2f('uLight', this.lightX, this.lightY);
    this.set2f('uDir', this.dirX, this.dirY);
  }
}

// World vector -> post-processing texture space (camera turned by `rot`, y up).
function toScreen(x, y, rot) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [x * c - y * s, -(x * s + y * c)];
}

export class Atmosphere {
  constructor(scene, theme, { quality, menu }) {
    this.scene = scene;
    this.theme = theme;
    this.menu = menu;
    this.pipe = null;
    this.clouds = null;
    this.speed = 0;
    this.wind = { x: 16, y: 9 };
    this.setQuality(quality);
  }

  setQuality(quality) {
    const hq = quality !== 'low';
    const scene = this.scene;
    const cam = scene.cameras.main;
    if (hq && !this.clouds && this.theme.clouds) {
      this.clouds = scene.add
        .tileSprite(0, 0, 64, 64, cloudTexture(scene))
        .setOrigin(0, 0)
        .setDepth(DEPTH.clouds)
        .setTint(0x0d1830)
        .setAlpha(this.theme.clouds)
        .setTileScale(12);
    }
    this.clouds?.setVisible(hq);

    const webgl = scene.renderer.type === Phaser.WEBGL;
    if (hq && webgl && !this.pipe) {
      const pm = scene.renderer.pipelines;
      if (!pm.postPipelineClasses.has('ApexGrade')) pm.addPostPipeline('ApexGrade', GradePipeline);
      cam.setPostPipeline('ApexGrade');
      const p = cam.getPostPipeline('ApexGrade');
      this.pipe = Array.isArray(p) ? p[0] : p;
      if (this.pipe) {
        this.pipe.tilt = this.menu ? 1 : 0;
        this.pipe.vignette = this.menu ? 0.6 : 0.42;
        this.pipe.tint = this.theme.tint || [1, 1, 1];
      }
    } else if (!hq && this.pipe) {
      cam.removePostPipeline('ApexGrade');
      this.pipe = null;
    }
  }

  // view: visible world rect; speed: 0..1 how fast the followed car is going;
  // (vx, vy): its direction of travel in the world.
  update(view, time, speed, camRot, vx = 1, vy = 0) {
    if (this.clouds?.visible) {
      const s = 12;
      const pad = 64;
      const w = Math.ceil(view.width + pad * 2);
      const h = Math.ceil(view.height + pad * 2);
      if (w > this.clouds.width || h > this.clouds.height) this.clouds.setSize(w + 256, h + 256);
      const gx = Math.floor(view.x - pad);
      const gy = Math.floor(view.y - pad);
      this.clouds.setPosition(gx, gy);
      this.clouds.tilePositionX = (gx - this.wind.x * time) / s;
      this.clouds.tilePositionY = (gy - this.wind.y * time) / s;
    }
    if (this.pipe) {
      this.speed += (speed - this.speed) * 0.08;
      this.pipe.speed = this.menu ? 0 : this.speed;
      // the sunlight falloff keeps pointing at the sun when the camera turns
      [this.pipe.lightX, this.pipe.lightY] = toScreen(-LIGHT.x, -LIGHT.y, camRot);
      const l = Math.hypot(vx, vy);
      if (l > 1e-3) [this.pipe.dirX, this.pipe.dirY] = toScreen(vx / l, vy / l, camRot);
    }
  }
}
