import * as THREE from 'three';
import {
  CONFIG,
  SETTING,
  PANELS,
  NPCS,
  INTERACTABLES,
  QUEUES,
  EVENTS,
  EVENT_ORDER,
} from './data/neighbourhood.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Controls } from './input.js';
import { Queues } from './queue.js';
import {
  applyEffect,
  tick,
  formatClock,
  goalText,
  requirementReason,
  flagsPass,
  hourOf,
} from './economy.js';
import { npcCard, npcNodeCard } from './dialogue.js';

export class Game {
  constructor(opts) {
    this.mount = opts.mount;
    this.state = opts.state;
    this.onSnapshot = opts.onSnapshot || (() => {});
    this.onCard = opts.onCard || (() => {});
    this.onNotice = opts.onNotice || (() => {});
    this.onSave = opts.onSave || (() => {});
    this.onWin = opts.onWin || (() => {});

    this.card = null;
    this.cardRaw = [];
    this.dialogueNpc = null;
    this.pendingCard = null;
    this.pendingInteract = null;
    this.stick = { x: 0, y: 0, run: false };
    this.snapTimer = 0;
    this.saveTimer = 0;
    this.time = 0;
    this.disposed = false;
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 220;
  }

  start() {
    const w = this.mount.clientWidth || window.innerWidth;
    const h = this.mount.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: (window.devicePixelRatio || 1) < 2,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    this.renderer.setSize(w, h, false);
    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    this.mount.appendChild(canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xd9e3e6);
    this.scene.fog = new THREE.Fog(0xd9e3e6, 58, 155);

    this.camera = new THREE.PerspectiveCamera(58, w / h, 0.3, 340);
    this.camera.position.set(0, 8, 12);

    this.hemi = new THREE.HemisphereLight(0xfff1d6, 0x8a7a62, 0.85);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffeacb, 1.05);
    this.sun.position.set(60, 90, 40);
    this.scene.add(this.sun);

    this.world = buildWorld(this.scene);
    this.player = new Player(this.scene);
    this.player.setColliders(this.world.colliders);
    const start = this.state.pos || SETTING.spawn;
    this.player.setPosition(start[0], start[1]);

    this.cameraRig = new CameraRig(this.camera, this.world.colliders);
    this.queues = new Queues({
      scene: this.scene,
      onServe: (queueId, member) => this.onServed(queueId, member),
    });
    this.controls = new Controls(canvas, { onTap: (ndc) => this.handleTap(ndc) });

    this.handleResize = () => this.resize();
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);

    this.clock = new THREE.Clock();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
    this.emitSnapshot(true);
  }

  resize() {
    if (!this.renderer) return;
    const w = this.mount.clientWidth || window.innerWidth;
    const h = this.mount.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame() {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    this.time += dt;
    const paused = Boolean(this.card);

    if (!paused) {
      const v = this.moveVector();
      if (v.mag > 0.06) {
        this.player.setInput(v.x, v.z, v.run, v.mag);
        this.pendingInteract = null;
      } else {
        this.player.clearInput();
      }
      this.player.update(dt);
      this.queueTick();

      const rolled = tick(this.state, dt, this.player.isRunning);
      if (rolled) this.rollEvent();

      if (this.pendingInteract) {
        const t = this.pendingInteract;
        const d = Math.hypot(this.player.pos.x - t.at[0], this.player.pos.z - t.at[1]);
        if (d <= CONFIG.interactRadius) {
          this.pendingInteract = null;
          this.player.stop();
          this.activate(t);
        }
      }
    }

    this.world.update(dt, this.player.pos);
    this.queues.update(dt, this.player.pos);
    this.cameraRig.update(this.player.pos, this.player.heading, dt);
    this.updateSky();

    this.snapTimer += dt;
    if (this.snapTimer > 0.18) {
      this.snapTimer = 0;
      this.state.pos = [this.player.pos.x, this.player.pos.z];
      this.emitSnapshot();
    }

    this.saveTimer += dt;
    if (this.saveTimer > 20) {
      this.saveTimer = 0;
      this.persist();
    }
  }

  moveVector() {
    const keys = this.controls.vector();
    const sy = this.stick.y;
    const sx = this.stick.x;
    let fwd = keys.y + sy;
    let strafe = keys.x + sx;

    const mag = Math.min(1, Math.hypot(fwd, strafe));
    if (mag < 0.06) return { x: 0, z: 0, mag: 0, run: false };

    const len = Math.hypot(fwd, strafe) || 1;
    fwd /= len;
    strafe /= len;

    const f = this.cameraRig.forward();
    const r = this.cameraRig.right();
    return {
      x: f.x * fwd + r.x * strafe,
      z: f.z * fwd + r.z * strafe,
      mag,
      run: this.controls.running || this.stick.run,
    };
  }

  updateSky() {
    const hour = hourOf(this.state);
    let b;
    if (hour >= 19 || hour < 5) b = 0.26;
    else if (hour >= 17) b = 1 - ((hour - 17) / 2) * 0.74;
    else if (hour < 7) b = 0.26 + ((hour - 5) / 2) * 0.74;
    else b = 1;

    this.sun.intensity = 0.22 + 1.0 * b;
    this.hemi.intensity = 0.28 + 0.62 * b;
    const dayColor = new THREE.Color(0xd9e3e6);
    const nightColor = new THREE.Color(0x1f2536);
    const color = nightColor.clone().lerp(dayColor, b);
    this.scene.background.copy(color);
    this.scene.fog.color.copy(color);
  }

  // ------------------------------------------------------------------ input
  setStick(x, y, run) {
    this.stick.x = x;
    this.stick.y = y;
    this.stick.run = run;
  }

  handleTap(ndc) {
    if (this.card) return;
    this.raycaster.setFromCamera(ndc, this.camera);

    const markerHits = this.raycaster.intersectObjects(this.world.pickables, false);
    if (markerHits.length) {
      const data = markerHits[0].object.userData;
      this.targetInteract(data.npcId ? `npc:${data.npcId}` : data.interactId);
      return;
    }

    const npcHits = this.raycaster.intersectObjects(this.world.npcMeshes, true);
    if (npcHits.length) {
      let obj = npcHits[0].object;
      while (obj && !obj.userData.npcId) obj = obj.parent;
      if (obj?.userData.npcId) {
        this.targetInteract(`npc:${obj.userData.npcId}`);
        return;
      }
    }

    const playerHits = this.raycaster.intersectObject(this.player.group, true);
    if (playerHits.length) {
      this.player.stop();
      this.pendingInteract = null;
      return;
    }

    const point = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, point)) {
      const b = CONFIG.worldBound;
      this.player.walkTo(Math.max(-b, Math.min(b, point.x)), Math.max(-b, Math.min(b, point.z)));
      this.pendingInteract = null;
    }
  }

  targetInteract(id) {
    let target = INTERACTABLES.find((d) => d.id === id);
    if (id.startsWith('npc:')) {
      const npcId = id.slice(4);
      const npc = NPCS[npcId];
      if (!npc) return;
      target = { id, npcId, at: npc.at };
    }
    if (!target) return;

    const d = Math.hypot(this.player.pos.x - target.at[0], this.player.pos.z - target.at[1]);
    if (d <= CONFIG.interactRadius) {
      this.player.stop();
      this.activate(target);
    } else {
      this.player.walkTo(target.at[0], target.at[1]);
      this.pendingInteract = target;
    }
  }

  activate(target) {
    if (target.npcId) {
      this.openDialogue(target.npcId);
    } else if (target.kind === 'queue') {
      this.joinQueue(target.queue);
    } else {
      this.openPanel(target.panel);
    }
  }

  // ------------------------------------------------------------------ queue
  joinQueue(queueId) {
    const existing = this.queues.playerQueueId();
    if (existing && existing !== queueId) this.queues.leave(existing);
    const index = this.queues.join(queueId, {});
    if (index < 0) {
      this.notice('That queue is full — give it a moment, neh.');
      return;
    }
    const spot = this.queues.playerSpot(queueId);
    if (spot) this.player.walkTo(spot[0], spot[1]);
    this.notice(index === 0 ? 'You are next in line.' : `${index} ahead of you. Hold tight.`);
    this.emitSnapshot(true);
  }

  queueTick() {
    const id = this.queues.playerQueueId();
    if (!id) return;
    const spot = this.queues.playerSpot(id);
    if (!spot) return;
    const d = Math.hypot(this.player.pos.x - spot[0], this.player.pos.z - spot[1]);
    if (d > QUEUES[id].queueLeaveDistance) {
      this.queues.leave(id);
      this.notice('You left the queue.');
      return;
    }
    if (!this.player.hasTarget && !this.player.input.active && d > 0.8) {
      this.player.walkTo(spot[0], spot[1]);
    }
  }

  onServed(queueId, member) {
    if (!member?.isPlayer) return;
    this.openPanel(QUEUES[queueId].panel);
  }

  // ------------------------------------------------------------------ cards
  setCard(card) {
    this.card = card;
    this.cardRaw = card.options || [];
    this.dialogueNpc = card.npcId || null;
    this.onCard({
      title: card.title,
      subtitle: card.subtitle,
      text: card.text,
      tone: card.tone,
      options: this.cardRaw.map((o) => ({
        label: o.label,
        hint: o.hint,
        disabled: Boolean(o.__disabled),
        reason: o.__reason,
      })),
    });
  }

  closeCard() {
    this.card = null;
    this.cardRaw = [];
    this.dialogueNpc = null;
    this.onCard(null);
    this.emitSnapshot(true);
  }

  openPanel(panelId) {
    const panel = PANELS[panelId];
    if (!panel) {
      this.closeCard();
      return;
    }
    const options = panel.options
      .filter((o) => flagsPass(this.state, o.show, o.hide))
      .map((o) => {
        const reason = requirementReason(this.state, o.requires);
        return { ...o, __disabled: Boolean(reason), __reason: reason };
      });
    this.setCard({ title: panel.title, subtitle: panel.subtitle, tone: 'place', options });
  }

  openDialogue(npcId) {
    const card = npcCard(npcId, this.state);
    if (!card) return;
    this.setCard({ ...card, tone: 'talk' });
  }

  openNode(nodeId) {
    if (!this.dialogueNpc) return;
    const card = npcNodeCard(this.dialogueNpc, nodeId, this.state);
    if (!card) return;
    this.setCard({ ...card, tone: 'talk' });
  }

  openEvent(eventId) {
    const ev = EVENTS[eventId];
    if (!ev) return;
    const options = ev.options.map((o) => {
      const reason = requirementReason(this.state, o.requires);
      return { ...o, __disabled: Boolean(reason), __reason: reason };
    });
    this.setCard({ title: ev.title, subtitle: 'Today in Alex', text: ev.text, tone: 'event', options });
  }

  chooseOption(index) {
    const raw = this.cardRaw[index];
    if (!raw || raw.__disabled) return;
    const effect = raw.effect || {};

    this.applyStats(effect);

    if (this.pendingCard) {
      const card = this.pendingCard;
      this.pendingCard = null;
      this.setCard(card);
      return;
    }
    if (effect.open === 'panel') {
      this.openPanel(effect.panel);
      return;
    }
    if (effect.open === 'dialogue') {
      this.openDialogue(effect.npc);
      return;
    }
    if (raw.next && this.dialogueNpc) {
      this.openNode(raw.next);
      return;
    }
    this.closeCard();
  }

  // ---------------------------------------------------------------- effects
  applyStats(effect) {
    this.state.pos = [this.player.pos.x, this.player.pos.z];
    applyEffect(this.state, effect);
    if (effect.notice) this.notice(effect.notice);
    if (effect.sleep) this.sleep();
    if (effect.travel) this.travel(effect.travel);
    if (effect.interview) this.pendingCard = this.interviewResult();
    if (effect.gamble) this.pendingCard = this.gambleResult(effect.gamble);
    if (effect.win) this.winMoment();
    this.persist();
    this.emitSnapshot(true);
  }

  travel(target) {
    if (target === 'sandton') {
      this.player.setPosition(22, -12);
      this.state.pos = [22, -12];
      this.state.flags.visitedSandton = true;
      this.state.flags.arrivedByTaxi = true;
    } else if (target === 'alex') {
      this.player.setPosition(SETTING.spawn[0], SETTING.spawn[1]);
      this.state.pos = [...SETTING.spawn];
    }
  }

  sleep() {
    const s = this.state;
    s.day += 1;
    s.minutes = CONFIG.dayStartMinutes;
    s.energy = 100;
    s.hunger = Math.max(0, s.hunger - 20);
    s.flags.arrivedByTaxi = false;
    this.player.setPosition(SETTING.spawn[0], SETTING.spawn[1]);
    s.pos = [...SETTING.spawn];
    this.notice(`Day ${s.day}. A taxi hoots somewhere down the street.`);
    this.persist();
    this.rollEvent();
  }

  rollEvent() {
    if (this.state.day < 2) return;
    if (Math.random() >= 0.3) return;
    const id = EVENT_ORDER[Math.floor(Math.random() * EVENT_ORDER.length)];
    this.openEvent(id);
  }

  interviewResult() {
    const s = this.state;
    const hour = hourOf(s);
    const dressed = Boolean(s.flags.hasOutfit);
    const onTime = hour >= 8 && hour < 16;
    const arrived = Boolean(s.flags.arrivedByTaxi);

    if (dressed && onTime && arrived) {
      s.flags.hired = true;
      s.respect = Math.min(100, s.respect + 10);
      s.dreams = Math.min(100, s.dreams + 20);
      s.memory.precious = 'helped';
      return {
        title: 'The interview',
        subtitle: 'Mokoena Holdings',
        tone: 'good',
        text:
          '"You are on time. You are dressed. You look like you want it." She closes the folder. "Start tomorrow. Junior desk, one hundred and twenty a shift. Do not make me look silly."',
        options: [{ label: "Thank you, ma'am", effect: {} }],
      };
    }

    let text;
    if (!dressed) {
      text = 'Precious looks at your takkies, then at your shirt. "Come back in something smart. We are not a spaza shop."';
    } else if (!arrived) {
      text = '"You walked in here sweating and late. Sandton runs on time." She points at the door. "Take a taxi next time."';
    } else {
      text = '"Interviews are between eight and four. Come back when people are actually working."';
    }
    return {
      title: 'The interview',
      subtitle: 'Mokoena Holdings',
      tone: 'bad',
      text,
      options: [{ label: 'Eish. Okay', effect: {} }],
    };
  }

  gambleResult(kind) {
    if (kind === 'hustle') {
      if (Math.random() < 0.55) {
        this.state.cash += 200;
        this.state.respect = Math.max(0, this.state.respect - 3);
        return {
          title: 'The boxes',
          subtitle: 'Behind the rank',
          tone: 'good',
          text: 'Two hours, four boxes, one very quiet bakkie. Vusi counts R200 into your hand. "Sharp. You were never here."',
          options: [{ label: 'I was never here', effect: {} }],
        };
      }
      this.state.cash = Math.max(0, this.state.cash - 100);
      this.state.respect = Math.max(0, this.state.respect - 8);
      return {
        title: 'The boxes',
        subtitle: 'Behind the rank',
        tone: 'bad',
        text: 'A police van rolls past slowly. Vusi vanishes with the boxes and, somehow, with your R100 float too. Eish.',
        options: [{ label: 'Eish', effect: {} }],
      };
    }

    // phone snatch
    if (this.state.respect > 30) {
      this.state.respect = Math.min(100, this.state.respect + 2);
      return {
        title: 'The rank',
        subtitle: 'Phone-snatch',
        tone: 'good',
        text: 'You catch his wrist before he clears the pavement. The whole queue stands up behind you. He drops the phone and runs. Nomsa nods once. That is enough.',
        options: [{ label: 'Sharp', effect: {} }],
      };
    }
    this.state.cash = Math.max(0, this.state.cash - 50);
    return {
      title: 'The rank',
      subtitle: 'Phone-snatch',
      tone: 'bad',
      text: 'He is gone before you even turn properly. Your phone is gone, and so is the R50 that was in your pocket.',
      options: [{ label: 'Hayi', effect: {} }],
    };
  }

  winMoment() {
    this.onWin();
  }

  notice(text) {
    this.onNotice(text);
  }

  persist() {
    this.state.pos = [this.player.pos.x, this.player.pos.z];
    this.onSave(this.state);
  }

  // -------------------------------------------------------------- snapshot
  emitSnapshot() {
    const near = this.nearestLabel();
    const queueId = this.queues.playerQueueId();
    this.onSnapshot({
      cash: Math.round(this.state.cash),
      energy: Math.round(this.state.energy),
      hunger: Math.round(this.state.hunger),
      respect: Math.round(this.state.respect),
      dreams: Math.round(this.state.dreams),
      airtime: this.state.airtime,
      day: this.state.day,
      clock: formatClock(this.state),
      goal: goalText(this.state),
      camera: this.cameraRig ? this.cameraRig.label : 'Follow',
      near,
      queue: queueId ? this.queues.status(queueId) : null,
    });
  }

  nearestLabel() {
    let best = null;
    let bestDist = 5.5;
    INTERACTABLES.forEach((def) => {
      const d = Math.hypot(this.player.pos.x - def.at[0], this.player.pos.z - def.at[1]);
      if (d < bestDist) {
        bestDist = d;
        best = def.label;
      }
    });
    Object.entries(NPCS).forEach(([, npc]) => {
      const d = Math.hypot(this.player.pos.x - npc.at[0], this.player.pos.z - npc.at[1]);
      if (d < bestDist) {
        bestDist = d;
        best = npc.name;
      }
    });
    return best;
  }

  cycleCamera() {
    const label = this.cameraRig.cycle();
    this.emitSnapshot(true);
    return label;
  }

  dispose() {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    if (this.controls) this.controls.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
  }
}