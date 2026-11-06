/* TALENT — données partagées entre le serveur, la télé et les téléphones */
(function (root) {
  const CATEGORIES = {
    drole:           { label: 'La vidéo la plus drôle',          short: 'DRÔLE',          emoji: '😂', color: '#ffc93c', prompt: "Trouvez la vidéo la plus DRÔLE d'Internet" },
    genante:         { label: 'La vidéo la plus gênante',        short: 'GÊNANTE',        emoji: '😬', color: '#ff7a1a', prompt: "Trouvez la vidéo la plus GÊNANTE d'Internet" },
    wtf:             { label: 'La vidéo la plus WTF',            short: 'WTF',            emoji: '🤯', color: '#b04dff', prompt: "Trouvez la vidéo la plus WTF d'Internet" },
    absurde:         { label: 'La vidéo la plus absurde',        short: 'ABSURDE',        emoji: '🦄', color: '#19e3ff', prompt: "Trouvez la vidéo la plus ABSURDE d'Internet" },
    impressionnante: { label: 'La vidéo la plus impressionnante', short: 'IMPRESSIONNANTE', emoji: '🔥', color: '#ff2e63', prompt: "Trouvez la vidéo la plus IMPRESSIONNANTE d'Internet" },
    mignonne:        { label: 'La vidéo la plus mignonne',       short: 'MIGNONNE',       emoji: '🥹', color: '#ff7ad9', prompt: "Trouvez la vidéo la plus MIGNONNE d'Internet" },
    aleatoire:       { label: 'Mode aléatoire',                  short: 'ALÉATOIRE',      emoji: '🎲', color: '#7cff4f', prompt: 'Une catégorie surprise à chaque manche !' }
  };

  const REACTIONS = {
    clap:  { emoji: '👏', label: 'APPLAUDIR',  color: '#19e3ff' },
    laugh: { emoji: '😂', label: 'RIRE',       color: '#ffc93c' },
    cheer: { emoji: '🎉', label: 'ENCOURAGER', color: '#7cff4f' },
    boo:   { emoji: '👎', label: 'HUER',       color: '#ff2e63' }
  };

  const AVATARS = ['🦊', '🐸', '🐼', '🦄', '🐙', '🦁', '🐵', '🐧', '🐯', '🐨', '👽', '🤖', '👻', '🐲', '🦖', '🍕', '🌮', '🍩', '😎', '🤡'];
  const COLORS = ['#ff2e93', '#19e3ff', '#ffc93c', '#7cff4f', '#b04dff', '#ff7a1a', '#ff7ad9', '#4d7bff', '#00e0a4', '#ff5050'];

  const POINTS = { vote: 100, golden: 300, reaction: 5, reactionCap: 6, roundWinner: 150 };

  /** Analyse un lien YouTube / Instagram et renvoie les infos d'intégration */
  function parseVideo(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const url = raw.trim();
    let m = url.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/i);
    if (m) {
      const id = m[1];
      const vertical = /shorts\//i.test(url);
      const t = url.match(/[?&](?:t|start)=(\d+)/);
      return {
        platform: 'youtube', id, vertical,
        url: vertical ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
        embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1&modestbranding=1${t ? '&start=' + t[1] : ''}`,
        thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      };
    }
    m = url.match(/instagram\.com\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]+)/i);
    if (m) {
      const kind = m[1].toLowerCase().startsWith('reel') ? 'reel' : m[1].toLowerCase();
      const id = m[2];
      return {
        platform: 'instagram', id, vertical: true,
        url: `https://www.instagram.com/${kind}/${id}/`,
        embed: `https://www.instagram.com/${kind === 'tv' ? 'p' : kind}/${id}/embed/`,
        thumb: null
      };
    }
    return null;
  }

  const api = { CATEGORIES, REACTIONS, AVATARS, COLORS, POINTS, parseVideo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TALENT = api;
})(typeof window !== 'undefined' ? window : this);
