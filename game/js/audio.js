/*
  SENJA EXPRESS: Island Courier Run — game/js/audio.js
  =====================================================
  Semua suara game disintesis di kode dengan WebAudio native — TANPA
  file audio eksternal, TANPA Tone.js, TANPA network. Keputusan ini
  sadar (dicatat di benchmark-notes.md): lebih ringan, nol risiko
  offline, dan tidak ada lisensi yang perlu diurus.

  Lima suara, masing-masing satu fungsi kecil yang jujur tentang cara
  kerjanya:
  - Mesin: dua oscillator sawtooth yang di-detune sedikit (dengung
    propeller) + lowpass filter; frekuensi & volume mengikuti throttle
    dan kecepatan. Ini suara yang hidup terus selama terbang.
  - Angin: noise buffer putih yang dibuat sekali di constructor,
    dilewatkan bandpass filter; gain mengikuti kecepatan udara —
    makin cepat, makin keras desisnya.
  - Cincin: dua nada sine berurutan (E5 -> B5) dengan decay cepat —
    bunyi "ding-ding" kemenangan kecil.
  - Landing: thud — sine 70 Hz yang jatuh ke 40 Hz dalam 0,25 detik,
    seperti roda menyentuh aspal.
  - Crash: noise burst + sine rendah yang jatuh — benturan, bukan ledakan
    film; cukup untuk memberi tahu pilot ia gagal, tanpa berlebihan.

  Aturan main:
  - AudioContext HANYA dibuat setelah gestur pengguna pertama (klik
    tombol FLY / tekan tombol apa pun). Browser memblokir audio sebelum
    gestur; memaksanya hanya menghasilkan warning di console. Di mode
    screenshot headless (?shot=...) audio tidak pernah dibuat — render
    visual tidak boleh bergantung pada suara.
  - M = mute: menghentikan semua node sekaligus (master gain -> 0),
    bukan menghancurkan context, supaya unmute instan.
  - Semua node yang sekali pakai (chime/thud/crash) dihentikan dan
    diputus setelah selesai, supaya tidak menumpuk di memori selama
    penerbangan panjang.
  - Bila WebAudio tidak tersedia sama sekali, semua method menjadi
    no-op yang aman — game tetap jalan tanpa suara.
*/
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.windGain = null;
    this.windSource = null;
    this.muted = false;
    this.started = false;
  }

  /** Dipanggil dari gestur pengguna (klik FLY / keydown pertama). */
  ensure() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);

      // --- Mesin: dua sawtooth detuned + lowpass ---
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 700;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      this.engineOsc1 = this.ctx.createOscillator();
      this.engineOsc1.type = 'sawtooth'; this.engineOsc1.frequency.value = 70;
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc2.type = 'sawtooth'; this.engineOsc2.frequency.value = 73;
      this.engineOsc1.connect(filter); this.engineOsc2.connect(filter);
      filter.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc1.start(); this.engineOsc2.start();

      // --- Angin: noise buffer putih + bandpass ---
      const len = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.windSource = this.ctx.createBufferSource();
      this.windSource.buffer = buffer; this.windSource.loop = true;
      const band = this.ctx.createBiquadFilter();
      band.type = 'bandpass'; band.frequency.value = 900; band.Q.value = 0.6;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.0;
      this.windSource.connect(band); band.connect(this.windGain);
      this.windGain.connect(this.master);
      this.windSource.start();

      this.started = true;
    } catch (err) {
      // Audio gagal = game tetap jalan tanpa suara.
      this.ctx = null;
    }
  }

  /** Dipanggil tiap frame: mesin + angin mengikuti throttle/kecepatan. */
  update(throttle, speedKt, airborne) {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    const engineLevel = airborne ? 0.05 + throttle * 0.16 : throttle * 0.10;
    this.engineGain.gain.setTargetAtTime(engineLevel, t, 0.1);
    const freq = 55 + throttle * 55 + speedKt * 0.15;
    this.engineOsc1.frequency.setTargetAtTime(freq, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(freq * 1.045, t, 0.1);
    const windLevel = Math.max(0, (speedKt - 30) / 120) * 0.12;
    this.windGain.gain.setTargetAtTime(windLevel, t, 0.15);
  }

  _tone(freq, startAt, duration, type = 'sine', volume = 0.25) {
    if (!this.started || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    const t0 = this.ctx.currentTime + startAt;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t0); osc.stop(t0 + duration + 0.05);
  }

  /** Cincin dilewati: E5 lalu B5. */
  ring() { this._tone(659, 0, 0.35); this._tone(988, 0.12, 0.45); }

  /** Roda menyentuh runway: thud rendah. */
  landing() {
    if (!this.started || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    const t0 = this.ctx.currentTime;
    osc.frequency.setValueAtTime(75, t0);
    osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.25);
    gain.gain.setValueAtTime(0.5, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t0); osc.stop(t0 + 0.35);
  }

  /** Crash: noise burst + nada jatuh. */
  crash() {
    if (!this.started || !this.ctx) return;
    const len = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(gain); gain.connect(this.master);
    src.start();
    this._tone(120, 0, 0.6, 'sawtooth', 0.2);
  }

  /** Peti dilepas: klik singkat. */
  drop() { this._tone(440, 0, 0.12, 'square', 0.12); }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }
}
