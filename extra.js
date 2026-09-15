(function () {
  const orig = window.fetch;
  window.fetch = function (url, opts) {
    const p = orig.apply(this, arguments);
    if (String(url).indexOf('data.json') === -1) return p;
    return p.then(async function (res) {
      if (!res.ok) return res;
      const data = await res.clone().json();
      let extra = { items: [] };
      try {
        const er = await orig('extra-updates.json?v=' + Date.now(), { cache: 'no-store' });
        if (er.ok) extra = await er.json();
      } catch (e) {}
      for (const item of extra.items || []) {
        const panel = (data.vendors && data.vendors.panels || []).find(function (x) { return x.id === item.panelId; });
        if (!panel || !item.row) continue;
        let sg = (panel.subgroups || []).find(function (s) { return s.title === item.subgroupTitle; });
        if (!sg) sg = (panel.subgroups || []).find(function (s) { return s.title === 'Grok Bot'; });
        if (!sg) sg = (panel.subgroups || [])[0];
        if (!sg) continue;
        sg.rows = sg.rows || [];
        const titles = {};
        sg.rows.forEach(function (r) { titles[r.title] = 1; });
        if (!titles[item.row.title]) sg.rows.unshift(item.row);
      }
      if (extra.last_fetch && data.meta) data.meta.last_fetch = extra.last_fetch;
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });
  };
})();
