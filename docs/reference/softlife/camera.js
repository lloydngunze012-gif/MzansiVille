import * as THREE from 'three';

function shortest(from, to) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export class CameraRig {
  constructor(camera, colliders) {
    this.camera = camera;
    this.colliders = colliders || [];
    this.modes = ['follow', 'shoulder', 'top'];
    this.labels = ['Follow', 'Shoulder', 'Top down'];
    this.index = 0;
    this.yaw = 0;
    this.first = true;
  }

  get mode() {
    return this.modes[this.index];
  }

  get label() {
    return this.labels[this.index];
  }

  cycle() {
    this.index = (this.index + 1) % this.modes.length;
    this.first = true;
    return this.label;
  }

  forward() {
    const f = new THREE.Vector3();
    this.camera.getWorldDirection(f);
    f.y = 0;
    if (f.lengthSq() < 1e-5) f.set(0, 0, -1);
    return f.normalize();
  }

  right() {
    const f = this.forward();
    return new THREE.Vector3(-f.z, 0, f.x);
  }

  inside(p) {
    for (let i = 0; i < this.colliders.length; i += 1) {
      const c = this.colliders[i];
      if (
        p.x > c.minX - 0.3 &&
        p.x < c.maxX + 0.3 &&
        p.z > c.minZ - 0.3 &&
        p.z < c.maxZ + 0.3 &&
        p.y > 0.4 &&
        p.y < c.maxY
      ) {
        return true;
      }
    }
    return false;
  }

  avoid(from, to) {
    const steps = 7;
    for (let i = 1; i <= steps; i += 1) {
      const p = from.clone().lerp(to, i / steps);
      if (this.inside(p)) {
        return from.clone().lerp(to, Math.max(0, (i - 1) / steps - 0.06));
      }
    }
    return to;
  }

  update(pos, heading, dt) {
    const focus = new THREE.Vector3(pos.x, 1.35, pos.z);
    const desired = new THREE.Vector3();
    const look = focus.clone();

    if (this.mode === 'follow') {
      this.yaw += shortest(this.yaw, heading) * Math.min(1, dt * 2.6);
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      desired.set(focus.x - fx * 6.2, focus.y + 3.3, focus.z - fz * 6.2);
    } else if (this.mode === 'shoulder') {
      this.yaw += shortest(this.yaw, heading) * Math.min(1, dt * 4);
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      desired.set(focus.x - fx * 2.7 - fz * 0.85, focus.y + 1.3, focus.z - fz * 2.7 + fx * 0.85);
      look.set(pos.x + fx * 3.4, 1.5, pos.z + fz * 3.4);
    } else {
      desired.set(focus.x, 26, focus.z + 5.5);
      look.set(focus.x, 0.4, focus.z);
    }

    const safe = this.mode === 'top' ? desired : this.avoid(focus, desired);
    if (safe.y < 0.9) safe.y = 0.9;

    if (this.first) {
      this.camera.position.copy(safe);
      this.first = false;
    } else {
      this.camera.position.lerp(safe, Math.min(1, dt * 8));
    }
    this.camera.lookAt(look);
  }
}