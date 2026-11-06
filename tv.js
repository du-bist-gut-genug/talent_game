/* TALENT — écran principal (télévision) */
(function () {
  const { $, esc, SFX, confetti } = UI;
  const { CATEGORIES, REACTIONS, POINTS } = TALENT;
  const screen = $('#screen'), top = $('#top');

  let S = null;          // dernier état reçu
  let key = '';          // clé d'écran courante (évite de recharger la vidéo)
  let offset = 0;        // décalage d'horloge serveur
  let timers = [];       // minuteurs locaux de l'écran courant
  let engine = null, peer = null, lanBase = null;
  let lastTick = -1;
  let draft = { platforms: ['youtube', 'instagram'], category: 'drole', rounds: 3, submitTime: 120 };

  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const now = () => Date.now() + offset;
  const player = (id) => S.players.find(p => p.id === id);
  const logoHTML = (cls = '') => `<div class="logo ${cls}">${'TALENT'.split('').map(l => `<span>${l}</span>`).join('')}<i class="star">⭐</i></div>`;
  const catOf = (k) => CATEGORIES[k] || CATEGORIES.drole;
  const thumbHTML = (s, cls = 'th') => s.thumb ? `<div class="${cls}" style="background-image:url('${esc(s.thumb)}')"></div>` : `<div class="${cls} ig">📸</div>`;
  const kingTitle = (p) => p.title === 'roi' ? 'ROI DU CONTENU INTERNET' : p.title === 'reine' ? 'REINE DU CONTENU INTERNET' : 'ROI OU REINE DU CONTENU INTERNET';

  /* La télé est l'hôte : ses actions vont directement au moteur de jeu */
  function act(type, extra = {}) {
    if (!engine) return;
    const err = engine.act({ type, ...extra }, true);
    if (err && err !== 'silent') { SFX.error(); toast(err, '#ff2e63'); }
  }

  function toast(text, c = '#7cff4f') {
    const t = document.createElement('div');
    t.className = 'joinpop'; t.style.setProperty('--c', c); t.textContent = text;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3100);
  }

  /* ---------- Accueil ---------- */
  function renderHome() {
    top.classList.add('hidden');
    screen.innerHTML = `
      <section class="scr home">
        <div class="marquee" style="border:1.1rem dotted var(--gold);animation:blink .6s steps(2) infinite"></div>
        ${logoHTML('pop')}
        <p class="slogan rise">Qui a vraiment le meilleur goût sur Internet ?</p>
        <button class="btn gold pop" id="create" style="animation-delay:.4s">🎬 Créer une partie</button>
        <p class="sub rise" style="margin-top:3rem;font-size:1.5rem;animation-delay:.7s">Affichez cet écran sur la télé du salon · les joueurs rejoignent avec leur téléphone</p>
        <a href="about.html" class="sub rise" style="font-size:1.3rem;margin-top:1.2rem;color:var(--mute);animation-delay:.9s">À propos &amp; confidentialité</a>
      </section>
      <style>@keyframes blink{50%{opacity:.35}}</style>`;
    $('#create').onclick = () => { SFX.unlock(); SFX.join(); $('#create').disabled = true; host(newCode(), null); };
  }

  /* ---------- Hébergement de la partie (pair-à-pair) ---------- */
  function newCode() {
    const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    return Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join('');
  }
  function overlay(text) {
    const o = $('#off');
    if (text) { o.textContent = text; o.classList.remove('hidden'); } else o.classList.add('hidden');
  }
  function persist(room) {
    try { sessionStorage.setItem('talent-tv', JSON.stringify({ code: room.code, room })); } catch (_) { /* stockage indisponible */ }
  }

  function host(code, saved, attempt = 0) {
    overlay(saved ? 'Reprise de la partie…' : 'Ouverture de la partie…');
    peer = new Peer(UI.PEER_PREFIX + code, UI.PEER_OPTIONS);
    peer.on('open', () => {
      overlay(null);
      if (engine) return; // simple reconnexion au service de mise en relation
      engine = TalentEngine.createEngine(code, draft, saved);
      engine.onChange = persist;
      engine.addClient({ role: 'tv', send: (m) => (m.t === 'state' ? onState(m.s) : onFx(m.e)) });
    });
    peer.on('connection', handleConn);
    peer.on('disconnected', () => {
      if (peer.destroyed) return;
      overlay('Connexion Internet perdue… reconnexion');
      setTimeout(() => { if (peer.disconnected && !peer.destroyed) peer.reconnect(); }, 1500);
    });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id') {
        peer.destroy();
        // après un rechargement, l'ancienne connexion met quelques secondes à se libérer
        if (saved && attempt < 10) return setTimeout(() => host(code, saved, attempt + 1), 1500);
        return host(newCode(), null);
      }
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) {
        overlay('Connexion Internet perdue… reconnexion');
        setTimeout(() => { if (peer.disconnected && !peer.destroyed) peer.reconnect(); }, 2500);
      } else console.warn('PeerJS', e.type, e);
    });
  }

  /* Un téléphone se connecte à la télé */
  function handleConn(conn) {
    let client = null;
    const drop = () => { if (client && engine) engine.removeClient(client); client = null; };
    conn.on('data', (msg) => {
      if (!engine || !msg || typeof msg !== 'object') return;
      const reply = (o) => { if (conn.open) conn.send({ t: 'res', id: msg.id, ...o }); };
      if (msg.t === 'join') {
        try {
          const pid = engine.join(msg);
          drop();
          client = { role: 'phone', pid, send: (m) => { if (conn.open) conn.send(m); } };
          reply({ pid });
          engine.addClient(client);
        } catch (e) { reply({ error: e.message }); }
      } else if (msg.t === 'act') {
        if (!client) return reply({ error: 'Pas connecté' });
        const err = engine.act({ ...msg.body, pid: client.pid }, false);
        reply(err && err !== 'silent' ? { error: err } : { ok: true });
      }
    });
    conn.on('close', drop);
    conn.on('error', drop);
  }

  function onState(st) {
    const prev = S;
    S = st;
    offset = st.now - Date.now();
    const k = [st.phase, st.round, st.phase === 'show' ? st.current : '', st.phase === 'lobby' ? '' : ''].join('|');
    renderTop();
    if (k !== key) {
      key = k; clearTimers(); lastTick = -1;
      ({ lobby: renderLobby, intro: renderIntro, submit: renderSubmit, show: renderShow, vote: renderVote, results: renderResults, leaderboard: renderBoard, final: renderFinal }[st.phase] || renderLobby)(prev);
    } else {
      ({ lobby: updateLobby, submit: updateStatus, vote: updateStatus, show: updateShow }[st.phase] || (() => {}))();
    }
  }

  function renderTop() {
    top.classList.remove('hidden');
    const c = S.category ? catOf(S.category) : null;
    top.innerHTML = `
      ${logoHTML()}
      <div class="info">
        ${S.round ? `<span class="chip">Manche ${S.round} / ${S.settings.rounds}</span>` : ''}
        ${c && S.phase !== 'lobby' ? `<span class="chip">${c.emoji} ${esc(c.short)}</span>` : ''}
        <span class="chip">👥 ${S.players.filter(p => p.connected).length}</span>
        <span class="chip">Code <span class="code">${esc(S.code)}</span></span>
      </div>`;
  }

  /* ---------- Lobby ---------- */
  function renderLobby() {
    draft = { ...S.settings };
    // En local, on affiche l'adresse réseau de l'ordinateur ; en ligne, l'adresse publique de la page
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const base = local && lanBase ? lanBase + '/' : new URL('.', location.href).href;
    const joinUrl = `${base}join.html?code=${S.code}`;
    screen.innerHTML = `
      <section class="scr lobby">
        <div class="col card joinbox rise">
          <div class="lbl">REJOIGNEZ LA PARTIE</div>
          <div class="codetiles">${S.code.split('').map(l => `<b>${l}</b>`).join('')}</div>
          <div id="qr"></div>
          <div>
            <div class="sub" style="font-size:1.4rem">Scannez le QR code ou allez sur</div>
            <div class="url">${esc(base.replace('https://', '').replace('http://', ''))}join.html</div>
          </div>
          <div class="sub" style="font-size:1.2rem">📶 Wi-Fi ou 4G/5G : ça marche partout</div>
        </div>
        <div class="col card players-area rise" style="animation-delay:.1s">
          <div class="h2"><span>LES TALENTS</span><span id="pcount" class="chip" style="font-family:var(--body)"></span></div>
          <div class="pgrid" id="pgrid"></div>
        </div>
        <div class="col card settings rise" style="animation-delay:.2s" id="settings"></div>
      </section>
      <div class="hint"><kbd>Espace</kbd> lancer · <kbd>F</kbd> plein écran · cliquer un joueur pour le retirer</div>`;
    const q = $('#qr');
    if (window.QRCode) new QRCode(q, { text: joinUrl, width: 512, height: 512, colorDark: '#12002b', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    else q.innerHTML = `<div style="color:#12002b;font-weight:800;text-align:center">${esc(joinUrl)}</div>`;
    renderSettings();
    updateLobby();
  }

  function renderSettings() {
    const s = S.settings;
    const el = $('#settings');
    const opt = (group, val, label, on) => `<button class="opt ${on ? 'on' : ''}" data-g="${group}" data-v="${val}">${label}</button>`;
    el.innerHTML = `
      <div><h3>PLATEFORMES</h3><div class="opts">
        ${opt('platform', 'youtube', '▶️ YouTube', s.platforms.includes('youtube'))}
        ${opt('platform', 'instagram', '📸 Instagram', s.platforms.includes('instagram'))}
      </div></div>
      <div><h3>LE DÉFI</h3><div class="opts">
        ${Object.entries(CATEGORIES).map(([k, c]) => opt('category', k, `${c.emoji} ${c.short.charAt(0) + c.short.slice(1).toLowerCase()}`, s.category === k)).join('')}
      </div></div>
      <div><h3>MANCHES</h3><div class="opts">${[1, 2, 3, 4, 5, 7, 10].map(n => opt('rounds', n, n, s.rounds === n)).join('')}</div></div>
      <div><h3>TEMPS DE RECHERCHE</h3><div class="opts">${[60, 90, 120, 180, 300].map(n => opt('submitTime', n, n < 120 ? n + ' s' : n / 60 + ' min', s.submitTime === n)).join('')}</div></div>
      <button class="btn gold launch" id="launch">🚀 Lancer la partie</button>`;
    el.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      SFX.click();
      const g = b.dataset.g, v = b.dataset.v;
      const ns = draft; // brouillon local : les clics rapides ne s'écrasent pas
      if (g === 'platform') {
        const set = new Set(ns.platforms);
        set.has(v) ? set.delete(v) : set.add(v);
        if (!set.size) return toast('Au moins une plateforme !', '#ff7a1a');
        ns.platforms = [...set];
      } else if (g === 'category') ns.category = v;
      else ns[g] = Number(v);
      lastEdit = Date.now();
      S.settings = { ...ns, platforms: [...ns.platforms] };
      lastSettings = JSON.stringify(S.settings);
      renderSettings();
      act('settings', { settings: ns });
    });
    $('#launch').onclick = () => { SFX.unlock(); act('next'); };
    updateLaunch();
  }

  let lastSettings = '', lastEdit = 0;
  function updateLobby() {
    const g = $('#pgrid'); if (!g) return;
    const ss = JSON.stringify(S.settings);
    if (ss !== lastSettings && Date.now() - lastEdit > 1500) { lastSettings = ss; draft = { ...S.settings, platforms: [...S.settings.platforms] }; renderSettings(); }
    const ids = S.players.map(p => p.id + p.connected + (S.hostId === p.id)).join();
    if (g.dataset.ids !== ids) {
      g.dataset.ids = ids;
      g.innerHTML = S.players.length ? S.players.map(p => `
        <div class="pcard ${p.connected ? '' : 'off'}" style="--c:${p.color}" data-id="${p.id}" title="Cliquer pour retirer">
          ${S.hostId === p.id ? '<span class="crown">🎙️</span>' : ''}
          <div class="av">${p.avatar}</div><div class="nm">${esc(p.name)}</div>
        </div>`).join('') : `<div class="empty">En attente des premiers talents… 📱<br><span style="font-size:1.4rem">Le premier joueur connecté devient l'animateur 🎙️</span></div>`;
      g.querySelectorAll('.pcard').forEach(c => c.onclick = () => { if (confirm('Retirer ce joueur ?')) act('kick', { target: c.dataset.id }); });
    }
    $('#pcount').textContent = `${S.players.length} joueur${S.players.length > 1 ? 's' : ''}`;
    updateLaunch();
  }
  function updateLaunch() {
    const b = $('#launch'); if (!b || !S) return;
    const ok = S.players.length >= 2;
    b.disabled = !ok;
    b.textContent = ok ? '🚀 Lancer la partie' : `En attente de joueurs (${S.players.length}/2)`;
  }

  /* ---------- Intro de manche ---------- */
  function renderIntro() {
    const c = catOf(S.category);
    const random = S.settings.category === 'aleatoire';
    SFX.whoosh(); later(() => SFX.drumroll(1.2), 300);
    screen.innerHTML = `
      <section class="scr">
        <div class="round-tag">MANCHE ${S.round} / ${S.settings.rounds}</div>
        <div class="catcard" style="--cc:${c.color}">
          <div class="em" id="catem">${c.emoji}</div>
          <div class="ct" id="catct">${esc(c.short)}</div>
        </div>
        <div class="prompt">« ${esc(c.prompt)} »</div>
        <div class="platforms">${S.settings.platforms.map(p => p === 'youtube' ? '<span class="plat yt">▶ YouTube</span>' : '<span class="plat ig">📸 Instagram</span>').join('')}</div>
      </section>
      <button class="btn ghost corner-btn" id="skip">Passer ▶</button>`;
    $('#skip').onclick = () => act('next');
    if (random) {
      const keys = Object.keys(CATEGORIES).filter(k => k !== 'aleatoire');
      let i = 0;
      const iv = setInterval(() => {
        const r = CATEGORIES[keys[i++ % keys.length]];
        $('#catem').textContent = r.emoji; $('#catct').textContent = r.short; SFX.tick();
      }, 110);
      timers.push(setTimeout(() => { clearInterval(iv); $('#catem').textContent = c.emoji; $('#catct').textContent = c.short; SFX.reveal(); confetti(60); }, 1900));
      timers.push(iv);
    } else later(() => SFX.reveal(), 1100);
  }

  /* ---------- Recherche des vidéos ---------- */
  function renderSubmit() {
    const c = catOf(S.category);
    screen.innerHTML = `
      <section class="scr submit">
        <div class="prompt">${c.emoji} ${esc(c.prompt)}</div>
        <div class="sub">📱 À vos téléphones ! Cherchez la pépite et envoyez le lien</div>
        <div class="ring" id="ring">
          <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="8"/>
          <circle id="arc" cx="50" cy="50" r="45" fill="none" stroke="${c.color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="282.7" style="filter:drop-shadow(0 0 4px ${c.color})"/></svg>
          <div class="t" id="tleft"></div>
        </div>
        <div class="status-row" id="status"></div>
      </section>
      <button class="btn ghost corner-btn" id="skip">Terminer la recherche ▶</button>`;
    $('#skip').onclick = () => act('next');
    updateStatus();
  }

  function updateStatus() {
    const el = $('#status'); if (!el) return;
    const vote = S.phase === 'vote';
    el.innerHTML = S.players.filter(p => p.connected || p.submitted).map(p => {
      const ok = vote ? p.voted : p.submitted;
      return `<div class="st ${ok ? 'ok' : ''}"><span class="av">${p.avatar}</span><div>${esc(p.name)}<div class="s">${ok ? (vote ? '✅ a voté' : '✅ vidéo envoyée') : (vote ? '🤔 réfléchit…' : '🔎 cherche…')}</div></div></div>`;
    }).join('');
  }

  /* ---------- Diffusion ---------- */
  function renderShow() {
    const s = S.subs[S.current];
    if (!s) return;
    const total = S.subs.length;
    const shape = s.vertical ? 'v' : 'h';
    SFX.whoosh();
    screen.innerHTML = `
      <section class="scr show">
        <aside class="side rise">
          <div class="card" style="padding:1.2rem 1.6rem">
            <div class="numtag">TALENT</div>
            <div><span class="bign">#${s.n}</span> <span class="of">/ ${total}</span></div>
            <div class="sub" style="font-size:1.4rem;text-align:left;margin-top:.4rem">Anonyme jusqu’aux résultats 🤫</div>
          </div>
          <div class="counters" id="counters">
            ${Object.entries(REACTIONS).map(([k, r]) => `<div class="cnt" id="c-${k}" style="--rc:${r.color}"><div class="e">${r.emoji}</div><div class="v">${s.reactions[k]}</div><div class="l">${r.label}</div></div>`).join('')}
          </div>
          <div class="goldbox ${s.golden ? 'on' : ''}" id="goldbox"></div>
          <div class="card" style="padding:1rem 1.4rem;font-size:1.2rem;color:var(--mute);font-weight:600;margin-top:auto">
            📱 Réagissez avec vos téléphones !<br>⭐ Super Buzzer : 1 seul par joueur et par partie
          </div>
        </aside>
        <div class="stagebox">
          <div class="frame ${shape} ${s.platform === 'instagram' ? 'ig' : ''} ${s.golden ? 'gold' : ''} pop" id="frame">
            ${s.golden ? '<div class="goldbadge">⭐ SUPER</div>' : ''}
            <iframe src="${esc(s.embed)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
          </div>
        </div>
      </section>
      <button class="btn corner-btn" id="nextv">${S.current < total - 1 ? 'Vidéo suivante ▶' : 'Passer aux votes 🗳️'}</button>`;
    $('#nextv').onclick = () => act('next');
    updateShow();
  }

  function updateShow() {
    const s = S.subs[S.current]; if (!s) return;
    const gb = $('#goldbox');
    if (gb) {
      gb.className = 'goldbox' + (s.golden ? ' on' : '');
      gb.innerHTML = s.golden ? `⭐ SUPER BUZZER ×${s.golden}<div style="font-size:1.2rem;color:#fff;margin-top:.3rem">par ${s.goldenBy.map(esc).join(', ')}</div>` : '⭐ Super Buzzer en attente…';
    }
    const f = $('#frame');
    if (f && s.golden && !f.classList.contains('gold')) {
      f.classList.add('gold');
      f.insertAdjacentHTML('afterbegin', '<div class="goldbadge">⭐ SUPER</div>');
    }
  }

  /* ---------- Effets temps réel ---------- */
  function onFx(e) {
    if (e.kind === 'react') return flyReaction(e);
    if (e.kind === 'golden') return goldenBuzzer(e);
    if (e.kind === 'join') { SFX.join(); toast(`${e.avatar} ${e.name} a rejoint la partie !`, e.color); }
  }

  function flyReaction(e) {
    const r = REACTIONS[e.reaction]; if (!r) return;
    const fx = $('#fx');
    if (fx.childElementCount < 70) {
      const el = document.createElement('div');
      el.className = 'fly';
      el.style.left = (8 + Math.random() * 84) + 'vw';
      el.style.setProperty('--dx', (Math.random() * 16 - 8) + 'vw');
      el.style.setProperty('--c', e.color);
      el.innerHTML = `<div class="e">${r.emoji}</div><div class="n">${esc(e.name)}</div>`;
      fx.appendChild(el);
      setTimeout(() => el.remove(), 3300);
    }
    if (e.reaction === 'boo') {
      const b = document.createElement('div'); b.className = 'booflash'; document.body.appendChild(b); setTimeout(() => b.remove(), 800);
      const f = $('#frame'); if (f) { f.style.animation = 'none'; void f.offsetWidth; f.style.animation = 'shake .4s'; }
    }
    if (Math.random() < .7) SFX[e.reaction]();
    // compteur
    if (S && S.phase === 'show' && S.subs[S.current] && S.subs[S.current].id === e.sub) {
      Object.assign(S.subs[S.current].reactions, e.reactions);
      const c = $('#c-' + e.reaction);
      if (c) { c.querySelector('.v').textContent = e.reactions[e.reaction]; c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
    }
  }

  function goldenBuzzer(e) {
    const g = $('#golden');
    g.innerHTML = `<div class="bg"></div><div class="rays"></div>
      <div class="txt"><div class="star">⭐</div><div class="gb">SUPER<br>BUZZER</div><div class="by">${e.avatar} ${esc(e.name)} offre son Super Buzzer au talent #${e.n} !</div></div>`;
    g.classList.remove('hidden');
    SFX.golden();
    confetti(220, ['#ffc93c', '#fff1a8', '#ff9d00', '#ffffff', '#ffe066']);
    setTimeout(() => confetti(120, ['#ffc93c', '#fff1a8', '#ff9d00']), 1500);
    clearTimeout(goldenBuzzer.t);
    goldenBuzzer.t = setTimeout(() => g.classList.add('hidden'), 5000);
  }

  /* ---------- Vote ---------- */
  function renderVote() {
    SFX.reveal();
    screen.innerHTML = `
      <section class="scr">
        <div class="h1 pop" style="font-size:4.2rem">🗳️ À VOS VOTES !</div>
        <div class="sub rise">Votez sur votre téléphone pour la meilleure vidéo (pas la vôtre 😉)</div>
        <div class="vgrid">
          ${S.subs.map((s, i) => `
            <div class="vcard ${s.golden ? 'gold' : ''}" style="animation-delay:${i * .08}s">
              ${thumbHTML(s)}<div class="num">${s.n}</div>
              <div class="meta"><span>${s.platform === 'youtube' ? '▶ YouTube' : '📸 Instagram'}</span>
              <span>${s.golden ? '⭐'.repeat(s.golden) + ' ' : ''}👏${s.reactions.clap + s.reactions.laugh + s.reactions.cheer}</span></div>
            </div>`).join('')}
        </div>
        <div class="countdown-bar"><i id="vbar"></i></div>
        <div class="status-row" id="status" style="margin-top:1.4rem"></div>
      </section>
      <button class="btn ghost corner-btn" id="skip">Clore les votes ▶</button>`;
    $('#skip').onclick = () => act('next');
    updateStatus();
  }

  /* ---------- Résultats de manche ---------- */
  function renderResults() {
    const order = (S.lastResults || []).map(id => S.subs.find(s => s.id === id)).filter(Boolean);
    if (!order.length) {
      screen.innerHTML = `<section class="scr"><div class="h1">😴 Aucune vidéo !</div><div class="sub" style="margin-top:2rem">Personne n'a envoyé de lien cette manche…</div></section>
        <button class="btn corner-btn" id="nx">Continuer ▶</button>`;
      $('#nx').onclick = () => act('next');
      return;
    }
    screen.innerHTML = `
      <section class="scr">
        <div class="h1 pop" style="font-size:3.6rem">🏆 RÉSULTATS DE LA MANCHE ${S.round}</div>
        <div class="rlist ${order.length > 5 ? 'dense' : ''}" id="rlist">
          ${order.map((s, i) => {
            const p = player(s.owner) || { name: '?', avatar: '❓' };
            const b = s.breakdown || {};
            return `<div class="rrow ${i === 0 && s.points > 0 ? 'win' : ''}" data-i="${i}">
              <div class="rk">${i + 1}</div>
              ${thumbHTML(s)}
              <div><div class="who"><span class="av">${p.avatar}</span>${esc(p.name)} <span class="sub" style="font-size:1.4rem">· Talent #${s.n}</span></div>
              <div class="det">🗳️ ${s.votes} vote${s.votes > 1 ? 's' : ''} (+${b.votes}) · ⭐ Super Buzzer +${b.golden} · 👏 Réactions ${b.reactions >= 0 ? '+' : ''}${b.reactions}${b.bonus ? ' · 👑 Bonus +' + b.bonus : ''}</div></div>
              <div class="pts">${s.points >= 0 ? '+' : ''}${s.points}</div>
            </div>`;
          }).join('')}
        </div>
        <div class="winbanner" id="wb"></div>
      </section>
      <button class="btn corner-btn hidden" id="nx">${S.round >= S.settings.rounds ? '🎉 La grande finale ▶' : 'Classement général ▶'}</button>`;
    $('#nx').onclick = () => act('next');
    const rows = [...screen.querySelectorAll('.rrow')];
    const n = rows.length;
    // révélation : du dernier au premier
    for (let k = 0; k < n; k++) {
      const idx = n - 1 - k;
      const isWinner = idx === 0;
      const at = 1500 + k * 1800 + (isWinner && n > 1 ? 400 : 0);
      if (isWinner) later(() => SFX.drumroll(2), at - 2000 > 0 ? at - 2000 : 0);
      later(() => {
        rows[idx].classList.add('in');
        if (isWinner) {
          const s = order[0], p = player(s.owner);
          if (s.points > 0 && p) {
            SFX.win(); confetti(160);
            $('#wb').textContent = `${p.avatar} ${p.name} remporte la manche !`;
            $('#wb').classList.add('in');
          }
          later(() => $('#nx').classList.remove('hidden'), 1200);
        } else SFX.reveal();
      }, isWinner ? Math.max(at, 2200) : at);
    }
  }

  /* ---------- Classement général ---------- */
  function renderBoard() {
    const ps = S.players.slice().sort((a, b) => b.score - a.score);
    const max = Math.max(1, ...ps.map(p => p.score));
    screen.innerHTML = `
      <section class="scr">
        <div class="h1 pop" style="font-size:4.6rem">📊 CLASSEMENT GÉNÉRAL</div>
        <div class="sub">Après ${S.round} manche${S.round > 1 ? 's' : ''} sur ${S.settings.rounds}</div>
        <div class="board">
          ${ps.map((p, i) => `<div class="brow" style="--c:${p.color};animation-delay:${i * .1}s">
            <div class="rk">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</div><div class="av">${p.avatar}</div>
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</div>
            <div class="bar"><i data-w="${Math.max(2, p.score / max * 100)}"></i></div>
            <div class="sc"><span data-n="${p.score}">0</span>${p.lastGain ? `<span class="gain">${p.lastGain > 0 ? '+' : ''}${p.lastGain}</span>` : ''}</div>
          </div>`).join('')}
        </div>
      </section>
      <button class="btn gold corner-btn" id="nx">Manche suivante ▶</button>`;
    $('#nx').onclick = () => act('next');
    SFX.reveal();
    later(() => {
      screen.querySelectorAll('.bar i').forEach(b => b.style.width = b.dataset.w + '%');
      countUp(screen.querySelectorAll('[data-n]'));
    }, 300);
  }

  function countUp(els, dur = 1600) {
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      els.forEach(el => el.textContent = Math.round(Number(el.dataset.n) * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- Cérémonie finale ---------- */
  function renderFinal() {
    const ps = S.players.slice().sort((a, b) => b.score - a.score);
    const [p1, p2, p3] = ps;
    const wins = (id) => S.history.filter(h => h.winners.includes(id)).length;
    const pod = (p, cls, rank) => p ? `<div class="pod ${cls}" id="${cls}">
        <div class="av">${p.avatar}</div><div class="nm">${esc(p.name)}</div>
        <div class="sc"><span data-n="${p.score}">${p.score}</span> pts</div>
        <div class="sub" style="font-size:1.3rem">🏆 ${wins(p.id)} manche${wins(p.id) > 1 ? 's' : ''} gagnée${wins(p.id) > 1 ? 's' : ''}</div>
        <div class="blk">${rank}</div></div>` : '';
    screen.innerHTML = `
      <section class="scr final">
        <div class="h1 pop" id="ftitle" style="font-size:3.4rem">🎉 LA GRANDE FINALE 🎉</div>
        <div class="podium">${pod(p2, 'p2', 2)}${pod(p1, 'p1', 1)}${pod(p3, 'p3', 3)}</div>
        <div class="kingtitle" id="king">${p1 ? `${esc(p1.name)} · ${kingTitle(p1)}` : ''}</div>
        <div class="others">${ps.slice(3).map((p, i) => `<span class="chip">${i + 4}. ${p.avatar} ${esc(p.name)} · ${p.score} pts</span>`).join('')}</div>
      </section>
      <button class="btn gold corner-btn hidden" id="nx">🔁 Nouvelle partie</button>`;
    $('#nx').onclick = () => act('next');
    later(() => SFX.drumroll(1.4), 500);
    later(() => { $('#p3') && $('#p3').classList.add('in'); SFX.reveal(); }, 2200);
    later(() => { $('#p2') && $('#p2').classList.add('in'); SFX.reveal(); }, 3800);
    later(() => SFX.drumroll(2.6), 4600);
    later(() => {
      $('#p1') && $('#p1').classList.add('in');
      $('#king').classList.add('in');
      $('#ftitle').innerHTML = '👑 ET LE GAGNANT EST… 👑';
      SFX.win(); setTimeout(() => SFX.golden(), 700);
      confetti(260); setTimeout(() => confetti(200, ['#ffc93c', '#fff1a8', '#ff9d00', '#fff']), 1600); setTimeout(() => confetti(160), 3200);
      $('#nx').classList.remove('hidden');
    }, 7300);
  }

  /* ---------- Horloge (comptes à rebours) ---------- */
  setInterval(() => {
    if (!S || !S.deadline) return;
    const left = Math.max(0, S.deadline - now());
    if (S.phase === 'submit') {
      const sec = Math.ceil(left / 1000);
      const t = $('#tleft'), arc = $('#arc'), ring = $('#ring');
      if (t) t.textContent = sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : sec;
      if (arc) arc.style.strokeDashoffset = 282.7 * (1 - left / (S.settings.submitTime * 1000));
      if (ring) ring.classList.toggle('urgent', sec <= 10);
      if (sec <= 10 && sec !== lastTick && sec > 0) { lastTick = sec; SFX.tick(); }
    }
    if (S.phase === 'vote') {
      const b = $('#vbar'); if (b) b.style.width = (left / 35000 * 100) + '%';
    }
  }, 200);

  /* ---------- Clavier ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
    }
    if ((e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') && S) {
      e.preventDefault();
      if (S.phase === 'results' && $('#nx') && $('#nx').classList.contains('hidden')) return;
      if (S.phase === 'final' && $('#nx') && $('#nx').classList.contains('hidden')) return;
      act('next');
    }
  });
  document.addEventListener('pointerdown', () => SFX.unlock(), { once: true });

  /* ---------- Démarrage ---------- */
  // serveur de développement local uniquement : donne l'adresse réseau de l'ordinateur
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    fetch('api/info').then(r => r.json()).then(d => { lanBase = d.lan; if (S && S.phase === 'lobby') { key = ''; onState(S); } }).catch(() => {});
  }
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('talent-tv') || 'null'); } catch (_) { saved = null; }
  if (!window.Peer) { renderHome(); overlay('Impossible de charger le module de connexion. Vérifiez la connexion Internet puis rechargez.'); }
  else if (saved && saved.room) host(saved.code, saved.room); else renderHome();
})();
