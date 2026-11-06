/*
 * TALENT — moteur de jeu.
 * Il tourne directement dans la page de la télévision : la télé est l'hôte de la partie,
 * les téléphones s'y connectent en pair-à-pair. Aucun serveur de jeu n'est nécessaire.
 */
(function () {
  const { CATEGORIES, AVATARS, COLORS, POINTS, parseVideo } = TALENT;
  const INTRO_MS = 6500;
  const VOTE_MS = 35000;
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  function cleanSettings(s = {}) {
    const platforms = Array.isArray(s.platforms) ? s.platforms.filter(p => p === 'youtube' || p === 'instagram') : [];
    return {
      platforms: platforms.length ? platforms : ['youtube', 'instagram'],
      category: CATEGORIES[s.category] ? s.category : 'drole',
      rounds: Math.min(10, Math.max(1, Number(s.rounds) || 3)),
      submitTime: Math.min(600, Math.max(30, Number(s.submitTime) || 120))
    };
  }

  function createEngine(code, settings, saved) {
    const room = saved || {
      code, settings: cleanSettings(settings),
      players: [], hostId: null, phase: 'lobby', round: 0, category: null,
      deadline: null, subs: [], current: -1, votes: {}, lastResults: null,
      history: [], usedCats: [], phaseAt: Date.now()
    };
    room.players.forEach(p => { p.conns = 0; });
    const clients = new Set();
    let onChange = null;

    /* ---------- Diffusion ---------- */
    function view(role, pid) {
      const reveal = ['results', 'leaderboard', 'final'].includes(room.phase);
      const showSubs = ['show', 'vote', 'results', 'leaderboard', 'final'].includes(room.phase);
      const subs = showSubs ? room.subs.map((x, i) => ({
        n: i + 1, id: x.id, platform: x.platform, vertical: x.vertical, embed: x.embed, thumb: x.thumb, url: x.url,
        reactions: x.reactions, golden: x.golden.length, goldenBy: x.golden.map(g => g.name),
        mine: x.playerId === pid,
        owner: reveal ? x.playerId : undefined,
        votes: reveal ? x.votesCount : undefined, points: reveal ? x.points : undefined,
        breakdown: reveal ? x.breakdown : undefined
      })) : [];
      const me = room.players.find(p => p.id === pid);
      const mySub = room.subs.find(s => s.playerId === pid);
      return {
        code: room.code, phase: room.phase, round: room.round, settings: room.settings,
        category: room.category, deadline: room.deadline, now: Date.now(), phaseAt: room.phaseAt, hostId: room.hostId,
        current: room.current, subCount: room.subs.length,
        players: room.players.map(p => ({
          id: p.id, name: p.name, avatar: p.avatar, color: p.color, title: p.title, score: p.score,
          connected: p.conns > 0, goldenUsed: p.goldenUsed, lastGain: p.lastGain || 0,
          submitted: !!room.subs.find(s => s.playerId === p.id), voted: !!room.votes[p.id]
        })),
        subs, lastResults: reveal ? room.lastResults : null, history: room.history,
        me: role === 'phone' && me ? { id: me.id, name: me.name, avatar: me.avatar, color: me.color, goldenUsed: me.goldenUsed, score: me.score, isHost: room.hostId === me.id } : null,
        mySub: role === 'phone' && mySub ? { url: mySub.url, platform: mySub.platform } : null,
        myVote: role === 'phone' ? room.votes[pid] || null : null
      };
    }

    function broadcast() {
      for (const c of clients) c.send({ t: 'state', s: view(c.role, c.pid) });
      if (onChange) onChange(room);
    }
    function fx(data) { for (const c of clients) c.send({ t: 'fx', e: data }); }

    /* ---------- Machine à états ---------- */
    function setPhase(phase, ms) {
      room.phase = phase;
      room.phaseAt = Date.now();
      room.deadline = ms ? Date.now() + ms : null;
    }

    function startRound() {
      room.round += 1;
      room.subs = []; room.votes = {}; room.current = -1; room.lastResults = null;
      room.players.forEach(p => { p.lastGain = 0; });
      let cat = room.settings.category;
      if (cat === 'aleatoire') {
        const keys = Object.keys(CATEGORIES).filter(k => k !== 'aleatoire');
        let pool = keys.filter(k => !room.usedCats.includes(k));
        if (!pool.length) { room.usedCats = []; pool = keys; }
        cat = pool[Math.floor(Math.random() * pool.length)];
        room.usedCats.push(cat);
      }
      room.category = cat;
      setPhase('intro', INTRO_MS);
    }

    function endSubmit() {
      if (!room.subs.length) { computeResults(); return; }
      room.subs.sort(() => Math.random() - 0.5); // ordre aléatoire = anonymat
      room.current = 0;
      setPhase('show');
    }

    const canVote = (p) => room.subs.some(s => s.playerId !== p.id);

    function computeResults() {
      room.players.forEach(p => { p.lastGain = 0; });
      const tally = {};
      for (const sid of Object.values(room.votes)) tally[sid] = (tally[sid] || 0) + 1;
      for (const s of room.subs) {
        s.votesCount = tally[s.id] || 0;
        let react = 0;
        for (const [rid, r] of Object.entries(s.reactors)) {
          if (rid === s.playerId) continue;
          react += Math.min(r.pos, POINTS.reactionCap) * POINTS.reaction - Math.min(r.boo, POINTS.reactionCap) * POINTS.reaction;
        }
        s.breakdown = { votes: s.votesCount * POINTS.vote, golden: s.golden.length * POINTS.golden, reactions: react, bonus: 0 };
        s.points = s.breakdown.votes + s.breakdown.golden + s.breakdown.reactions;
      }
      const best = Math.max(0, ...room.subs.map(s => s.points));
      const winners = best > 0 ? room.subs.filter(s => s.points === best) : [];
      winners.forEach(s => { s.breakdown.bonus = POINTS.roundWinner; s.points += POINTS.roundWinner; });
      for (const s of room.subs) {
        const p = room.players.find(x => x.id === s.playerId);
        if (p) { p.score = Math.max(0, p.score + s.points); p.lastGain = s.points; }
      }
      room.lastResults = room.subs.slice().sort((a, b) => b.points - a.points).map(s => s.id);
      room.history.push({ round: room.round, category: room.category, winners: winners.map(s => s.playerId) });
      setPhase('results');
    }

    function next() {
      switch (room.phase) {
        case 'lobby':
          if (room.players.length < 2) return 'Il faut au moins 2 joueurs';
          startRound(); break;
        case 'intro': setPhase('submit', room.settings.submitTime * 1000); break;
        case 'submit': endSubmit(); break;
        case 'show':
          if (room.current < room.subs.length - 1) { room.current += 1; room.phaseAt = Date.now(); }
          else setPhase('vote', VOTE_MS);
          break;
        case 'vote': computeResults(); break;
        case 'results': setPhase(room.round >= room.settings.rounds ? 'final' : 'leaderboard'); break;
        case 'leaderboard': startRound(); break;
        case 'final': restart(); break;
      }
      return null;
    }

    function restart() {
      room.round = 0; room.subs = []; room.votes = {}; room.current = -1; room.history = []; room.usedCats = [];
      room.lastResults = null; room.category = null;
      room.players = room.players.filter(p => p.conns > 0);
      room.players.forEach(p => { p.score = 0; p.goldenUsed = false; p.lastGain = 0; });
      if (!room.players.some(p => p.id === room.hostId)) room.hostId = room.players[0] ? room.players[0].id : null;
      setPhase('lobby');
    }

    const ticker = setInterval(() => {
      if (room.deadline && Date.now() >= room.deadline) {
        if (room.phase === 'intro') next();
        else if (room.phase === 'submit') endSubmit();
        else if (room.phase === 'vote') computeResults();
        broadcast();
      }
    }, 250);

    /* ---------- Entrées ---------- */
    function join(body) {
      let pl = body.pid && room.players.find(x => x.id === body.pid);
      if (pl) return pl.id;
      const name = String(body.name || '').replace(/[<>]/g, '').trim().slice(0, 14);
      if (!name) throw new Error(body.pid ? 'unknown' : 'Choisis un pseudo');
      if (room.players.some(x => x.name.toLowerCase() === name.toLowerCase())) throw new Error('Ce pseudo est déjà pris');
      if (room.phase === 'final') throw new Error('La partie est terminée');
      if (room.players.length >= 40) throw new Error('La partie est complète');
      pl = {
        id: uid(), name, score: 0, goldenUsed: false, conns: 0, lastGain: 0,
        avatar: AVATARS.includes(body.avatar) ? body.avatar : AVATARS[room.players.length % AVATARS.length],
        color: COLORS[room.players.length % COLORS.length],
        title: ['roi', 'reine'].includes(body.title) ? body.title : 'both'
      };
      room.players.push(pl);
      if (!room.hostId) room.hostId = pl.id;
      fx({ kind: 'join', name: pl.name, avatar: pl.avatar, color: pl.color });
      broadcast();
      return pl.id;
    }

    function addClient(c) {
      clients.add(c);
      const p = c.pid && room.players.find(x => x.id === c.pid);
      if (p) { p.conns += 1; if (!room.players.some(x => x.id === room.hostId)) room.hostId = p.id; }
      broadcast();
    }

    function removeClient(c) {
      if (!clients.delete(c)) return;
      const p = c.pid && room.players.find(x => x.id === c.pid);
      if (p) {
        p.conns = Math.max(0, p.conns - 1);
        setTimeout(() => {
          if (p.conns === 0 && room.hostId === p.id) {
            const other = room.players.find(x => x.conns > 0);
            if (other) room.hostId = other.id;
          }
          broadcast();
        }, 4000);
      }
    }

    /** Applique une action. Renvoie null (ok), un message d'erreur, ou 'silent'. */
    function act(body, isTv) {
      const p = room.players.find(x => x.id === body.pid);
      const isHost = p && room.hostId === p.id;
      let res = handle(body, p, isTv, isHost);
      if (res === 'nobroadcast') return null;
      if (res === null) broadcast();
      return res;
    }

    function handle(body, p, isTv, isHost) {
      switch (body.type) {
        case 'next':
          if (!isTv && !isHost) return 'Seul l’animateur peut faire ça';
          return next();
        case 'settings':
          if (!isTv) return 'Interdit';
          if (room.phase !== 'lobby') return 'Partie déjà lancée';
          room.settings = cleanSettings({ ...room.settings, ...body.settings });
          return null;
        case 'kick':
          if (!isTv) return 'Interdit';
          room.players = room.players.filter(x => x.id !== body.target);
          if (room.hostId === body.target) room.hostId = room.players[0] ? room.players[0].id : null;
          return null;
      }
      if (!p) return 'Joueur inconnu';
      switch (body.type) {
        case 'submit': {
          if (room.phase !== 'submit') return 'Ce n’est pas le moment';
          const v = parseVideo(body.url);
          if (!v) return 'Lien non reconnu (YouTube ou Instagram uniquement)';
          if (!room.settings.platforms.includes(v.platform)) return `${v.platform === 'youtube' ? 'YouTube' : 'Instagram'} n’est pas autorisé dans cette partie`;
          if (room.subs.some(s => s.playerId !== p.id && s.platform === v.platform && s.vid === v.id)) return 'Quelqu’un a déjà proposé cette vidéo !';
          const existing = room.subs.find(s => s.playerId === p.id);
          const data = { platform: v.platform, vid: v.id, url: v.url, embed: v.embed, thumb: v.thumb, vertical: v.vertical };
          if (existing) Object.assign(existing, data);
          else room.subs.push({ id: uid(), playerId: p.id, ...data, reactions: { clap: 0, laugh: 0, cheer: 0, boo: 0 }, reactors: {}, golden: [] });
          const active = room.players.filter(x => x.conns > 0);
          if (active.every(x => room.subs.some(s => s.playerId === x.id))) room.deadline = Math.min(room.deadline, Date.now() + 3000);
          return null;
        }
        case 'react': {
          if (room.phase !== 'show') return 'silent';
          const s = room.subs[room.current];
          if (!s || !['clap', 'laugh', 'cheer', 'boo'].includes(body.reaction)) return 'silent';
          const now = Date.now();
          p.rt = (p.rt || []).filter(t => now - t < 1000);
          if (p.rt.length >= 8) return 'silent';
          p.rt.push(now);
          s.reactions[body.reaction] += 1;
          const r = s.reactors[p.id] || (s.reactors[p.id] = { pos: 0, boo: 0 });
          if (body.reaction === 'boo') r.boo += 1; else r.pos += 1;
          fx({ kind: 'react', reaction: body.reaction, name: p.name, avatar: p.avatar, color: p.color, reactions: s.reactions, sub: s.id });
          return 'nobroadcast';
        }
        case 'golden': {
          if (room.phase !== 'show') return 'Ce n’est pas le moment';
          const s = room.subs[room.current];
          if (!s) return 'Aucune vidéo';
          if (p.goldenUsed) return 'Tu as déjà utilisé ton Super Buzzer';
          if (s.playerId === p.id) return 'Pas de Super Buzzer sur ta propre vidéo !';
          p.goldenUsed = true;
          s.golden.push({ id: p.id, name: p.name });
          fx({ kind: 'golden', name: p.name, avatar: p.avatar, color: p.color, n: room.current + 1 });
          return null;
        }
        case 'vote': {
          if (room.phase !== 'vote') return 'Ce n’est pas le moment';
          const s = room.subs.find(x => x.id === body.sub);
          if (!s) return 'Vidéo inconnue';
          if (s.playerId === p.id) return 'Tu ne peux pas voter pour ta vidéo !';
          room.votes[p.id] = s.id;
          const voters = room.players.filter(x => x.conns > 0 && canVote(x));
          if (voters.every(x => room.votes[x.id])) room.deadline = Math.min(room.deadline, Date.now() + 2500);
          return null;
        }
      }
      return 'Action inconnue';
    }

    return {
      room, join, act, addClient, removeClient, broadcast,
      set onChange(fn) { onChange = fn; },
      destroy() { clearInterval(ticker); clients.clear(); }
    };
  }

  window.TalentEngine = { createEngine, cleanSettings };
})();
