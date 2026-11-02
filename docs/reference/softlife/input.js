export class Controls {
  constructor(el, { onTap }) {
    this.el = el;
    this.onTap = onTap;
    this.keys = new Set();
    this.pointer = null;

    this.handleDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.pointer = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    };

    this.handleUp = (e) => {
      const p = this.pointer;
      this.pointer = null;
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      const dt = performance.now() - p.t;
      if (Math.hypot(dx, dy) > 16 || dt > 420) return;
      const rect = this.el.getBoundingClientRect();
      const ndc = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
      };
      this.onTap(ndc);
    };

    this.handleKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        this.keys.add(k);
        if (k.startsWith('arrow')) e.preventDefault();
      }
    };
    this.handleKeyUp = (e) => {
      this.keys.delete(e.key.toLowerCase());
    };
    this.handleBlur = () => this.keys.clear();

    el.addEventListener('pointerdown', this.handleDown);
    el.addEventListener('pointerup', this.handleUp);
    el.addEventListener('pointercancel', () => {
      this.pointer = null;
    });
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  vector() {
    const has = (k) => this.keys.has(k);
    let x = 0;
    let y = 0;
    if (has('w') || has('arrowup')) y += 1;
    if (has('s') || has('arrowdown')) y -= 1;
    if (has('a') || has('arrowleft')) x -= 1;
    if (has('d') || has('arrowright')) x += 1;
    return { x, y };
  }

  get running() {
    return this.keys.has('shift');
  }

  dispose() {
    this.el.removeEventListener('pointerdown', this.handleDown);
    this.el.removeEventListener('pointerup', this.handleUp);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
  }
}