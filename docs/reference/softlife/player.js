import * as THREE from 'three';
import { CONFIG } from './data/neighbourhood.js';

const matCache = new Map();
export function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

const geoCache = new Map();
export function boxGeo(w, h, d) {
  const key = `b|${w}|${h}|${d}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(key);
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createFigure({ body = 0x4b7f9e, skin = 0x8d5a3b, legs = 0x2d2a33 } = {}) {
  const group = new THREE.Group();
  const torso = new THREE.Mesh(boxGeo(0.56, 0.7, 0.34), mat(body));
  torso.position.y = 1.06;
  const hips = new THREE.Mesh(boxGeo(0.5, 0.16, 0.32), mat(legs));
  hips.position.y = 0.72;
  const head = new THREE.Mesh(boxGeo(0.36, 0.38, 0.34), mat(skin));
  head.position.y = 1.62;
  const hair = new THREE.Mesh(boxGeo(0.38, 0.1, 0.36), mat(0x241d1a));
  hair.position.y = 1.82;

  const armGeo = boxGeo(0.15, 0.5, 0.16);
  const makeArm = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.36, 1.36, 0);
    const m = new THREE.Mesh(armGeo, mat(body));
    m.position.y = -0.25;
    g.add(m);
    return g;
  };
  const legGeo = boxGeo(0.18, 0.62, 0.2);
  const makeLeg = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.15, 0.72, 0);
    const m = new THREE.Mesh(legGeo, mat(legs));
    m.position.y = -0.32;
    g.add(m);
    return g;
  };

  const armL = makeArm(-1);
  const armR = makeArm(1);
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;

  group.add(torso, hips, head, hair, armL, armR, legL, legR, shadow);
  group.userData.parts = { armL, armR, legL, legR };
  return group;
}

export class Player {
  constructor(scene) {
    this.group = createFigure({ body: 0x2f6f8f, skin: 0x8a5736, legs: 0x2a2a33 });
    scene.add(this.group);
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;
    this.target = null;
    this.input = { active: false, x: 0, z: 0, run: false, mag: 0 };
    this.phase = 0;
    this.speed = 0;
    this.colliders = [];
    this.parts = this.group.userData.parts;
    this.sync();
  }

  setColliders(list) {
    this.colliders = list || [];
  }

  setPosition(x, z) {
    this.pos.set(x, 0, z);
    this.target = null;
    this.sync();
  }

  walkTo(x, z) {
    this.target = new THREE.Vector3(x, 0, z);
  }

  stop() {
    this.target = null;
    this.input.active = false;
  }

  get hasTarget() {
    return Boolean(this.target);
  }

  get isRunning() {
    return this.input.active && this.input.run;
  }

  setInput(x, z, run, mag) {
    this.input = { active: true, x, z, run, mag };
    this.target = null;
  }

  clearInput() {
    this.input.active = false;
  }

  blocked(x, z) {
    const r = 0.42;
    for (let i = 0; i < this.colliders.length; i += 1) {
      const c = this.colliders[i];
      if (c.maxY !== undefined && c.maxY < 0.5) continue;
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  }

  update(dt) {
    let dx = 0;
    let dz = 0;
    let speed = 0;

    if (this.input.active) {
      const m = Math.hypot(this.input.x, this.input.z);
      if (m > 0.001) {
        dx = this.input.x / m;
        dz = this.input.z / m;
        const base = this.input.run ? CONFIG.runSpeed : CONFIG.walkSpeed;
        speed = base * (this.input.run ? 1 : Math.max(0.4, Math.min(1, this.input.mag)));
      }
    } else if (this.target) {
      const tx = this.target.x - this.pos.x;
      const tz = this.target.z - this.pos.z;
      const d = Math.hypot(tx, tz);
      if (d < 0.2) {
        this.target = null;
      } else {
        dx = tx / d;
        dz = tz / d;
        speed = Math.min(CONFIG.walkSpeed, Math.max(1.2, d * 4));
      }
    }

    if (speed > 0.01) {
      const before = { x: this.pos.x, z: this.pos.z };
      const nx = this.pos.x + dx * speed * dt;
      if (!this.blocked(nx, this.pos.z)) this.pos.x = nx;
      const nz = this.pos.z + dz * speed * dt;
      if (!this.blocked(this.pos.x, nz)) this.pos.z = nz;

      const b = CONFIG.worldBound;
      this.pos.x = clamp(this.pos.x, -b, b);
      this.pos.z = clamp(this.pos.z, -b, b);

      const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
      if (moved < 0.0005) this.target = null;

      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 12);
      this.phase += dt * (speed * 1.8 + 2);
    } else {
      this.phase += dt * 1.5;
    }

    this.speed = speed;
    this.animate(dt, speed);
    this.sync();
  }

  animate(dt, speed) {
    const amp = Math.min(1, speed / CONFIG.walkSpeed);
    const swing = Math.sin(this.phase * 2) * 0.55 * amp;
    const ease = Math.min(1, dt * 10);
    this.parts.legL.rotation.x += (swing - this.parts.legL.rotation.x) * ease;
    this.parts.legR.rotation.x += (-swing - this.parts.legR.rotation.x) * ease;
    this.parts.armL.rotation.x += (-swing * 0.8 - this.parts.armL.rotation.x) * ease;
    this.parts.armR.rotation.x += (swing * 0.8 - this.parts.armR.rotation.x) * ease;

    const idle = speed > 0.05 ? 0 : Math.sin(this.phase) * 0.02;
    this.group.position.y = idle;
  }

  sync() {
    this.group.position.x = this.pos.x;
    this.group.position.z = this.pos.z;
    this.group.rotation.y = this.heading;
  }
}