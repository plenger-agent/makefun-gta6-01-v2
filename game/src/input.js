// input.js — keyboard and mouse, gathered in one place: a held-key set, an
// edge-triggered "just pressed" set the menus and interactions read, mouse
// delta from pointer lock, and the attack button. Nothing game-shaped here.
export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.attackHeld = false;
    this.attackClicked = false;
    this.locked = false;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.attackHeld = false; });

    dom.addEventListener('click', () => {
      if (!this.locked && this.wantsLock) dom.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.attackHeld = true; this.attackClicked = true; }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.attackHeld = false; });
    this.wantsLock = false;
  }

  down(code) { return this.keys.has(code); }
  justPressed(code) { return this.pressed.has(code); }

  axis(neg, pos) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }

  // Called once per frame by the loop: returns and clears the mouse delta.
  takeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0; this.mouseDY = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
    this.attackClicked = false;
  }
}
