// 数据驱动渲染：fetch data.json 并以统一时间线信息流形式渲染页面
let allUpdates = [];
let subscribedSources = [];
let rawVendorsData = [];
let selectedAudiences = ['开发', '产品', '通用'];

const AUDIENCE_KEY = 'selected_audiences';
const AUDIENCE_VER_KEY = 'audience_defaults_version';
const AUDIENCE_VER = '2';
const AUDIENCE_OPTIONS = ['开发', '产品', '通用'];

const PRODUCT_SUBGROUPS = new Set(['ChatGPT', 'Grok Bot']);
const GENERAL_SUBGROUPS = new Set(['ChatGPT', 'Grok Bot', 'AI 行业要闻']);
const PRODUCT_HINT = /产品经理|产品设计|原型|PRD|需求|用户研究|路线图|roadmap|figma|notion|linear|workspace|协作文档|会议纪要|用户故事|验收/;
const GENERAL_HINT = /办公|文档|会议|写作|翻译|演示|slides|邮件|总结|纪要|知识库|通用助手/;

function inferAudiences(panelId, subgroup, title, desc) {
  const text = `${subgroup || ''} ${title || ''} ${desc || ''}`;
  const set = new Set();
  if (PRODUCT_SUBGROUPS.has(subgroup) || PRODUCT_HINT.test(text)) set.add('产品');
  if (GENERAL_SUBGROUPS.has(subgroup) || GENERAL_HINT.test(text)) set.add('通用');
  if (PRODUCT_SUBGROUPS.has(subgroup) || GENERAL_SUBGROUPS.has(subgroup)) set.add('开发');
  if (panelId === 'industry') {
    set.add('开发');
    set.add('产品');
    set.add('通用');
  }
  if (set.size === 0) set.add('开发');
  else if (!PRODUCT_SUBGROUPS.has(subgroup) && panelId !== 'industry' && !GENERAL_SUBGROUPS.has(subgroup)) {
    set.add('开发');
  }
  return [...set];
}

function loadAudiences() {
  const ver = localStorage.getItem(AUDIENCE_VER_KEY);
  if (ver !== AUDIENCE_VER) {
    selectedAudiences = ['开发', '产品', '通用'];
    localStorage.setItem(AUDIENCE_KEY, JSON.stringify(selectedAudiences));
    localStorage.setItem(AUDIENCE_VER_KEY, AUDIENCE_VER);
    return;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIENCE_KEY) || '[]');
    selectedAudiences = AUDIENCE_OPTIONS.filter(a => saved.includes(a));
    if (!selectedAudiences.length) selectedAudiences = ['开发', '产品', '通用'];
  } catch (e) {
    selectedAudiences = ['开发', '产品', '通用'];
  }
}

function saveAudiences() {
  localStorage.setItem(AUDIENCE_KEY, JSON.stringify(selectedAudiences));
  localStorage.setItem(AUDIENCE_VER_KEY, AUDIENCE_VER);
}

function renderAudienceBar() {
  document.querySelectorAll('.audience-chip').forEach(btn => {
    const a = btn.getAttribute('data-audience');
    btn.classList.toggle('active', selectedAudiences.includes(a));
  });
}

function bindAudienceBar() {
  const bar = document.getElementById('audience-bar');
  if (!bar || bar.dataset.bound) return;
  bar.dataset.bound = '1';
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('.audience-chip');
    if (!btn) return;
    const a = btn.getAttribute('data-audience');
    if (selectedAudiences.includes(a)) {
      if (selectedAudiences.length === 1) return;
      selectedAudiences = selectedAudiences.filter(x => x !== a);
    } else {
      selectedAudiences = AUDIENCE_OPTIONS.filter(x => x === a || selectedAudiences.includes(x));
    }
    saveAudiences();
    renderAudienceBar();
    renderFeed();
  });
}

// 「自定义订阅」面板里的置顶顺序
const PANEL_ORDER = ['xai', 'industry', 'openai', 'google', 'cursor', 'anthropic', 'leaderboards', 'opensource_agents', 'opencode', 'command_code'];
// 首屏默认只点亮站长日常在用的产品线（按产品线精确勾选，不整组面板全选）
const DEFAULT_SUBSCRIBED_LINES = [
  ['xai', 'Grok CLI'],
  ['xai', 'Grok Bot'],
  ['openai', 'ChatGPT'],
  ['google', 'Antigravity 2.0'], // 桌面 GUI Agent，不是 IDE
  ['industry', 'AI 行业要闻'],
  ['command_code', 'Command Code'],
];
// 曾经默认勾过、现已撤下的产品线（升版本时从订阅里摘掉一次）
const REMOVED_DEFAULT_LINES = [
  ['google', 'Antigravity CLI'],
  ['google', 'Antigravity IDE'],
];
const DEFAULTS_VERSION = '5';

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function logoImg(domain, cls) {
  const name = esc(domain.split('.')[0]);
  const localUrl = `assets/logos/${name}.svg`;
  const fallbackUrl = `https://www.google.com/s2/favicons?sz=64&domain=${esc(domain)}`;
  return `<img class="${cls}" src="${localUrl}" alt="" loading="lazy" onerror="if(this.src!=='${fallbackUrl}'){this.src='${fallbackUrl}';}else{this.style.visibility='hidden';}">`;
}

function chip(text, cls) {
  return `<span class="chip ${esc(cls || '')}">${esc(text)}</span>`;
}

function renderFeed() {
  const container = document.getElementById('feed-container');
  if (!container) return;

  const filtered = allUpdates.filter(item => {
    const key = `${item.panelId}-${item.subgroupTitle}`;
    if (!subscribedSources.includes(key)) return false;
    const aud = item.audiences || ['开发'];
    if (!aud.some(a => selectedAudiences.includes(a))) return false;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 60px 20px;">
        <p style="margin-bottom: 16px; color: var(--ink-dim);">当前岗位频道下没有已订阅工具的更新</p>
        <button class="settings-trigger-btn" style="margin: 0 auto;" onclick="openSettings()">
          自定义订阅
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(item => {
    const typeHtml = item.typeChips.map(c => chip(c.text, c.class)).join(' ');
    const audHtml = (item.audiences || []).map(a => chip(a, 'chip-audience')).join(' ');
    const chipsHtml = `${typeHtml} ${audHtml}`;
    return `
      <div class="feed-item">
        <div class="feed-marker"><div class="feed-dot"></div></div>
        <div class="feed-card" onclick="openDetail('${esc(item.id)}')">
          <div class="feed-header">
            <div class="feed-tool">
              ${logoImg(item.logoDomain, 'tool-logo')}
              <span class="tool-name">${esc(item.panelName)}</span>
              <span class="tool-subgroup">${esc(item.subgroupTitle)}</span>
            </div>
            <div class="feed-date">${esc(item.when)}</div>
          </div>
          ${item.title ? `<h3 class="feed-title">${esc(item.title)}</h3>` : ''}
          <p class="feed-desc">${esc(item.desc)}</p>
          <div class="feed-footer">
            <div class="feed-chips">${chipsHtml}</div>
            <span class="feed-more-btn">→</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function main() {
  const res = await fetch('data.json?v=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('data.json 加载失败：' + res.status);
  const data = await res.json();

  // Keep a reference to raw vendor panels for subscription panel rendering
  rawVendorsData = data.vendors.panels;

  // Load subscription settings
  const saved = localStorage.getItem('subscribed_sources');
  if (saved) {
    try {
      subscribedSources = JSON.parse(saved);
    } catch (e) {
      subscribedSources = [];
    }
  }
  
  // 读取用户手调取消的黑名单（若有）
  let unsubscribed = [];
  try {
    unsubscribed = JSON.parse(localStorage.getItem('unsubscribed_sources') || '[]');
  } catch(e) { unsubscribed = []; }

  // 默认只勾选 DEFAULT_SUBSCRIBED_LINES；老用户不会被整组面板强行补回
  function ensureDefaultLines(list) {
    for (const [panelId, title] of DEFAULT_SUBSCRIBED_LINES) {
      const panel = rawVendorsData.find(p => p.id === panelId);
      const hit = ((panel && panel.subgroups) || []).find(s => s.title === title);
      const key = `${panelId}-${title}`;
      if (hit && !list.includes(key) && !unsubscribed.includes(key)) list.push(key);
    }
    return list;
  }

  // 默认清单变更时，撤下已废弃的默认项（例如 Antigravity CLI）
  const savedDefaultsVer = localStorage.getItem('subscribed_defaults_version');
  if (savedDefaultsVer !== DEFAULTS_VERSION) {
    for (const [panelId, title] of REMOVED_DEFAULT_LINES) {
      const key = `${panelId}-${title}`;
      subscribedSources = subscribedSources.filter(s => s !== key);
      if (!unsubscribed.includes(key)) unsubscribed.push(key);
    }
    localStorage.setItem('unsubscribed_sources', JSON.stringify(unsubscribed));
    localStorage.setItem('subscribed_defaults_version', DEFAULTS_VERSION);
  }

  if (!saved || !Array.isArray(subscribedSources) || subscribedSources.length === 0) {
    subscribedSources = ensureDefaultLines([]);
  } else {
    // 仅补齐新增的默认产品线（例如刚加的 Grok Bot），不回填整组 Anthropic/榜单等
    subscribedSources = ensureDefaultLines(subscribedSources);
  }
  localStorage.setItem('subscribed_sources', JSON.stringify(subscribedSources));

  // Aggregate all updates from data
  allUpdates = [];
  for (const panel of data.vendors.panels) {
    for (const sg of panel.subgroups) {
      for (const row of sg.rows) {
        allUpdates.push({
          panelId: panel.id,
          panelName: panel.name,
          logoDomain: panel.logo_domain,
          subgroupTitle: sg.title || panel.name,
          subgroupLink: row.link || sg.link,
          subgroupLinkText: sg.link_text,
          badge: panel.badge,
          when: row.when,
          title: row.title || '',
          desc: row.desc,
          detail: row.detail || '',
          typeChips: row.type_chips || [],
          audiences: inferAudiences(panel.id, sg.title || panel.name, row.title || '', row.desc || '')
        });
      }
    }
  }

  // Sort by date descending
  allUpdates.sort((a, b) => b.when.localeCompare(a.when));

  // 同标题只保留最新一条（采集可能把同一更新写进多行）
  const seenTitles = new Set();
  allUpdates = allUpdates.filter((item) => {
    const key = (item.title || '').trim().toLowerCase();
    if (!key) return true;
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });

  // Assign stable IDs based on sorted position
  allUpdates.forEach((item, index) => {
    item.id = `${item.panelId}-${item.when}-${index}`;
  });

  // Set meta details
  const lastFetchEl = document.getElementById('last-fetch-time');
  if (lastFetchEl) lastFetchEl.textContent = data.meta.last_fetch;

  loadAudiences();
  bindAudienceBar();
  renderAudienceBar();

  // Render initial feed
  renderFeed();

  // Detail Modal functions
  window.openDetail = function(id) {
    const item = allUpdates.find(u => u.id === id);
    if (!item) return;

    // Set hash
    location.hash = `/update/${id}`;

    const modal = document.getElementById('detail-modal');
    const body = document.getElementById('modal-body-content');
    if (!modal || !body) return;

    const typeHtml = item.typeChips.map(c => chip(c.text, c.class)).join(' ');
    const audHtml = (item.audiences || []).map(a => chip(a, 'chip-audience')).join(' ');
    const chipsHtml = `${typeHtml} ${audHtml}`;
    const actionButtonHtml = item.subgroupLink 
      ? `<a class="modal-action-btn" href="${esc(item.subgroupLink)}" target="_blank" rel="noopener">查看官方原始链接 ↗</a>` 
      : '';

    body.innerHTML = `
      <div class="modal-tool">
        ${logoImg(item.logoDomain, 'tool-logo')}
        <span class="tool-name">${esc(item.panelName)}</span>
        <span class="tool-subgroup">${esc(item.subgroupTitle)}</span>
      </div>
      <div class="modal-meta">
        <div class="modal-date">${esc(item.when)}</div>
        <div class="modal-chips">${chipsHtml}</div>
      </div>
      <h2 class="modal-title">${esc(item.title)}</h2>
      <div class="modal-desc">${window.marked ? marked.parse(item.detail || item.desc) : esc(item.desc)}</div>
      ${actionButtonHtml}
    `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Lock background scrolling
  };

  window.closeDetail = function() {
    const modal = document.getElementById('detail-modal');
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = ''; // Unlock background scrolling
    
    // Clean hash without reloading
    if (location.hash.startsWith('#/update/')) {
      history.replaceState(null, null, ' ');
    }
  };

  // Subscription Settings panel functions
  window.openSettings = function() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    renderSettingsList();
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  window.closeSettings = function() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  function renderSettingsList() {
    const container = document.getElementById('settings-list');
    if (!container) return;

    // 常看的几家排最前，其余保持 data.json 原顺序（sort 稳定）
    const ordered = [...rawVendorsData].sort((a, b) => {
      const ia = PANEL_ORDER.indexOf(a.id);
      const ib = PANEL_ORDER.indexOf(b.id);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    container.innerHTML = ordered.map(panel => {
      const chipsHtml = panel.subgroups.map(sg => {
        const key = `${panel.id}-${sg.title}`;
        const active = subscribedSources.includes(key);
        const activeClass = active ? 'active' : '';
        const intro = sg.footnote || `追踪 ${esc(panel.name)} - ${esc(sg.title)} 的更新日志`;
        return `
          <button class="settings-chip ${activeClass}" 
                  onmouseenter="showSettingInfo('${esc(intro)}')" 
                  onmouseleave="clearSettingInfo()"
                  onclick="toggleSubscription('${esc(key)}', ${!active})">
            ${esc(sg.title)}
          </button>
        `;
      }).join('');

      return `
        <div class="settings-group">
          <div class="settings-group-title">${esc(panel.name)}</div>
          <div class="settings-chips-row">${chipsHtml}</div>
        </div>
      `;
    }).join('');
  }

  window.showSettingInfo = function(text) {
    const el = document.getElementById('settings-hover-info');
    if (el) el.textContent = text;
  };

  window.clearSettingInfo = function() {
    const el = document.getElementById('settings-hover-info');
    if (el) el.textContent = '鼠标悬停于任一频道上以查看其追踪内容...';
  };

  window.toggleSubscription = function(key, isChecked) {
    let unsubscribed = [];
    try { unsubscribed = JSON.parse(localStorage.getItem('unsubscribed_sources') || '[]'); } catch(e) { unsubscribed = []; }

    if (isChecked) {
      if (!subscribedSources.includes(key)) {
        subscribedSources.push(key);
      }
      unsubscribed = unsubscribed.filter(s => s !== key);
    } else {
      subscribedSources = subscribedSources.filter(s => s !== key);
      if (!unsubscribed.includes(key)) {
        unsubscribed.push(key);
      }
    }
    localStorage.setItem('subscribed_sources', JSON.stringify(subscribedSources));
    localStorage.setItem('unsubscribed_sources', JSON.stringify(unsubscribed));
    renderSettingsList();
    renderFeed();
  };

  window.subscribeAll = function(shouldSubscribeAll) {
    if (shouldSubscribeAll) {
      subscribedSources = [];
      rawVendorsData.forEach(panel => {
        panel.subgroups.forEach(sg => {
          subscribedSources.push(`${panel.id}-${sg.title}`);
        });
      });
    } else {
      subscribedSources = [];
    }
    localStorage.setItem('subscribed_sources', JSON.stringify(subscribedSources));
    renderSettingsList();
    renderFeed();
  };

  // Bind close buttons and escape key listeners
  const closeBtn = document.getElementById('modal-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', window.closeDetail);
  }
  
  const modalEl = document.getElementById('detail-modal');
  if (modalEl) {
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) {
        window.closeDetail();
      }
    });
  }

  const openSettingsBtn = document.getElementById('open-settings-btn');
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', window.openSettings);
  }

  const closeSettingsBtn = document.getElementById('settings-close-btn');
  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', window.closeSettings);
  }

  const settingsModalEl = document.getElementById('settings-modal');
  if (settingsModalEl) {
    settingsModalEl.addEventListener('click', (e) => {
      if (e.target === settingsModalEl) {
        window.closeSettings();
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.closeDetail();
      window.closeSettings();
    }
  });

  // Routing based on hash
  function handleRoute() {
    const hash = location.hash;
    if (hash === '#pricing') {
      window.switchView('pricing');
      return;
    }
    if (hash.startsWith('#/update/')) {
      const id = hash.replace('#/update/', '');
      window.openDetail(id);
    } else {
      window.closeDetail();
    }
  }

  window.addEventListener('hashchange', handleRoute);
  
  // Call route handler on initial load in case page was loaded with hash
  handleRoute();

  setupPullToRefresh();
}

function setupPullToRefresh() {
  const indicator = document.getElementById('ptr-indicator');
  if (!indicator) return;

  let startY = 0;
  let pulling = false;
  let armed = false;
  let refreshing = false;
  const THRESHOLD = 72;

  function setIndicator(text, visible) {
    indicator.textContent = text;
    indicator.classList.toggle('visible', !!visible);
    indicator.classList.toggle('refreshing', refreshing);
  }

  async function doRefresh() {
    if (refreshing) return;
    refreshing = true;
    setIndicator('刷新中…', true);
    try {
      // bust cache and reload page data
      const res = await fetch('data.json?v=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('data.json ' + res.status);
      // soft reload keeps it simple and re-runs subscription logic
      location.reload();
    } catch (err) {
      refreshing = false;
      setIndicator('刷新失败，松手重试', true);
      setTimeout(() => setIndicator('', false), 1600);
    }
  }

  window.addEventListener('touchstart', (e) => {
    if (refreshing) return;
    if (window.scrollY > 2) return;
    if (document.getElementById('detail-modal')?.classList.contains('active')) return;
    if (document.getElementById('settings-modal')?.classList.contains('active')) return;
    startY = e.touches[0].clientY;
    pulling = true;
    armed = false;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!pulling || refreshing) return;
    const dy = e.touches[0].clientY - startY;
    if (dy < 8 || window.scrollY > 2) {
      setIndicator('', false);
      return;
    }
    const progress = Math.min(dy, 120);
    indicator.style.setProperty('--ptr-pull', progress + 'px');
    if (dy >= THRESHOLD) {
      armed = true;
      setIndicator('松开刷新', true);
    } else {
      armed = false;
      setIndicator('下拉刷新', true);
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    if (armed && !refreshing) {
      doRefresh();
    } else {
      setIndicator('', false);
      indicator.style.removeProperty('--ptr-pull');
    }
  }, { passive: true });

  // desktop: double-click masthead eyebrow / title area also refreshes
  const mast = document.querySelector('.masthead');
  if (mast) {
    mast.addEventListener('dblclick', () => { if (!refreshing) doRefresh(); });
  }
}


main().catch(err => {
  console.error(err);
  const container = document.getElementById('feed-container');
  if (container) {
    container.innerHTML = `<div class="empty-state" style="color:var(--alert-red);">数据加载失败，请刷新重试：${esc(err.message)}</div>`;
  }
});
