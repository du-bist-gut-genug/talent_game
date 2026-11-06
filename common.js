/* TALENT — outils communs : réseau, sons synthétisés, confettis */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /*
   * Connexion pair-à-pair (WebRTC via PeerJS).
   * Le service public PeerJS sert uniquement à mettre la télé et les téléphones en relation ;
   * ensuite les données du jeu circulent directement entre les appareils.
   */
  const PEER_PREFIX = 'talent-jeu-fr-v1-';
  const PEER_OPTIONS = { debug: 1, config: { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' }
  ] } };

  /* ---------- Sons (Web Audio, aucun fichier) ---------- */
  let ctx = null, master = null;
  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = .5; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, t0, dur, { type = 'sine', vol = .3, slide = 0 } = {}) {
    const c = audio(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + t0 + dur);
    g.gain.setValueAtTime(0, c.currentTime + t0);
    g.gain.linearRampToValueAtTime(vol, c.currentTime + t0 + .01);
    g.gain.exponentialRampToValueAtTime(.001, c.currentTime + t0 + dur);
    o.connect(g); g.connect(master);
    o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + .05);
  }
  function noise(t0, dur, { vol = .25, filter = 2000, q = .8, type = 'bandpass' } = {}) {
    const c = audio(); if (!c) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = filter; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(.001, c.currentTime + t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(c.currentTime + t0);
  }

  const SFX = {
    unlock() { audio(); },
    click() { tone(660, 0, .08, { type: 'square', vol: .12 }); },
    join() { tone(523, 0, .12, { type: 'triangle' }); tone(784, .1, .2, { type: 'triangle' }); },
    tick() { tone(1200, 0, .05, { type: 'square', vol: .08 }); },
    whoosh() { noise(0, .5, { vol: .25, filter: 900, q: .5 }); },
    clap() { for (let i = 0; i < 6; i++) noise(i * .045 + Math.random() * .02, .06, { vol: .3, filter: 1800, q: 1.2 }); },
    laugh() { [0, .11, .22, .33].forEach((t, i) => tone(420 - i * 25, t, .09, { type: 'sawtooth', vol: .1, slide: 120 })); },
    cheer() { tone(700, 0, .12, { type: 'triangle', vol: .2 }); tone(1050, .08, .2, { type: 'triangle', vol: .2 }); noise(0, .4, { vol: .08, filter: 6000 }); },
    boo() { tone(160, 0, .55, { type: 'sawtooth', vol: .16, slide: -60 }); tone(120, 0, .55, { type: 'sawtooth', vol: .1, slide: -40 }); },
    golden() {
      // fanfare dorée + scintillement
      const notes = [523, 659, 784, 1047, 784, 1047, 1319];
      notes.forEach((n, i) => { tone(n, i * .11, .35, { type: 'square', vol: .12 }); tone(n / 2, i * .11, .35, { type: 'triangle', vol: .15 }); });
      tone(1568, .8, 1.4, { type: 'triangle', vol: .2 }); tone(1047, .8, 1.4, { type: 'square', vol: .1 });
      for (let i = 0; i < 22; i++) tone(2000 + Math.random() * 2500, .8 + i * .05, .12, { vol: .05 });
      noise(.8, 1.6, { vol: .1, filter: 8000, type: 'highpass' });
    },
    drumroll(dur = 2) { for (let t = 0; t < dur; t += .045) noise(t, .05, { vol: .12 + t / dur * .2, filter: 300, q: .7 }); noise(dur, .6, { vol: .5, filter: 200, q: .5, type: 'lowpass' }); tone(80, dur, .5, { vol: .4 }); },
    win() { [523, 659, 784, 1047].forEach((n, i) => tone(n, i * .14, .5, { type: 'triangle', vol: .22 })); [1047, 1319, 1568].forEach(n => tone(n, .6, 1.2, { type: 'triangle', vol: .14 })); },
    reveal() { tone(220, 0, .3, { type: 'sawtooth', vol: .1, slide: 660 }); tone(880, .3, .4, { type: 'triangle', vol: .2 }); },
    error() { tone(200, 0, .25, { type: 'square', vol: .12, slide: -80 }); }
  };

  function confetti(n = 120, colors = ['#ff2e93', '#ffc93c', '#19e3ff', '#7cff4f', '#b04dff', '#fff']) {
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      el.className = 'confetti';
      el.style.left = Math.random() * 100 + 'vw';
      el.style.background = colors[i % colors.length];
      el.style.setProperty('--dx', (Math.random() * 40 - 20) + 'vw');
      el.style.setProperty('--rot', (Math.random() * 1440 - 720) + 'deg');
      el.style.animationDuration = 2.2 + Math.random() * 2.5 + 's';
      el.style.animationDelay = Math.random() * .8 + 's';
      if (Math.random() > .6) { el.style.width = '8px'; el.style.height = '8px'; el.style.borderRadius = '50%'; }
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 6000);
    }
  }

  window.UI = { $, esc, SFX, confetti, PEER_PREFIX, PEER_OPTIONS };
})();
