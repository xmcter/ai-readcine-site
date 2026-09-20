#!/usr/bin/env node
// Guards the feed data before it reaches ai.readcine.com.
//
// extra.js merges extra-updates.json into data.json in the browser and silently
// skips any item whose panelId is absent, so a typo there deletes content with no
// visible error. The quicknav in data.json drives the header links; an anchor that
// matches neither a panel id nor a view handled by app.js is a dead link.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (name) => JSON.parse(readFileSync(join(ROOT, name), "utf8"));

const data = readJson("data.json");
const extra = readJson("extra-updates.json");
const app = readFileSync(join(ROOT, "app.js"), "utf8");

const panels = data?.vendors?.panels ?? [];
const errors = [];
const warnings = [];

const seenIds = new Set();
let repeatTitles = 0;
for (const panel of panels) {
  if (!panel.id) {
    errors.push("a panel is missing its id");
  } else if (seenIds.has(panel.id)) {
    errors.push(`duplicate panel id: ${panel.id}`);
  } else {
    seenIds.add(panel.id);
  }
  for (const subgroup of panel.subgroups ?? []) {
    const titles = new Set();
    for (const row of subgroup.rows ?? []) {
      if (!row.title || !row.when) {
        errors.push(`row without title/when in ${panel.id} / ${subgroup.title}`);
        continue;
      }
      if (titles.has(row.title)) repeatTitles++;
      titles.add(row.title);
    }
  }
}
if (repeatTitles) {
  warnings.push(
    `${repeatTitles} row(s) share a title with another row in the same subgroup ` +
      `(same upstream update summarised more than once)`,
  );
}

// Anchors app.js handles itself (e.g. #pricing switches to the pricing view).
const appViews = new Set(
  [...app.matchAll(/hash\s*===\s*['"]#([\w-]+)['"]/g)].map((m) => m[1]),
);
for (const nav of data.quicknav ?? []) {
  const target = String(nav.href ?? "").replace(/^#/, "");
  if (target && !seenIds.has(target) && !appViews.has(target)) {
    errors.push(`quicknav "${nav.label}" points at #${target}, which has no panel or view`);
  }
}

for (const item of extra.items ?? []) {
  const panel = panels.find((p) => p.id === item.panelId);
  if (!panel) {
    errors.push(`extra item "${item.row?.title}" uses unknown panelId: ${item.panelId}`);
    continue;
  }
  const hasSubgroup = (panel.subgroups ?? []).some((s) => s.title === item.subgroupTitle);
  if (!hasSubgroup) {
    warnings.push(
      `extra item "${item.row?.title}" subgroup "${item.subgroupTitle}" missing in ${item.panelId}; ` +
        `extra.js falls back to Grok Bot / first subgroup`,
    );
  }
}

const rowCount = panels.reduce(
  (n, p) => n + (p.subgroups ?? []).reduce((m, s) => m + (s.rows ?? []).length, 0),
  0,
);

for (const warning of warnings) console.warn(`warn: ${warning}`);

if (errors.length) {
  for (const error of errors) console.error(`error: ${error}`);
  process.exit(1);
}

console.log(
  `ok: ${panels.length} panels, ${rowCount} rows, ${extra.items?.length ?? 0} extra items ` +
    `(last_fetch ${data.meta?.last_fetch}, extras ${extra.last_fetch})`,
);
