// server/scripts/plots.js
//
// Helper for hand-editing server/data/plots.json. Save the file in your
// editor before running a command that writes to it.
//
// Usage (from server/):  npm run plots -- <command> [args]
//
//   handoff <id> <owner>                    archive the current shop (if any) and start a new one
//   vacate <id>                             archive the current shop and mark the plot vacant
//   seen <id> <activity|-> [lock|-] [note]  set today's report, optionally add a comment
//   shift <zone> <dx> <dz>                  move every plot in a zone, e.g. shift lime -2 1
//   check                                   look for mistakes without changing anything
//
//   activity: vacant | wip | unclear | inactive | active     lock: locked | unlocked
//   Add --date YYYY-MM-DD to any command to use a date other than today.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = process.env.PLOTS_FILE ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/plots.json');
const ACTIVITY = ['vacant', 'wip', 'unclear', 'inactive', 'active'];
const LOCK = ['locked', 'unlocked'];
const SHOP_FIELDS = ['owner', 'shop_name', 'guild_name', 'description', 'stock', 'palette',
  'guild_color', 'primary_color', 'secondary_color'];

const args = process.argv.slice(2);
const dateFlag = args.indexOf('--date');
const DATE = dateFlag >= 0 ? args.splice(dateFlag, 2)[1] : new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
const [cmd, ...rest] = args;

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    fail(`plots.json isn't valid JSON (${e.message}). Fix it in your editor first.`);
  }
}

function save(plots) {
  fs.writeFileSync(FILE, JSON.stringify(plots, null, 2) + '\n');
}

function findPlot(plots, id) {
  return plots.find((p) => p.id === id) ?? fail(`no plot with id "${id}"`);
}

function emptyShop(owner) {
  const shop = Object.fromEntries(SHOP_FIELDS.map((f) => [f, null]));
  shop.owner = owner;
  // "[TAG] Guild Name" fills in the guild fields
  const m = owner.match(/^\[([^\]]+)\]\s*(.+)$/);
  if (m) [shop.owner, shop.guild_name] = [m[1], m[2]];
  shop.report = { activity: null, lock: null, date: DATE };
  shop.comments = [];
  return shop;
}

function archive(plot) {
  if (!plot.shop) return null;
  const { report, ...old } = plot.shop;
  plot.past_shops.push({ ...old, closed: DATE });
  plot.shop = null;
  return old.owner;
}

const commands = {
  handoff([id, ...ownerParts]) {
    const owner = ownerParts.join(' ');
    if (!id || !owner) fail('usage: handoff <id> <owner>');
    const plots = load();
    const plot = findPlot(plots, id);
    if (plot.shop?.owner === owner) fail(`${owner} already owns ${id}. Edit the shop in place instead.`);
    const elsewhere = plots.find((p) => p.shop?.owner === owner);
    const old = archive(plot);
    plot.shop = emptyShop(owner);
    save(plots);
    console.log(`${id}: ${old ? `archived ${old}, ` : ''}new shop for ${owner}. Fill in the description in plots.json.`);
    if (elsewhere) console.log(`note: ${owner} also owns ${elsewhere.id}. If they moved, run: npm run plots -- vacate ${elsewhere.id}`);
  },

  vacate([id]) {
    if (!id) fail('usage: vacate <id>');
    const plots = load();
    const plot = findPlot(plots, id);
    const old = archive(plot) ?? fail(`${id} is already vacant`);
    save(plots);
    console.log(`${id}: archived ${old}, plot is now vacant.`);
  },

  seen([id, activity, lock, ...noteParts]) {
    if (!id || !activity) fail('usage: seen <id> <activity|-> [lock|-] [note]');
    const a = activity === '-' ? null : activity.toLowerCase();
    const l = !lock || lock === '-' ? null : lock.toLowerCase();
    if (a && !ACTIVITY.includes(a)) fail(`activity must be one of: ${ACTIVITY.join(', ')}`);
    if (l && !LOCK.includes(l)) fail(`lock must be one of: ${LOCK.join(', ')}`);
    const plots = load();
    const plot = findPlot(plots, id);
    if (!plot.shop) fail(`${id} is vacant. Use handoff to add a shop first.`);
    plot.shop.report = { activity: a, lock: l, date: DATE };
    const note = noteParts.join(' ');
    if (note) plot.shop.comments.push({ date: DATE, body: note });
    save(plots);
    console.log(`${id}: ${a ?? '?'} / ${l ?? '?'} on ${DATE}${note ? `, comment added` : ''}`);
  },

  shift([zone, dx, dz]) {
    const [x, z] = [Number(dx), Number(dz)];
    if (!zone || !Number.isFinite(x) || !Number.isFinite(z)) fail('usage: shift <zone> <dx> <dz>');
    const plots = load();
    const hits = plots.filter((p) => p.id.startsWith(`${zone}-`));
    if (!hits.length) fail(`no plots in zone "${zone}"`);
    for (const p of hits) {
      p.x += x;
      p.z += z;
    }
    save(plots);
    console.log(`moved ${hits.length} ${zone} plots by ${x}, ${z}`);
  },

  check() {
    const plots = load();
    const problems = [];
    const owners = new Map();
    const ids = new Set();
    for (const p of plots) {
      if (ids.has(p.id)) problems.push(`${p.id}: duplicate id`);
      ids.add(p.id);
      if (!Array.isArray(p.past_shops)) problems.push(`${p.id}: past_shops should be a list ([] if none)`);
      if (p.shop) {
        const s = p.shop;
        if (!s.owner) problems.push(`${p.id}: current shop has no owner`);
        for (const f of SHOP_FIELDS) if (!(f in s)) problems.push(`${p.id}: shop is missing "${f}"`);
        if (!Array.isArray(s.comments)) problems.push(`${p.id}: shop.comments should be a list`);
        if (s.report?.activity && !ACTIVITY.includes(s.report.activity)) problems.push(`${p.id}: unknown activity "${s.report.activity}"`);
        if (s.report?.lock && !LOCK.includes(s.report.lock)) problems.push(`${p.id}: unknown lock "${s.report.lock}"`);
        if (owners.has(s.owner)) problems.push(`${s.owner} owns both ${owners.get(s.owner)} and ${p.id}`);
        owners.set(s.owner, p.id);
        if (p.past_shops?.some((old) => old.owner === s.owner)) {
          problems.push(`${p.id}: ${s.owner} is both the current shop and a past shop (same owner should be an in-place edit)`);
        }
      }
      for (const old of p.past_shops ?? []) {
        if (!old.closed) problems.push(`${p.id}: past shop ${old.owner} has no "closed" date`);
      }
      for (const c of [...(p.shop?.comments ?? []), ...(p.past_shops ?? []).flatMap((o) => o.comments ?? [])]) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date ?? '')) problems.push(`${p.id}: comment with bad date "${c.date}"`);
      }
    }
    if (!problems.length) return console.log(`ok: ${plots.length} plots, no problems found`);
    console.log(problems.join('\n'));
    console.log(`\n${problems.length} problem(s)`);
    process.exitCode = 1;
  },
};

(commands[cmd] ?? (() => {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 15).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
}))(rest);
