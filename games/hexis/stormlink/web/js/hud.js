/* hud.js — the instrument panel, including the one that matters most here:
 * the netgraph.
 *
 * A multiplayer game that does not show you your connection is asking you to
 * guess whether it is the game or the network. Round trip, jitter, packet
 * arrival and how far prediction is having to correct are all on screen,
 * because when this build feels bad the reason is always one of those four
 * and the player deserves to know which.
 */

export class Hud {
  constructor(root) {
    this.root = root;
    this.el = {};
    for (const id of ['hp', 'en', 'name', 'wave', 'rtt', 'jit', 'kbps', 'corr',
                      'board', 'feed', 'combo', 'banner', 'graph', 'tick']) {
      this.el[id] = root.querySelector('#' + id);
    }
    this.gctx = this.el.graph ? this.el.graph.getContext('2d') : null;
    this.feed = [];
    this.bannerT = 0;
    this._last = {};
  }

  /* Write-on-change, the same discipline the single-player build learned the
     hard way: a HUD that writes to the DOM sixty times a second for values
     that change twice a minute costs more than the renderer. */
  set(id, text) {
    const n = this.el[id];
    if (!n || this._last[id] === text) return;
    this._last[id] = text;
    n.textContent = text;
  }
  bar(id, k) {
    const n = this.el[id];
    if (!n) return;
    const q = Math.round(Math.max(0, Math.min(1, k)) * 100) / 100;
    if (this._last['bar' + id] === q) return;
    this._last['bar' + id] = q;
    n.style.transform = 'scaleX(' + q + ')';
  }

  banner(text, secs = 2.5) {
    if (!this.el.banner) return;
    this.el.banner.textContent = text;
    this.el.banner.classList.add('on');
    this.bannerT = secs;
  }

  event(e) {
    let line = null;
    if (e.t === 'kill') line = `<b>${esc(e.a)}</b> dropped a ${['grunt', 'lancer', 'brute'][e.n] || 'hostile'}`;
    else if (e.t === 'down') line = `<b>${esc(e.a)}</b> went down`;
    else if (e.t === 'join') line = `<b>${esc(e.a)}</b> connected`;
    else if (e.t === 'leave') line = `<b>${esc(e.a)}</b> disconnected`;
    else if (e.t === 'wave') { this.banner('WAVE ' + e.n, 2.6); line = `wave <b>${e.n}</b> incoming`; }
    else if (e.t === 'wave_clear') { this.banner('WAVE ' + e.n + ' CLEAR', 2.2); line = `wave <b>${e.n}</b> cleared`; }
    else if (e.t === 'chat') line = `<b>${esc(e.from)}</b>: ${esc(e.text)}`;
    if (!line) return;
    this.feed.push({ line, t: 6 });
    if (this.feed.length > 7) this.feed.shift();
    this.renderFeed();
  }

  renderFeed() {
    if (!this.el.feed) return;
    this.el.feed.innerHTML = this.feed.map(f => '<div>' + f.line + '</div>').join('');
  }

  update(net, me, dt) {
    if (me) {
      this.bar('hp', me.hp / 100);
      this.bar('en', me.energy / 100);
      this.set('combo', me.combo > 1 ? me.combo + ' HIT' : '');
    }
    this.set('rtt', Math.round(net.rtt) + ' ms');
    this.set('jit', '±' + Math.round(net.jitter) + ' ms');
    const secs = Math.max(1, performance.now() / 1000);
    this.set('kbps', Math.round((net.bytesIn + net.bytesOut) * 8 / 1000 / secs) + ' kbps');
    this.set('tick', net.snapshot ? 't' + net.snapshot.tick : '—');

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0 && this.el.banner) this.el.banner.classList.remove('on');
    }
    let dirty = false;
    for (const f of this.feed) { f.t -= dt; if (f.t <= 0) dirty = true; }
    if (dirty) { this.feed = this.feed.filter(f => f.t > 0); this.renderFeed(); }
  }

  scoreboard(snap, names, myId) {
    if (!this.el.board || !snap) return;
    const rows = snap.players.slice().sort((a, b) => b.score - a.score).map(p => {
      const n = names.get(p.id) || ('P' + p.id);
      const dead = (p.flags & 1) ? ' dead' : '';
      return `<tr class="${p.id === myId ? 'me' : ''}${dead}"><td>${esc(n)}</td><td>${p.score}</td><td>${p.hp}</td></tr>`;
    }).join('');
    const html = '<table>' + rows + '</table>';
    if (this._last.board !== html) { this._last.board = html; this.el.board.innerHTML = html; }
  }

  /* The netgraph: one bar per received snapshot, height = inter-arrival time.
     A flat row of equal bars is a healthy 30 Hz stream; gaps are dropped or
     delayed packets, and they are exactly what a stutter looks like from the
     inside. The red line is the prediction error. */
  graph(net, predictor) {
    const c = this.gctx;
    if (!c) return;
    const w = this.el.graph.width, h = this.el.graph.height;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(5,7,12,0.55)';
    c.fillRect(0, 0, w, h);

    const hist = net.history;
    const ideal = 1000 / (net.welcome ? net.welcome.tickRate : 30);
    // Reference line at the ideal inter-arrival gap.
    c.strokeStyle = 'rgba(124,138,163,0.45)';
    c.beginPath();
    const yRef = h - (ideal / (ideal * 3)) * h;
    c.moveTo(0, yRef); c.lineTo(w, yRef); c.stroke();

    const n = Math.min(hist.length - 1, w);
    for (let i = 0; i < n; i++) {
      const a = hist[hist.length - 1 - i], b = hist[hist.length - 2 - i];
      if (!b) break;
      const gap = a.t - b.t;
      const k = Math.min(1, gap / (ideal * 3));
      const bh = Math.max(1, k * h);
      c.fillStyle = gap > ideal * 2 ? '#FF5A3C' : gap > ideal * 1.4 ? '#FFC64D' : '#5FE3FF';
      c.fillRect(w - 1 - i, h - bh, 1, bh);
    }

    if (predictor) {
      const e = Math.min(1, predictor.maxError / 1.5);
      c.fillStyle = 'rgba(255,90,60,0.75)';
      c.fillRect(0, h - e * h, 2, Math.max(1, e * h));
    }
    this.set('corr', predictor ? predictor.corrections + ' corr' : '—');
  }
}

function esc(s) {
  return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
