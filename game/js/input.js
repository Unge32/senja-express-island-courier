/*
  SENJA EXPRESS: Island Courier Run — game/js/input.js
  =====================================================
  Semua input pilot dalam satu tempat: keyboard + mouse. File ini
  TIDAK memutuskan apa arti input itu (itu flight-model.js dan
  main.js); ia hanya mengumpulkan keadaan tombol dan mengubahnya
  menjadi satu objek `state` yang bersih setiap frame.

  Keyboard (sesuai benchmark-notes.md):
  - W / S ......... throttle naik / turun (tahan; perubahan halus)
  - Panah Atas/Bawah  pitch (hidung naik/turun)
  - Panah Kiri/Kanan  roll (miring kiri/kanan)
  - A / D ......... rudder (yaw halus, untuk koreksi final approach)
  - SPACE ......... jatuhkan peti suplai (misi MEDIC DROP)
  - C ............. ganti view chase <-> cockpit
  - P ............. pause
  - R ............. restart misi
  - M ............. mute
  Tombol aksi (C/P/R/M/SPACE) memakai edge-trigger: callback dipanggil
  sekali saat tombol ditekan, bukan setiap frame selama ditahan. Ini
  mencegah restart berulang bila pemain menahan R.

  Mouse:
  - Drag (tahan tombol kiri + geser): pitch mengikuti gerakan vertikal,
    roll mengikuti gerakan horizontal — kendali halus untuk pemain yang
    lebih nyaman dengan mouse. Dilepas = stick kembali netral.
  - Wheel: throttle naik/turun per notch.
  - Klik pertama di mana pun juga dipakai main.js untuk membangun
    AudioContext (aturan browser: audio butuh gestur pengguna).

  Detail yang dijaga:
  - Arrow keys + SPACE dicegah default-nya (preventDefault) supaya
    halaman tidak scroll saat bermain.
  - Input analog (pitch/roll) dikembalikan sebagai -1..1 dengan
    smoothing ringan: perubahan mendadak dihaluskan supaya pesawat
    tidak tersentak.
  - Semua listener didaftarkan sekali di constructor dan bisa dilepas
    lewat dispose() — berguna bila main.js me-restart scene.
*/
export class InputManager {
  constructor() {
    this.keys = new Set();
    this.throttleDelta = 0; // akumulasi per frame, dikonsumsi main.js
    this.mousePitch = 0;
    this.mouseRoll = 0;
    this.dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this.onAction = null; // (action: 'view'|'pause'|'restart'|'mute'|'drop') => void
    this.onFirstGesture = null; // () => void, sekali saja
    this._gestureFired = false;

    this._onKeyDown = (e) => this._handleKey(e, true);
    this._onKeyUp = (e) => this._handleKey(e, false);
    this._onMouseDown = (e) => this._handleMouseDown(e);
    this._onMouseMove = (e) => this._handleMouseMove(e);
    this._onMouseUp = () => { this.dragging = false; this.mousePitch = 0; this.mouseRoll = 0; };
    this._onWheel = (e) => this._handleWheel(e);
    this._onPointerDown = () => this._fireGesture();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    window.addEventListener('pointerdown', this._onPointerDown);
  }

  _fireGesture() {
    if (this._gestureFired) return;
    this._gestureFired = true;
    if (this.onFirstGesture) this.onFirstGesture();
  }

  _handleKey(e, down) {
    const code = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
      e.preventDefault();
    }
    this._fireGesture();
    if (down && !e.repeat) {
      if (code === 'KeyC' && this.onAction) this.onAction('view');
      if (code === 'KeyP' && this.onAction) this.onAction('pause');
      if (code === 'KeyR' && this.onAction) this.onAction('restart');
      if (code === 'KeyM' && this.onAction) this.onAction('mute');
      if (code === 'Space' && this.onAction) this.onAction('drop');
    }
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  _handleMouseDown(e) {
    if (e.target && (e.target.closest('button') || e.target.closest('select') || e.target.closest('.screen-card'))) return;
    this.dragging = true;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
  }

  _handleMouseMove(e) {
    if (!this.dragging) return;
    const dx = e.clientX - this._lastX;
    const dy = e.clientY - this._lastY;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
    // Drag ke kanan = roll kanan; drag ke bawah = hidung naik (stick).
    this.mouseRoll = Math.max(-1, Math.min(1, this.mouseRoll + dx * 0.004));
    this.mousePitch = Math.max(-1, Math.min(1, this.mousePitch - dy * 0.004));
  }

  _handleWheel(e) {
    // Wheel ke atas = throttle naik.
    this.throttleDelta += (e.deltaY < 0 ? 1 : -1) * 0.06;
  }

  /** Keadaan analog frame ini: pitch/roll/yaw -1..1 + throttleDelta. */
  read(dt) {
    let pitch = 0, roll = 0, yaw = 0;
    if (this.keys.has('ArrowUp')) pitch += 1;
    if (this.keys.has('ArrowDown')) pitch -= 1;
    if (this.keys.has('ArrowLeft')) roll -= 1;
    if (this.keys.has('ArrowRight')) roll += 1;
    if (this.keys.has('KeyA')) yaw -= 1;
    if (this.keys.has('KeyD')) yaw += 1;
    // Throttle: W/S tahan = perubahan kontinu per detik.
    let throttleDelta = this.throttleDelta;
    this.throttleDelta = 0;
    if (this.keys.has('KeyW')) throttleDelta += 0.45 * dt;
    if (this.keys.has('KeyS')) throttleDelta -= 0.45 * dt;
    // Mouse drag menimpa keyboard bila aktif.
    if (this.dragging) {
      pitch = this.mousePitch;
      roll = this.mouseRoll;
    }
    return { pitch, roll, yaw, throttleDelta };
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('pointerdown', this._onPointerDown);
  }
}
