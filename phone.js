/* TALENT — téléphone (télécommande du joueur) */
(function () {
  const { $, esc, SFX, confetti } = UI;
  const { CATEGORIES, REACTIONS, AVATARS } = TALENT;
  const app = $('#app');

  const params = new URLSearchParams(location.search);
  let code = (params.get('code') || localStorage.getItem('talent-code') || '').toUpperCase();
  let pid = code ? localStorage.getItem('talent-pid-' + code) : null;
  let S = null, key = '', offset = 0, timers = [];
  let peer = null, link = null, seq = 0, retries = 0, reconnecting = false, connectFail = null;
  const pending = new Map();
  let form = { name: localStorage.getItem('talent-name') || '', avatar: localStorage.getItem('talent-avatar') || AVATARS[Math.floor(Math.random() * AVATARS.length)], title: localStorage.getItem('talent-title') || 'both' };

  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const now = () => Date.now() + offset;
  const catOf = (k) => CATEGORIES[k] || CATEGORIES.drole;
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (_) { /* */ } };
  const logo = () => `<div class="logo">${'TALENT'.split('').map(l => `<span>${l}</span>`).join('')}</div>`;

  function toast(msg, ok = false) {
    const t = $('#toast'); t.textContent = msg; t.className = 'on' + (ok ? ' ok' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.className = '', 2600);
  }
  async function act(type, extra = {}) {
    try {
      const r = await request({ t: 'act', body: { type, ...extra } });
      if (r.error) throw new Error(r.error);
      return true;
    } catch (e) { SFX.error(); buzz([60, 40, 60]); toast(e.message); return false; }
  }

  /* ---------- Connexion pair-à-pair à la télé ---------- */
  function request(msg, timeout = 8000) {
    return new Promise((resolve, reject) => {
      if (!link || !link.open) return reject(new Error('Pas connecté à la télé… reconnexion'));
      const id = ++seq;
      pending.set(id, resolve);
      link.send({ ...msg, id });
      setTimeout(() => { if (pending.delete(id)) reject(new Error('La télé ne répond pas')); }, timeout);
    });
  }

  function ensurePeer() {
    return new Promise((resolve, reject) => {
      if (peer && peer.open) return resolve(peer);
      if (peer && !peer.destroyed && peer.disconnected) peer.reconnect();
      else if (!peer || peer.destroyed) {
        peer = new Peer(UI.PEER_OPTIONS);
        peer.on('error', (e) => {
          if (e.type === 'peer-unavailable') { if (connectFail) connectFail('Partie introuvable : vérifie le code affiché sur la télé'); }
          else if (['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible'].includes(e.type)) { if (connectFail) connectFail('Connexion Internet impossible'); }
        });
        peer.on('disconnected', () => setTimeout(() => { if (peer && peer.disconnected && !peer.destroyed) peer.reconnect(); }, 1500));
      }
      const t = setTimeout(() => reject(new Error('Connexion Internet impossible')), 10000);
      peer.once('open', () => { clearTimeout(t); resolve(peer); });
    });
  }

  async function openLink(c) {
    await ensurePeer();
    return new Promise((resolve, reject) => {
      let done = false;
      const cn = peer.connect(UI.PEER_PREFIX + c, { reliable: true, serialization: 'json' });
      const fail = (m) => {
        if (done) return;
        done = true; connectFail = null;
        try { cn.close(); } catch (_) { /* déjà fermée */ }
        reject(new Error(m));
      };
      connectFail = fail;
      cn.on('open', () => { if (done) return; done = true; connectFail = null; resolve(cn); });
      cn.on('data', onData);
      cn.on('close', () => onClose(cn));
      cn.on('error', () => fail('Connexion à la télé impossible'));
      setTimeout(() => fail('La télé ne répond pas'), 15000);
    });
  }

  function onData(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'res') { const r = pending.get(msg.id); if (r) { pending.delete(msg.id); r(msg); } }
    else if (msg.t === 'state') onState(msg.s);
    else if (msg.t === 'fx') onFx(msg.e);
  }

  function onFx(e) {
    if (e.kind === 'golden' && S && S.me && e.name !== S.me.name) { buzz([100, 50, 100, 50, 300]); flash('#ffc93c'); }
  }

  function onClose(cn) {
    if (cn !== link) return;
    link = null;
    if (pid) { $('#net').classList.remove('hidden'); setTimeout(reconnect, 1200); }
  }

  /* Reconnexion automatique (téléphone en veille, passage par l'appli YouTube, télé rechargée…) */
  async function reconnect() {
    if (reconnecting || !pid || (link && link.open)) return;
    reconnecting = true;
    $('#net').classList.remove('hidden');
    try {
      link = await openLink(code);
      const r = await request({ t: 'join', pid });
      if (r.error) {
        reconnecting = false;
        return leave(r.error === 'unknown' ? 'Tu ne fais plus partie de cette partie. Rejoins-la à nouveau.' : r.error);
      }
      retries = 0;
      $('#net').classList.add('hidden');
    } catch (e) {
      retries += 1;
      if (retries > 25) { reconnecting = false; return leave('Impossible de retrouver la télé. La partie est peut-être terminée.'); }
      setTimeout(() => { reconnecting = false; reconnect(); }, 2000);
      return;
    }
    reconnecting = false;
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && pid && !(link && link.open)) reconnect(); });

  /* ---------- Rejoindre ---------- */
  function renderJoin(err = '') {
    key = 'join';
    app.innerHTML = `
      <div class="center" style="flex:0;margin:18px 0 10px">${logo().replace('class="logo"', 'class="logo" style="font-size:64px"')}
        <div class="slogan" style="font-size:14px">Qui a vraiment le meilleur goût sur Internet ?</div></div>
      <div class="main">
        <div class="card"><label class="lbl">CODE DE LA PARTIE</label>
          <input class="field code" id="code" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="ABCD" value="${esc(code)}"></div>
        <div class="card"><label class="lbl">TON PSEUDO</label>
          <input class="field" id="name" maxlength="14" autocomplete="nickname" placeholder="Ex : Léa, MaxLeFou…" value="${esc(form.name)}"></div>
        <div class="card"><label class="lbl">TON AVATAR</label>
          <div class="avatars">${AVATARS.map(a => `<button class="${a === form.avatar ? 'on' : ''}" data-a="${a}">${a}</button>`).join('')}</div></div>
        <div class="card"><label class="lbl">SI TU GAGNES, TU SERAS…</label>
          <div class="seg">
            <button data-t="roi" class="${form.title === 'roi' ? 'on' : ''}">👑 Roi</button>
            <button data-t="reine" class="${form.title === 'reine' ? 'on' : ''}">👑 Reine</button>
            <button data-t="both" class="${form.title === 'both' ? 'on' : ''}">Roi ou Reine</button>
          </div></div>
        <div class="err" id="err">${esc(err)}</div>
        <button class="btn gold wide" id="go">🎤 Entrer sur scène</button>
        <a href="about.html" class="muted" style="font-size:13px;display:block;margin-top:4px">À propos &amp; confidentialité</a>
      </div>`;
    app.querySelectorAll('.avatars button').forEach(b => b.onclick = () => {
      form.avatar = b.dataset.a; app.querySelectorAll('.avatars button').forEach(x => x.classList.toggle('on', x === b)); SFX.click(); buzz(10);
    });
    app.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
      form.title = b.dataset.t; app.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); SFX.click();
    });
    $('#go').onclick = join;
    $('#name').onkeydown = (e) => { if (e.key === 'Enter') join(); };
    if (!code) $('#code').focus();
  }

  async function join() {
    SFX.unlock();
    const c = $('#code').value.trim().toUpperCase();
    form.name = $('#name').value.trim();
    if (c.length !== 4) return showErr('Le code fait 4 lettres (affiché sur la télé)');
    if (!form.name) return showErr('Choisis un pseudo !');
    $('#go').disabled = true;
    try {
      $('#go').textContent = 'Connexion à la télé…';
      if (link) { const old = link; link = null; try { old.close(); } catch (_) { /* */ } }
      link = await openLink(c);
      const r = await request({ t: 'join', name: form.name, avatar: form.avatar, title: form.title });
      if (r.error) { const l = link; link = null; l.close(); throw new Error(r.error); }
      code = c; pid = r.pid;
      localStorage.setItem('talent-code', code);
      localStorage.setItem('talent-pid-' + code, pid);
      localStorage.setItem('talent-name', form.name);
      localStorage.setItem('talent-avatar', form.avatar);
      localStorage.setItem('talent-title', form.title);
      history.replaceState(null, '', 'join.html?code=' + code);
      SFX.join(); buzz([30, 30, 60]);
    } catch (e) { $('#go').disabled = false; $('#go').textContent = '🎤 Entrer sur scène'; showErr(e.message); }
  }
  function showErr(m) { SFX.error(); buzz(80); const e = $('#err'); e.textContent = m; e.style.animation = 'none'; void e.offsetWidth; e.style.animation = 'shake .4s'; }

  function leave(msg) {
    const l = link; link = null; S = null;
    if (l) { try { l.close(); } catch (_) { /* */ } }
    localStorage.removeItem('talent-pid-' + code);
    pid = null;
    renderJoin(msg);
  }

  function onState(st) {
    S = st; offset = st.now - Date.now();
    if (!st.me) return leave('Tu as été retiré de la partie.');
    const k = [st.phase, st.round, st.phase === 'show' ? st.current : ''].join('|');
    if (k !== key) {
      key = k; timers.forEach(clearTimeout); timers = [];
      app.innerHTML = `<div class="bar">${logo()}<div class="me" id="me"></div></div><div class="main" id="main"></div>`;
      ({ lobby: vLobby, intro: vIntro, submit: vSubmit, show: vShow, vote: vVote, results: vResults, leaderboard: vBoard, final: vFinal }[st.phase] || vLobby)();
    } else {
      ({ lobby: vLobby, submit: uSubmit, show: uShow, vote: uVote, leaderboard: vBoard }[st.phase] || (() => {}))();
    }
    renderMe();
  }

  function renderMe() {
    const m = $('#me'); if (!m) return;
    m.style.setProperty('--c', S.me.color);
    m.innerHTML = `<span class="av">${S.me.avatar}</span><span class="nm">${esc(S.me.name)}</span><span class="sc">${S.me.score} pts</span>`;
  }

  function hostBox(label, cls = '') {
    if (!S.me.isHost) return '';
    return `<div class="host"><div class="lbl2">🎙️ TU ES L'ANIMATEUR</div><button class="btn ${cls} wide" id="hnext">${label}</button></div>`;
  }
  function bindHost() { const b = $('#hnext'); if (b) b.onclick = () => { SFX.click(); buzz(15); act('next'); }; }
  function catCard() {
    const c = catOf(S.category);
    return `<div class="cat" style="--cc:${c.color}"><div class="em">${c.emoji}</div><div class="t">${esc(c.label)}</div></div>`;
  }

  /* ---------- Écrans ---------- */
  function vLobby() {
    const n = S.players.length;
    $('#main').innerHTML = `
      <div class="center">
        <div class="big-emoji">${S.me.avatar}</div>
        <div class="title">Bienvenue ${esc(S.me.name)} !</div>
        <div class="muted">Tu es sur scène 🎤 Regarde la télé…</div>
        <div class="chip">👥 ${n} joueur${n > 1 ? 's' : ''} connecté${n > 1 ? 's' : ''}</div>
        <div class="card" style="width:100%;text-align:left;font-size:15px">
          <b>Défi :</b> ${esc(catOf(S.settings.category).label)} ${catOf(S.settings.category).emoji}<br>
          <b>Plateformes :</b> ${S.settings.platforms.map(p => p === 'youtube' ? 'YouTube' : 'Instagram').join(' + ')}<br>
          <b>Manches :</b> ${S.settings.rounds} · <b>Recherche :</b> ${S.settings.submitTime < 120 ? S.settings.submitTime + ' s' : S.settings.submitTime / 60 + ' min'}
        </div>
      </div>
      ${S.me.isHost ? `<div class="host"><div class="lbl2">🎙️ TU ES L'ANIMATEUR</div>
        <button class="btn gold wide" id="hnext" ${n < 2 ? 'disabled' : ''}>${n < 2 ? 'En attente d’un 2e joueur…' : '🚀 Lancer la partie'}</button></div>` : ''}`;
    bindHost();
  }

  function vIntro() {
    buzz([40, 60, 40]);
    $('#main').innerHTML = `
      <div class="center">
        <div class="muted" style="font-family:var(--display);color:var(--cyan)">MANCHE ${S.round} / ${S.settings.rounds}</div>
        ${catCard()}
        <div class="title" style="font-size:22px">Prépare-toi à chercher ! 🔎</div>
        <div class="muted">Les yeux sur la télé 📺</div>
      </div>`;
  }

  function vSubmit() {
    buzz(60);
    const yt = S.settings.platforms.includes('youtube'), ig = S.settings.platforms.includes('instagram');
    $('#main').innerHTML = `
      ${catCard()}
      <div class="timer" id="timer">--</div>
      <div class="row">
        ${yt ? '<a class="platbtn yt" href="https://www.youtube.com/" target="_blank" rel="noopener">▶ YouTube</a>' : ''}
        ${ig ? '<a class="platbtn ig" href="https://www.instagram.com/reels/" target="_blank" rel="noopener">📸 Instagram</a>' : ''}
      </div>
      <div class="card">
        <label class="lbl">COLLE LE LIEN DE TA VIDÉO</label>
        <input class="field" id="url" inputmode="url" autocomplete="off" placeholder="${yt ? 'https://youtu.be/…' : 'https://instagram.com/reel/…'}" style="font-size:16px">
        <div class="row" style="margin-top:10px">
          ${navigator.clipboard && navigator.clipboard.readText ? '<button class="btn ghost" id="paste" style="font-size:14px;padding:14px 8px">📋 Coller</button>' : ''}
          <button class="btn gold" id="send" style="font-size:16px;padding:14px 8px">Envoyer 🚀</button>
        </div>
        <div class="muted" style="font-size:12px;margin-top:10px">Astuce : sur l'appli, « Partager » → « Copier le lien », puis reviens ici.</div>
      </div>
      <div id="sent"></div>
      ${hostBox('Terminer la recherche ▶', 'ghost')}`;
    bindHost();
    const send = async () => {
      const u = $('#url').value.trim();
      const v = TALENT.parseVideo(u);
      if (!v) { SFX.error(); buzz(80); return toast('Lien non reconnu : colle un lien YouTube ou Instagram'); }
      if (!S.settings.platforms.includes(v.platform)) { SFX.error(); return toast(`${v.platform === 'youtube' ? 'YouTube' : 'Instagram'} n’est pas autorisé dans cette partie`); }
      $('#send').disabled = true;
      const ok = await act('submit', { url: u });
      $('#send').disabled = false;
      if (ok) { SFX.join(); buzz([30, 40, 80]); toast('Vidéo envoyée ! Tu peux la changer jusqu’à la fin ⏱️', true); $('#url').value = ''; }
    };
    $('#send').onclick = send;
    $('#url').onkeydown = (e) => { if (e.key === 'Enter') send(); };
    const p = $('#paste');
    if (p) p.onclick = async () => { try { $('#url').value = (await navigator.clipboard.readText()).trim(); SFX.click(); } catch (_) { toast('Impossible de lire le presse-papiers : colle manuellement'); } };
    uSubmit();
  }
  function uSubmit() {
    const el = $('#sent'); if (!el) return;
    if (S.mySub) {
      const v = TALENT.parseVideo(S.mySub.url);
      el.innerHTML = `<div class="sent pop">${v && v.thumb ? `<img src="${esc(v.thumb)}" alt="">` : '<span style="font-size:34px">📸</span>'}
        <div>✅ Ta vidéo est envoyée !<div class="u">${esc(S.mySub.url)}</div></div></div>`;
    } else el.innerHTML = '';
  }

  /* Télécommande pendant la diffusion */
  function vShow() {
    const s = S.subs[S.current];
    if (!s) return;
    buzz(30);
    $('#main').innerHTML = `
      <div class="nowplaying">EN DIRECT SUR LA TÉLÉ<br><b>TALENT #${s.n}</b> <span class="muted">/ ${S.subs.length}</span></div>
      ${s.mine ? '<div class="mine-tag">🤫 C’est TA vidéo ! Garde ton sérieux…</div>' : ''}
      <div class="rgrid">
        ${Object.entries(REACTIONS).map(([k, r]) => `<button class="rbtn" data-r="${k}" style="--rc:${r.color}"><span class="e">${r.emoji}</span><span class="l">${r.label}</span></button>`).join('')}
      </div>
      <button class="golden" id="golden"></button>
      ${hostBox(S.current < S.subs.length - 1 ? 'Vidéo suivante ▶' : 'Passer aux votes 🗳️')}`;
    bindHost();
    app.querySelectorAll('.rbtn').forEach(b => {
      const fire = (e) => {
        e.preventDefault();
        SFX.unlock(); buzz(18);
        b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 90);
        act('react', { reaction: b.dataset.r });
      };
      b.addEventListener('pointerdown', fire);
    });
    $('#golden').onclick = async () => {
      if (!confirm('Utiliser ton unique SUPER BUZZER sur cette vidéo ? ⭐')) return;
      const ok = await act('golden');
      if (ok) { SFX.golden(); buzz([100, 60, 100, 60, 400]); confetti(80, ['#ffc93c', '#fff1a8', '#ff9d00']); flash('#ffc93c'); }
    };
    uShow();
  }
  function uShow() {
    const g = $('#golden'), s = S.subs[S.current]; if (!g || !s) return;
    if (S.me.goldenUsed) { g.disabled = true; g.textContent = '⭐ Super Buzzer utilisé'; }
    else if (s.mine) { g.disabled = true; g.textContent = '⭐ Pas sur ta vidéo !'; }
    else { g.disabled = false; g.textContent = '⭐ SUPER BUZZER ⭐'; }
  }

  function vVote() {
    buzz([40, 40, 40]);
    $('#main').innerHTML = `
      <div class="title">🗳️ À TOI DE VOTER !</div>
      <div class="muted">Quelle est la meilleure vidéo ? (tu peux changer d'avis)</div>
      <div class="timer" id="timer" style="font-size:28px">--</div>
      <div class="vlist" id="vlist"></div>
      ${hostBox('Clore les votes ▶', 'ghost')}`;
    bindHost();
    uVote();
  }
  function uVote() {
    const l = $('#vlist'); if (!l) return;
    l.innerHTML = S.subs.map(s => `
      <button class="vitem ${s.mine ? 'mine' : ''} ${S.myVote === s.id ? 'on' : ''}" data-id="${s.id}" ${s.mine ? 'disabled' : ''}>
        ${s.thumb ? `<div class="th" style="background-image:url('${esc(s.thumb)}')"></div>` : '<div class="th ig">📸</div>'}
        <div><div class="n">#${s.n}</div><div class="d">${s.mine ? 'Ta vidéo' : (s.platform === 'youtube' ? 'YouTube' : 'Instagram')}${s.golden ? ' · ⭐ Super Buzzer' : ''}</div></div>
        <span class="ck">${S.myVote === s.id ? '✅' : ''}</span>
      </button>`).join('');
    l.querySelectorAll('.vitem:not(.mine)').forEach(b => b.onclick = async () => {
      SFX.click(); buzz(25);
      if (await act('vote', { sub: b.dataset.id })) toast('Vote enregistré ✅', true);
    });
  }

  function revealDelay() {
    const n = (S.lastResults || []).length;
    if (!n) return 0;
    const winnerAt = Math.max(1500 + (n - 1) * 1800 + (n > 1 ? 400 : 0), 2200);
    return Math.max(0, winnerAt + 500 - (now() - S.phaseAt));
  }

  function vResults() {
    $('#main').innerHTML = `<div class="center"><div class="big-emoji">👀</div><div class="title">Regarde la télé…</div><div class="muted">Les résultats tombent !</div></div>`;
    later(() => {
      const mine = S.subs.find(s => s.owner === pid);
      const rank = mine ? S.lastResults.indexOf(mine.id) + 1 : 0;
      const win = rank === 1 && mine.points > 0;
      if (win) { confetti(120); buzz([80, 40, 80, 40, 300]); SFX.win(); }
      $('#main').innerHTML = `
        <div class="center">
          ${mine ? `<div class="muted">Ta vidéo (talent #${mine.n}) termine</div>
            <div class="rank">${rank}${rank === 1 ? 'er' : 'e'}</div>
            <div class="gain">${mine.points >= 0 ? '+' : ''}${mine.points} pts</div>
            <div class="card" style="width:100%;font-size:15px;text-align:left">
              🗳️ Votes : +${mine.breakdown.votes}<br>⭐ Super Buzzer : +${mine.breakdown.golden}<br>👏 Réactions : ${mine.breakdown.reactions >= 0 ? '+' : ''}${mine.breakdown.reactions}${mine.breakdown.bonus ? `<br>👑 Bonus vainqueur : +${mine.breakdown.bonus}` : ''}
            </div>
            <div class="title" style="font-size:22px">${win ? '🏆 Tu remportes la manche !' : rank <= 2 ? 'Pas mal du tout ! 🔥' : 'La prochaine sera la bonne 💪'}</div>`
          : '<div class="big-emoji">😶</div><div class="title">Pas de vidéo cette manche</div><div class="muted">0 point… la prochaine fois !</div>'}
        </div>
        ${hostBox(S.round >= S.settings.rounds ? '🎉 La grande finale ▶' : 'Classement général ▶')}`;
      bindHost();
    }, revealDelay());
  }

  function vBoard() {
    const ps = S.players.slice().sort((a, b) => b.score - a.score);
    const rank = ps.findIndex(p => p.id === pid) + 1;
    $('#main').innerHTML = `
      <div class="center">
        <div class="muted">Classement après ${S.round} manche${S.round > 1 ? 's' : ''}</div>
        <div class="rank">${rank}${rank === 1 ? 'er' : 'e'}</div>
        <div class="muted">sur ${ps.length} · ${S.me.score} pts</div>
        <div class="card" style="width:100%">
          ${ps.slice(0, 5).map((p, i) => `<div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:${p.id === pid ? 900 : 600};color:${p.id === pid ? 'var(--gold)' : 'inherit'}"><span>${i + 1}. ${p.avatar} ${esc(p.name)}</span><span>${p.score}</span></div>`).join('')}
        </div>
      </div>
      ${hostBox('Manche suivante ▶', 'gold')}`;
    bindHost();
  }

  function vFinal() {
    $('#main').innerHTML = `<div class="center"><div class="big-emoji">🥁</div><div class="title">LA GRANDE FINALE</div><div class="muted">Tous les yeux sur la télé…</div></div>`;
    const elapsed = now() - S.phaseAt;
    later(() => {
      const ps = S.players.slice().sort((a, b) => b.score - a.score);
      const rank = ps.findIndex(p => p.id === pid) + 1;
      const me = ps[rank - 1];
      const title = me.title === 'roi' ? 'ROI DU CONTENU INTERNET' : me.title === 'reine' ? 'REINE DU CONTENU INTERNET' : 'ROI OU REINE DU CONTENU INTERNET';
      if (rank === 1) { confetti(200); buzz([100, 50, 100, 50, 600]); SFX.win(); }
      $('#main').innerHTML = `
        <div class="center">
          ${rank === 1 ? `<div class="big-emoji">👑</div><div class="title" style="color:var(--gold)">TU ES LE ${esc(title)} !</div>`
            : `<div class="big-emoji">${rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🎬'}</div><div class="rank">${rank}e</div>`}
          <div class="muted">${me.score} points · ${S.history.filter(h => h.winners.includes(pid)).length} manche(s) gagnée(s)</div>
          <div class="muted" style="margin-top:8px">Merci d’avoir joué à TALENT ✨</div>
        </div>
        ${hostBox('🔁 Nouvelle partie', 'gold')}`;
      bindHost();
    }, Math.max(0, 7600 - elapsed));
  }

  function flash(c) { const f = document.createElement('div'); f.className = 'flash'; f.style.background = c; f.style.opacity = '.5'; document.body.appendChild(f); setTimeout(() => f.remove(), 600); }

  /* ---------- Comptes à rebours ---------- */
  setInterval(() => {
    const t = $('#timer'); if (!t || !S || !S.deadline) return;
    const sec = Math.max(0, Math.ceil((S.deadline - now()) / 1000));
    t.textContent = sec >= 60 ? `⏱️ ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `⏱️ ${sec}s`;
    t.classList.toggle('urgent', sec <= 10);
  }, 250);

  document.addEventListener('pointerdown', () => SFX.unlock(), { once: true });

  if (!window.Peer) renderJoin('Impossible de charger le module de connexion. Vérifie ta connexion Internet.');
  else if (code && pid) {
    app.innerHTML = '<div class="center"><div class="big-emoji">📡</div><div class="title">Connexion à la télé…</div></div>';
    reconnect();
  } else renderJoin();
})();
