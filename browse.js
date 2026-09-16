(function () {
  const LS_CLICKED = 'ai-readcine:clicked';
  const LS_LAST = 'ai-readcine:lastId';
  const LS_SCROLL = 'ai-readcine:listScroll';
  const MAX = 400;

  function readClicked() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS_CLICKED) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function isClicked(id) { return !!id && readClicked().includes(id); }
  function markClicked(id) {
    if (!id) return;
    let arr = readClicked().filter(x => x !== id);
    arr.unshift(id);
    if (arr.length > MAX) arr = arr.slice(0, MAX);
    try {
      localStorage.setItem(LS_CLICKED, JSON.stringify(arr));
      localStorage.setItem(LS_LAST, id);
    } catch (e) {}
  }
  function readLast() { try { return localStorage.getItem(LS_LAST) || ''; } catch (e) { return ''; } }
  function saveScroll(y) { try { localStorage.setItem(LS_SCROLL, String(Math.max(0, Math.round(y || 0)))); } catch (e) {} }
  function readScroll() {
    try {
      const n = parseInt(localStorage.getItem(LS_SCROLL) || '0', 10);
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    } catch (e) { return 0; }
  }
  function visibleItems() {
    return (typeof allUpdates !== 'undefined' ? allUpdates : []).filter(item => {
      const key = item.panelId + '-' + item.subgroupTitle;
      if (typeof subscribedSources !== 'undefined' && !subscribedSources.includes(key)) return false;
      const aud = item.audiences || ['开发'];
      if (typeof selectedAudiences !== 'undefined' && !aud.some(a => selectedAudiences.includes(a))) return false;
      return true;
    });
  }

  function updateResume() {
    const bar = document.getElementById('resumeBar');
    if (!bar) return;
    const last = readLast();
    const rows = visibleItems();
    const i = rows.findIndex(x => x.id === last);
    if (!last || i < 0) { bar.hidden = true; return; }
    const cur = rows[i];
    bar.hidden = false;
    bar.innerHTML = '';
    const a = document.createElement('button');
    a.type = 'button';
    a.className = 'resume-link';
    a.textContent = '上次看到「' + (cur.title || cur.desc || cur.id) + '」';
    a.onclick = () => {
      const el = document.querySelector('[data-update-id="' + CSS.escape(cur.id) + '"]');
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    bar.appendChild(a);
  }

  function paintList() {
    document.querySelectorAll('.feed-card[onclick]').forEach(card => {
      const m = String(card.getAttribute('onclick') || '').match(/openDetail\('([^']+)'\)/);
      if (!m) return;
      const id = m[1];
      card.setAttribute('data-update-id', id);
      card.classList.toggle('is-read', isClicked(id));
      const item = card.closest('.feed-item');
      if (item) item.setAttribute('data-update-id', id);
    });
    const last = readLast();
    if (last) {
      const el = document.querySelector('[data-update-id="' + CSS.escape(last) + '"]');
      if (el) {
        el.classList.add('is-resume');
        el.scrollIntoView({ block: 'center' });
      } else {
        const y = readScroll();
        if (y > 0) window.scrollTo(0, y);
      }
    }
    updateResume();
  }

  function ensurePager() {
    const body = document.getElementById('modal-body-content');
    if (!body) return null;
    let pager = document.getElementById('detailPager');
    if (pager) return pager;
    pager = document.createElement('div');
    pager.id = 'detailPager';
    pager.className = 'detail-pager';
    pager.innerHTML = '<button type="button" class="pager-btn" id="btnNextUpdate"><strong>下一篇</strong><span id="nextUpdateHint"></span></button>';
    body.appendChild(pager);
    pager.querySelector('#btnNextUpdate').addEventListener('click', e => {
      const id = e.currentTarget.dataset.id;
      if (id && typeof openDetail === 'function') openDetail(id);
    });
    return pager;
  }

  function fillPager(id) {
    const pager = ensurePager();
    if (!pager) return;
    const rows = visibleItems();
    const i = rows.findIndex(x => x.id === id);
    const next = i >= 0 ? rows[i + 1] : null;
    const btn = document.getElementById('btnNextUpdate');
    const hint = document.getElementById('nextUpdateHint');
    if (!btn) return;
    if (!next) {
      pager.hidden = true;
      return;
    }
    pager.hidden = false;
    btn.disabled = false;
    btn.classList.remove('is-disabled');
    btn.dataset.id = next.id;
    if (hint) hint.textContent = (isClicked(next.id) ? '已读 · ' : '未读 · ') + (next.title || next.desc || '');
  }

  function wrap() {
    if (typeof renderFeed === 'function' && !renderFeed.__browse) {
      const orig = renderFeed;
      window.renderFeed = function () {
        const r = orig.apply(this, arguments);
        requestAnimationFrame(paintList);
        return r;
      };
      window.renderFeed.__browse = true;
    }
    if (typeof openDetail === 'function' && !openDetail.__browse) {
      const orig = openDetail;
      window.openDetail = function (id) {
        markClicked(id);
        saveScroll(window.scrollY || 0);
        const r = orig.apply(this, arguments);
        fillPager(id);
        paintList();
        return r;
      };
      window.openDetail.__browse = true;
    }
  }

  function bind() {
    wrap();
    let tries = 0;
    const t = setInterval(() => {
      wrap();
      if (typeof allUpdates !== 'undefined' && allUpdates.length) {
        paintList();
        clearInterval(t);
      }
      if (++tries > 40) clearInterval(t);
    }, 200);
    let tick = 0;
    window.addEventListener('scroll', () => {
      if (document.getElementById('detail-modal')?.classList.contains('active')) return;
      if (tick) return;
      tick = requestAnimationFrame(() => {
        tick = 0;
        saveScroll(window.scrollY || 0);
      });
    }, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
