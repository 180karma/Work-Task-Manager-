(function(){
'use strict';

/* ================= connection =================
   URL and anon key are injected by js/config.js (generated from .env). */
const injected = window.WTM_CONFIG || {};
const CONFIG = { url: injected.url || '', anonKey: injected.anonKey || '', invoicesUrl: injected.invoicesUrl || '' };

/* ================= utilities ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
const pad4 = n => String(n).padStart(4, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOfTs = ts => dayKey(new Date(ts));
const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return dayKey(d); };
const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const ms = v => v == null ? null : (typeof v === 'number' ? v : Date.parse(v));
function fmtDay(s, wd = true) {
  if (!isDay(s)) return '';
  const d = parseDay(s), o = { day: 'numeric', month: 'short' };
  if (wd) o.weekday = 'short';
  if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return d.toLocaleDateString(undefined, o);
}
const fmtTime = ts => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function fmtWhen(ts) {
  const d = dayOfTs(ts), t = dayKey();
  if (d === t) return fmtTime(ts);
  if (d === addDays(t, -1)) return 'Yesterday';
  if (Date.now() - ts < 6 * 864e5) return new Date(ts).toLocaleDateString(undefined, { weekday: 'short' });
  return fmtDay(d, false);
}
function fmtDur(v) {
  if (v == null || isNaN(v)) return '';
  const m = Math.floor(v / 60000);
  if (m < 1) return v > 0 ? '<1m' : '0m';
  const h = Math.floor(m / 60);
  return h ? `${h}h ${pad(m % 60)}m` : `${m}m`;
}
function dueLabel(s) { const t = dayKey(); if (s === t) return 'Today'; if (s === addDays(t, 1)) return 'Tomorrow'; if (s === addDays(t, -1)) return 'Yesterday'; return fmtDay(s); }
function stamp() { const d = new Date(); return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} ${fmtTime(d)}`; }
const people = n => `${n} ${n === 1 ? 'person' : 'people'}`;
const trunc = (s, n) => (s = String(s || '')).length > n ? s.slice(0, n - 1) + '…' : s;
const cmpStr = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
const escRx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const debounce = (fn, wait) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; };
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  json(k) { const r = this.get(k); if (!r) return null; try { return JSON.parse(r); } catch (e) { return null; } }
};
const COLORS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
function hashColor(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }
const I = {
  check: '<svg class="ico" viewBox="0 0 24 24"><path d="M5 12.5 9.5 17 19 7.5"/></svg>',
  close: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  up: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  back: '<svg class="ico" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  person: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/></svg>',
  people: '<svg class="ico" viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.3c1.7.6 2.8 2.2 3.1 4.7"/></svg>',
  dept: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 20V8l8-4 8 4v12M9 20v-6h6v6M4 20h16"/></svg>',
  wrench: '<svg class="ico" viewBox="0 0 24 24"><path d="M14.7 6.3a3.5 3.5 0 0 0-4.6 4.6L4.5 16.5 7.5 19.5l5.6-5.6a3.5 3.5 0 0 0 4.6-4.6L15.2 11.8 12.2 8.8l2.5-2.5Z"/></svg>',
  bell: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 16.5h12l-1.2-2V10a4.8 4.8 0 0 0-9.6 0v4.5L6 16.5Z"/><path d="M10 16.5a2 2 0 0 0 4 0"/></svg>',
  spark: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 3.5 13.4 9 19 10.5 13.4 12 12 17.5 10.6 12 5 10.5 10.6 9 12 3.5Z"/><path d="M18 15.5 18.7 17.5 20.7 18.2 18.7 18.9 18 20.9 17.3 18.9 15.3 18.2 17.3 17.5 18 15.5Z"/></svg>',
  monitor: '<svg class="ico" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="12" rx="2"/><path d="M8 20h8M12 16.5V20"/></svg>',
  utensils: '<svg class="ico" viewBox="0 0 24 24"><path d="M8 3.5v7a2 2 0 0 1-2 2H6v8M8 3.5v6M5 3.5v6M18 3.5c1.4 2 2 4 2 6.2 0 1.6-1 2.8-2.4 2.8H17V20.5"/></svg>',
  glass: '<svg class="ico" viewBox="0 0 24 24"><path d="M8 3.5h8l-1 7.2a3.2 3.2 0 0 1-6 0L8 3.5Z"/><path d="M12 13.7V20.5M9 20.5h6"/></svg>',
  shield: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 3.5 19 6.2v5.4c0 4.2-2.8 7.2-7 8.9-4.2-1.7-7-4.7-7-8.9V6.2L12 3.5Z"/></svg>',
  leaf: '<svg class="ico" viewBox="0 0 24 24"><path d="M5 19.5C5 11 11 4.5 20 4.5 19.5 14 13 19.5 5 19.5Z"/><path d="M9 15.5c2-2 4.2-3.6 7-5"/></svg>',
  wave: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 8.5c1.6 1.4 3.2 1.4 4.8 0s3.2-1.4 4.8 0 3.2 1.4 4.8 0 3.2-1.4 4.6 0"/><path d="M3 14.5c1.6 1.4 3.2 1.4 4.8 0s3.2-1.4 4.8 0 3.2 1.4 4.8 0 3.2-1.4 4.6 0"/></svg>',
  coin: '<svg class="ico" viewBox="0 0 24 24"><ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/></svg>',
  bed: '<svg class="ico" viewBox="0 0 24 24"><path d="M3.5 18.5V8M3.5 14h17v4.5M20.5 14V10.5a2 2 0 0 0-2-2H11v5.5"/><circle cx="7.5" cy="11" r="1.3"/></svg>',
  cal: '<svg class="ico" viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
  flag: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 21V4M6 4.5h11l-2 4 2 4H6"/></svg>',
  pin: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  hash: '<svg class="ico" viewBox="0 0 24 24"><path d="M9 4 7 20M17 4l-2 16M4.5 9h15M3.5 15h15"/></svg>',
  folder: '<svg class="ico" viewBox="0 0 24 24"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/></svg>',
  more: '<svg class="ico" viewBox="0 0 24 24"><path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"/></svg>',
  plus: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  msg: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 5.5h16v10H9l-5 4v-14Z"/></svg>',
  send: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 12 20 4l-5 16-3-7-8-1Z"/></svg>',
  link: '<svg class="ico" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  task: '<svg class="ico" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>',
  trade: '<svg class="ico" viewBox="0 0 24 24"><path d="M14.7 6.3a3.5 3.5 0 0 0-4.6 4.6L4.5 16.5 7.5 19.5l5.6-5.6a3.5 3.5 0 0 0 4.6-4.6L15.2 11.8 12.2 8.8l2.5-2.5Z"/></svg>',
  camera: '<svg class="ico" viewBox="0 0 24 24"><path d="M8.2 7.2 9.4 5.2h5.2l1.2 2h2.7a1.8 1.8 0 0 1 1.8 1.8v8.2a1.8 1.8 0 0 1-1.8 1.8H5.5a1.8 1.8 0 0 1-1.8-1.8V9a1.8 1.8 0 0 1 1.8-1.8h2.7Z"/><circle cx="12" cy="13" r="3.1"/></svg>'
};
const icon = (k, style) => style ? (I[k] || I.dept).replace('class="ico"', `class="ico" style="${style}"`) : (I[k] || I.dept);
const DEPT_ICONS = ['wrench', 'bell', 'spark', 'monitor', 'utensils', 'glass', 'shield', 'leaf', 'wave', 'coin', 'bed', 'dept'];
const DEPT_ICON_LABEL = { wrench: 'Tools', bell: 'Front desk', spark: 'Housekeeping', monitor: 'Computers', utensils: 'Kitchen', glass: 'Bar', shield: 'Security', leaf: 'Grounds', wave: 'Pool', coin: 'Accounts', bed: 'Rooms', dept: 'Building' };
function guessDeptIcon(d) {
  const s = (((d && d.name) || '') + ' ' + ((d && d.code) || '')).toLowerCase();
  if (/\b(maint|mnt|engineer|repair|handy)\b/.test(s)) return 'wrench';
  if (/\b(front|desk|fd|recept|concierge)\b/.test(s)) return 'bell';
  if (/\b(house|clean|hk|cln|laundry|linen)\b/.test(s)) return 'spark';
  if (/\b(it|tech|computer|network|ict)\b/.test(s)) return 'monitor';
  if (/\b(kitchen|chef|food|cook)\b/.test(s)) return 'utensils';
  if (/\b(bar|beverage)\b/.test(s)) return 'glass';
  if (/\b(security|guard)\b/.test(s)) return 'shield';
  if (/\b(garden|ground|landscape)\b/.test(s)) return 'leaf';
  if (/\b(pool|spa|swim)\b/.test(s)) return 'wave';
  if (/\b(account|finance|payroll)\b/.test(s)) return 'coin';
  if (/\b(room|rooms)\b/.test(s)) return 'bed';
  return 'dept';
}
const DEPT_PASTEL = { c1: 'd1', c2: 'd2', c3: 'd3', c4: 'd4', c5: 'd5', c6: 'd6', c7: 'd7', c8: 'd8' };
function deptLook(d) {
  const key = d && d.icon && I[d.icon] ? d.icon : guessDeptIcon(d);
  return { icon: key, color: DEPT_PASTEL[(d && d.color) || 'c1'] || 'd1' };
}
function deptChipHtml(d, text) {
  const L = deptLook(d);
  return `<span class="tchip dept" style="--pc:var(--${esc(L.color)})">${icon(L.icon)}${esc(text != null ? text : (d ? d.name : 'Department'))}</span>`;
}
function deptLead(d, size) {
  const L = deptLook(d);
  const box = size ? `;width:${size}px;height:${size}px` : '';
  return `<span class="cicon" style="--pc:var(--${esc(L.color)})${box}">${icon(L.icon)}</span>`;
}

/* ================= vocabulary ================= */
const ROLE = { it: { label: 'IT', rank: 4 }, admin: { label: 'Admin', rank: 3 }, supervisor: { label: 'Supervisor', rank: 2 }, staff: { label: 'Staff', rank: 1 } };
const rankOf = r => (ROLE[r] || { rank: 0 }).rank;
const STATUS = { todo: 'To do', doing: 'In progress', blocked: 'Blocked', done: 'Done' };
const PRIO = { 1: 'Critical', 2: 'High', 3: 'Normal', 4: 'Low' };
const ACTIONS = {
  created:  { label: 'Created',       cat: 'task',  tone: 'accent' },
  edited:   { label: 'Edited',        cat: 'task',  tone: 'muted' },
  status:   { label: 'Status',        cat: 'task',  tone: 'info' },
  deleted:  { label: 'Deleted',       cat: 'task',  tone: 'danger' },
  restored: { label: 'Restored',      cat: 'task',  tone: 'accent' },
  done:     { label: 'Completed',     cat: 'done',  tone: 'accent' },
  reopened: { label: 'Reopened',      cat: 'done',  tone: 'info' },
  start:    { label: 'Timer started', cat: 'time',  tone: 'signal' },
  stop:     { label: 'Timer stopped', cat: 'time',  tone: 'signal' },
  time:     { label: 'Time added',    cat: 'time',  tone: 'signal' },
  note:     { label: 'Note',          cat: 'note',  tone: 'ink' },
  message:  { label: 'Message',       cat: 'msg',   tone: 'info' },
  notice:   { label: 'Notice',        cat: 'note',  tone: 'ink' },
  daily:    { label: 'Daily task',    cat: 'task',  tone: 'accent' },
  order:    { label: 'Order',         cat: 'task',  tone: 'info' },
  check:    { label: 'Checklist',     cat: 'task',  tone: 'accent' },
  slip:     { label: 'Needs attention', cat: 'task', tone: 'danger' },
  user:     { label: 'Login',         cat: 'admin', tone: 'muted' },
  admin:    { label: 'Department',    cat: 'admin', tone: 'muted' },
  group:    { label: 'Group',         cat: 'admin', tone: 'muted' },
  project:  { label: 'Project',       cat: 'admin', tone: 'muted' },
  setting:  { label: 'Setting',       cat: 'admin', tone: 'muted' },
  calendar: { label: 'Calendar',      cat: 'admin', tone: 'muted' }
};
const CATS = [['task', 'Task changes', 'info'], ['done', 'Completions', 'accent'], ['time', 'Time', 'signal'], ['note', 'Notes', 'ink'], ['msg', 'Messages', 'info'], ['admin', 'Admin', 'muted']];
const actionOf = a => ACTIONS[a] || { label: a, cat: 'admin', tone: 'muted' };
const TRADES = [['plumber', 'Plumber'], ['electrician', 'Electrician'], ['carpenter', 'Carpenter'], ['painter', 'Painter'], ['locksmith', 'Locksmith'], ['hvac', 'HVAC'], ['glazier', 'Glazier'], ['appliance', 'Appliance'], ['grounds', 'Grounds'], ['handyman', 'Handyman']];
const tradeSlug = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const tradeLabel = slug => { const hit = TRADES.find(t => t[0] === slug); return hit ? hit[1] : String(slug || '').replace(/-/g, ' '); };

/* ================= state ================= */
const D = {
  ready: false, me: null, rank: 0,
  profiles: new Map(), depts: new Map(), groups: new Map(), projects: new Map(), rooms: [], rules: [],
  locations: new Map(), maps: new Map(),
  dm: { byDept: new Map(), byUser: new Map() }, gm: { byGroup: new Map(), byUser: new Map() },
  heads: new Map(), tagDepts: new Map(),
  tasks: new Map(), log: new Map(), msgs: new Map(), notices: new Map(), orders: new Map(), daily: new Map(), calendar: new Map(), reads: {},
  skew: 0, since: null, logMax: 0, msgMax: 0, logMin: Infinity, logComplete: false,
  live: false, saving: 0, dirVersion: 0
};
const now = () => Date.now() + D.skew;
const TP = Object.assign({ tab: 'open', q: '', scope: 'mine', sort: 'smart', dir: 1, trade: '', room: '' }, LS.json('wtm.tasks.v2') || {});
const LP = Object.assign({ q: '', range: 'all', from: '', to: '', person: '', dept: '', group: 'day', cats: [], sort: [{ k: 'n', d: -1 }], ctl: false }, LS.json('wtm.log.v2') || {});
const PP = Object.assign({ tab: 'people', q: '', dept: '', role: '' }, LS.json('wtm.people.v2') || {});
TP.q = ''; LP.q = ''; PP.q = '';
const saveTP = () => LS.set('wtm.tasks.v2', JSON.stringify(TP));
const saveLP = () => LS.set('wtm.log.v2', JSON.stringify(LP));
const savePP = () => LS.set('wtm.people.v2', JSON.stringify(PP));
const ALL_ID = '00000000-0000-0000-0000-000000000000';
const ALL_CONV = 'all:' + ALL_ID;
const OL = { q: '', tab: 'needed', task: '', deptLock: false };
const NB = { kind: 'notice' };
const DY = { q: '', dept: '' };
const UI = { view: 'tasks', conv: ALL_CONV, msgDept: '', linkTask: null, logLimit: 300, msgPin: null, msgPhotoFile: null, msgPhotoPreview: '' };
let sb = null, channel = null;

/* ================= directory helpers ================= */
const me = () => D.me ? D.me.id : null;
const prof = id => D.profiles.get(id);
const nameOf = id => { const p = prof(id); return p ? (p.full_name || p.email) : 'Someone'; };
const shortOf = id => { const p = prof(id); return p ? (p.short_name || (p.full_name || p.email).split(/\s+/)[0]) : 'Someone'; };
const whoLabel = id => id && id === me() ? 'You' : id ? nameOf(id) : '—';
function initials(p) { const n = (p && (p.full_name || p.username || p.email) || '?').trim().split(/[\s@.]+/).filter(Boolean); return ((n[0] || '?')[0] + (n.length > 1 ? n[n.length - 1][0] : '')).toUpperCase(); }
const FACES = ['😀','😄','😁','😊','😉','😎','🤓','🧐','🤠','🥳','😇','🤗','🤔','😴','😬','😤','🤯','👷','🧑‍🍳','🧑‍🔧','🧑‍💼','🧑‍💻','👮','🦸','🧙','🐱','🐶','🦊','🐻','🐼','🐸','🐧','🦄','🌸','⭐','🔥','🌊','🍀','🔧','🧹','🍳','💻','🛎️','🛏️','🏠'];
function emojiPickerHtml(id, cur) {
  const curI = FACES.indexOf(cur || '');
  return `<div class="faces" id="${id}" role="radiogroup" aria-label="Profile picture">${FACES.map((e, i) => `<button type="button" data-face="${i}" aria-pressed="${i === curI}" aria-label="Picture ${i + 1}">${e}</button>`).join('')}<button type="button" data-face="-1" aria-pressed="${curI < 0}" aria-label="Use initials">Aa</button></div>`;
}
function pickedEmoji(id) {
  const b = document.querySelector(`#${id} button[aria-pressed="true"]`);
  if (!b || b.dataset.face === '-1') return '';
  return FACES[+b.dataset.face] || '';
}
const avatar = (id, cls = '') => {
  const p = prof(id), face = p && p.emoji, photo = p && p.photo;
  const pic = photo ? `<img data-media="wtm-photos:${esc(photo)}" alt="" hidden>` : '';
  return `<span class="av ${cls}${face ? ' emoji' : ''}${photo ? ' photo' : ''}" style="--ac:var(--${hashColor(id)})" title="${esc(p ? p.full_name || p.username || p.email : '')}" aria-hidden="true">${face ? esc(face) : esc(initials(p))}${pic}</span>`;
};
const activePeople = () => Array.from(D.profiles.values()).filter(p => p.active).sort((a, b) => cmpStr(a.full_name || a.email, b.full_name || b.email));
const liveDepts = () => Array.from(D.depts.values()).filter(d => !d.archived).sort((a, b) => cmpStr(a.name, b.name));
const liveGroups = () => Array.from(D.groups.values()).filter(g => !g.archived).sort((a, b) => cmpStr(a.name, b.name));
const liveProjects = () => Array.from(D.projects.values()).filter(p => !p.archived).sort((a, b) => cmpStr(a.name, b.name));
const liveLocations = () => Array.from(D.locations.values()).filter(l => !l.archived).sort((a, b) => cmpStr(a.name, b.name));
const liveMaps = () => Array.from(D.maps.values()).filter(m => !m.archived && D.locations.get(m.location_id) && !D.locations.get(m.location_id).archived);
const deptsOf = uid => D.dm.byUser.get(uid) || new Set();
const membersOfDept = id => D.dm.byDept.get(id) || new Set();
const headsOfDept = id => D.heads.get(id) || new Set();
const headDeptsOf = uid => { const s = new Set(); for (const [d, ps] of D.heads) if (ps.has(uid)) s.add(d); return s; };
function deptForTag(tag) {
  if (!tag || !D.tagDepts) return '';
  if (tag.startsWith('trade:')) return D.tagDepts.get(tag.slice(6)) || '';
  if (tag.includes(':')) return '';
  return D.tagDepts.get(tag) || '';
}
function deptsForTags(tags) {
  const ids = [];
  for (const t of tags || []) { const id = deptForTag(t); if (id && !ids.includes(id)) ids.push(id); }
  return ids;
}
function foldTagDepts(tags, assignees, skip) {
  const next = (assignees || []).slice();
  for (const id of deptsForTags(tags)) {
    if (skip && skip.has(id)) continue;
    if (!next.some(a => a.kind === 'dept' && a.id === id)) next.push({ kind: 'dept', id });
  }
  return next;
}
const groupsOf = uid => D.gm.byUser.get(uid) || new Set();
const membersOfGroup = id => D.gm.byGroup.get(id) || new Set();
const myDepts = () => deptsOf(me());
const myGroups = () => groupsOf(me());
const canAdmin = () => D.rank >= 3;
const canSupervise = () => D.rank >= 2;
const canManage = p => p && D.rank >= 3 && (D.rank === 4 || rankOf(p.role) < 3);
const roleChoices = () => D.rank === 4 ? ['staff', 'supervisor', 'admin', 'it'] : ['staff', 'supervisor'];
const MEDIA = new Map();
function mediaUrl(bucket, path) {
  const key = bucket + '\n' + path;
  const hit = MEDIA.get(key);
  if (hit && hit.url && hit.exp > Date.now() + 20000) return Promise.resolve(hit.url);
  if (hit && hit.pending) return hit.pending;
  const pending = sb.storage.from(bucket).createSignedUrl(path, 3600).then(({ data, error }) => {
    if (error || !data || !data.signedUrl) { MEDIA.delete(key); return ''; }
    MEDIA.set(key, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
    return data.signedUrl;
  }).catch(() => { MEDIA.delete(key); return ''; });
  MEDIA.set(key, { url: '', exp: 0, pending });
  return pending;
}
function hydrateMedia(root) {
  const scope = root && root.querySelectorAll ? root : document;
  for (const img of scope.querySelectorAll('img[data-media]')) {
    const raw = img.getAttribute('data-media') || '';
    const i = raw.indexOf(':');
    if (i < 1 || img.dataset.loading === '1' || img.getAttribute('src')) continue;
    img.dataset.loading = '1';
    mediaUrl(raw.slice(0, i), raw.slice(i + 1)).then(url => {
      img.dataset.loading = '';
      if (!url || !img.isConnected) return;
      img.src = url;
      img.hidden = false;
    });
  }
}
function pinLabel(pin) {
  if (!pin) return 'Pin';
  const map = D.maps.get(pin.map_id);
  const loc = D.locations.get((map && map.location_id) || pin.location_id);
  if (loc && map) return loc.name + ' · ' + map.name;
  if (loc) return loc.name;
  return 'Pin';
}
function pinFigure(pin, cls) {
  if (!pin || !pin.map_id) return '';
  const map = D.maps.get(pin.map_id);
  if (!map || !map.image_path) return `<span class="tchip">${icon('pin')}${esc(pinLabel(pin))}</span>`;
  return `<figure class="pinfig${cls ? ' ' + cls : ''}"><img data-media="wtm-maps:${esc(map.image_path)}" alt="${esc(pinLabel(pin))}" hidden><i class="pindot" style="left:${Number(pin.x)}%;top:${Number(pin.y)}%"></i><figcaption>${esc(pinLabel(pin))}</figcaption></figure>`;
}
function shotImg(path, cls, preview) {
  const c = 'shot' + (cls ? ' ' + cls : '');
  if (preview) return `<img class="${c}" src="${esc(preview)}" alt="Photo">`;
  if (!path) return '';
  return `<img class="${c}" data-media="wtm-photos:${esc(path)}" alt="Photo" hidden>`;
}
function imageExt(file) {
  const fromType = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[file && file.type];
  if (fromType) return fromType;
  const m = /\.(jpe?g|png|webp|gif)$/i.exec((file && file.name) || '');
  if (!m) return '';
  return m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
}
function pickImageFile() {
  return new Promise(resolve => {
    let inp = $('#filePick');
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.id = 'filePick'; inp.hidden = true;
      document.body.appendChild(inp);
    }
    const done = file => { inp.onchange = null; inp.oncancel = null; resolve(file || null); };
    inp.value = '';
    inp.onchange = () => done(inp.files && inp.files[0]);
    inp.addEventListener('cancel', () => done(null), { once: true });
    inp.click();
  });
}
const IMG_PHOTO = { long: 800, short: 800, quality: 0.5, limit: 3 * 1024 * 1024 };
const IMG_MAP = { long: 3000, short: 2000, quality: 0.85, limit: 5 * 1024 * 1024 };
function decodeImage(file) {
  const viaTag = () => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
  if (!window.createImageBitmap) return viaTag();
  return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(viaTag);
}
async function shrinkImage(file, opt = IMG_PHOTO) {
  let src;
  try { src = await decodeImage(file); } catch (_) { return null; }
  const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
  if (!w || !h) return null;
  const scale = Math.min(1, opt.long / Math.max(w, h), opt.short / Math.min(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  if (src.close) src.close();
  let blob = null;
  for (let q = opt.quality; q >= 0.2; q -= 0.1) {
    blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= opt.limit) break;
  }
  if (!blob || blob.size > opt.limit) return null;
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
}
async function putImage(bucket, folder, file) {
  if (!imageExt(file) && !String(file && file.type).startsWith('image/')) { toast('Choose a photo or picture file.'); return null; }
  const small = await shrinkImage(file, bucket === 'wtm-maps' ? IMG_MAP : IMG_PHOTO);
  if (!small) { toast('That picture couldn\'t be read. Try a JPEG or PNG.'); return null; }
  const path = folder + '/' + crypto.randomUUID() + '.jpg';
  const { error } = await sb.storage.from(bucket).upload(path, small, { contentType: 'image/jpeg', upsert: false });
  if (error) { toast(error.message || 'The image didn\'t upload.'); return null; }
  return path;
}
function clearMsgAttach() {
  if (UI.msgPhotoPreview) URL.revokeObjectURL(UI.msgPhotoPreview);
  UI.msgPin = null; UI.msgPhotoFile = null; UI.msgPhotoPreview = '';
}
function attachPreview(pin, preview, mode) {
  const attr = mode === 'sheet' ? 'data-sh' : 'data-act';
  const pinClear = mode === 'sheet' ? 'nm-clear-pin' : 'msg-clear-pin';
  const photoClear = mode === 'sheet' ? 'nm-clear-photo' : 'msg-clear-photo';
  const bits = [];
  if (pin) bits.push(`<span class="dchip">${icon('pin')}<span class="lbltxt">${esc(pinLabel(pin))}</span><button type="button" class="x" ${attr}="${pinClear}" aria-label="Remove pin">${icon('close', 'width:13px;height:13px')}</button></span>`);
  if (preview) bits.push(`<span class="dchip">${shotImg('', 'sm', preview)}<span class="lbltxt">Photo</span><button type="button" class="x" ${attr}="${photoClear}" aria-label="Remove photo">${icon('close', 'width:13px;height:13px')}</button></span>`);
  return bits.join('');
}
function assigneeLabel(a) {
  if (a.kind === 'user') return nameOf(a.id);
  if (a.kind === 'dept') { const d = D.depts.get(a.id); return d ? d.name : 'Department'; }
  const g = D.groups.get(a.id); return g ? g.name : 'Group';
}
function assigneeChip(a) {
  if (a.kind === 'user') return `<span class="tchip person">${icon('person')}${esc(shortOf(a.id))}</span>`;
  if (a.kind === 'dept') return deptChipHtml(D.depts.get(a.id));
  const g = D.groups.get(a.id); return `<span class="tchip group" style="--pc:var(--${esc(g ? g.color : 'c8')})">${icon('people')}${esc(g ? g.name : 'Group')}</span>`;
}
function tagGlyph(type) {
  if (type === 'person') return 'person';
  if (type === 'room') return 'pin';
  if (type === 'dept') return 'dept';
  if (type === 'trade') return 'trade';
  return 'hash';
}
function tagInfo(t) {
  if (t.startsWith('person:')) { const id = t.slice(7); return { type: 'person', id, label: '@' + shortOf(id) }; }
  if (t.startsWith('dept:')) { const d = D.depts.get(t.slice(5)); const L = deptLook(d); return { type: 'dept', id: t.slice(5), label: d ? d.name : 'Department', color: L.color, icon: L.icon }; }
  if (t.startsWith('room:')) return { type: 'room', label: t.slice(5) };
  if (t.startsWith('trade:')) return { type: 'trade', id: t.slice(6), label: tradeLabel(t.slice(6)) };
  return { type: 'word', label: '#' + t };
}
function tagChip(t) {
  const i = tagInfo(t);
  if (i.type === 'person') return `<span class="tchip person">${icon('person')}${esc(i.label.slice(1))}</span>`;
  if (i.type === 'dept') return deptChipHtml(D.depts.get(i.id), i.label);
  if (i.type === 'room') return `<span class="tchip room" data-room="${esc(i.label)}">${icon('pin')}${esc(i.label)}</span>`;
  if (i.type === 'trade') return `<span class="tchip trade">${icon('trade')}${esc(i.label)}</span>`;
  return `<span class="tchip word">${esc(i.label)}</span>`;
}

/* ================= tasks: derived ================= */
const liveTasks = () => Array.from(D.tasks.values()).filter(t => !t.deleted_at);
function isMine(t) {
  const u = me(), md = myDepts(), mg = myGroups();
  return t.assignees.some(a => (a.kind === 'user' && a.id === u) || (a.kind === 'dept' && md.has(a.id)) || (a.kind === 'group' && mg.has(a.id)))
    || (t.created_by === u && !t.assignees.length);
}
const canDelete = t => t.created_by === me() || D.rank >= 2;
const ordersFor = id => Array.from(D.orders.values()).filter(o => o.task_id === id);
const orderLabel = s => s === 'needed' ? 'Needed' : s === 'ordered' ? 'Ordered' : 'Received';
function orderState(id) {
  const os = ordersFor(id);
  if (!os.length) return '';
  if (os.some(o => o.status === 'needed')) return 'needed';
  if (os.some(o => o.status === 'ordered')) return 'ordered';
  return 'received';
}
const hhmm = v => v ? String(v).slice(0, 5) : '';
function canWork(t) { return t.status !== 'done' && (isMine(t) || D.rank >= 2); }
function canTake(t) {
  if (!t || t.status === 'done' || t.deleted_at) return false;
  if (t.assignees.some(a => a.kind === 'user')) return false;
  const depts = t.assignees.filter(a => a.kind === 'dept');
  if (!depts.length) return false;
  return D.rank >= 2 || depts.some(a => myDepts().has(a.id));
}
function takeTask(t) {
  const assignees = t.assignees.map(a => ({ kind: a.kind, id: a.id }));
  if (!assignees.some(a => a.kind === 'user' && a.id === me())) assignees.push({ kind: 'user', id: me() });
  return act('wtm_save_task', { p: { id: t.id, status: 'doing', assignees } }, 'You took this task.');
}
function toggleChecks(id, index) {
  const t = D.tasks.get(id); if (!t || !t.checks || !t.checks[index]) return;
  const checks = t.checks.map((c, i) => ({ t: c.t, done: i === index ? !c.done : !!c.done }));
  return act('wtm_save_task', { p: { id, checks } });
}
function askBlock(anchor, onReason) {
  openPicker(anchor, {
    title: 'Why is this blocked?',
    html: `<form class="pop-foot" id="popBlock"><input class="field" id="popBlockIn" maxlength="200" placeholder="Waiting on a part, a trade, a person…" required><button class="btn sm primary" type="submit">Block</button></form>`
  });
  pop.onBlock = onReason;
  const inp = $('#popBlockIn'); if (inp) inp.focus();
}

/* ================= API ================= */
class WtmError extends Error { constructor(msg, code) { super(msg); this.code = code; } }
function toErr(e) {
  if (!e) return new WtmError('Something went wrong.', '');
  const code = e.code || '', m = e.message || String(e);
  if (/JWT|jwt|token/i.test(m) && code !== '42501') return new WtmError('Your session expired. Sign in again.', 'auth');
  if (/Failed to fetch|NetworkError|network/i.test(m)) return new WtmError("Can't reach the server. Check your connection and try again.", 'net');
  if (code === 'PGRST202' || /Could not find the function/i.test(m)) return new WtmError('The database is missing WTM\'s functions. Run schema.sql in Supabase.', 'setup');
  return new WtmError(m, code);
}
async function call(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw toErr(error);
  return data;
}
async function act(fn, args, okMsg) {
  D.saving++; renderChrome();
  try {
    const r = await call(fn, args);
    if (r && r.id && Array.isArray(r.assignees)) D.tasks.set(r.id, normTask(r));
    await sync(true);
    if (okMsg) toast(okMsg);
    return r === null || r === undefined ? true : r;
  } catch (e) {
    const err = toErr(e);
    toast(err.message, { tone: 'danger', ms: 7000 });
    if (err.code === 'auth') signOut();
    return null;
  } finally { D.saving--; renderChrome(); render(); }
}

/* ================= data ================= */
function normPin(p) {
  if (!p || !p.map_id) return null;
  const x = Number(p.x), y = Number(p.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { map_id: p.map_id, location_id: p.location_id || null, x, y };
}
function normTask(t) {
  return Object.assign({}, t, {
    due: t.due || null, due_time: t.due_time ? String(t.due_time).slice(0, 5) : null,
    tags: t.tags || [], assignees: t.assignees || [], blocked_note: t.blocked_note || '',
    checks: Array.isArray(t.checks) ? t.checks.map(c => ({ t: c.t || c.label || '', done: !!c.done })) : [],
    pin: normPin(t.pin), photo: t.photo || null,
    created_at: ms(t.created_at), updated_at: ms(t.updated_at), done_at: ms(t.done_at), deleted_at: ms(t.deleted_at)
  });
}
const normLog = e => Object.assign({}, e, { ts: ms(e.ts), day: dayOfTs(ms(e.ts)) });
const normMsg = m => Object.assign({}, m, { at: ms(m.created_at), pin: normPin(m.pin), photo: m.photo || null });
const normStamp = row => Object.assign({}, row, { created_at: ms(row.created_at), updated_at: ms(row.updated_at) });
const normDaily = d => Object.assign({}, d, {
  created_at: ms(d.created_at), updated_at: ms(d.updated_at), priority: +d.priority || 3, tags: d.tags || [], active: d.active !== false,
  weekdays: Array.isArray(d.weekdays) && d.weekdays.length ? d.weekdays.map(Number) : [0, 1, 2, 3, 4, 5, 6],
  due_time: d.due_time ? String(d.due_time).slice(0, 5) : null,
  checklist: Array.isArray(d.checklist) ? d.checklist : []
});
const normCal = c => Object.assign({}, c, {
  day: String(c.day || '').slice(0, 10), end_day: c.end_day ? String(c.end_day).slice(0, 10) : null,
  starts: c.starts ? String(c.starts).slice(0, 5) : null, notes: c.notes || '',
  created_at: ms(c.created_at), updated_at: ms(c.updated_at), deleted_at: ms(c.deleted_at)
});
function isItDept(d) {
  if (!d) return false;
  const code = String(d.code || '').trim().toLowerCase();
  const name = String(d.name || '').trim().toLowerCase();
  return code === 'it' || name === 'it' || name === 'information technology';
}
function applyDirectory(x) {
  const meRow = x.me || {};
  const seesIt = !!(meRow.active && rankOf(meRow.role) >= 3);
  const hiddenPeople = new Set((x.profiles || []).filter(p => !seesIt && p.role === 'it' && p.id !== meRow.id).map(p => p.id));
  const hiddenDepts = new Set((x.departments || []).filter(d => !seesIt && isItDept(d)).map(d => d.id));
  D.profiles = new Map((x.profiles || []).filter(p => !hiddenPeople.has(p.id)).map(p => [p.id, p]));
  D.depts = new Map((x.departments || []).filter(d => !hiddenDepts.has(d.id)).map(d => [d.id, d]));
  D.groups = new Map((x.groups || []).map(g => [g.id, g]));
  D.projects = new Map((x.projects || []).map(p => [p.id, p]));
  D.rooms = x.rooms || []; D.rules = x.tag_rules || [];
  D.locations = new Map((x.locations || []).map(l => [l.id, l]));
  D.maps = new Map((x.maps || []).map(m => [m.id, m]));
  D.dm = { byDept: new Map(), byUser: new Map() }; D.gm = { byGroup: new Map(), byUser: new Map() }; D.heads = new Map();
  for (const m of x.department_members || []) {
    if (hiddenPeople.has(m.p) || hiddenDepts.has(m.d)) continue;
    (D.dm.byDept.get(m.d) || D.dm.byDept.set(m.d, new Set()).get(m.d)).add(m.p);
    (D.dm.byUser.get(m.p) || D.dm.byUser.set(m.p, new Set()).get(m.p)).add(m.d);
    if (m.h) (D.heads.get(m.d) || D.heads.set(m.d, new Set()).get(m.d)).add(m.p);
  }
  D.tagDepts = new Map((x.tag_departments || []).filter(r => !hiddenDepts.has(r.d)).map(r => [r.tag, r.d]));
  for (const m of x.group_members || []) {
    if (hiddenPeople.has(m.p)) continue;
    (D.gm.byGroup.get(m.g) || D.gm.byGroup.set(m.g, new Set()).get(m.g)).add(m.p);
    (D.gm.byUser.get(m.p) || D.gm.byUser.set(m.p, new Set()).get(m.p)).add(m.g);
  }
  D.me = x.me; D.rank = D.me && D.me.active ? rankOf(D.me.role) : 0;
  D.dirVersion++;
}
function applyBootstrap(x) {
  applyDirectory(x);
  D.tasks = new Map((x.tasks || []).map(t => [t.id, normTask(t)]));
  D.log = new Map((x.log || []).map(e => [e.id, normLog(e)]));
  D.msgs = new Map((x.messages || []).map(m => [m.id, normMsg(m)]));
  D.reads = x.reads || {};
  D.notices = new Map((x.notices || []).map(n => [n.id, normStamp(n)]));
  D.orders = new Map((x.orders || []).map(o => [o.id, normStamp(o)]));
  D.daily = new Map((x.daily || []).map(d => [d.id, normDaily(d)]));
  D.calendar = new Map((x.calendar || []).map(c => [c.id, normCal(c)]));
  D.skew = Date.parse(x.server_time) - Date.now();
  D.since = x.server_time;
  D.logMax = Math.max(0, ...D.log.keys()); D.logMin = D.log.size ? Math.min(...D.log.keys()) : Infinity;
  D.msgMax = Math.max(0, ...D.msgs.keys());
  D.logComplete = (x.log || []).length < 2000;
  D.ready = true;
}
function applySync(x) {
  applyDirectory(x);
  for (const t of x.tasks || []) D.tasks.set(t.id, normTask(t));
  const vis = new Set(x.visible_ids || []);
  for (const id of Array.from(D.tasks.keys())) if (!vis.has(id)) D.tasks.delete(id);
  for (const e of x.log || []) { D.log.set(e.id, normLog(e)); D.logMax = Math.max(D.logMax, e.id); D.logMin = Math.min(D.logMin, e.id); }
  for (const m of x.messages || []) { D.msgs.set(m.id, normMsg(m)); D.msgMax = Math.max(D.msgMax, m.id); }
  D.reads = x.reads || D.reads;
  if (x.notices) D.notices = new Map(x.notices.map(n => [n.id, normStamp(n)]));
  if (x.orders) D.orders = new Map(x.orders.map(o => [o.id, normStamp(o)]));
  if (x.daily) D.daily = new Map(x.daily.map(d => [d.id, normDaily(d)]));
  if (x.calendar) D.calendar = new Map(x.calendar.map(c => [c.id, normCal(c)]));
  D.skew = Date.parse(x.server_time) - Date.now();
  D.since = x.server_time;
}

/* ================= sync & realtime ================= */
let syncing = null, syncAgain = false, pollTimer = 0;
async function sync(force) {
  if (!sb || !D.ready || $('#app').hidden) return;
  if (syncing) { syncAgain = true; return syncing; }
  syncing = (async () => {
    try {
      const x = await call('wtm_sync', { p_since: D.since, p_log_after: D.logMax, p_msg_after: D.msgMax });
      if (x.inactive) { D.me = x.me; D.ready = false; unsubscribe(); showInactive(); return; }
      applySync(x);
      if (D.me.must_change_password) { D.ready = false; unsubscribe(); showChangePassword(true); return; }
      D.syncErr = false;
      if (!force) render();
    } catch (e) {
      const err = toErr(e);
      D.syncErr = true; renderChrome();
      if (err.code === 'auth') signOut();
    } finally {
      syncing = null;
      if (syncAgain) { syncAgain = false; sync(); }
    }
  })();
  return syncing;
}
const poke = debounce(() => sync(), 350);
function subscribe() {
  unsubscribe();
  try {
    channel = sb.channel('wtm-' + uid());
    for (const table of ['log_entries', 'messages', 'tasks', 'task_assignees', 'notices', 'orders', 'daily_tasks', 'calendar_entries', 'tag_rules', 'tag_departments', 'profiles', 'department_members', 'locations', 'maps']) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, poke);
    }
    channel.subscribe(status => { D.live = status === 'SUBSCRIBED'; renderChrome(); schedulePoll(); });
  } catch (_) { D.live = false; }
  schedulePoll();
}
function unsubscribe() { if (channel && sb) { try { sb.removeChannel(channel); } catch (_) {} } channel = null; }
function schedulePoll() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (!document.hidden) sync(); }, D.live ? 90000 : 15000);
}

/* ================= screens ================= */
function showScreen(html) {
  $('#app').hidden = true; closePop(); closeSheet(true); unmountMail();
  const s = $('#screen'); s.hidden = false; s.innerHTML = html;
  const f = s.querySelector('input'); if (f) setTimeout(() => f.focus(), 30);
}
const brandBlock = `<div><div class="wordmark">WTM</div><div class="lbl" style="margin-top:6px">Work Task Manager</div></div>`;
function showLogin(msg) {
  D.ready = false; unsubscribe();
  showScreen(`<div class="card">${brandBlock}
    <form id="loginForm">
      <label class="fld"><span class="lbl">User name</span><input class="field" id="loginUser" type="text" autocomplete="username" required></label>
      <label class="fld"><span class="lbl">Password</span><input class="field" id="loginPw" type="password" autocomplete="current-password" required></label>
      <div class="formerr" role="alert">${esc(msg || '')}</div>
      <button class="btn primary" type="submit" id="loginBtn">Sign in</button>
    </form>
    <p style="font-size:13px">Logins are set up by IT and admin. If you've forgotten your password, ask them to reset it.</p>
  </div>`);
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'Signing in…';
    const username = $('#loginUser').value.trim();
    const looked = await sb.rpc('wtm_login_email', { p_username: username });
    const authEmail = looked && looked.data;
    const { error } = authEmail ? await sb.auth.signInWithPassword({ email: authEmail, password: $('#loginPw').value }) : { error: { message: 'Invalid login credentials' } };
    if (error || looked.error) {
      btn.disabled = false; btn.textContent = 'Sign in';
      const message = (error && error.message) || (looked.error && looked.error.message) || '';
      $('.formerr').textContent = /invalid/i.test(message) ? 'That user name and password don\'t match.' : /banned|disabled/i.test(message) ? 'This login is turned off. Contact IT.' : message;
      return;
    }
    start();
  });
}
function showChangePassword(forced) {
  showScreen(`<div class="card">${brandBlock}
    <h2>${forced ? 'Choose your own password' : 'Change password'}</h2>
    <p>${forced ? 'You signed in with a temporary password. Pick a new one to continue.' : 'Use at least 8 characters.'}</p>
    <form id="pwForm">
      <label class="fld"><span class="lbl">New password</span><input class="field" id="pw1" type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="fld"><span class="lbl">Type it again</span><input class="field" id="pw2" type="password" autocomplete="new-password" minlength="8" required></label>
      <div class="formerr" role="alert"></div>
      <button class="btn primary" type="submit" id="pwBtn">Save password</button>
    </form>
    <button type="button" class="btn ghost sm" id="pwOut" style="align-self:flex-start">${forced ? 'Sign out' : 'Cancel'}</button>
  </div>`);
  $('#pwForm').addEventListener('submit', async e => {
    e.preventDefault();
    const a = $('#pw1').value, b = $('#pw2').value, err = $('.formerr');
    if (a.length < 8) { err.textContent = 'Use at least 8 characters.'; return; }
    if (a !== b) { err.textContent = 'The two passwords don\'t match.'; return; }
    $('#pwBtn').disabled = true;
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) { $('#pwBtn').disabled = false; err.textContent = error.message; return; }
    try { await call('wtm_password_changed'); } catch (_) {}
    toast('Password saved.');
    start();
  });
  $('#pwOut').addEventListener('click', () => forced ? signOut() : showApp());
}
function showInactive() {
  showScreen(`<div class="card">${brandBlock}<h2>Your login is turned off</h2><p>Contact IT or an admin if you think this is a mistake.</p><button class="btn" id="inOut">Sign out</button></div>`);
  $('#inOut').addEventListener('click', signOut);
}
function showProblem(msg) {
  showScreen(`<div class="card">${brandBlock}<h2>Can't open WTM</h2><p>${esc(msg)}</p><button class="btn primary" id="retry">Try again</button></div>`);
  $('#retry').addEventListener('click', () => location.reload());
}
function showLoading() { showScreen(`<div class="card" aria-busy="true">${brandBlock}<p>Opening your work…</p><div class="skel" style="border:0;border-radius:8px"></div></div>`); }
function showApp() {
  $('#screen').hidden = true; $('#screen').innerHTML = ''; $('#app').hidden = false;
  setView(UI.view, true);
}
async function signOut() {
  unsubscribe(); D.ready = false;
  try { await sb.auth.signOut(); } catch (_) {}
  showLogin();
}
function openAccount(anchor) {
  const m = D.me || {};
  openPicker(anchor, {
    title: m.username || m.full_name || 'Account',
    sections: [{ items: [
      { key: 'settings', label: 'Settings', sub: [m.username || m.full_name, (ROLE[m.role] || {}).label].filter(Boolean).join(' · '), lead: m.id ? avatar(m.id) : '' },
      { key: 'out', label: 'Log out', sub: 'End this session on this device' }
    ] }],
    onPick(it) {
      closePop();
      if (it.key === 'out') signOut();
      else setView('settings');
    }
  });
}

/* ================= boot ================= */
function config() { return { url: CONFIG.url, key: CONFIG.anonKey }; }
async function connect() {
  const c = config();
  if (!c.url || !c.key) { showProblem('This copy of WTM has no project URL or anon key.'); return; }
  if (!window.supabase || typeof window.supabase.createClient !== 'function') { showProblem('The Supabase library didn\'t load. Check your internet connection.'); return; }
  try { sb = window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'wtm.auth' } }); }
  catch (e) { showProblem('The project URL or anon key isn\'t valid.'); return; }
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && D.ready) { D.ready = false; unsubscribe(); showLogin(); } });
  let session = null;
  try { session = (await sb.auth.getSession()).data.session; } catch (_) {}
  if (!session) { showLogin(); return; }
  start();
}
async function start() {
  showLoading();
  let x;
  try { x = await call('wtm_bootstrap'); }
  catch (e) {
    const err = toErr(e);
    if (err.code === 'auth' || err.code === '28000') { showLogin(err.message); return; }
    if (err.code === 'setup' || err.code === 'net') { showProblem(err.message); return; }
    showLogin(err.message); return;
  }
  if (x.inactive) { D.me = x.me; D.ready = false; showInactive(); return; }
  applyBootstrap(x);
  if (D.me.must_change_password) { D.ready = false; showChangePassword(true); return; }
  showApp();
  subscribe();
  openDaily();
}

/* ================= auto-tagging ================= */
const ROOM_WORDS = { room: 'Room', rm: 'Room', ward: 'Ward', suite: 'Suite', office: 'Office', bay: 'Bay', lab: 'Lab', unit: 'Unit', bed: 'Bed' };
const ROOM_RX = /(?<![\p{L}\p{N}])(room|rm|ward|suite|office|bay|lab|unit|bed)\.?\s*#?\s*(\d{1,4}[a-z]?(?:[.\-]\d{1,3}[a-z]?)?)(?![\p{L}\p{N}])/giu;
const FLOOR_WORD = { ground: 'Ground', 'g/f': 'Ground', gf: 'Ground', 'lower ground': 'Lower ground', lg: 'Lower ground', basement: 'Basement', mezzanine: 'Mezzanine', mezz: 'Mezzanine', rooftop: 'Roof', roof: 'Roof', first: 'Level 1', second: 'Level 2', third: 'Level 3', fourth: 'Level 4', fifth: 'Level 5', sixth: 'Level 6', seventh: 'Level 7', eighth: 'Level 8', ninth: 'Level 9', tenth: 'Level 10', eleventh: 'Level 11', twelfth: 'Level 12' };
function levelName(n) {
  const s = String(n).toUpperCase().replace(/^0+(?=\d)/, '');
  return s === '0' || s === 'G' ? 'Ground' : 'Level ' + s;
}
function floorRange(a, b) {
  a = +a; b = +b;
  if (a > b) [a, b] = [b, a];
  if (b - a > 8) return [levelName(a), levelName(b)];
  const out = [];
  for (let i = a; i <= b; i++) out.push(levelName(i));
  return out;
}
function floorHits(text) {
  const named = w => { const k = w.toLowerCase().replace(/\s+/g, ' '); const b = k.match(/^basement(?:\s+(\d{1,2}))?$/); return b ? (b[1] ? 'Basement ' + b[1] : 'Basement') : FLOOR_WORD[k]; };
  const specs = [
    [/(?<![\p{L}\p{N}])(?:floors?|levels?)\s+(\d{1,2})\s*(?:-|–|to|through|and)\s*(\d{1,2})(?![\p{L}\p{N}])/giu, m => /\band\b/i.test(m[0]) ? [levelName(m[1]), levelName(m[2])] : floorRange(m[1], m[2])],
    [/(?<![\p{L}\p{N}])(\d{1,2})(?:st|nd|rd|th)\s*(?:floor|fl\.?|level|lvl\.?)(?![\p{L}\p{N}])/giu, m => [levelName(m[1])]],
    [/(?<![\p{L}\p{N}])(lower\s+ground|ground|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|basement|mezzanine|rooftop|roof)\s+(?:floor|level)(?![\p{L}\p{N}])/giu, m => [named(m[1])]],
    [/(?<![\p{L}\p{N}])(?:floor|level|lvl\.?|fl\.?|l)\s*#?\s*(\d{1,2}[a-z]?)(?![\p{L}\p{N}])/giu, m => [levelName(m[1])]],
    [/(?<![\p{L}\p{N}])(g\/f|gf|lg|basement(?:\s+\d{1,2})?|mezzanine|mezz|rooftop|lower\s+ground)(?![\p{L}\p{N}])/giu, m => [named(m[1])]]
  ];
  const hits = [];
  for (const [rx, labels] of specs) for (const m of text.matchAll(rx)) {
    const list = labels(m).filter(Boolean);
    if (list.length) hits.push({ index: m.index, len: m[0].length, labels: list });
  }
  return hits;
}
let MATCH = null, matchVer = -1;
function matchers() {
  if (MATCH && matchVer === D.dirVersion) return MATCH;
  const ci = new Map(), cs = new Map();
  const add = (map, phrase, item) => { phrase = String(phrase || '').trim(); if (phrase.length < 2) return; const k = map === ci ? phrase.toLowerCase() : phrase; if (!map.has(k)) map.set(k, item); };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const firsts = {};
  for (const p of activePeople()) { const f = (p.full_name || '').split(/\s+/)[0].toLowerCase(); if (f) firsts[f] = (firsts[f] || 0) + 1; }
  for (const p of activePeople()) {
    const item = { type: 'person', id: p.id, label: p.full_name || p.email, tag: 'person:' + p.id };
    if ((p.full_name || '').trim().includes(' ')) add(ci, p.full_name, item);
    if (p.short_name) { add(cs, p.short_name, item); add(cs, cap(p.short_name), item); }
    const f = (p.full_name || '').split(/\s+/)[0];
    if (f.length >= 3 && firsts[f.toLowerCase()] === 1) add(cs, cap(f), item);
  }
  for (const d of liveDepts()) {
    const item = { type: 'dept', id: d.id, label: d.name, tag: 'dept:' + d.id };
    add(ci, d.name, item); if (d.code && d.code.length >= 2) add(cs, d.code, item);
  }
  for (const r of D.rooms) { const item = { type: 'room', label: r.name, tag: 'room:' + r.name }; add(ci, r.name, item); for (const a of r.aliases || []) add(ci, a, item); }
  for (const r of D.rules) add(ci, r.phrase, { type: 'tag', label: '#' + r.tag, tag: r.tag });
  for (const p of liveProjects()) if (p.name.length >= 3) add(ci, p.name, { type: 'project', id: p.id, label: p.name });
  for (const [slug, label] of TRADES) add(ci, label, { type: 'trade', label, tag: 'trade:' + slug });
  const rx = (map, flags) => { const keys = Array.from(map.keys()).sort((a, b) => b.length - a.length).map(escRx); return keys.length ? new RegExp(`(?<![\\p{L}\\p{N}])(${keys.join('|')})(?![\\p{L}\\p{N}])`, flags) : null; };
  MATCH = { ci, cs, rxCi: rx(ci, 'giu'), rxCs: rx(cs, 'gu') }; matchVer = D.dirVersion;
  return MATCH;
}
const dkey = d => d.type + ':' + (d.id || d.tag || d.label);
function detect(text) {
  const M = matchers(), out = [], spans = [], seen = new Set();
  const take = (s, e, items) => {
    if (spans.some(([a, b]) => s < b && e > a)) return;
    spans.push([s, e]);
    for (const item of [].concat(items)) { const k = dkey(item); if (!seen.has(k)) { seen.add(k); out.push(item); } }
  };
  for (const m of text.matchAll(ROOM_RX)) { const label = `${ROOM_WORDS[m[1].toLowerCase()]} ${m[2].toUpperCase()}`; take(m.index, m.index + m[0].length, { type: 'room', label, tag: 'room:' + label }); }
  for (const h of floorHits(text)) take(h.index, h.index + h.len, h.labels.map(label => ({ type: 'room', label, tag: 'room:' + label })));
  if (M.rxCi) for (const m of text.matchAll(M.rxCi)) { const it = M.ci.get(m[1].toLowerCase()); if (it) take(m.index, m.index + m[0].length, it); }
  if (M.rxCs) for (const m of text.matchAll(M.rxCs)) { const it = M.cs.get(m[1]); if (it) take(m.index, m.index + m[0].length, it); }
  return out;
}
function findAssignee(q) {
  const n = q.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); if (!n) return null;
  const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  for (const p of activePeople()) if (norm(p.short_name) === n || norm(p.full_name) === n || norm((p.full_name || '').split(/\s+/)[0]) === n) return { kind: 'user', id: p.id };
  for (const d of liveDepts()) if (norm(d.name) === n || norm(d.code) === n) return { kind: 'dept', id: d.id };
  for (const g of liveGroups()) if (norm(g.name) === n) return { kind: 'group', id: g.id };
  for (const p of activePeople()) if (norm(p.full_name).startsWith(n) || norm(p.short_name).startsWith(n)) return { kind: 'user', id: p.id };
  for (const d of liveDepts()) if (norm(d.name).startsWith(n)) return { kind: 'dept', id: d.id };
  for (const g of liveGroups()) if (norm(g.name).startsWith(n)) return { kind: 'group', id: g.id };
  return null;
}
function mentionToken(item) {
  const bits = [];
  const push = s => { const t = String(s || '').trim(); if (t && !/\s/.test(t)) bits.push(t); };
  if (item.kind === 'user') {
    const p = prof(item.id) || {};
    push(p.short_name); push((p.full_name || '').split(/\s+/)[0]); push((p.full_name || '').replace(/\s+/g, '')); push((p.email || '').split('@')[0]);
  } else if (item.kind === 'dept') {
    const d = D.depts.get(item.id) || {};
    push((d.name || '').replace(/\s+/g, '')); push(d.code);
  } else {
    const g = D.groups.get(item.id) || {};
    push((g.name || '').replace(/\s+/g, ''));
  }
  for (const t of bits) { const hit = findAssignee(t); if (hit && hit.kind === item.kind && hit.id === item.id) return t; }
  return String(item.label || 'name').replace(/[^\p{L}\p{N}]/gu, '') || 'name';
}
function mentionChoices(q, taken) {
  const has = (k, id) => (taken || []).some(a => a.kind === k && a.id === id);
  const n = String(q || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const rank = (...fields) => {
    if (!n) return 1;
    let best = 0;
    for (const f of fields) { const a = norm(f); if (!a) continue; if (a.startsWith(n)) best = 3; else if (best < 2 && a.includes(n)) best = 2; }
    return best;
  };
  const rows = [];
  for (const d of liveDepts()) {
    if (has('dept', d.id)) continue;
    const s = rank(d.name, d.code); if (!s) continue;
    rows.push({ kind: 'dept', id: d.id, label: d.name, sub: d.code ? d.code + ' · Department' : 'Department', score: s, ord: 0, lead: deptLead(d) });
  }
  for (const p of activePeople()) {
    if (has('user', p.id)) continue;
    const s = rank(p.full_name, p.short_name, (p.email || '').split('@')[0], p.title); if (!s) continue;
    const depts = Array.from(deptsOf(p.id)).map(id => { const d = D.depts.get(id); return d && d.name; }).filter(Boolean).join(', ');
    const role = ROLE[p.role] ? ROLE[p.role].label : '';
    rows.push({ kind: 'user', id: p.id, label: (p.full_name || p.email) + (p.id === me() ? ' (you)' : ''), sub: [role, depts].filter(Boolean).join(' · ') || 'Staff', score: s, ord: 1, lead: avatar(p.id) });
  }
  for (const g of liveGroups()) {
    if (has('group', g.id)) continue;
    const s = rank(g.name); if (!s) continue;
    rows.push({ kind: 'group', id: g.id, label: g.name, sub: 'Group', score: s, ord: 2, lead: `<span class="cicon" style="--pc:var(--${esc(g.color)})">${icon('people', 'width:15px;height:15px')}</span>` });
  }
  rows.sort((a, b) => b.score - a.score || a.ord - b.ord || cmpStr(a.label, b.label));
  if (!n) return rows.filter(r => r.kind === 'dept').slice(0, 4).concat(rows.filter(r => r.kind === 'user').slice(0, 5), rows.filter(r => r.kind === 'group').slice(0, 2)).slice(0, 8);
  return rows.slice(0, 8);
}
function taskChoices(q) {
  const n = String(q || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const rows = [];
  for (const t of liveTasks()) {
    if (t.status === 'done') continue;
    const a = norm(t.title), s = !n ? 1 : a.startsWith(n) ? 3 : a.includes(n) ? 2 : 0; if (!s) continue;
    rows.push({ kind: 'task', id: t.id, label: t.title, sub: [STATUS[t.status], t.due ? 'Due ' + dueLabel(t.due) : ''].filter(Boolean).join(' · '), score: s, at: t.updated_at, lead: icon('task', 'width:18px;height:18px;color:var(--faint)') });
  }
  rows.sort((a, b) => b.score - a.score || b.at - a.at);
  return rows.slice(0, 8);
}
function placeChoices(q) {
  const n = String(q || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const rows = [], seen = new Set();
  const add = (label, sub, names) => {
    const k = norm(label); if (!k || seen.has(k)) return;
    let s = !n ? 1 : 0;
    for (const f of names) { const a = norm(f); if (a.startsWith(n)) s = 3; else if (s < 2 && a.includes(n)) s = 2; }
    if (!s) return;
    seen.add(k);
    rows.push({ kind: 'place', label, token: label.replace(/\s+/g, ''), sub, score: s, lead: icon('pin', 'width:18px;height:18px;color:var(--faint)') });
  };
  for (const r of D.rooms) add(r.name, 'Room', [r.name].concat(r.aliases || []));
  for (const l of liveLocations()) add(l.name, 'Location', [l.name]);
  const m = n && String(q).match(new RegExp('^' + ROOM_RX.source + '$', 'iu'));
  if (m) { const label = `${ROOM_WORDS[m[1].toLowerCase()]} ${m[2].toUpperCase()}`; if (!seen.has(norm(label))) { seen.add(norm(label)); rows.unshift({ kind: 'place', label, token: label.replace(/\s+/g, ''), sub: 'Room', score: 4, lead: icon('pin', 'width:18px;height:18px;color:var(--faint)') }); } }
  rows.sort((a, b) => b.score - a.score || cmpStr(a.label, b.label));
  return rows.slice(0, 8);
}
let mention = null;
function mentionAt(input, chars = '@') {
  if (!input || (input.selectionEnd != null && input.selectionStart !== input.selectionEnd)) return null;
  const c = input.selectionStart ?? input.value.length;
  const m = input.value.slice(0, c).match(new RegExp(`(?:^|\\s)([${chars}])([^\\s${chars}]*)$`));
  if (!m) return null;
  return { start: c - m[2].length - 1, q: m[2], ch: m[1] };
}
function closeMention() {
  const el = $('#mention');
  if (el) { el.hidden = true; el.innerHTML = ''; }
  if (mention && mention.input) { mention.input.removeAttribute('aria-expanded'); mention.input.removeAttribute('aria-activedescendant'); }
  mention = null;
}
function placeMention() {
  if (!mention) return;
  const el = $('#mention'), r = mention.input.getBoundingClientRect();
  const w = Math.min(320, innerWidth - 24);
  el.style.width = w + 'px';
  el.style.left = Math.min(Math.max(12, r.left), innerWidth - w - 12) + 'px';
  const h = el.offsetHeight;
  let top = r.bottom + 6;
  if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 6);
  el.style.top = top + 'px';
}
function drawMention() {
  const el = $('#mention'); if (!mention || !el) return;
  const labels = { dept: 'Departments', user: 'Staff', group: 'Groups', task: 'Tasks', place: 'Locations' };
  const none = { '#': 'No open task matches', '^': 'No room or location matches' }[mention.ch] || 'No department or staff matches';
  let html = '', last = '';
  if (!mention.items.length) html = `<div class="mention-empty">${none} “${esc(mention.q)}”.</div>`;
  mention.items.forEach((it, i) => {
    if (it.kind !== last) { last = it.kind; html += `<div class="mention-sec">${labels[it.kind]}</div>`; }
    const on = i === mention.hl;
    html += `<button type="button" class="mention-item${on ? ' hl' : ''}" id="mention-opt-${i}" data-i="${i}" role="option" aria-selected="${on}">${it.lead}<span class="txt">${esc(it.label)}${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ''}</span></button>`;
  });
  el.innerHTML = html;
  el.hidden = false;
  mention.input.setAttribute('aria-expanded', 'true');
  mention.input.setAttribute('aria-controls', 'mention');
  const cur = el.querySelector('.hl');
  if (cur) { mention.input.setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView({ block: 'nearest' }); }
  else mention.input.removeAttribute('aria-activedescendant');
  placeMention();
}
function syncMention(input, mode, onPick, taken, chars = '@') {
  if (!input || document.activeElement !== input) { if (mention && mention.input === input) closeMention(); return; }
  const at = mentionAt(input, chars);
  if (!at) { if (mention && mention.input === input) closeMention(); return; }
  const items = at.ch === '#' ? taskChoices(at.q) : at.ch === '^' ? placeChoices(at.q) : mentionChoices(at.q, taken);
  const same = mention && mention.input === input && mention.ch === at.ch;
  const hl = same ? Math.min(mention.hl, Math.max(0, items.length - 1)) : 0;
  mention = { input, mode, onPick, items, hl, q: at.q, ch: at.ch, chars };
  drawMention();
}
function acceptMention(index) {
  if (!mention || !mention.items.length) return;
  const item = mention.items[index]; if (!item) return;
  const input = mention.input, mode = mention.mode, onPick = mention.onPick, at = mentionAt(input, mention.chars);
  if (at && (mode === 'token' || mode === 'title' || mode === 'msg')) {
    const v = input.value, end = at.start + 1 + at.q.length;
    if (mode === 'token' || mode === 'msg') {
      const insert = item.kind === 'task' ? '' : item.kind === 'place' ? '^' + item.token + ' ' : '@' + mentionToken(item) + ' ';
      input.value = v.slice(0, at.start) + insert + v.slice(end);
      const pos = at.start + insert.length;
      input.setSelectionRange(pos, pos);
    } else {
      input.value = (v.slice(0, at.start) + v.slice(end)).replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+/, '');
      const pos = Math.min(at.start, input.value.length);
      input.setSelectionRange(pos, pos);
    }
  } else if (mode === 'field') input.value = '';
  closeMention();
  if (mode === 'token' || mode === 'msg') input.dispatchEvent(new Event('input', { bubbles: true }));
  if (onPick) onPick(item);
  if (mode === 'title' && document.contains(input)) input.dispatchEvent(new Event('input', { bubbles: true }));
}
function parseDue(s) {
  s = s.toLowerCase(); const t = dayKey();
  if (s === 'today' || s === 'tod') return t;
  if (s === 'tom' || s === 'tmr' || s === 'tomorrow') return addDays(t, 1);
  const wd = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(s.slice(0, 3));
  if (wd >= 0 && /^[a-z]+$/.test(s)) { let n = (wd - new Date().getDay() + 7) % 7; if (n === 0) n = 7; return addDays(t, n); }
  let m = s.match(/^\+(\d{1,3})d?$/); if (m) return addDays(t, +m[1]);
  m = s.match(/^\+(\d{1,2})w$/); if (m) return addDays(t, 7 * m[1]);
  if (isDay(s)) return s;
  return null;
}
function parseTokens(str) {
  const out = { title: '', priority: null, due: null, tags: [], assign: [], tokens: [] }, keep = [];
  for (const w of str.split(/\s+/).filter(Boolean)) {
    let m;
    if ((m = w.match(/^!([1-4])$/))) { out.priority = +m[1]; out.tokens.push({ w, kind: 'priority' }); continue; }
    if ((m = w.match(/^#([\p{L}\p{N}_-]{1,40})$/u))) { const tg = m[1].toLowerCase(); if (!out.tags.includes(tg)) out.tags.push(tg); out.tokens.push({ w, kind: 'tag', tag: tg }); continue; }
    if ((m = w.match(/^@(.+)$/))) { const a = findAssignee(m[1]); if (a) { if (!out.assign.some(x => x.kind === a.kind && x.id === a.id)) out.assign.push(a); out.tokens.push({ w, kind: 'assign', a }); continue; } }
    if ((m = w.match(/^\^(.+)$/))) { const d = parseDue(m[1]); if (d) { out.due = d; out.tokens.push({ w, kind: 'due' }); continue; } }
    keep.push(w);
  }
  out.title = keep.join(' ');
  return out;
}

/* ================= quick add ================= */
const QA = { assign: [], due: null, noDefaultDue: false, priority: null, project: null, tags: [], dismissed: new Set(), pin: null, photoFile: null, photoPreview: '' };
function resetQA() {
  if (QA.photoPreview) URL.revokeObjectURL(QA.photoPreview);
  QA.assign = []; QA.due = null; QA.noDefaultDue = false; QA.priority = null; QA.project = null; QA.tags = []; QA.dismissed = new Set();
  QA.pin = null; QA.photoFile = null; QA.photoPreview = '';
}
function scopeDefaults() {
  const s = TP.scope || '';
  if (s.startsWith('dept:')) return { assign: [{ kind: 'dept', id: s.slice(5) }] };
  if (s.startsWith('group:')) return { assign: [{ kind: 'group', id: s.slice(6) }] };
  if (s.startsWith('proj:')) return { project: s.slice(5) };
  return {};
}
function qaDraft() {
  const q = parseTokens($('#qaInput').value);
  const det = detect(q.title).filter(d => !QA.dismissed.has(dkey(d)));
  const sd = scopeDefaults();
  const tags = [], src = {};
  const addTag = (t, s) => { if (!tags.includes(t)) { tags.push(t); src[t] = s; } };
  QA.tags.forEach(t => addTag(t, 'qa')); q.tags.forEach(t => addTag(t, 'token'));
  let project = QA.project, projectSrc = QA.project ? 'qa' : null;
  if (!project && sd.project) { project = sd.project; projectSrc = 'default'; }
  for (const d of det) {
    if (d.type === 'project') { if (!project) { project = d.id; projectSrc = 'auto'; } continue; }
    if (d.tag) addTag(d.tag, 'auto');
  }
  const assign = []; const aSrc = {};
  const addA = (a, s) => { if (!assign.some(x => x.kind === a.kind && x.id === a.id)) { assign.push(a); aSrc[a.kind + ':' + a.id] = s; } };
  QA.assign.forEach(a => addA(a, 'qa')); q.assign.forEach(a => addA(a, 'token'));
  if (!assign.length && sd.assign && !QA.dismissed.has('scope')) sd.assign.forEach(a => addA(a, 'default'));
  for (const id of deptsForTags(tags)) if (!QA.dismissed.has('tagdept:' + id)) addA({ kind: 'dept', id }, 'tag');
  let due = QA.due || q.due, dueSrc = QA.due ? 'qa' : q.due ? 'token' : null;
  if (!due && TP.tab === 'today' && !QA.noDefaultDue) { due = dayKey(); dueSrc = 'default'; }
  const priority = QA.priority || q.priority || 3, prioSrc = QA.priority ? 'qa' : q.priority ? 'token' : null;
  return { title: q.title, assign, aSrc, due, dueSrc, priority, prioSrc, project, projectSrc, tags, src, q };
}
function closeQaMenu() {
  const menu = $('#qaMenu'), btn = $('#qaDrop');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
function renderQaTools() {
  const d = qaDraft();
  const tools = [
    ['date', 'cal', d.due ? dueLabel(d.due) : 'Date', !!d.due],
    ['priority', 'flag', d.prioSrc ? 'P' + d.priority : 'Priority', !!d.prioSrc], ['room', 'pin', 'Room', d.tags.some(t => t.startsWith('room:'))],
    ['trade', 'trade', 'Trade', d.tags.some(t => t.startsWith('trade:'))],
    ['tag', 'hash', 'Tag', d.tags.some(t => !t.includes(':'))], ['project', 'folder', d.project && D.projects.get(d.project) ? trunc(D.projects.get(d.project).name, 18) : 'Project', !!d.project],
    ['pin', 'pin', QA.pin ? trunc(pinLabel(QA.pin), 22) : 'Pin', !!QA.pin],
    ['more', 'more', 'Details', false]
  ];
  const open = $('#qaMenu') && !$('#qaMenu').hidden;
  const n = tools.filter(t => t[3]).length;
  const bar = (k, ic, l, on) => `<button type="button" class="tool${on ? ' on' : ''}" data-tool="${k}">${icon(ic)}<span>${esc(l)}</span></button>`;
  $('#qaTools').innerHTML = `${bar('assign', 'person', 'Assign', d.assign.length)}${bar('photo', 'camera', 'Photo', !!QA.photoFile)}<button type="button" class="tool qa-drop${n ? ' on' : ''}" id="qaDrop" aria-expanded="${open ? 'true' : 'false'}" aria-haspopup="menu" aria-controls="qaMenu">${icon('more')}<span>Add details</span>${n ? `<span class="n">${n}</span>` : ''}${I.down}</button>
    <div class="qa-menu" id="qaMenu" role="menu" aria-label="Add details to the task"${open ? '' : ' hidden'}>${tools.map(([k, ic, l, on]) => `<button type="button" class="tool${on ? ' on' : ''}" role="menuitem" data-tool="${k}">${icon(ic)}<span>${esc(l)}</span></button>`).join('')}</div>`;
}
function renderQaChips() {
  const d = qaDraft(), h = [];
  const chip = (key, src, inner, mini) => `<span class="dchip${src === 'auto' ? ' auto' : ''}" data-chip="${esc(key)}" data-src="${src}">${inner}${mini || ''}<button type="button" class="x" aria-label="Remove">${icon('close', 'width:13px;height:13px')}</button></span>`;
  for (const a of d.assign) h.push(chip('a:' + a.kind + ':' + a.id, d.aSrc[a.kind + ':' + a.id], `${icon(a.kind === 'user' ? 'person' : a.kind === 'dept' ? 'dept' : 'people')}<span class="lbltxt">→ ${esc(assigneeLabel(a))}</span>`));
  if (d.due) h.push(chip('due', d.dueSrc, `${icon('cal')}<span class="lbltxt">Due ${esc(dueLabel(d.due))}</span>`));
  if (d.prioSrc) h.push(chip('prio', d.prioSrc, `${icon('flag')}<span class="lbltxt">P${d.priority} ${PRIO[d.priority]}</span>`));
  if (d.project && D.projects.get(d.project)) h.push(chip('proj', d.projectSrc, `<i class="pdot" style="--pc:var(--${esc(D.projects.get(d.project).color)})"></i><span class="lbltxt">${esc(D.projects.get(d.project).name)}</span>`));
  if (QA.pin) h.push(chip('pin', 'qa', `${icon('pin')}<span class="lbltxt">${esc(pinLabel(QA.pin))}</span>`));
  if (QA.photoFile) h.push(chip('photo', 'qa', `${shotImg('', 'sm', QA.photoPreview)}<span class="lbltxt">Photo</span>`));
  for (const t of d.tags) {
    const i = tagInfo(t);
    const ic = tagGlyph(i.type);
    const assignable = (i.type === 'person' || i.type === 'dept') && !d.assign.some(a => a.id === i.id);
    h.push(chip('t:' + t, d.src[t], `${icon(ic)}<span class="lbltxt">${esc(i.type === 'word' ? i.label.slice(1) : i.label)}</span>`, assignable ? `<button type="button" class="mini" data-assign="${esc(t)}">Assign</button>` : ''));
  }
  $('#qaChips').innerHTML = h.join('');
}
function renderQa() { renderQaTools(); renderQaChips(); }
function removeToken(pred) {
  const inp = $('#qaInput');
  inp.value = inp.value.split(/(\s+)/).filter(w => !pred(w)).join('').replace(/\s{2,}/g, ' ').trim();
}
function onQaChip(key, src) {
  const d = qaDraft();
  if (key.startsWith('a:')) {
    const [, kind, id] = key.split(':');
    if (src === 'qa') QA.assign = QA.assign.filter(a => !(a.kind === kind && a.id === id));
    else if (src === 'token') removeToken(w => { const m = w.match(/^@(.+)$/); if (!m) return false; const a = findAssignee(m[1]); return a && a.kind === kind && a.id === id; });
    else if (src === 'default') QA.dismissed.add('scope');
    else if (src === 'tag') QA.dismissed.add('tagdept:' + id);
  } else if (key === 'due') {
    if (src === 'qa') QA.due = null; else if (src === 'token') removeToken(w => /^\^/.test(w) && parseDue(w.slice(1))); else QA.noDefaultDue = true;
  } else if (key === 'prio') {
    QA.priority = null; removeToken(w => /^![1-4]$/.test(w));
  } else if (key === 'proj') {
    if (src === 'auto') { const det = detect(d.q.title).find(x => x.type === 'project' && x.id === d.project); if (det) QA.dismissed.add(dkey(det)); }
    QA.project = null;
  } else if (key.startsWith('t:')) {
    const t = key.slice(2);
    if (src === 'qa') QA.tags = QA.tags.filter(x => x !== t);
    else if (src === 'token') removeToken(w => w.toLowerCase() === '#' + t);
    else { const det = detect(d.q.title).find(x => x.tag === t); if (det) QA.dismissed.add(dkey(det)); }
  } else if (key === 'pin') QA.pin = null;
  else if (key === 'photo') { if (QA.photoPreview) URL.revokeObjectURL(QA.photoPreview); QA.photoFile = null; QA.photoPreview = ''; }
  renderQa();
}
async function submitQuick() {
  const d = qaDraft();
  if (!d.title.trim()) { toast(d.q.tokens.length ? 'Add a few words for the title as well.' : 'Type what needs doing.'); $('#qaInput').focus(); return; }
  const btn = $('#qaAdd'); btn.disabled = true;
  let photo = null;
  if (QA.photoFile) {
    photo = await putImage('wtm-photos', me(), QA.photoFile);
    if (!photo) { btn.disabled = false; return; }
  }
  const payload = { title: d.title, priority: d.priority, due: d.due, project_id: d.project, tags: d.tags, assignees: d.assign };
  if (QA.pin) payload.pin = QA.pin;
  if (photo) payload.photo = photo;
  const r = await act('wtm_save_task', { p: payload });
  if (!r && photo) sb.storage.from('wtm-photos').remove([photo]);
  btn.disabled = false;
  if (r) {
    $('#qaInput').value = ''; resetQA(); renderQa();
    const t = D.tasks.get(r.id);
    if (t && !taskInView(t)) toast('Task added. It\'s not in this view; switch to “Everything I can see” to find it.');
  }
}

/* ================= picker popover ================= */
let pop = null;
function closePop() { if (!pop) return; const el = $('#pop'); el.hidden = true; el.innerHTML = ''; el.classList.remove('map'); const a = pop.anchor; pop = null; if (a && document.contains(a)) try { a.focus({ preventScroll: true }); } catch (_) {} }
function placePop(anchor) {
  const el = $('#pop');
  if (innerWidth <= 640) { el.style.left = ''; el.style.top = ''; return; }
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  let left = Math.min(Math.max(12, r.left), innerWidth - w - 12), top = r.bottom + 6;
  if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 6);
  el.style.left = left + 'px'; el.style.top = top + 'px';
}
// opts: { title, sections:[{label, items:[{key,label,sub,lead,selected}]}], multi, search, custom:{placeholder,button}, onPick(item), onCustom(text), html }
function openPicker(anchor, opts) {
  closePop();
  pop = Object.assign({ anchor, q: '', hl: 0 }, opts);
  const el = $('#pop'); el.hidden = false;
  el.setAttribute('aria-label', opts.title || 'Choose');
  drawPop(true);
  placePop(anchor);
}
function drawPop(first) {
  const el = $('#pop'), q = pop.q.trim().toLowerCase();
  let list = '';
  if (pop.sections) {
    let i = 0;
    for (const s of pop.sections) {
      const items = s.items.filter(it => !q || (it.label + ' ' + (it.sub || '') + ' ' + (it.keywords || '')).toLowerCase().includes(q));
      if (!items.length) continue;
      list += (s.label ? `<div class="pop-sec">${esc(s.label)}</div>` : '') + items.map(it => `<button type="button" class="pop-item${i++ === pop.hl ? ' hl' : ''}" data-key="${esc(it.key)}" role="option" aria-selected="${!!it.selected}">${pop.multi ? `<span class="tick">${I.check}</span>` : ''}${it.lead || ''}<span class="txt">${esc(it.label)}${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ''}</span></button>`).join('');
    }
    if (!list) list = `<div class="pop-sec" style="text-transform:none;letter-spacing:0;font-family:var(--f-body);font-size:13px">${pop.custom ? 'No matches. Use the box below to add your own.' : 'No matches.'}</div>`;
  }
  if (first) {
    el.innerHTML = `<div class="pop-head"><span class="lbl">${esc(pop.title || '')}</span><button type="button" class="iconbtn" data-pop="close" aria-label="Close" style="width:34px;height:34px">${I.close}</button></div>
      ${pop.search ? `<div class="pop-search"><input class="field" id="popSearch" placeholder="${esc(pop.searchPlaceholder || 'Search')}" autocomplete="off"></div>` : ''}
      ${pop.html || ''}
      ${pop.sections ? `<div class="pop-list" id="popList" role="listbox"${pop.multi ? ' aria-multiselectable="true"' : ''}>${list}</div>` : ''}
      ${pop.custom ? `<form class="pop-foot" id="popCustom"><input class="field" id="popCustomIn" placeholder="${esc(pop.custom.placeholder)}" maxlength="60"><button class="btn sm primary" type="submit">${esc(pop.custom.button || 'Add')}</button></form>` : ''}
      ${pop.multi ? `<div class="pop-foot"><span class="muted" style="flex:1;font-size:12.5px;align-self:center">Tap to add or remove</span><button type="button" class="btn sm" data-pop="close">Done</button></div>` : ''}`;
    const s = $('#popSearch'); if (s && innerWidth > 640) s.focus();
  } else if ($('#popList')) $('#popList').innerHTML = list;
  hydrateMedia(el);
}
function popItems() { return $$('#popList .pop-item'); }
function findPopItem(key) { for (const s of pop.sections || []) for (const it of s.items) if (it.key === key) return it; return null; }

/* pickers used across the app */
function assigneeSections(selected = []) {
  const has = (k, id) => selected.some(a => a.kind === k && a.id === id);
  return [
    { label: 'Departments', items: liveDepts().map(d => ({ key: 'dept:' + d.id, label: d.name, sub: people(membersOfDept(d.id).size), lead: deptLead(d, 28), selected: has('dept', d.id), keywords: d.code })) },
    { label: 'Groups', items: liveGroups().map(g => ({ key: 'group:' + g.id, label: g.name, sub: people(membersOfGroup(g.id).size), lead: `<span class="cicon" style="--pc:var(--${esc(g.color)});width:28px;height:28px">${icon('people', 'width:15px;height:15px')}</span>`, selected: has('group', g.id) })) },
    { label: 'People', items: activePeople().map(p => ({ key: 'user:' + p.id, label: (p.full_name || p.email) + (p.id === me() ? ' (you)' : ''), sub: [ROLE[p.role] ? ROLE[p.role].label : '', Array.from(deptsOf(p.id)).map(id => D.depts.get(id) && D.depts.get(id).name).filter(Boolean).join(', ')].filter(Boolean).join(' · '), lead: avatar(p.id), selected: has('user', p.id), keywords: p.short_name + ' ' + p.email + ' ' + p.title })) }
  ];
}
function pickAssignees(anchor, current, onChange) {
  let list = current.slice();
  openPicker(anchor, {
    title: 'Assign to', search: true, multi: true, searchPlaceholder: 'Search people, departments, groups',
    sections: assigneeSections(list),
    onPick(it) {
      const [kind, id] = it.key.split(':');
      const i = list.findIndex(a => a.kind === kind && a.id === id);
      if (i >= 0) list.splice(i, 1); else list.push({ kind, id });
      it.selected = i < 0; onChange(list.slice()); drawPop();
    }
  });
}
function datePickerHtml(cur) {
  const t = dayKey(), opts = [['Today', t], ['Tomorrow', addDays(t, 1)]];
  const dow = new Date().getDay();
  for (const [n, w] of [['Mon', 1], ['Fri', 5]]) { let k = (w - dow + 7) % 7; if (k <= 1) k += 7; opts.push(['Next ' + n, addDays(t, k)]); }
  opts.push(['In a week', addDays(t, 7)], ['In 2 weeks', addDays(t, 14)]);
  return `<div class="pop-grid">${opts.map(([l, d]) => `<button type="button" class="btn sm${d === cur ? ' primary' : ''}" data-date="${d}">${l}<small>${esc(fmtDay(d, false))}</small></button>`).join('')}</div>
    <form class="pop-foot" id="popDate"><label class="sr" for="popDateIn">Pick a date</label><input class="field" type="date" id="popDateIn" value="${esc(cur || '')}"><button class="btn sm primary" type="submit">Set</button></form>
    ${cur ? `<div class="pop-foot"><button type="button" class="btn sm ghost" data-date="">Remove date</button></div>` : ''}`;
}
function pickDate(anchor, cur, onPick) { openPicker(anchor, { title: 'Due date', html: datePickerHtml(cur), onDate: onPick }); }
function pickPriority(anchor, cur, onPick) {
  openPicker(anchor, { title: 'Priority', sections: [{ items: [1, 2, 3, 4].map(p => ({ key: String(p), label: `P${p} ${PRIO[p]}`, lead: `<span class="prio p${p}" style="width:22px">P${p}</span>`, selected: p === cur })) }], onPick: it => { onPick(+it.key); closePop(); } });
}
function pickRoom(anchor, onPick) {
  openPicker(anchor, {
    title: 'Room', search: true, searchPlaceholder: 'Search rooms',
    sections: [{ items: D.rooms.map(r => ({ key: r.name, label: r.name, sub: (r.aliases || []).join(', '), lead: icon('pin', 'color:var(--info)') })) }],
    custom: { placeholder: 'Room or floor, e.g. 12B, 2nd floor, L3', button: 'Add' },
    onPick: it => { onPick('room:' + it.key); closePop(); },
    onCustom: txt => {
      txt = txt.trim(); if (!txt) return;
      const m = /^\d/.test(txt) ? 'Room ' + txt.toUpperCase() : (detect(txt).find(x => x.type === 'room') || { label: txt }).label;
      onPick('room:' + m); closePop();
    }
  });
}
function knownTags() {
  const set = new Set(D.rules.map(r => r.tag));
  for (const t of D.tasks.values()) for (const tg of t.tags) if (!tg.includes(':')) set.add(tg);
  return Array.from(set).sort(cmpStr);
}
function pickTrade(anchor, onPick, opt) {
  opt = opt || {};
  const custom = new Map();
  for (const t of D.tasks.values()) for (const tg of t.tags) if (tg.startsWith('trade:') && !TRADES.some(x => x[0] === tg.slice(6))) custom.set(tg, tradeLabel(tg.slice(6)));
  const items = (opt.current ? [{ key: '', label: 'No tradie', lead: icon('close') }] : [])
    .concat(TRADES.map(([k, l]) => ({ key: 'trade:' + k, label: l, lead: icon('trade'), selected: opt.current === 'trade:' + k })))
    .concat(Array.from(custom, ([key, label]) => ({ key, label, lead: icon('trade'), selected: opt.current === key })));
  openPicker(anchor, {
    title: opt.title || 'Trade', search: true, searchPlaceholder: 'Search trades',
    sections: [{ items }],
    custom: { placeholder: 'Other trade', button: 'Add' },
    onPick: it => { onPick(it.key); closePop(); },
    onCustom: txt => { const s = tradeSlug(txt); if (s) { onPick('trade:' + s); closePop(); } }
  });
}
function stampTrade(t, tag) {
  const tags = (t.tags || []).filter(x => !x.startsWith('trade:'));
  if (tag) tags.push(tag);
  const before = new Set(deptsForTags(t.tags));
  const after = new Set(deptsForTags(tags));
  let assignees = (t.assignees || []).filter(a => !(a.kind === 'dept' && before.has(a.id) && !after.has(a.id)));
  assignees = foldTagDepts(tags, assignees);
  const msg = tag ? `${tradeLabel(tag.slice(6))} stamped on the task.` : 'Tradie removed.';
  return act('wtm_save_task', { p: { id: t.id, tags, assignees } }, msg);
}
function pickTag(anchor, onPick) {
  openPicker(anchor, {
    title: 'Tag', search: true, searchPlaceholder: 'Search tags',
    sections: [{ items: knownTags().map(t => ({ key: t, label: '#' + t })) }],
    custom: { placeholder: 'New tag', button: 'Add' },
    onPick: it => { onPick(it.key); closePop(); },
    onCustom: txt => { const t = txt.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-').slice(0, 40); if (t) { onPick(t); closePop(); } }
  });
}
function pickProject(anchor, cur, onPick) {
  openPicker(anchor, {
    title: 'Project', search: true,
    sections: [{ items: [{ key: '', label: 'No project', selected: !cur }].concat(liveProjects().map(p => ({ key: p.id, label: p.name, lead: `<i class="pdot" style="--pc:var(--${esc(p.color)})"></i>`, selected: p.id === cur }))) }],
    onPick: it => { onPick(it.key || null); closePop(); }
  });
}
function pickTask(anchor, onPick) {
  const list = liveTasks().filter(t => t.status !== 'done').sort((a, b) => b.updated_at - a.updated_at);
  openPicker(anchor, { title: 'Link a task', search: true, searchPlaceholder: 'Search tasks', sections: [{ items: list.map(t => ({ key: t.id, label: t.title, sub: t.due ? 'Due ' + dueLabel(t.due) : '', lead: icon('task', 'color:var(--faint)') })) }], onPick: it => { onPick(it.key); closePop(); } });
}
function openPinPicker(anchor, current, onPick) {
  const locs = liveLocations();
  if (!locs.length) { toast('No locations yet. A supervisor can add one in Settings.'); return; }
  let locId = current && locs.some(l => l.id === current.location_id) ? current.location_id : locs[0].id;
  const mapsFor = () => liveMaps().filter(m => m.location_id === locId);
  let mapId = current && mapsFor().some(m => m.id === current.map_id) ? current.map_id : (mapsFor()[0] && mapsFor()[0].id);
  let x = current && current.map_id === mapId && mapId ? +current.x : null;
  let y = current && current.map_id === mapId && mapId ? +current.y : null;
  const draw = () => {
    const box = $('#pinPop'); if (!box) return;
    const maps = mapsFor();
    if (!maps.some(m => m.id === mapId)) { mapId = maps[0] ? maps[0].id : null; x = null; y = null; }
    const map = mapId && D.maps.get(mapId);
    box.innerHTML = `<div class="chipline pin-locs">${locs.map(l => `<button type="button" class="tool${l.id === locId ? ' on' : ''}" data-pin="loc" data-id="${esc(l.id)}">${esc(l.name)}</button>`).join('')}</div>
      ${maps.length > 1 ? `<div class="chipline">${maps.map(m => `<button type="button" class="tool${m.id === mapId ? ' on' : ''}" data-pin="map" data-id="${esc(m.id)}">${esc(m.name)}</button>`).join('')}</div>` : (map ? `<p class="muted" style="margin:0 12px 6px;font-size:12.5px">${esc(map.name)}</p>` : '')}
      ${map ? `<div class="mapstage" id="mapStage" data-pin="drop"><img data-media="wtm-maps:${esc(map.image_path)}" alt="${esc(map.name)}" hidden>${x != null ? `<i class="pindot" style="left:${x}%;top:${y}%"></i>` : ''}</div><p class="muted" style="margin:6px 12px;font-size:12.5px">${x == null ? 'Tap the map to drop the pin.' : 'Tap again to move it.'}</p>` : '<p class="muted" style="margin:8px 12px">This location has no map yet. A supervisor can add one in Settings.</p>'}
      <div class="pop-foot"><button type="button" class="btn sm primary" data-pin="use"${x == null ? ' disabled' : ''}>Use this pin</button></div>`;
    hydrateMedia(box);
  };
  openPicker(anchor || document.body, { title: 'Drop a pin', html: '<div id="pinPop"></div>' });
  $('#pop').classList.add('map');
  pop.onPin = (kind, id, ev) => {
    if (kind === 'loc') { locId = id; mapId = null; x = null; y = null; draw(); }
    else if (kind === 'map') { mapId = id; x = null; y = null; draw(); }
    else if (kind === 'drop') {
      const stage = $('#mapStage'); if (!stage) return;
      const img = stage.querySelector('img');
      const r = img && img.getBoundingClientRect().width ? img.getBoundingClientRect() : stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      x = Math.round(Math.min(100, Math.max(0, (ev.clientX - r.left) / r.width * 100)) * 10) / 10;
      y = Math.round(Math.min(100, Math.max(0, (ev.clientY - r.top) / r.height * 100)) * 10) / 10;
      draw();
    } else if (kind === 'use' && x != null && mapId) {
      const pin = { map_id: mapId, location_id: locId, x, y };
      closePop();
      onPick(pin);
    }
  };
  draw();
}
function pickRecipient(anchor, onPick) {
  const u = me();
  const depts = liveDepts();
  openPicker(anchor, {
    title: 'Message', search: true, searchPlaceholder: 'Search people, departments, groups',
    sections: [
      { label: 'General (default)', items: [{ key: ALL_CONV, label: 'Everyone', sub: 'Read by all staff · no department required', lead: `<span class="cicon" style="--pc:var(--accent);width:28px;height:28px">${icon('people', 'width:15px;height:15px')}</span>` }] },
      { label: 'Departments (optional)', items: depts.map(d => ({ key: 'dept:' + d.id, label: d.name, sub: `${people(membersOfDept(d.id).size)} · read by all`, lead: deptLead(d, 28) })) },
      { label: 'Groups', items: liveGroups().filter(g => myGroups().has(g.id)).map(g => ({ key: 'group:' + g.id, label: g.name, sub: people(membersOfGroup(g.id).size), lead: `<span class="cicon" style="--pc:var(--${esc(g.color)});width:28px;height:28px">${icon('people', 'width:15px;height:15px')}</span>` })) },
      { label: 'People', items: activePeople().filter(p => p.id !== u).map(p => ({ key: 'user:' + p.id, label: p.full_name || p.email, sub: p.title || (ROLE[p.role] || {}).label, lead: avatar(p.id), keywords: p.short_name + ' ' + p.email })) }
    ],
    onPick: it => { closePop(); onPick(it.key); }
  });
}

/* ================= chrome ================= */
let rafId = 0;
function render() { if (rafId) return; rafId = requestAnimationFrame(() => { rafId = 0; renderNow(); }); }
function renderNow() {
  if (!D.ready || $('#app').hidden) return;
  renderChrome();
  if (UI.view === 'tasks') renderTasks();
  else if (UI.view === 'messages') renderMessages();
  else if (UI.view === 'board') renderBoard();
  else if (UI.view === 'orders') renderOrders();
  else if (UI.view === 'invoices') renderInvoices();
  else if (UI.view === 'mail') renderMail();
  else if (UI.view === 'daily') renderDaily();
  else if (UI.view === 'calendar') renderCalendar();
  else if (UI.view === 'handover') renderHandover();
  else if (UI.view === 'log') renderLog();
  else if (UI.view === 'people') renderPeople();
  else renderSettings();
  if (sheet && sheet.refresh) sheet.refresh();
  hydrateMedia(document);
}
function unreadIn(conv) {
  const last = D.reads[conv] || 0, u = me(); let n = 0;
  for (const m of D.msgs.values()) if (m.id > last && m.sender !== u && convKeyOf(m) === conv) n++;
  return n;
}
function totalUnread() { const u = me(); let n = 0; for (const m of D.msgs.values()) if (m.sender !== u && m.id > (D.reads[convKeyOf(m)] || 0)) n++; return n; }
const SEEN_KEY = 'wtm.seen.v1';
function newestAt(view) {
  let max = 0;
  const take = t => { if (t > max) max = t; };
  if (view === 'tasks') { for (const t of liveTasks()) take(t.created_at || 0); }
  else if (view === 'board') { for (const n of D.notices.values()) if (!n.archived_at) take(n.created_at || 0); }
  else if (view === 'orders') { for (const o of D.orders.values()) take(o.created_at || 0); }
  return max;
}
function seenMap() {
  const s = LS.json(SEEN_KEY) || {};
  let changed = false;
  for (const v of ['tasks', 'board', 'orders']) if (s[v] == null) { s[v] = newestAt(v); changed = true; }
  if (changed) LS.set(SEEN_KEY, JSON.stringify(s));
  return s;
}
function markSeen(view) {
  const s = seenMap(), at = newestAt(view);
  if ((s[view] || 0) >= at) return;
  s[view] = at;
  LS.set(SEEN_KEY, JSON.stringify(s));
}
function freshCount(view) {
  const since = seenMap()[view] || 0, u = me();
  let n = 0;
  if (view === 'tasks') { for (const t of liveTasks()) if (t.created_by !== u && (t.created_at || 0) > since) n++; }
  else if (view === 'board') { for (const item of D.notices.values()) if (!item.archived_at && item.created_by !== u && (item.created_at || 0) > since) n++; }
  else if (view === 'orders') { for (const o of D.orders.values()) if (o.created_by !== u && (o.created_at || 0) > since) n++; }
  return n;
}
function paintBadge(ids, n) {
  const label = n > 99 ? '99+' : String(n);
  for (const id of ids) {
    const el = $(id); if (!el) continue;
    el.hidden = !n;
    el.textContent = n ? label : '';
  }
}
function renderChrome() {
  if (!D.ready) return;
  const el = $('#sync'); let cls = 'ok', txt = 'Live', tip = 'Changes from others appear as they happen.';
  if (D.syncErr) { cls = 'bad'; txt = 'Offline'; tip = "Can't reach the server. Changes will load when the connection returns."; }
  else if (D.saving) { cls = 'busy'; txt = 'Saving'; tip = 'Saving your change'; }
  else if (!D.live) { cls = 'busy'; txt = 'Checking'; tip = 'Live updates are unavailable, so WTM checks for changes every 15 seconds.'; }
  el.className = 'sync ' + cls; el.title = tip; el.lastElementChild.textContent = txt;
  $('#meBtn').innerHTML = D.me ? avatar(D.me.id) : '';
  for (const b of $$('#nav button[data-view], #dock button')) { if (b.dataset.view === UI.view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
  if (UI.view === 'tasks' || UI.view === 'board' || UI.view === 'orders') markSeen(UI.view);
  const un = totalUnread(), label = un > 99 ? '99+' : String(un);
  for (const nb of [$('#navUnread'), $('#dockUnread')]) { if (!nb) continue; nb.hidden = !un; nb.textContent = label; }
  paintBadge(['#navTaskNew', '#dockTaskNew'], freshCount('tasks'));
  paintBadge(['#navBoardNew', '#dockBoardNew'], freshCount('board'));
  paintBadge(['#navOrderNew', '#dockOrderNew'], freshCount('orders'));
  $('#railFoot').innerHTML = D.me ? `Signed in as <b>${esc(D.me.full_name || D.me.email)}</b> · ${esc((ROLE[D.me.role] || {}).label || '')}<br>Press <span class="mono">N</span> for a new task, <span class="mono">/</span> to search.` : '';
  renderStats(); renderClock();
}
function renderStats() {
  const today = dayKey(); let open = 0, due = 0, over = 0;
  for (const t of liveTasks()) {
    if (t.status === 'done' || !isMine(t)) continue; open++;
    if (t.due) { if (t.due < today) over++; else if (t.due === today) due++; }
  }
  const un = totalUnread();
  $('#stats').innerHTML = `
    <button class="stat" data-go="open"><span>For me<span class="dk"> · open</span></span><b>${open}</b></button>
    <button class="stat${over ? ' warn' : ''}" data-go="today"><span>Overdue</span><b>${over}</b></button>
    <button class="stat" data-go="today"><span>Due today</span><b>${due}</b></button>
    <button class="stat${un ? ' new' : ''}" data-go="messages"><span>Unread</span><b>${un}</b></button>`;
}
function renderClock() { const n = new Date(); $('#clock').innerHTML = `<span>${esc(n.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}</span><b>${esc(fmtTime(n))}</b>`; }

/* ================= tasks view ================= */
const TABS = [['open', 'Open'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['done', 'Done'], ['all', 'All']];
function inTab(t, tab, today) {
  if (tab === 'all') return true;
  if (tab === 'done') return t.status === 'done';
  if (t.status === 'done') return false;
  if (tab === 'open') return true;
  if (tab === 'today') return (t.due && t.due <= today) || t.status === 'doing';
  if (tab === 'upcoming') return !!t.due && t.due > today;
  return true;
}
function inScope(t, s) {
  s = s || TP.scope;
  if (s === 'all') return true;
  if (s === 'mine') return isMine(t);
  if (s === 'created') return t.created_by === me();
  if (s.startsWith('dept:')) { const id = s.slice(5), mem = membersOfDept(id); return t.assignees.some(a => (a.kind === 'dept' && a.id === id) || (a.kind === 'user' && mem.has(a.id))); }
  if (s.startsWith('group:')) { const id = s.slice(6); return t.assignees.some(a => a.kind === 'group' && a.id === id); }
  if (s.startsWith('user:')) { const id = s.slice(5); return t.assignees.some(a => a.kind === 'user' && a.id === id); }
  if (s.startsWith('proj:')) return t.project_id === s.slice(5);
  return true;
}
const taskInView = t => inScope(t) && inTab(t, TP.tab, dayKey());
const cmpDue = (a, b) => (a.due ? 0 : 1) - (b.due ? 0 : 1) || (a.due && b.due ? cmpStr(a.due, b.due) : 0);
function smartRank(t, today) {
  if (t.status === 'done') return 9;
  if (t.due && t.due < today) return 0;
  if (t.status === 'doing') return 1;
  if (t.due === today) return 2;
  if (t.status === 'blocked') return 5;
  return t.due ? 3 : 4;
}
function taskComparator(key, today, tab) {
  const byCreated = (a, b) => a.created_at - b.created_at;
  switch (key) {
    case 'priority': return (a, b) => a.priority - b.priority || cmpDue(a, b) || byCreated(a, b);
    case 'due': return (a, b) => cmpDue(a, b) || a.priority - b.priority || byCreated(a, b);
    case 'updated': return (a, b) => b.updated_at - a.updated_at;
    case 'created': return (a, b) => b.created_at - a.created_at;
    case 'title': return (a, b) => cmpStr(a.title, b.title);
    default:
      if (tab === 'done') return (a, b) => (b.done_at || 0) - (a.done_at || 0);
      return (a, b) => smartRank(a, today) - smartRank(b, today) || cmpDue(a, b) || a.priority - b.priority || byCreated(a, b);
  }
}
function scopeOptions() {
  let h = `<option value="mine">Assigned to me</option><option value="created">Created by me</option><option value="all">Everything I can see</option>`;
  if (TP.scope.startsWith('user:') && prof(TP.scope.slice(5))) h += `<option value="${esc(TP.scope)}">Assigned to ${esc(nameOf(TP.scope.slice(5)))}</option>`;
  const ds = D.rank >= 3 ? liveDepts() : liveDepts().filter(d => myDepts().has(d.id));
  if (ds.length) h += `<optgroup label="Departments">${ds.map(d => `<option value="dept:${esc(d.id)}">${esc(d.name)}</option>`).join('')}</optgroup>`;
  const gs = liveGroups().filter(g => myGroups().has(g.id) || D.rank >= 3);
  if (gs.length) h += `<optgroup label="Groups">${gs.map(g => `<option value="group:${esc(g.id)}">${esc(g.name)}</option>`).join('')}</optgroup>`;
  const ps = liveProjects();
  if (ps.length) h += `<optgroup label="Projects">${ps.map(p => `<option value="proj:${esc(p.id)}">${esc(p.name)}</option>`).join('')}</optgroup>`;
  return h;
}
function taskRow(t, today) {
  const over = t.status !== 'done' && t.due && t.due < today, isToday = t.due === today && t.status !== 'done';
  const meta = [], pj = t.project_id && D.projects.get(t.project_id);
  const people = t.assignees.filter(a => a.kind === 'user'), teams = t.assignees.filter(a => a.kind !== 'user');
  if (people.length) meta.push(`<span class="avs" title="${esc(people.map(a => nameOf(a.id)).join(', '))}">${people.slice(0, 4).map(a => avatar(a.id, 'sm')).join('')}</span>${people.length === 1 ? `<span>${esc(shortOf(people[0].id))}</span>` : ''}`);
  for (const a of teams) meta.push(assigneeChip(a));
  if (pj) meta.push(`<span class="chip"><i class="pdot" style="--pc:var(--${esc(pj.color)})"></i>${esc(pj.name)}</span>`);
  if (t.status === 'doing' || t.status === 'blocked') meta.push(`<span class="spill ${t.status}">${STATUS[t.status]}${t.status === 'blocked' && t.blocked_note ? ' · ' + esc(trunc(t.blocked_note, 42)) : ''}</span>`);
  if (t.due || t.due_time) meta.push(`<span class="due${over ? ' over' : isToday ? ' today' : ''}">${over ? 'Overdue · ' : ''}${t.due ? esc(dueLabel(t.due)) : ''}${t.due && t.due_time ? ' · ' : ''}${t.due_time ? esc(hhmm(t.due_time)) : ''}</span>`);
  const ost = orderState(t.id);
  if (ost) meta.push(`<span class="tchip trade">Order ${esc(orderLabel(ost))}</span>`);
  if (t.priority <= 2) meta.push(`<span class="prio p${t.priority}">P${t.priority}</span>`);
  if (t.daily_id) meta.push('<span class="tchip daily">Daily</span>');
  if (t.pin) meta.push(`<span class="tchip">${icon('pin')}${esc(pinLabel(t.pin))}</span>`);
  for (const tg of t.tags) { const i = tagInfo(tg); if (i.type === 'trade') continue; if ((i.type === 'person' && t.assignees.some(a => a.kind === 'user' && a.id === i.id)) || (i.type === 'dept' && t.assignees.some(a => a.kind === 'dept' && a.id === i.id))) continue; meta.push(tagChip(tg)); }
  const extras = `${t.photo ? shotImg(t.photo, 'row') : ''}${t.pin ? pinFigure(t.pin, 'mini') : ''}`;
  const done = t.status === 'done';
  const trade = (t.tags.find(x => x.startsWith('trade:')) || '').slice(6);
  const acts = [`<button type="button" class="btn sm stamp${trade ? ' on' : ''}" data-act="tradie">${icon('trade')}${trade ? esc(tradeLabel(trade)) : 'Stamp tradie'}</button>`];
  if (!done && canTake(t)) acts.push(`<button type="button" class="btn sm" data-act="take">Take</button>`);
  else if (!done && t.status === 'todo' && canWork(t)) acts.push(`<button type="button" class="btn sm" data-act="start">Start</button>`);
  if (!done && (t.status === 'todo' || t.status === 'doing') && canWork(t)) acts.push(`<button type="button" class="btn sm ghost" data-act="block">Block</button>`);
  return `<li class="task p${t.priority}${done ? ' done' : ''}" data-id="${esc(t.id)}">
    <button class="check" data-act="toggle" aria-label="${done ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">${I.check}</button>
    <button class="tbody" data-act="open"><span class="ttitle">${esc(t.title)}</span>${meta.length ? `<span class="tmeta">${meta.join('')}</span>` : ''}${extras ? `<span class="textras">${extras}</span>` : ''}</button>
    ${acts.length ? `<span class="tacts">${acts.join('')}</span>` : ''}
  </li>`;
}
function renderTasks() {
  renderQa();
  const sel = $('#taskScope'), sh = scopeOptions();
  if (sel.dataset.h !== sh) { sel.innerHTML = sh; sel.dataset.h = sh; }
  if (!Array.from(sel.options).some(o => o.value === TP.scope)) TP.scope = 'mine';
  sel.value = TP.scope;
  const roomSel = $('#taskRoom');
  const roomNames = new Set(D.rooms.map(r => r.name));
  for (const t of D.tasks.values()) for (const tg of t.tags || []) if (tg.startsWith('room:')) roomNames.add(tg.slice(5));
  const roomHtml = `<option value="">All rooms</option>` + Array.from(roomNames).sort(cmpStr).map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  if (roomSel && roomSel.dataset.h !== roomHtml) { roomSel.innerHTML = roomHtml; roomSel.dataset.h = roomHtml; }
  if (roomSel) {
    if (TP.room && !Array.from(roomSel.options).some(o => o.value === TP.room)) TP.room = '';
    roomSel.value = TP.room || '';
  }
  $('#taskSort').value = ['smart', 'priority', 'due', 'updated', 'created', 'title'].includes(TP.sort) ? TP.sort : 'smart';
  $('#taskDir').innerHTML = TP.dir === 1 ? I.down : I.up;
  const today = dayKey(), q = TP.q.trim().toLowerCase();
  let list = liveTasks().filter(t => inScope(t));
  if (q) list = list.filter(t => [t.title, t.notes, t.tags.map(x => tagInfo(x).label).join(' '), t.assignees.map(assigneeLabel).join(' ')].join(' ').toLowerCase().includes(q));
  if (TP.room) list = list.filter(t => t.tags.includes('room:' + TP.room));
  const counts = {}; for (const [k] of TABS) counts[k] = list.filter(t => inTab(t, k, today)).length;
  list = list.filter(t => inTab(t, TP.tab, today));
  const cmp = taskComparator(TP.sort, today, TP.tab); list.sort((a, b) => TP.dir * cmp(a, b));
  $('#taskTabs').innerHTML = TABS.map(([k, l]) => `<button type="button" data-tab="${k}" aria-pressed="${TP.tab === k}">${l}<span class="n">${counts[k]}</span></button>`).join('');
  const mine = liveTasks().filter(t => isMine(t) && t.status !== 'done').length;
  $('#taskSummary').textContent = `${mine} open for you · ${liveTasks().length} you can see`;
  const out = $('#taskOut');
  if (!liveTasks().length) {
    out.innerHTML = `<div class="empty"><h2>No tasks yet</h2><p>Type one above. Names, departments, room numbers, floors and keywords are picked up as you type, and the buttons add an assignee, date, priority, room or tag without typing.</p></div>`;
    return;
  }
  if (!list.length) {
    const msg = TP.q ? `Nothing matches “${esc(TP.q)}”.` : TP.tab === 'today' ? 'Nothing due today and nothing in progress here.' : TP.tab === 'done' ? 'No completed tasks here yet.' : TP.tab === 'upcoming' ? 'No tasks with a future due date here.' : 'No open tasks here.';
    out.innerHTML = `<div class="empty"><p style="margin:0">${msg}</p>${TP.scope !== 'all' ? `<div class="row" style="margin-top:12px"><button class="btn sm" data-act="scope-all">Show everything I can see</button></div>` : ''}</div>`;
    return;
  }
  out.innerHTML = `<ol class="tasklist" id="taskList">${list.map(t => taskRow(t, today)).join('')}</ol>
    <p class="listfoot">${list.length} task${list.length === 1 ? '' : 's'}</p>`;
}

/* ================= task actions ================= */
const toggleDone = t => act('wtm_save_task', { p: { id: t.id, status: t.status === 'done' ? 'todo' : 'done' } });
async function deleteTask(id) {
  const t = D.tasks.get(id);
  const r = await act('wtm_delete_task', { p_task: id });
  if (r) toast(`Deleted “${trunc(t ? t.title : 'task', 36)}”`, { action: 'Undo', onAction: () => act('wtm_restore_task', { p_task: id }, 'Task restored.') });
}

/* ================= sheet (shared) ================= */
let sheet = null;
function openSheet(s) {
  closePop();
  if (sheet) closeSheet(true);
  sheet = s; if (!s.opener) s.opener = document.activeElement;
  $('#sheet').classList.toggle('wide', s.kind === 'keywords');
  $('#sheet').innerHTML = s.html();
  $('#sheetWrap').hidden = false;
  document.body.style.overflow = 'hidden';
  if (s.mount) s.mount();
  hydrateMedia($('#sheet'));
  if (s.focus) { const f = $(s.focus); if (f) f.focus(); } else $('#sheet').focus();
}
function closeSheet(force) {
  if (!sheet) return;
  closeMention();
  if (!force && sheet.dirty && sheet.dirty()) { sheet.warn = true; if (sheet.foot) sheet.foot(); return; }
  const opener = sheet.opener; sheet = null;
  $('#sheetWrap').hidden = true; $('#sheet').innerHTML = ''; $('#sheet').classList.remove('wide');
  document.body.style.overflow = '';
  if (opener && document.contains(opener)) try { opener.focus({ preventScroll: true }); } catch (_) {}
}
const sheetHead = (eyebrow, sub) => `<header class="sh-head"><div><div class="lbl" id="sh-h">${esc(eyebrow)}</div>${sub ? `<div class="sh-sub mono">${esc(sub)}</div>` : ''}</div><button type="button" class="iconbtn" data-sh="close" aria-label="Close">${I.close}</button></header>`;
function autosize(el) { if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
function insertAtCursor(el, text) {
  const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? el.value.length;
  const before = el.value.slice(0, s), sep = before && !/\s$/.test(before) ? ' ' : '';
  el.value = before + sep + text + ' ' + el.value.slice(e);
  const pos = (before + sep + text + ' ').length; el.focus(); el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ================= task sheet ================= */
function openTask(id, opener) {
  const t = D.tasks.get(id); if (!t) { toast('That task isn\'t visible to you any more.'); return; }
  if (t.deleted_at) { toast('That task was deleted.'); return; }
  taskSheet({ mode: 'edit', id, orig: t, opener });
}
function openNewTask(prefill, opener) {
  const fromQa = !prefill;
  const d = prefill || qaDraft();
  const o = { title: d.title || '', notes: '', project_id: d.project || null, priority: d.priority || 3, status: 'todo', due: d.due || null, tags: d.tags || [], assignees: d.assign || [], pin: fromQa ? QA.pin : null, photo: null, photoFile: fromQa ? QA.photoFile : null, photoPreview: fromQa ? QA.photoPreview : '' };
  taskSheet({ mode: 'new', orig: o, opener });
}
function taskSheet(cfg) {
  const o = cfg.orig, edit = cfg.mode === 'edit';
  const pinKey = p => p && p.map_id ? `${p.map_id}|${Number(p.x)}|${Number(p.y)}` : '';
  const dr = { status: o.status, priority: o.priority, assignees: o.assignees.slice(), tags: o.tags.slice(), skipDepts: new Set(), project_id: o.project_id || null, pin: o.pin ? { map_id: o.pin.map_id, location_id: o.pin.location_id, x: +o.pin.x, y: +o.pin.y } : null, photo: o.photo || null, photoFile: o.photoFile || null, photoPreview: o.photoPreview || '', photoCleared: false };
  const pullDepts = () => { dr.assignees = foldTagDepts(dr.tags, dr.assignees, dr.skipDepts); };
  const S = {
    opener: cfg.opener, kind: 'task', id: cfg.id, armed: false, warn: false,
    html: () => {
      const creator = edit && o.created_by ? ` by ${shortOf(o.created_by)}` : '';
      return `${sheetHead(edit ? 'Task' : 'New task', edit ? `Created ${fmtDay(dayOfTs(o.created_at))} ${fmtTime(o.created_at)}${creator}` : '')}
      <div class="sh-body">
        <label class="sr" for="f-title">Title</label>
        <textarea id="f-title" class="ttl" rows="1" maxlength="300" placeholder="What needs doing?">${esc(o.title)}</textarea>
        ${edit && o.daily_id ? '<p class="muted" style="margin:0">Today’s copy of a daily task. Saving here changes today. The repeating setup is on Daily.</p>' : ''}
        <div class="sugg" id="f-sugg"></div>
        <div class="fld"><span class="lbl">Status</span><div class="seg" id="f-status" role="group">${Object.entries(STATUS).map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${dr.status === v}">${l}</button>`).join('')}</div></div>
        <label class="fld" id="f-block-wrap"${dr.status === 'blocked' ? '' : ' hidden'}><span class="lbl" for="f-blocked">Why blocked</span><input class="field" id="f-blocked" maxlength="200" value="${esc(o.blocked_note || '')}" placeholder="Waiting on a part, a trade, a person…"></label>
        <div class="fld"><span class="lbl" id="f-prio-l">Priority · ${PRIO[dr.priority]}</span><div class="seg" id="f-prio" role="group">${[1, 2, 3, 4].map(p => `<button type="button" data-v="${p}" aria-pressed="${dr.priority === p}">P${p}</button>`).join('')}</div></div>
        <div class="fld"><span class="lbl">Assigned to</span><div class="chipline" id="f-assign"></div></div>
        <div class="fgrid">
          <div class="fld"><label class="lbl" for="f-project">Project</label><select class="field" id="f-project"><option value="">No project</option>${liveProjects().map(p => `<option value="${esc(p.id)}"${p.id === dr.project_id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
          <div class="fld"><label class="lbl" for="f-due">Due</label><div class="duewrap"><input class="field" type="date" id="f-due" value="${esc(o.due || '')}"><input class="field" type="time" id="f-due-time" value="${esc(hhmm(o.due_time))}" aria-label="Due time"><button type="button" class="btn sm" data-sh="duepick">${icon('cal')}Quick dates</button></div></div>
        </div>
        <div class="fld"><span class="lbl">Tags</span><div class="chipline" id="f-tags"></div></div>
        <div class="fld"><span class="lbl">Place and photo</span><div id="f-place"></div></div>
        <div class="fld"><div class="row" style="justify-content:space-between"><label class="lbl" for="f-notes">Notes</label><button type="button" class="btn sm ghost" data-sh="stamp">${icon('cal')}Insert date</button></div><textarea class="field" id="f-notes" rows="4" maxlength="5000">${esc(o.notes || '')}</textarea></div>
        ${edit ? `<div class="fld" id="f-checks"></div>
        <div class="row"><button type="button" class="btn" data-sh="message">${icon('msg')}Message about this task</button><button type="button" class="btn" data-sh="order">${icon('trade')}Add to order list</button></div>
        <div id="sh-links"></div>
        <div class="fld"><span class="lbl">History</span><ol class="hist" id="sh-hist"></ol></div>` : ''}
      </div>
      <footer class="sh-foot" id="sh-foot"></footer>`;
    },
    mount: () => { if (!edit) pullDepts(); autosize($('#f-title')); S.drawAssign(); S.drawTags(); S.drawPlace(); S.sugg(); S.foot(); S.refresh(); },
    focus: edit ? null : '#f-title',
    drawAssign: () => {
      $('#f-assign').innerHTML = dr.assignees.map(a => `<span class="dchip" data-rm-assign="${esc(a.kind + ':' + a.id)}">${icon(a.kind === 'user' ? 'person' : a.kind === 'dept' ? 'dept' : 'people')}<span class="lbltxt">${esc(assigneeLabel(a))}</span><button type="button" class="x" aria-label="Remove ${esc(assigneeLabel(a))}">${icon('close', 'width:13px;height:13px')}</button></span>`).join('')
        + `<input class="mention-in" id="f-assign-in" placeholder="Type @ then a name" autocomplete="off" aria-autocomplete="list" aria-label="Assign to a department or staff member">`
        + `<button type="button" class="btn sm" data-sh="assign">${I.plus}${dr.assignees.length ? 'Change' : 'Assign'}</button>`;
    },
    drawTags: () => {
      $('#f-tags').innerHTML = dr.tags.map(t => { const i = tagInfo(t); return `<span class="dchip" data-rm-tag="${esc(t)}">${icon(tagGlyph(i.type))}<span class="lbltxt">${esc(i.type === 'word' ? i.label.slice(1) : i.label)}</span><button type="button" class="x" aria-label="Remove tag">${icon('close', 'width:13px;height:13px')}</button></span>`; }).join('')
        + `<button type="button" class="btn sm" data-sh="addtag">${icon('hash')}Tag</button><button type="button" class="btn sm" data-sh="addroom">${icon('pin')}Room</button><button type="button" class="btn sm" data-sh="addtrade">${icon('trade')}Trade</button>`;
    },
    drawPlace: () => {
      const el = $('#f-place'); if (!el) return;
      const shot = dr.photoPreview ? shotImg('', '', dr.photoPreview) : shotImg(dr.photo, '');
      el.innerHTML = `<div class="place-row">${dr.pin ? pinFigure(dr.pin) : ''}${shot}</div>
        <div class="row"><button type="button" class="btn sm" data-sh="pin">${icon('pin')}${dr.pin ? 'Move pin' : 'Drop pin'}</button>
        ${dr.pin ? '<button type="button" class="btn sm ghost" data-sh="clear-pin">Remove pin</button>' : ''}
        <button type="button" class="btn sm" data-sh="photo">${icon('camera')}${dr.photo || dr.photoFile ? 'Change photo' : 'Add photo'}</button>
        ${(dr.photo || dr.photoFile) && !dr.photoCleared ? '<button type="button" class="btn sm ghost" data-sh="clear-photo">Remove photo</button>' : ''}</div>`;
      hydrateMedia(el);
    },
    sugg: () => {
      const det = detect($('#f-title').value).filter(d => d.tag && !dr.tags.includes(d.tag));
      $('#f-sugg').innerHTML = det.length ? `<span>Found in the title:</span>${det.map(d => `<button type="button" data-sugg="${esc(d.tag)}">+ ${esc(d.type === 'tag' ? d.label : d.type === 'person' ? '@' + shortOf(d.id) : d.label)}</button>`).join('')}` : '';
    },
    values: () => ({
      title: $('#f-title').value.trim().slice(0, 300), status: dr.status, priority: dr.priority, project_id: $('#f-project').value || null,
      due: isDay($('#f-due').value) ? $('#f-due').value : null, due_time: $('#f-due-time') && $('#f-due-time').value ? $('#f-due-time').value : null, tags: dr.tags.slice(), notes: $('#f-notes').value.slice(0, 5000), assignees: dr.assignees.slice(),
      blocked_note: dr.status === 'blocked' && $('#f-blocked') ? $('#f-blocked').value.trim().slice(0, 200) : ''
    }),
    patch: () => {
      const v = S.values(), p = {};
      if (v.title !== (o.title || '').trim()) p.title = v.title;
      if (v.status !== o.status) p.status = v.status;
      if (v.priority !== o.priority) p.priority = v.priority;
      if ((v.project_id || null) !== (o.project_id || null)) p.project_id = v.project_id;
      if ((v.due || null) !== (o.due || null)) p.due = v.due;
      if ((v.due_time || null) !== (hhmm(o.due_time) || null)) p.due_time = v.due_time || '';
      if (v.tags.slice().sort().join('|') !== o.tags.slice().sort().join('|')) p.tags = v.tags;
      if (v.notes !== (o.notes || '')) p.notes = v.notes;
      if ((v.blocked_note || '') !== (o.blocked_note || '')) p.blocked_note = v.blocked_note;
      const ak = l => l.map(a => a.kind + ':' + a.id).sort().join('|');
      if (ak(v.assignees) !== ak(o.assignees)) p.assignees = v.assignees;
      if (pinKey(dr.pin) !== pinKey(o.pin)) p.pin = dr.pin;
      if (dr.photoCleared) { if (o.photo) p.photo = ''; }
      else if (dr.photo && dr.photo !== o.photo) p.photo = dr.photo;
      return p;
    },
    dirty: () => Object.keys(S.patch()).length > 0 || !!dr.photoFile,
    foot: () => {
      const f = $('#sh-foot'); if (!f) return;
      const dirty = S.dirty(), key = [edit, S.armed, !!(S.warn && dirty)].join('|');
      if (f.dataset.k === key) { const s = f.querySelector('[data-sh="save"]'); if (s) s.disabled = edit && !dirty; return; }
      f.dataset.k = key;
      f.innerHTML = `${edit && canDelete(o) ? `<button type="button" class="btn danger${S.armed ? ' armed' : ''}" data-sh="delete">${S.armed ? 'Tap again to delete' : 'Delete'}</button>` : ''}
        <span class="spacer"></span>
        ${S.warn && dirty ? `<span class="dirty">Unsaved changes</span><button type="button" class="btn ghost" data-sh="discard">Discard</button>` : ''}
        <button type="button" class="btn primary" data-sh="save"${edit && !dirty ? ' disabled' : ''}>${edit ? 'Save changes' : 'Add task'}</button>`;
    },
    refresh: () => {
      if (!edit) return;
      const t = D.tasks.get(cfg.id);
      if (!t || t.deleted_at) { closeSheet(true); return; }
      const hl = $('#sh-hist');
      if (hl) {
        const es = Array.from(D.log.values()).filter(e => e.task_id === cfg.id).sort((a, b) => b.id - a.id);
        const key = es.length + '|' + (es[0] ? es[0].id : '');
        if (hl.dataset.k !== key) {
          hl.dataset.k = key;
          hl.innerHTML = es.length ? es.slice(0, 80).map(e => { const a = actionOf(e.action); return `<li class="t-${a.tone}"><div class="when">No. ${pad4(e.id)} · ${esc(fmtDay(e.day))} ${esc(fmtTime(e.ts))} · ${esc(whoLabel(e.actor))}</div><div><span class="what">${esc(a.label)}</span>${e.duration_ms != null ? ` <span class="mono">${esc(fmtDur(+e.duration_ms))}</span>` : ''}</div>${e.detail ? `<div class="det">${esc(e.detail)}</div>` : ''}</li>`; }).join('') : '<li class="t-muted"><div class="det">No entries yet.</div></li>';
        }
      }
      const links = $('#sh-links'), checks = $('#f-checks'), live = D.tasks.get(cfg.id);
      if (checks && live) {
        checks.innerHTML = live.checks && live.checks.length ? `<span class="lbl">Checklist</span><div class="checks">${live.checks.map((c, i) => `<button type="button" class="btn sm ghost${c.done ? ' on' : ''}" data-sh="check" data-i="${i}" aria-pressed="${c.done ? 'true' : 'false'}">${c.done ? 'Done · ' : ''}${esc(c.t)}</button>`).join('')}</div>` : '';
      }
      if (links && live) {
        const ords = ordersFor(cfg.id);
        const msgs = Array.from(D.msgs.values()).filter(m => m.task_id === cfg.id).sort((a, b) => b.id - a.id).slice(0, 8);
        const bits = [];
        if (ords.length) bits.push(`<div class="fld"><span class="lbl">Orders</span><div class="checks">${ords.map(o => `<span class="tchip trade">${esc(orderLabel(o.status))} · ${esc(trunc(o.item, 40))}</span>`).join('')}</div></div>`);
        if (msgs.length) bits.push(`<div class="fld"><span class="lbl">Messages</span><ul class="mini-list">${msgs.map(m => `<li><span class="grow"><b>${esc(shortOf(m.sender))}</b> ${esc(trunc(m.body, 80))}</span><small>${esc(fmtWhen(m.at))}</small></li>`).join('')}</ul></div>`);
        links.innerHTML = bits.join('');
      }
    },
    save: async () => {
      const v = S.values();
      if (!v.title) { toast('Give the task a title first.'); $('#f-title').focus(); return; }
      if (v.status === 'blocked' && !v.blocked_note) { toast('Say why this task is blocked.'); const b = $('#f-blocked'); if (b) b.focus(); return; }
      const btn = $('#sh-foot [data-sh="save"]'); if (btn) btn.disabled = true;
      let uploaded = null;
      if (dr.photoFile) {
        uploaded = await putImage('wtm-photos', me(), dr.photoFile);
        if (!uploaded) { if (btn) btn.disabled = false; return; }
        dr.photo = uploaded; dr.photoFile = null; dr.photoCleared = false;
      }
      let r;
      if (!edit) {
        const p = { title: v.title, status: v.status, priority: v.priority, project_id: v.project_id, due: v.due, due_time: v.due_time || '', tags: v.tags, notes: v.notes, assignees: v.assignees, blocked_note: v.blocked_note };
        if (dr.pin) p.pin = dr.pin;
        if (dr.photo) p.photo = dr.photo;
        r = await act('wtm_save_task', { p }, 'Task added.');
      } else { const p = S.patch(); if (!Object.keys(p).length) { closeSheet(true); return; } r = await act('wtm_save_task', { p: Object.assign({ id: cfg.id }, p) }); }
      if (!r && uploaded) sb.storage.from('wtm-photos').remove([uploaded]);
      if (r) {
        if (!edit) {
          if (dr.photoPreview && dr.photoPreview !== QA.photoPreview) URL.revokeObjectURL(dr.photoPreview);
          $('#qaInput').value = ''; resetQA(); renderQa();
        }
        closeSheet(true);
      }
      else if (btn) btn.disabled = false;
    },
    click: (b, e) => {
      const k = b.dataset.sh;
      if (k === 'assign') pickAssignees(b, dr.assignees, l => { dr.assignees = l; S.drawAssign(); S.foot(); });
      else if (k === 'duepick') pickDate(b, $('#f-due').value, d => { $('#f-due').value = d || ''; S.foot(); });
      else if (k === 'addtag') pickTag(b, t => { if (!dr.tags.includes(t)) dr.tags.push(t); pullDepts(); S.drawTags(); S.drawAssign(); S.sugg(); S.foot(); });
      else if (k === 'addroom') pickRoom(b, t => { if (!dr.tags.includes(t)) dr.tags.push(t); S.drawTags(); S.sugg(); S.foot(); });
      else if (k === 'addtrade') pickTrade(b, t => { if (!dr.tags.includes(t)) dr.tags.push(t); pullDepts(); S.drawTags(); S.drawAssign(); S.sugg(); S.foot(); });
      else if (k === 'pin') openPinPicker(b, dr.pin, pin => { dr.pin = pin; S.drawPlace(); S.foot(); });
      else if (k === 'clear-pin') { dr.pin = null; S.drawPlace(); S.foot(); }
      else if (k === 'photo') pickImageFile().then(file => {
        if (!file || sheet !== S) return;
        if (dr.photoPreview && dr.photoPreview !== QA.photoPreview) URL.revokeObjectURL(dr.photoPreview);
        dr.photoFile = file; dr.photoPreview = URL.createObjectURL(file); dr.photoCleared = false; S.drawPlace(); S.foot();
      });
      else if (k === 'clear-photo') {
        if (dr.photoPreview && dr.photoPreview !== QA.photoPreview) URL.revokeObjectURL(dr.photoPreview);
        dr.photoPreview = ''; dr.photoFile = null; dr.photo = null; dr.photoCleared = true; S.drawPlace(); S.foot();
      }
      else if (k === 'stamp') insertAtCursor($('#f-notes'), stamp());
      else if (k === 'message') { const id = cfg.id; pickRecipient(b, key => { closeSheet(true); UI.linkTask = id; openConv(key); }); }
      else if (k === 'order') { const t = D.tasks.get(cfg.id); closeSheet(true); if (t) orderFromTask(t); }
      else if (k === 'check') { toggleChecks(cfg.id, +b.dataset.i); }
      else if (k === 'save') S.save();
      else if (k === 'discard') closeSheet(true);
      else if (k === 'delete') {
        if (!S.armed) { S.armed = true; S.foot(); setTimeout(() => { if (sheet === S && S.armed) { S.armed = false; S.foot(); } }, 3500); }
        else { closeSheet(true); deleteTask(cfg.id); }
      }
    }
  };
  S.onSeg = b => {
    const seg = b.parentElement;
    if (seg.id === 'f-status') { dr.status = b.dataset.v; const w = $('#f-block-wrap'); if (w) w.hidden = dr.status !== 'blocked'; }
    else if (seg.id === 'f-prio') { dr.priority = +b.dataset.v; $('#f-prio-l').textContent = 'Priority · ' + PRIO[dr.priority]; }
    else return;
    for (const x of seg.children) x.setAttribute('aria-pressed', String(x === b));
    S.foot();
  };
  S.onRemove = el => {
    if (el.dataset.rmAssign) { const [kind, id] = el.dataset.rmAssign.split(':'); if (kind === 'dept' && deptsForTags(dr.tags).includes(id)) dr.skipDepts.add(id); dr.assignees = dr.assignees.filter(a => !(a.kind === kind && a.id === id)); S.drawAssign(); }
    if (el.dataset.rmTag) { dr.tags = dr.tags.filter(t => t !== el.dataset.rmTag); S.drawTags(); S.sugg(); }
    S.foot();
  };
  S.onSugg = tag => { if (!dr.tags.includes(tag)) dr.tags.push(tag); pullDepts(); S.drawTags(); S.drawAssign(); S.sugg(); S.foot(); };
  const addAssignee = item => {
    if (!dr.assignees.some(a => a.kind === item.kind && a.id === item.id)) dr.assignees.push({ kind: item.kind, id: item.id });
    S.drawAssign(); S.foot();
    const again = $('#f-assign-in'); if (again) again.focus();
  };
  S.onInput = el => {
    if (el.id === 'f-title') { autosize(el); S.sugg(); syncMention(el, 'title', addAssignee, dr.assignees); }
    else if (el.id === 'f-assign-in') syncMention(el, 'field', addAssignee, dr.assignees);
    S.foot();
  };
  openSheet(S);
}

/* ================= messages view ================= */
function convKeyOf(m) {
  if (m.to_kind === 'all') return ALL_CONV;
  if (m.to_kind === 'user') return 'user:' + (m.sender === me() ? m.to_id : m.sender);
  return m.to_kind + ':' + m.to_id;
}
function convInfo(key) {
  const [kind, id] = (key || ALL_CONV).split(':');
  if (kind === 'all') return { key: ALL_CONV, kind: 'all', id: ALL_ID, name: 'Everyone', sub: 'All staff · read by all', lead: `<span class="cicon" style="--pc:var(--accent)">${I.people}</span>`, canPost: true };
  if (kind === 'user') { const p = prof(id); return { key, kind, id, name: p ? p.full_name || p.email : 'Someone', sub: p ? [p.title, (ROLE[p.role] || {}).label].filter(Boolean).join(' · ') : '', lead: avatar(id), canPost: !!(p && p.active) }; }
  if (kind === 'dept') { const d = D.depts.get(id); const L = deptLook(d); return { key, kind, id, name: d ? d.name : 'Department', sub: `${people(membersOfDept(id).size)} · department · read by all`, color: L.color, lead: deptLead(d), canPost: true }; }
  const g = D.groups.get(id); return { key, kind, id, name: g ? g.name : 'Group', sub: `${people(membersOfGroup(id).size)} · group`, lead: `<span class="cicon" style="--pc:var(--${esc(g ? g.color : 'c8')})">${I.people}</span>`, canPost: myGroups().has(id) };
}
function conversations() {
  const map = new Map();
  map.set(ALL_CONV, { key: ALL_CONV, last: null, sec: 'Everyone' });
  for (const d of liveDepts()) map.set('dept:' + d.id, { key: 'dept:' + d.id, last: null, sec: 'Departments' });
  for (const id of myGroups()) { const g = D.groups.get(id); if (g && !g.archived) map.set('group:' + id, { key: 'group:' + id, last: null, sec: 'Groups' }); }
  for (const m of D.msgs.values()) {
    const k = convKeyOf(m);
    const [kind, id] = k.split(':');
    const hidden = (kind === 'user' && id !== me() && !prof(id)) || (kind === 'dept' && !D.depts.has(id));
    if (!hidden) {
      if (!map.has(k)) map.set(k, { key: k, last: null, sec: k.startsWith('user:') ? 'Direct' : k.startsWith('dept:') ? 'Departments' : 'Groups' });
      const c = map.get(k); if (!c.last || m.id > c.last.id) c.last = m;
    }
    if (m.to_kind === 'all' || (m.to_kind === 'dept' && D.depts.has(m.to_id))) {
      const ca = map.get(ALL_CONV); if (ca && (!ca.last || m.id > ca.last.id)) ca.last = m;
    }
  }
  if (UI.conv && ((UI.conv.startsWith('user:') && UI.conv.slice(5) !== me() && !prof(UI.conv.slice(5))) || (UI.conv.startsWith('dept:') && !D.depts.has(UI.conv.slice(5))))) UI.conv = ALL_CONV;
  if (UI.conv && !map.has(UI.conv)) map.set(UI.conv, { key: UI.conv, last: null, sec: UI.conv.startsWith('user:') ? 'Direct' : UI.conv.startsWith('dept:') ? 'Departments' : 'Groups' });
  return Array.from(map.values()).map(c => Object.assign(c, convInfo(c.key), { unread: unreadIn(c.key) }));
}
function renderMessages() {
  if (!UI.conv) UI.conv = ALL_CONV;
  const all = conversations(), order = ['Everyone', 'Departments', 'Groups', 'Direct'];
  const sortC = (a, b) => (a.key === ALL_CONV ? -1 : b.key === ALL_CONV ? 1 : (b.last ? b.last.id : 0) - (a.last ? a.last.id : 0) || cmpStr(a.name, b.name));
  const cur = all.find(c => c.key === UI.conv) || convInfo(UI.conv);
  const open = $('#convList').classList.contains('open');
  const badge = n => n ? `<span class="un badge" style="background:var(--danger);color:var(--surface)">${n > 99 ? '99+' : n}</span>` : '';
  let h = `<button type="button" class="conv-pick" id="convPick" aria-expanded="${open ? 'true' : 'false'}" aria-haspopup="listbox" aria-controls="convMenu">${cur.lead}<span class="nm">${esc(cur.name)}</span>${badge(cur.unread)}<svg class="ico chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="conv-menu" id="convMenu" role="listbox" aria-label="Conversations">`;
  for (const sec of order) {
    const list = all.filter(c => c.sec === sec).sort(sortC); if (!list.length) continue;
    h += `<div class="convsec">${esc(sec)}</div>` + list.map(c => `<button type="button" class="conv${c.unread ? ' unread' : ''}" data-conv="${esc(c.key)}" role="option"${c.color ? ` style="--pc:var(--${esc(c.color)})"` : ''}${UI.conv === c.key ? ' aria-selected="true" aria-current="true"' : ''}>${c.lead}<span class="nm">${esc(c.name)}</span><span class="tm">${c.last ? esc(fmtWhen(c.last.at)) : ''}</span><span class="pv">${c.last ? esc((c.last.sender === me() ? 'You: ' : c.kind !== 'user' ? shortOf(c.last.sender) + ': ' : '') + (c.last.body || (c.last.photo ? 'Photo' : c.last.pin ? 'Pin' : ''))) : esc(c.sub)}</span>${badge(c.unread)}</button>`).join('');
  }
  h += '</div>';
  $('#convList').innerHTML = h;
  $('#msgLayout').classList.toggle('open', !!UI.conv);
  renderThread();
}
function msgHtml(s) {
  return String(s).split(/((?:^|(?<=\s))[@^][^\s@#^]+)/).map((p, i) => {
    if (i % 2 === 0) return esc(p);
    if (p[0] === '@') {
      const hit = findAssignee(p.slice(1));
      if (hit && hit.kind === 'dept') { const L = deptLook(D.depts.get(hit.id)); return `<b class="mtag dept" style="--pc:var(--${esc(L.color)})">${icon(L.icon, 'width:12px;height:12px')}${esc(p)}</b>`; }
      if (hit && hit.kind === 'user') return `<b class="mtag person">${esc(p)}</b>`;
    }
    if (p[0] === '^') return `<b class="mtag place">${esc(p)}</b>`;
    return `<b class="mtag">${esc(p)}</b>`;
  }).join('');
}
function deptTag(d, prefix) {
  const L = deptLook(d);
  return `<span class="dept-tag" style="--pc:var(--${esc(L.color)})">${icon(L.icon, 'width:12px;height:12px')}${prefix || ''}${esc(d ? d.name : 'Department')}</span>`;
}
let threadKey = '';
function renderThread() {
  const th = $('#thread');
  if (!UI.conv) UI.conv = ALL_CONV;
  const c = Object.assign({ key: UI.conv }, convInfo(UI.conv));
  const isAll = c.key === ALL_CONV;
  const msgs = Array.from(D.msgs.values()).filter(m => {
    if (m.to_kind === 'dept' && !D.depts.has(m.to_id)) return false;
    return isAll ? (m.to_kind === 'all' || m.to_kind === 'dept') : convKeyOf(m) === c.key;
  }).sort((a, b) => a.id - b.id);
  const canPost = c.kind === 'user' ? !!(prof(c.id) && prof(c.id).active) : c.canPost;
  const key = c.key + '|' + msgs.length + '|' + (msgs.length ? msgs[msgs.length - 1].id : 0) + '|' + canPost + '|' + D.dirVersion + '|' + UI.msgDept;
  const lt = UI.linkTask && D.tasks.get(UI.linkTask);
  if (threadKey !== key) {
    const wasNew = threadKey.split('|')[0] !== c.key;
    const draft = $('#msgBody') ? $('#msgBody').value : '';
    let body = '', lastDay = '';
    for (const m of msgs) {
      const d = dayOfTs(m.at);
      if (d !== lastDay) { body += `<div class="dsep">${esc(d === dayKey() ? 'Today' : fmtDay(d))}</div>`; lastDay = d; }
      const mine = m.sender === me(), t = m.task_id && D.tasks.get(m.task_id);
      const deptObj = m.to_kind === 'dept' ? D.depts.get(m.to_id) : null;
      const fromLbl = !mine && c.kind !== 'user'
        ? `${esc(nameOf(m.sender))}${isAll && deptObj ? ` · ${deptTag(deptObj)}` : ''}`
        : (mine && isAll && deptObj ? deptTag(deptObj, 'To ') : '');
      body += `<div class="bub${mine ? ' me' : ''}">${fromLbl ? `<span class="from">${fromLbl}</span>` : ''}${m.body ? `<span class="body">${msgHtml(m.body)}</span>` : ''}${m.photo ? shotImg(m.photo) : ''}${m.pin ? pinFigure(m.pin, 'mini') : ''}${m.task_id ? `<button type="button" class="tlink" data-open-task="${esc(m.task_id)}">${icon('task', 'width:14px;height:14px')}${esc(t ? trunc(t.title, 50) : 'Linked task')}</button>` : ''}<span class="at">${esc(fmtTime(m.at))}</span></div>`;
    }
    const depts = liveDepts();
    const deptSelect = isAll && depts.length ? `<label class="msg-dept-opt"><span class="sr">Department (optional)</span><select class="field sm" id="msgDept" title="Optional: tag a department (still read by all)"><option value="">Dept: Optional (All)</option>${depts.map(d => `<option value="${esc(d.id)}"${UI.msgDept === d.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>` : '';
    th.innerHTML = `<div class="thead${c.kind === 'dept' ? ' dept' : ''}"${c.color ? ` style="--pc:var(--${esc(c.color)})"` : ''}><button type="button" class="iconbtn" data-act="conv-back" aria-label="Back to conversations">${I.back}</button>${c.lead}<div class="who"><b>${esc(c.name)}</b><span>${esc(c.sub)}</span></div></div>
      <div class="tmsgs" id="tmsgs">${body || `<p class="muted" style="margin:auto;text-align:center;font-size:13.5px">No messages yet. Type below and press Send — everyone can read it.</p>`}</div>
      ${canPost ? `<form class="tcompose" id="msgForm" autocomplete="off">
        <div class="linkbar" id="msgLinked"></div>
        <div class="linkbar" id="msgAttach"></div>
        <label class="sr" for="msgBody">Message</label>
        <textarea class="field" id="msgBody" rows="1" maxlength="4000" placeholder="Write a message…" aria-autocomplete="list"></textarea>
        <p class="taghelp"><b>@</b> person or department · <b>#</b> task · <b>^</b> place, such as Unit 12</p>
        <div class="row msg-bar"><span class="row tight">${deptSelect}<button type="button" class="btn sm ghost" data-act="msg-stamp">${icon('cal')}Date</button><button type="button" class="btn sm ghost" data-act="msg-pin">${icon('pin')}Pin</button><button type="button" class="btn sm ghost" data-act="msg-photo">${icon('camera')}Photo</button><button type="button" class="btn sm ghost" data-act="msg-link">${icon('link')}Task</button></span><button type="submit" class="btn sm primary">${icon('send')}Send</button></div>
      </form>` : `<div class="tcompose"><p class="muted" style="margin:0;font-size:13px">You can't reply here.</p></div>`}`;
    threadKey = key;
    if ($('#msgBody') && draft && !wasNew) { $('#msgBody').value = draft; autosize($('#msgBody')); }
    const box = $('#tmsgs');
    requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  }
  const ml = $('#msgLinked');
  if (ml) ml.innerHTML = lt ? `${icon('link', 'width:14px;height:14px')}Linked: <b>${esc(trunc(lt.title, 50))}</b><button type="button" class="btn sm ghost" data-act="msg-unlink">Remove</button>` : '';
  const ma = $('#msgAttach');
  if (ma) ma.innerHTML = attachPreview(UI.msgPin, UI.msgPhotoPreview, 'bar');
  if (msgs.length && UI.view === 'messages' && !document.hidden) {
    const byConv = new Map();
    for (const m of msgs) { const k = convKeyOf(m); if (m.id > (byConv.get(k) || 0)) byConv.set(k, m.id); }
    let marked = false;
    for (const [k, maxId] of byConv) {
      if (maxId > (D.reads[k] || 0)) {
        D.reads[k] = maxId;
        call('wtm_mark_read', { p_conv: k, p_last: maxId }).catch(() => {});
        const cv = $(`.conv[data-conv="${CSS.escape(k)}"]`); if (cv) { cv.classList.remove('unread'); const b = cv.querySelector('.un'); if (b) b.remove(); }
        marked = true;
      }
    }
    if (marked) renderChrome();
  }
}
function closeConvMenu() { const list = $('#convList'); if (list) list.classList.remove('open'); const b = $('#convPick'); if (b) b.setAttribute('aria-expanded', 'false'); }
function openConv(key) { UI.conv = key || ALL_CONV; threadKey = ''; closeConvMenu(); if (UI.view !== 'messages') setView('messages'); else renderMessages(); setTimeout(() => { const b = $('#msgBody'); if (b && innerWidth > 640) b.focus(); }, 50); }
async function sendMessage() {
  const el = $('#msgBody'), body = el.value.trim();
  if (!body && !UI.msgPin && !UI.msgPhotoFile) { el.focus(); return; }
  let [kind, id] = (UI.conv || ALL_CONV).split(':');
  if (kind === 'all' && UI.msgDept && D.depts.has(UI.msgDept)) { kind = 'dept'; id = UI.msgDept; }
  const btn = $('#msgForm button[type="submit"]'); btn.disabled = true;
  let photo = null;
  if (UI.msgPhotoFile) {
    photo = await putImage('wtm-photos', me(), UI.msgPhotoFile);
    if (!photo) { btn.disabled = false; return; }
  }
  const r = await act('wtm_send_message', { p_kind: kind, p_to: id, p_body: body, p_task: UI.linkTask || null, p_pin: UI.msgPin, p_photo: photo });
  if (!r && photo) sb.storage.from('wtm-photos').remove([photo]);
  btn && (btn.disabled = false);
  if (r) { el.value = ''; autosize(el); UI.linkTask = null; clearMsgAttach(); threadKey = ''; renderMessages(); $('#msgBody') && $('#msgBody').focus(); }
}
function openNewMessageSheet() {
  let linkTask = null, pin = null, photoFile = null, photoPreview = '';
  const depts = liveDepts(), groups = liveGroups().filter(g => myGroups().has(g.id)).sort((a, b) => cmpStr(a.name, b.name)), others = activePeople().filter(p => p.id !== me());
  const byRole = ['it', 'admin', 'supervisor', 'staff'].map(role => ({ role, people: others.filter(p => p.role === role).sort((a, b) => cmpStr(a.full_name || a.email, b.full_name || b.email)) })).filter(g => g.people.length);
  const leftover = others.filter(p => !ROLE[p.role]).sort((a, b) => cmpStr(a.full_name || a.email, b.full_name || b.email));
  const whoName = p => esc(p.full_name || p.email) + (p.title ? ' · ' + esc(p.title) : '');
  const S = {
    kind: 'new-msg', focus: '#nm-body',
    html: () => `${sheetHead('New message', 'Leave the second list empty to send to everyone, or to one department')}
      <div class="sh-body">
        <label class="fld">
          <span class="lbl" for="nm-dept">Department</span>
          <select class="field" id="nm-dept">
            <option value="${ALL_CONV}">Everyone</option>
            ${depts.map(d => `<option value="dept:${esc(d.id)}">${esc(d.name)}</option>`).join('')}
          </select>
        </label>
        <label class="fld">
          <span class="lbl" for="nm-who">Group or person</span>
          <select class="field" id="nm-who">
            <option value="">No one — use the department above</option>
            ${groups.length ? `<optgroup label="Groups">${groups.map(g => `<option value="group:${esc(g.id)}">${esc(g.name)}</option>`).join('')}</optgroup>` : ''}
            ${byRole.map(g => `<optgroup label="${esc(ROLE[g.role].label)}">${g.people.map(p => `<option value="user:${esc(p.id)}">${whoName(p)}</option>`).join('')}</optgroup>`).join('')}
            ${leftover.length ? `<optgroup label="Other">${leftover.map(p => `<option value="user:${esc(p.id)}">${whoName(p)}</option>`).join('')}</optgroup>` : ''}
          </select>
        </label>
        <label class="fld">
          <span class="lbl">Message</span>
          <textarea class="field" id="nm-body" rows="3" maxlength="4000" placeholder="Type your message and press Send…"></textarea>
        </label>
        <p class="taghelp"><b>@</b> tags a person or department, <b>#</b> links a task, and <b>^</b> tags a place such as Unit 12. A list opens as you type. Arrow keys move through it, and Enter picks.</p>
        <div class="linkbar" id="nm-linked"></div>
        <div class="linkbar" id="nm-attach"></div>
      </div>
      <footer class="sh-foot">
        <button type="button" class="btn sm ghost" data-sh="nm-stamp">${icon('cal')}Date</button>
        <button type="button" class="btn sm ghost" data-sh="nm-pin">${icon('pin')}Pin</button>
        <button type="button" class="btn sm ghost" data-sh="nm-photo">${icon('camera')}Photo</button>
        <button type="button" class="btn sm ghost" data-sh="nm-link">${icon('link')}Task</button>
        <span class="spacer"></span>
        <button type="button" class="btn" data-sh="close">Cancel</button>
        <button type="button" class="btn primary" data-sh="nm-send">${icon('send')}Send</button>
      </footer>`,
    mount() { S.drawLinked(); S.drawAttach(); },
    drawLinked() {
      const el = $('#nm-linked'), lt = linkTask && D.tasks.get(linkTask);
      if (el) el.innerHTML = lt ? `${icon('link', 'width:14px;height:14px')}Linked: <b>${esc(trunc(lt.title, 50))}</b><button type="button" class="btn sm ghost" data-sh="nm-unlink">Remove</button>` : '';
    },
    drawAttach() {
      const el = $('#nm-attach'); if (el) el.innerHTML = attachPreview(pin, photoPreview, 'sheet');
    },
    click: async b => {
      const k = b.dataset.sh;
      if (k === 'nm-stamp') { insertAtCursor($('#nm-body'), stamp()); return; }
      if (k === 'nm-pin') { openPinPicker(b, pin, next => { pin = next; S.drawAttach(); }); return; }
      if (k === 'nm-clear-pin') { pin = null; S.drawAttach(); return; }
      if (k === 'nm-photo') {
        const file = await pickImageFile();
        if (!file || sheet !== S) return;
        if (photoPreview) URL.revokeObjectURL(photoPreview);
        photoFile = file; photoPreview = URL.createObjectURL(file); S.drawAttach(); return;
      }
      if (k === 'nm-clear-photo') {
        if (photoPreview) URL.revokeObjectURL(photoPreview);
        photoFile = null; photoPreview = ''; S.drawAttach(); return;
      }
      if (k === 'nm-link') { pickTask(b, id => { linkTask = id; S.drawLinked(); }); return; }
      if (k === 'nm-unlink') { linkTask = null; S.drawLinked(); return; }
      if (k === 'nm-send') {
        const body = $('#nm-body').value.trim();
        if (!body && !pin && !photoFile) { toast('Write a message, add a photo, or drop a pin.'); $('#nm-body').focus(); return; }
        const target = ($('#nm-who') && $('#nm-who').value) || ($('#nm-dept') ? $('#nm-dept').value : ALL_CONV);
        const [kind, id] = target.split(':');
        b.disabled = true;
        let photo = null;
        if (photoFile) {
          photo = await putImage('wtm-photos', me(), photoFile);
          if (!photo) { b.disabled = false; return; }
        }
        const r = await act('wtm_send_message', { p_kind: kind, p_to: id, p_body: body, p_task: linkTask || null, p_pin: pin, p_photo: photo }, 'Message sent.');
        if (!r && photo) sb.storage.from('wtm-photos').remove([photo]);
        b.disabled = false;
        if (r) {
          closeSheet(true);
          openConv(kind === 'dept' ? ALL_CONV : target);
        }
      }
    }
  };
  openSheet(S);
}

/* ================= log book view ================= */
function deptNames(uidv) { return Array.from(deptsOf(uidv)).map(id => D.depts.get(id)).filter(Boolean).map(d => headsOfDept(d.id).has(uidv) ? 'Head of ' + d.name : d.name).sort(cmpStr); }
const LKEYS = {
  n:   { label: 'No.',      get: e => e.id, dirs: ['first entry first', 'latest entry first'], def: -1 },
  ts:  { label: 'Time',     get: e => e.ts, dirs: ['oldest first', 'newest first'], def: -1 },
  a:   { label: 'Action',   get: e => actionOf(e.action).label, dirs: ['A–Z', 'Z–A'], def: 1 },
  tt:  { label: 'Task',     get: e => e.task_title || '', dirs: ['A–Z', 'Z–A'], def: 1 },
  dur: { label: 'Duration', get: e => e.duration_ms == null ? null : +e.duration_ms, dirs: ['shortest first', 'longest first'], def: -1 },
  by:  { label: 'By',       get: e => e.actor ? nameOf(e.actor) : '', dirs: ['A–Z', 'Z–A'], def: 1 }
};
const GROUPS = {
  day: { key: e => e.day, title: k => { const t = dayKey(); return fmtDay(k) + (k === t ? ' · Today' : k === addDays(t, -1) ? ' · Yesterday' : ''); } },
  task: { key: e => e.task_id || '', title: (k, e) => k ? (D.tasks.get(k) && !D.tasks.get(k).deleted_at ? D.tasks.get(k).title : (e.task_title || 'Deleted task')) : 'Not about a task' },
  person: { key: e => e.actor || '', title: k => k ? whoLabel(k) : 'System' },
  dept: { key: e => deptNames(e.actor)[0] || '', title: k => k || 'No department' },
  action: { key: e => e.action, title: k => actionOf(k).label }
};
function rangeBounds() {
  const t = dayKey();
  switch (LP.range) {
    case 'today': return [t, t];
    case 'yesterday': { const y = addDays(t, -1); return [y, y]; }
    case '7': return [addDays(t, -6), t];
    case '30': return [addDays(t, -29), t];
    case 'month': return [t.slice(0, 8) + '01', t];
    case 'custom': return [isDay(LP.from) ? LP.from : '0000-00-00', isDay(LP.to) ? LP.to : '9999-99-99'];
    default: return null;
  }
}
function logRows() {
  const rb = rangeBounds(), q = LP.q.trim().toLowerCase();
  let rows = Array.from(D.log.values());
  if (rb) rows = rows.filter(e => e.day >= rb[0] && e.day <= rb[1]);
  if (LP.cats.length) rows = rows.filter(e => LP.cats.includes(actionOf(e.action).cat));
  if (LP.person) rows = rows.filter(e => e.actor === LP.person);
  if (LP.dept) rows = rows.filter(e => deptsOf(e.actor).has(LP.dept));
  if (q) rows = rows.filter(e => [e.task_title, e.detail, e.project_name, actionOf(e.action).label, e.actor ? nameOf(e.actor) : '', String(e.id)].join(' ').toLowerCase().includes(q));
  const chain = LP.sort.filter(s => LKEYS[s.k]);
  rows.sort((a, b) => {
    for (const s of chain) {
      const g = LKEYS[s.k].get, va = g(a), vb = g(b), ea = va == null || va === '', eb = vb == null || vb === '';
      if (ea || eb) { if (ea && eb) continue; return ea ? 1 : -1; }
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : cmpStr(va, vb);
      if (c) return c * s.d;
    }
    return b.id - a.id;
  });
  return rows;
}
function renderSortChain() {
  const chain = LP.sort; let h = `<span class="ctl-lbl">Sort</span>`;
  chain.forEach((s, i) => {
    const k = LKEYS[s.k]; if (!k) return;
    if (i) h += `<span class="then">then</span>`;
    h += `<span class="schip"><button type="button" data-sflip="${i}" title="Reverse"><span class="k">${k.label}</span><span class="d">${k.dirs[s.d === 1 ? 0 : 1]}</span></button>${chain.length > 1 ? `<button type="button" class="x" data-sdel="${i}" aria-label="Remove ${k.label} from sort">${icon('close', 'width:14px;height:14px')}</button>` : ''}</span>`;
  });
  const avail = Object.keys(LKEYS).filter(k => !chain.some(s => s.k === k));
  if (avail.length && chain.length < 4) h += `<label class="sr" for="sortAdd">Then sort by</label><select class="field" id="sortAdd" style="height:34px"><option value="">+ then by…</option>${avail.map(k => `<option value="${k}">${LKEYS[k].label}</option>`).join('')}</select>`;
  h += `<button type="button" class="btn ghost sm" data-act="sort-reset">Reset</button>`;
  $('#sortChain').innerHTML = h;
}
const COLS = [['n', 'No.', 'c-n'], ['ts', 'Time', 'c-time'], ['a', 'Action', 'c-act'], ['tt', 'Task', 'c-task'], [null, 'Detail', 'c-detail'], ['dur', 'Duration', 'c-dur'], ['by', 'By', 'c-by']];
function renderLog() {
  $('#logRange').value = LP.range; $('#customRange').hidden = LP.range !== 'custom';
  $('#logFrom').value = LP.from || ''; $('#logTo').value = LP.to || ''; $('#logGroup').value = LP.group;
  const actors = new Set(Array.from(D.log.values()).map(e => e.actor).filter(Boolean));
  const ph = `<option value="">Everyone</option>` + Array.from(actors).map(id => [id, nameOf(id)]).sort((a, b) => cmpStr(a[1], b[1])).map(([id, n]) => `<option value="${esc(id)}">${esc(id === me() ? n + ' (you)' : n)}</option>`).join('');
  const ps = $('#logPerson'); if (ps.dataset.h !== ph) { ps.innerHTML = ph; ps.dataset.h = ph; } ps.value = actors.has(LP.person) ? LP.person : ''; if (!actors.has(LP.person)) LP.person = '';
  const dh = `<option value="">All departments</option>` + liveDepts().map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
  const dsel = $('#logDept'); if (dsel.dataset.h !== dh) { dsel.innerHTML = dh; dsel.dataset.h = dh; } dsel.value = LP.dept; if (dsel.value !== LP.dept) LP.dept = '';
  const open = liveTasks().filter(t => t.status !== 'done').sort((a, b) => cmpStr(a.title, b.title)).slice(0, 300);
  const lt = $('#logTask'), keep = lt.value, th = `<option value="">Not linked to a task</option>` + open.map(t => `<option value="${esc(t.id)}">${esc(trunc(t.title, 60))}</option>`).join('');
  if (lt.dataset.h !== th) { lt.innerHTML = th; lt.dataset.h = th; lt.value = open.some(t => t.id === keep) ? keep : ''; }
  $('#catChips').innerHTML = `<span class="ctl-lbl">Show</span>` + CATS.map(([k, l, tone]) => `<button type="button" class="fchip t-${tone}" data-cat="${k}" aria-pressed="${LP.cats.includes(k)}"><i></i>${l}</button>`).join('') + (LP.cats.length ? `<button type="button" class="btn ghost sm" data-act="cats-clear">Show all</button>` : '');
  renderSortChain();
  const active = (LP.range !== 'all') + !!LP.person + !!LP.dept + (LP.group !== 'day') + LP.cats.length + !(LP.sort.length === 1 && LP.sort[0].k === 'n' && LP.sort[0].d === -1);
  $('#logCtl').classList.toggle('collapsed', !LP.ctl);
  $('#logCtlToggle').setAttribute('aria-expanded', String(!!LP.ctl));
  $('#ctlBadge').hidden = !active; $('#ctlBadge').textContent = active;
  const out = $('#logOut'), total = D.log.size;
  $('#logSummary').textContent = total ? `${total} entr${total === 1 ? 'y' : 'ies'} you can see` : '';
  if (!total) { out.innerHTML = `<div class="empty"><h2>The log book is empty</h2><p>Every change to a task, every message and login change is written here automatically, with the time and who did it.</p></div>`; return; }
  const rows = logRows();
  if (!rows.length) { out.innerHTML = `<div class="empty"><p style="margin:0">No entries match these filters.</p><div class="row" style="margin-top:12px"><button class="btn sm" data-act="filters-clear">Clear filters</button></div></div>`; return; }
  const idx = {}; LP.sort.forEach((s, i) => idx[s.k] = i);
  const head = COLS.map(([k, l, c]) => {
    if (!k) return `<th class="${c}" scope="col"><span class="nosort">${l}</span></th>`;
    const i = idx[k], s = i != null ? LP.sort[i] : null;
    const ind = s ? `<span class="ind">${s.d === 1 ? '↑' : '↓'}${LP.sort.length > 1 ? i + 1 : ''}</span>` : '';
    return `<th class="${c}" scope="col"${s && i === 0 ? ` aria-sort="${s.d === 1 ? 'ascending' : 'descending'}"` : ''}><button type="button" class="sorth" data-sort="${k}" title="Click to sort · Shift+click to add as next sort">${l}${ind}</button></th>`;
  }).join('');
  const grp = GROUPS[LP.group], shown = rows.slice(0, UI.logLimit), withDate = LP.group !== 'day';
  let body = '';
  if (grp) {
    const groups = new Map(), totals = new Map();
    for (const e of shown) { const k = grp.key(e); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    for (const e of rows) { const k = grp.key(e), t = totals.get(k) || { n: 0, d: 0 }; t.n++; if (e.duration_ms && (e.action === 'stop' || e.action === 'time')) t.d += +e.duration_ms; totals.set(k, t); }
    for (const [k, list] of groups) {
      const t = totals.get(k);
      body += `<tr class="grp"><th colspan="7" scope="colgroup"><span class="grp-in"><span>${esc(grp.title(k, list[0]))}</span><span class="mono">${t.n} entr${t.n === 1 ? 'y' : 'ies'}${t.d ? ' · ' + fmtDur(t.d) + ' tracked' : ''}</span></span></th></tr>` + list.map(e => logRow(e, withDate)).join('');
    }
  } else body = shown.map(e => logRow(e, withDate)).join('');
  const tracked = rows.reduce((s, e) => s + (e.duration_ms && (e.action === 'stop' || e.action === 'time') ? +e.duration_ms : 0), 0);
  out.innerHTML = `<div class="ledger-wrap"><table class="ledger"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <div class="logfoot"><span>Showing ${shown.length} of ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}${tracked ? ` · ${fmtDur(tracked)} tracked` : ''}</span>
    <span class="row">${rows.length > shown.length ? `<button class="btn sm" data-act="more">Show ${Math.min(300, rows.length - shown.length)} more</button>` : ''}${!D.logComplete ? `<button class="btn sm" data-act="older">Load older entries</button>` : ''}<button class="btn sm" data-act="csv">${icon('down', 'width:16px;height:16px')}Export this view (CSV)</button></span></div>`;
}
function logRow(e, withDate) {
  const a = actionOf(e.action), task = e.task_id ? D.tasks.get(e.task_id) : null, linked = !!(task && !task.deleted_at);
  const time = withDate ? `${fmtDay(e.day, false)} ${fmtTime(e.ts)}` : fmtTime(e.ts);
  const tname = e.task_title ? (task && task.deleted_at ? `<span class="gone">${esc(e.task_title)}</span>` : esc(e.task_title)) : '';
  return `<tr class="lrow${linked ? ' linked' : ''}"${linked ? ` data-task="${esc(e.task_id)}" tabindex="0"` : ''}>
    <td class="c-n">${pad4(e.id)}</td><td class="c-time">${esc(time)}</td>
    <td class="c-act"><span class="act t-${a.tone}"><i></i>${esc(a.label)}</span></td>
    <td class="c-task">${tname}</td>
    <td class="c-detail${e.action === 'note' ? ' note' : ''}">${esc(e.detail || '')}</td>
    <td class="c-dur">${e.duration_ms != null ? esc(fmtDur(+e.duration_ms)) : ''}</td>
    <td class="c-by">${e.actor ? `<span class="byname">${avatar(e.actor, 'sm')}${esc(whoLabel(e.actor))}</span>` : ''}</td>
  </tr>`;
}
async function loadOlder() {
  try {
    const rows = await call('wtm_log_before', { p_before: D.logMin, p_limit: 2000 });
    for (const e of rows) { D.log.set(e.id, normLog(e)); D.logMin = Math.min(D.logMin, e.id); }
    if (rows.length < 2000) D.logComplete = true;
    toast(rows.length ? `Loaded ${rows.length} older entries.` : 'You\'ve reached the first entry.');
    render();
  } catch (e) { toast(toErr(e).message, { tone: 'danger' }); }
}

/* ================= people view ================= */
const PTABS = [['people', 'People'], ['depts', 'Departments'], ['groups', 'Groups']];
function renderPeople() {
  $('#peopleTabs').innerHTML = PTABS.map(([k, l]) => `<button type="button" role="tab" data-ptab="${k}" aria-selected="${PP.tab === k}">${l}</button>`).join('');
  $('#peopleTools').hidden = PP.tab !== 'people';
  const acts = [];
  if (PP.tab === 'people' && canAdmin()) acts.push(`<button type="button" class="btn primary" data-act="add-person">${I.plus}Add person</button>`);
  if (PP.tab === 'depts' && canAdmin()) acts.push(`<button type="button" class="btn primary" data-act="add-dept">${I.plus}Add department</button>`);
  if (PP.tab === 'groups') acts.push(`<button type="button" class="btn primary" data-act="add-group">${I.plus}New group</button>`);
  $('#peopleActions').innerHTML = acts.join('');
  const out = $('#peopleOut');
  if (PP.tab === 'people') {
    const dh = `<option value="">All departments</option>` + liveDepts().map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
    const ds = $('#peopleDept'); if (ds.dataset.h !== dh) { ds.innerHTML = dh; ds.dataset.h = dh; } ds.value = PP.dept;
    const itOpt = $('#peopleRole').querySelector('option[value="it"]'); if (itOpt) itOpt.hidden = !canAdmin();
    if (!canAdmin() && PP.role === 'it') PP.role = '';
    $('#peopleRole').value = PP.role;
    const q = PP.q.trim().toLowerCase();
    let list = Array.from(D.profiles.values()).filter(p => !p.removed_at);
    if (PP.role === 'off') list = list.filter(p => !p.active); else { if (!canAdmin()) list = list.filter(p => p.active); if (PP.role) list = list.filter(p => p.role === PP.role); }
    if (PP.dept) list = list.filter(p => deptsOf(p.id).has(PP.dept));
    if (q) list = list.filter(p => [p.full_name, p.short_name, p.username, p.phone, p.email, p.title].join(' ').toLowerCase().includes(q));
    list.sort((a, b) => (b.active - a.active) || cmpStr(a.full_name || a.email, b.full_name || b.email));
    out.innerHTML = list.length ? `<ul class="plist2">${list.map(p => `<li><button type="button" class="prow2${p.active ? '' : ' off'}" data-person="${esc(p.id)}">${avatar(p.id)}<span class="nm">${esc(p.full_name || p.email)}${p.short_name ? `<small>“${esc(p.short_name)}”</small>` : ''}${p.id === me() ? '<small>you</small>' : ''}</span>
      <span class="side2"><span class="rolepill ${esc(p.role)}">${esc((ROLE[p.role] || {}).label || p.role)}</span>${p.active ? '' : '<span class="rolepill off">Off</span>'}</span>
      <span class="sub">${p.title ? `<span>${esc(p.title)}</span>` : ''}${deptNames(p.id).map(n => `<span>${esc(n)}</span>`).join('<span>·</span>')}</span></button></li>`).join('')}</ul>
      <p class="listfoot">${list.length} ${list.length === 1 ? 'person' : 'people'}</p>` : `<div class="empty"><p style="margin:0">No one matches.</p></div>`;
  } else if (PP.tab === 'depts') {
    const list = (canAdmin() ? Array.from(D.depts.values()) : liveDepts()).sort((a, b) => (a.archived - b.archived) || cmpStr(a.name, b.name));
    out.innerHTML = list.length ? `<ul class="plist2">${list.map(d => { const mem = Array.from(membersOfDept(d.id)); return `<li><button type="button" class="prow2${d.archived ? ' off' : ''}" data-dept="${esc(d.id)}">${deptLead(d, 36)}<span class="nm">${esc(d.name)}${d.code ? `<small>${esc(d.code)}</small>` : ''}</span>
      <span class="side2">${myDepts().has(d.id) ? '<span class="rolepill admin">Yours</span>' : ''}${d.archived ? '<span class="rolepill off">Archived</span>' : ''}</span>
      <span class="sub"><span class="avs">${mem.slice(0, 6).map(id => avatar(id, 'sm')).join('')}</span><span>${mem.length} ${mem.length === 1 ? 'person' : 'people'}${headsOfDept(d.id).size ? ' · head ' + esc(Array.from(headsOfDept(d.id)).map(shortOf).join(', ')) : ''}</span></span></button></li>`; }).join('')}</ul>` : `<div class="empty"><h2>No departments yet</h2><p>${canAdmin() ? 'Add departments, then put people in them. Tasks and messages can go to a whole department.' : 'An admin or IT sets up departments.'}</p></div>`;
  } else {
    const list = liveGroups().concat(canAdmin() ? Array.from(D.groups.values()).filter(g => g.archived) : []);
    out.innerHTML = list.length ? `<ul class="plist2">${list.map(g => { const mem = Array.from(membersOfGroup(g.id)); return `<li><button type="button" class="prow2${g.archived ? ' off' : ''}" data-group="${esc(g.id)}"><span class="cicon" style="--pc:var(--${esc(g.color)});width:36px;height:36px">${I.people}</span><span class="nm">${esc(g.name)}</span>
      <span class="side2">${myGroups().has(g.id) ? '<span class="rolepill admin">Member</span>' : ''}${g.archived ? '<span class="rolepill off">Archived</span>' : ''}</span>
      <span class="sub"><span class="avs">${mem.slice(0, 6).map(id => avatar(id, 'sm')).join('')}</span><span>${mem.length} ${mem.length === 1 ? 'person' : 'people'}${g.owner_id ? ' · run by ' + esc(shortOf(g.owner_id)) : ''}</span></span></button></li>`; }).join('')}</ul>` : `<div class="empty"><h2>No groups yet</h2><p>Groups are for people who work together across departments, such as a night shift or a project crew. Anyone can make one.</p></div>`;
  }
}
const checklistHtml = (id, items, selected) => `<div class="checklist" id="${id}">${items.map(it => `<label><input type="checkbox" value="${esc(it.id)}"${selected.has(it.id) ? ' checked' : ''}>${it.lead || ''}<span>${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</label>`).join('')}</div>`;
const checked = id => $$(`#${id} input:checked`).map(i => i.value);
const swatchHtml = (id, cur, pastel) => `<div class="swatches" id="${id}" role="radiogroup" aria-label="Colour">${COLORS.map(c => `<button type="button" style="--pc:var(--${pastel ? (DEPT_PASTEL[c] || 'd1') : c})" data-color="${c}" aria-pressed="${c === cur}" aria-label="Colour ${c.slice(1)}"></button>`).join('')}</div>`;
function personSheet(id) {
  const p = prof(id); if (!p) return;
  const manage = canManage(p) || (D.rank === 4);
  const editName = manage || id === me();
  const groupsList = Array.from(groupsOf(id)).map(g => D.groups.get(g)).filter(g => g && !g.archived).map(g => g.name);
  openSheet({
    kind: 'person', armed: false,
    html: () => `${sheetHead('Person', p.username || p.full_name || p.email)}
      <div class="sh-body">
        <div class="profile-head">${avatar(id, 'lg')}<div><b>${esc(p.full_name || p.username || p.email)}</b><span class="muted">${esc([p.title, (ROLE[p.role] || {}).label].filter(Boolean).join(' · '))}</span></div></div>
        <div class="row">${id !== me() && p.active ? `<button type="button" class="btn" data-sh="dm">${icon('msg')}Message</button>` : ''}${p.active ? `<button type="button" class="btn" data-sh="assign-task">${I.plus}New task for ${esc(shortOf(id))}</button>` : ''}<button type="button" class="btn ghost" data-sh="their-tasks">See their tasks</button></div>
        <dl class="kv"><dt>User name</dt><dd style="user-select:all">${esc(p.username || '—')}</dd><dt>Phone</dt><dd>${esc(p.phone || '—')}</dd><dt>Email</dt><dd style="user-select:all">${esc(p.email || '—')}</dd><dt>Departments</dt><dd>${esc(deptNames(id).join(', ') || '—')}</dd><dt>Groups</dt><dd>${esc(groupsList.join(', ') || '—')}</dd><dt>Role</dt><dd>${esc((ROLE[p.role] || {}).label || p.role)} · this is their access, not their job title</dd>${p.short_name ? `<dt>Known as</dt><dd>${esc(p.short_name)} · picked up when typed in a task</dd>` : ''}</dl>
        ${editName ? `<hr style="border:0;border-top:1px solid var(--line);width:100%;margin:0">
        <h2>${manage ? 'Name and login' : 'Your name'}</h2>
        <div class="fld"><span class="lbl">Profile picture</span>${emojiPickerHtml('pf-face', p.emoji || '')}</div>
        <div class="fgrid">
          ${manage ? `<label class="fld"><span class="lbl">User name</span><input class="field" id="pf-user" maxlength="40" value="${esc(p.username)}" required></label>` : ''}
          <label class="fld"><span class="lbl">Full name</span><input class="field" id="pf-name" maxlength="80" value="${esc(p.full_name)}"></label>
          <label class="fld"><span class="lbl">Phone</span><input class="field" id="pf-phone" type="tel" maxlength="40" value="${esc(p.phone || '')}" placeholder="e.g. 0412 345 678"></label>
          <label class="fld"><span class="lbl">Email</span><input class="field" id="pf-email" type="email" maxlength="120" value="${esc(p.email || '')}" placeholder="Optional contact email"></label>
          <label class="fld"><span class="lbl">Known as</span><input class="field" id="pf-short" maxlength="40" value="${esc(p.short_name)}" placeholder="e.g. Sam"></label>
          <label class="fld"><span class="lbl">Job title</span><input class="field" id="pf-title" maxlength="80" value="${esc(p.title)}" placeholder="e.g. Department head"></label>
          ${manage ? `<label class="fld"><span class="lbl">Role</span><select class="field" id="pf-role"${id === me() ? ' disabled' : ''}>${(roleChoices().includes(p.role) ? roleChoices() : [p.role].concat(roleChoices())).map(r => `<option value="${r}"${r === p.role ? ' selected' : ''}>${ROLE[r].label}</option>`).join('')}</select></label>` : ''}
        </div>
        <p class="muted" style="margin:0;font-size:13px">The job title is a name. Saving it keeps their role as ${esc((ROLE[p.role] || {}).label || p.role)}.</p>
        ${manage ? `<div class="fld"><span class="lbl">Departments</span>${liveDepts().length ? checklistHtml('pf-depts', liveDepts().map(d => ({ id: d.id, label: d.name, sub: d.code })), deptsOf(id)) : '<p class="muted" style="margin:0">No departments yet.</p>'}</div>
        <div class="fld"><span class="lbl">Department head</span><p class="muted" style="margin:0 0 6px;font-size:13px">A head stays ${esc((ROLE[p.role] || {}).label || 'staff')}. An order for that department tags them.</p>${liveDepts().length ? checklistHtml('pf-heads', liveDepts().map(d => ({ id: d.id, label: 'Head of ' + d.name })), headDeptsOf(id)) : ''}</div>` : ''}
        ${manage && id !== me() ? `<label class="toggle"><span><b>Login turned on</b><br><span class="muted" style="font-size:13px">Turned-off logins can't sign in or see anything. Their history stays in the log.</span></span><input type="checkbox" id="pf-active"${p.active ? ' checked' : ''}></label>
        <div class="fld"><span class="lbl">Password</span><div class="row"><button type="button" class="btn" data-sh="reset">Reset password</button><span class="muted" style="font-size:13px">Gives them a temporary password to change on next sign-in.</span></div><div id="pf-pw"></div></div>
        <div class="row"><button type="button" class="btn danger" data-sh="delete">Delete account</button><span class="muted" style="font-size:13px">Removes their login. Their name stays on tasks and in the log.</span></div>` : ''}` : ''}
      </div>
      ${editName ? `<footer class="sh-foot"><span class="spacer"></span><button type="button" class="btn primary" data-sh="save">Save changes</button></footer>` : ''}`,
    click: async (b) => {
      const k = b.dataset.sh;
      if (k === 'dm') { closeSheet(true); openConv('user:' + id); }
      else if (k === 'assign-task') { closeSheet(true); setView('tasks'); openNewTask({ title: '', assign: [{ kind: 'user', id }], priority: 3, tags: [] }); }
      else if (k === 'their-tasks') { closeSheet(true); TP.scope = 'user:' + id; TP.tab = 'open'; saveTP(); setView('tasks'); }
      else if (k === 'reset') {
        if (!sheet.armed) { sheet.armed = true; b.textContent = 'Tap again to reset'; b.classList.add('danger', 'armed'); return; }
        b.disabled = true;
        const r = await adminFn({ action: 'reset_password', user_id: id });
        b.disabled = false; sheet.armed = false; b.textContent = 'Reset password'; b.classList.remove('danger', 'armed');
        if (r) $('#pf-pw').innerHTML = pwBox(p.username || p.full_name, r.password);
      }
      else if (k === 'delete') {
        if (!sheet.delArmed) { sheet.delArmed = true; b.textContent = 'Tap again to delete'; b.classList.add('armed'); return; }
        b.disabled = true;
        const r = await adminFn({ action: 'delete_user', user_id: id });
        if (r) { closeSheet(true); toast('Account deleted.'); }
        else { b.disabled = false; sheet.delArmed = false; b.textContent = 'Delete account'; b.classList.remove('armed'); }
      }
      else if (k === 'save') {
        const body = { full_name: $('#pf-name').value.trim(), short_name: $('#pf-short').value.trim(), title: $('#pf-title').value.trim(), phone: $('#pf-phone').value.trim(), email: $('#pf-email').value.trim(), emoji: pickedEmoji('pf-face') };
        if ($('#pf-user')) body.username = $('#pf-user').value.trim();
        if ($('#pf-role') && id !== me() && $('#pf-role').value !== p.role) body.role = $('#pf-role').value;
        if ($('#pf-depts')) {
          const heads = $('#pf-heads') ? checked('pf-heads') : [];
          const depts = new Set(checked('pf-depts'));
          heads.forEach(hid => depts.add(hid));
          const same = (a, b) => a.slice().sort().join() === b.slice().sort().join();
          if (!same(Array.from(depts), Array.from(deptsOf(id)))) body.departments = Array.from(depts);
          if (!same(heads, Array.from(headDeptsOf(id)))) body.heads = heads;
        }
        const activeEl = $('#pf-active'), wasActive = p.active;
        if (activeEl) body.active = activeEl.checked;
        b.disabled = true;
        const r = await act('wtm_admin_update_user', { p_user: id, p: body }, 'Saved.');
        b.disabled = false;
        if (r) {
          if (activeEl && activeEl.checked !== wasActive) adminFn({ action: 'set_active', user_id: id, active: activeEl.checked }, true);
          closeSheet(true);
        }
      }
    }
  });
}
function pwBox(username, password) {
  return `<div class="pwbox"><span class="lbl">Temporary sign-in details</span><span>User name: <b style="user-select:all">${esc(username)}</b></span><span>Password:</span><code>${esc(password)}</code>
    <div class="row"><button type="button" class="btn sm" data-copy="${esc('User name: ' + username + '\nTemporary password: ' + password)}">Copy both</button><span class="muted" style="font-size:12.5px">Shown once. They'll choose their own password when they sign in.</span></div></div>`;
}
async function adminFn(body, quiet) {
  try {
    const { data, error } = await sb.functions.invoke('wtm-admin', { body });
    if (error) {
      let msg = error.message || 'The login service didn\'t respond.';
      try { const j = error.context && typeof error.context.json === 'function' ? await error.context.json() : null; if (j && j.error) msg = j.error; } catch (_) {}
      if (/not found|404|FunctionsFetchError|Failed to send/i.test(msg)) msg = 'The wtm-admin function isn\'t deployed yet. See SETUP.md, step 4.';
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    await sync(true); render();
    return data;
  } catch (e) { if (!quiet) toast(e.message || String(e), { tone: 'danger', ms: 8000 }); return null; }
}
function addPersonSheet() {
  openSheet({
    kind: 'add-person', focus: '#np-user',
    html: () => `${sheetHead('Add person', 'Creates their login')}
      <div class="sh-body" id="np-body">
        <div class="fld"><span class="lbl">Profile picture</span>${emojiPickerHtml('np-face', '')}</div>
        <div class="fgrid">
          <label class="fld"><span class="lbl">User name</span><input class="field" id="np-user" maxlength="40" required placeholder="e.g. Joe O"></label>
          <label class="fld"><span class="lbl">Full name</span><input class="field" id="np-name" maxlength="80" placeholder="Leave blank to use the user name"></label>
          <label class="fld"><span class="lbl">Phone</span><input class="field" id="np-phone" type="tel" maxlength="40" placeholder="e.g. 0412 345 678"></label>
          <label class="fld"><span class="lbl">Email</span><input class="field" id="np-email" type="email" maxlength="120" placeholder="Optional contact email"></label>
          <label class="fld"><span class="lbl">Known as</span><input class="field" id="np-short" maxlength="40" placeholder="e.g. Sam"></label>
          <label class="fld"><span class="lbl">Job title</span><input class="field" id="np-title" maxlength="80"></label>
          <label class="fld"><span class="lbl">Role</span><select class="field" id="np-role">${roleChoices().map(r => `<option value="${r}"${r === 'staff' ? ' selected' : ''}>${ROLE[r].label}</option>`).join('')}</select></label>
          <label class="fld"><span class="lbl">Password</span><input class="field" id="np-pw" type="text" minlength="8" maxlength="72" placeholder="Leave blank to generate one" autocomplete="off"></label>
        </div>
        <div class="fld"><span class="lbl">Departments</span><p class="muted" style="margin:0 0 6px;font-size:13px">Tick every department this person belongs to.</p>${liveDepts().length ? checklistHtml('np-depts', liveDepts().map(d => ({ id: d.id, label: d.name, sub: d.code })), new Set()) : '<p class="muted" style="margin:0">No departments yet. You can add them later.</p>'}</div>
        <p class="muted" style="margin:0;font-size:13px">${D.rank === 4 ? 'IT can create any role.' : 'Admins can create supervisors and staff. Ask IT for admin or IT logins.'} They sign in with the user name. New people choose their own password the first time they sign in.</p>
        <div id="np-done"></div>
      </div>
      <footer class="sh-foot"><span class="spacer"></span><button type="button" class="btn primary" data-sh="create">Create login</button></footer>`,
    click: async b => {
      if (b.dataset.sh !== 'create') return;
      const username = $('#np-user').value.trim(), email = $('#np-email').value.trim();
      const name = $('#np-name').value.trim() || username;
      if (!username || username.includes('@')) { toast('Enter a user name without @.'); $('#np-user').focus(); return; }
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Enter a valid email address, or leave it blank.'); $('#np-email').focus(); return; }
      b.disabled = true; b.textContent = 'Creating…';
      const r = await adminFn({ action: 'create_user', username, full_name: name, email, phone: $('#np-phone').value.trim(), emoji: pickedEmoji('np-face'), short_name: $('#np-short').value.trim(), title: $('#np-title').value.trim(), role: $('#np-role').value, password: $('#np-pw').value || undefined, departments: $('#np-depts') ? checked('np-depts') : [] });
      b.disabled = false; b.textContent = 'Create login';
      if (r) {
        $('#np-done').innerHTML = pwBox(username, r.password);
        for (const el of $$('#np-body .fgrid input, #np-body .fgrid select, #np-depts input, #np-face button')) el.disabled = true;
        b.outerHTML = `<button type="button" class="btn primary" data-sh="close">Done</button>`;
        toast(`Login created for ${name}.`);
      }
    }
  });
}
function deptSheet(id) {
  const d = id ? D.depts.get(id) : null, admin = canAdmin();
  if (!admin) { if (d) { PP.dept = id; PP.tab = 'people'; savePP(); renderPeople(); } return; }
  let color = d ? d.color : COLORS[D.depts.size % COLORS.length];
  let iconKey = d && d.icon && I[d.icon] ? d.icon : guessDeptIcon(d);
  openSheet({
    kind: 'dept', focus: d ? null : '#dp-name',
    html: () => `${sheetHead(d ? 'Department' : 'New department', d ? people(membersOfDept(id).size) : '')}
      <div class="sh-body">
        <div class="fgrid"><label class="fld"><span class="lbl">Name</span><input class="field" id="dp-name" maxlength="80" value="${esc(d ? d.name : '')}"></label>
        <label class="fld"><span class="lbl">Short code</span><input class="field" id="dp-code" maxlength="12" value="${esc(d ? d.code : '')}" placeholder="e.g. MNT"></label></div>
        <div class="fld"><span class="lbl">Icon</span><div class="swatches icons" id="dp-icon" role="radiogroup" aria-label="Icon">${DEPT_ICONS.map(k => `<button type="button" data-icon="${k}" aria-pressed="${k === iconKey}" aria-label="${esc(DEPT_ICON_LABEL[k])}">${icon(k)}</button>`).join('')}</div></div>
        <div class="fld"><span class="lbl">Colour</span>${swatchHtml('dp-color', color, true)}</div>
        <div class="fld"><span class="lbl">Members</span>${checklistHtml('dp-members', activePeople().map(p => ({ id: p.id, label: p.full_name || p.email, sub: (ROLE[p.role] || {}).label, lead: avatar(p.id, 'sm') })), d ? membersOfDept(id) : new Set())}</div>
        <div class="fld"><span class="lbl">Department head</span><p class="muted" style="margin:0 0 6px;font-size:13px">They keep their role. An order for this department tags the head.</p>${checklistHtml('dp-heads', activePeople().map(p => ({ id: p.id, label: p.full_name || p.email, sub: (ROLE[p.role] || {}).label, lead: avatar(p.id, 'sm') })), d ? headsOfDept(id) : new Set())}</div>
        ${d ? `<div class="row">${d.archived ? `<button type="button" class="btn" data-sh="unarchive">Restore department</button>` : `<button type="button" class="btn danger" data-sh="archive">Archive department</button>`}<span class="muted" style="font-size:13px">Archived departments stop receiving tasks and messages. Their history stays.</span></div>` : ''}
      </div>
      <footer class="sh-foot"><span class="spacer"></span><button type="button" class="btn primary" data-sh="save">${d ? 'Save changes' : 'Create department'}</button></footer>`,
    click: async b => {
      const k = b.dataset.sh;
      if (b.dataset.color) { color = b.dataset.color; for (const x of $$('#dp-color button')) x.setAttribute('aria-pressed', String(x === b)); return; }
      if (b.dataset.icon) { iconKey = b.dataset.icon; for (const x of $$('#dp-icon button')) x.setAttribute('aria-pressed', String(x === b)); return; }
      if (k === 'archive' || k === 'unarchive') { if (await act('wtm_save_department', { p: { id, archived: k === 'archive' } }, k === 'archive' ? 'Department archived.' : 'Department restored.')) closeSheet(true); return; }
      if (k !== 'save') return;
      const name = $('#dp-name').value.trim(); if (!name) { toast('Give the department a name.'); return; }
      b.disabled = true;
      const heads = $('#dp-heads') ? checked('dp-heads') : [];
      const members = new Set(checked('dp-members'));
      heads.forEach(hid => members.add(hid));
      const payload = { id: id || null, name, code: $('#dp-code').value.trim(), color, icon: iconKey, members: Array.from(members) };
      const same = (a, b) => a.slice().sort().join() === b.slice().sort().join();
      if (!id || !same(heads, Array.from(headsOfDept(id)))) payload.heads = heads;
      const r = await act('wtm_save_department', { p: payload }, d ? 'Saved.' : 'Department created.');
      b.disabled = false; if (r) closeSheet(true);
    }
  });
}
function groupSheet(id) {
  const g = id ? D.groups.get(id) : null, mayEdit = !g || g.owner_id === me() || canAdmin();
  let color = g ? g.color : COLORS[(D.groups.size + 1) % COLORS.length];
  const mem = g ? membersOfGroup(id) : new Set([me()]);
  openSheet({
    kind: 'group', focus: g ? null : '#gp-name',
    html: () => `${sheetHead(g ? 'Group' : 'New group', g && g.owner_id ? `Run by ${nameOf(g.owner_id)}` : '')}
      <div class="sh-body">
        ${mayEdit ? `<label class="fld"><span class="lbl">Name</span><input class="field" id="gp-name" maxlength="80" value="${esc(g ? g.name : '')}" placeholder="e.g. Night shift"></label>
        <div class="fld"><span class="lbl">Colour</span>${swatchHtml('gp-color', color)}</div>
        <div class="fld"><span class="lbl">Members</span>${checklistHtml('gp-members', activePeople().map(p => ({ id: p.id, label: (p.full_name || p.email) + (p.id === (g ? g.owner_id : me()) ? ' (runs the group)' : ''), sub: deptNames(p.id).join(', '), lead: avatar(p.id, 'sm') })), mem)}</div>
        ${g ? `<div class="row">${g.archived ? `<button type="button" class="btn" data-sh="unarchive">Restore group</button>` : `<button type="button" class="btn danger" data-sh="archive">Archive group</button>`}</div>` : ''}`
        : `<p class="muted" style="margin:0">Only ${esc(nameOf(g.owner_id))}, admin or IT can change this group.</p><ul class="mini-list">${Array.from(mem).map(pid => `<li>${avatar(pid, 'sm')}<span class="grow">${esc(nameOf(pid))}</span></li>`).join('')}</ul>`}
        ${g && myGroups().has(id) ? `<div class="row"><button type="button" class="btn" data-sh="msg">${icon('msg')}Open group messages</button></div>` : ''}
      </div>
      ${mayEdit ? `<footer class="sh-foot"><span class="spacer"></span><button type="button" class="btn primary" data-sh="save">${g ? 'Save changes' : 'Create group'}</button></footer>` : ''}`,
    click: async b => {
      const k = b.dataset.sh;
      if (b.dataset.color) { color = b.dataset.color; for (const x of $$('#gp-color button')) x.setAttribute('aria-pressed', String(x === b)); return; }
      if (k === 'msg') { closeSheet(true); openConv('group:' + id); return; }
      if (k === 'archive' || k === 'unarchive') { if (await act('wtm_save_group', { p: { id, archived: k === 'archive' } }, k === 'archive' ? 'Group archived.' : 'Group restored.')) closeSheet(true); return; }
      if (k !== 'save') return;
      const name = $('#gp-name').value.trim(); if (!name) { toast('Give the group a name.'); return; }
      b.disabled = true;
      const r = await act('wtm_save_group', { p: { id: id || null, name, color, members: checked('gp-members') } }, g ? 'Saved.' : 'Group created.');
      b.disabled = false; if (r) closeSheet(true);
    }
  });
}

/* ================= keyword library ================= */
function openKeywordLibrary(opener) {
  const st = { q: '', tag: '' };
  const may = canSupervise();
  const S = {
    opener, kind: 'keywords',
    html: () => `${sheetHead('Keyword library', 'Many words, one tag')}
      <div class="sh-body kwsheet">
        <div class="kwbar">
          <label class="sr" for="kwSearch">Search the library</label>
          <input class="field" id="kwSearch" placeholder="Search words or tags" autocomplete="off">
          <label class="sr" for="kwTag">Show one tag</label>
          <select class="field" id="kwTag"></select>
        </div>
        <p class="muted" id="kwCount" style="margin:0"></p>
        ${may ? `<form id="kwAdd" class="kwadd">
          <span class="lbl">Add many words to one tag</span>
          <input class="field" id="kwNewTag" list="kwTagList" maxlength="40" placeholder="Tag, for example plumbing" autocomplete="off">
          <textarea class="field" id="kwNewWords" rows="3" placeholder="One word or phrase per line"></textarea>
          <button class="btn" type="submit">Add to this tag</button>
          <datalist id="kwTagList"></datalist>
        </form>` : '<p class="muted" style="margin:0">Supervisors, admin and IT can change the library. Everyone else can read it.</p>'}
        ${may ? `<div class="fld"><span class="lbl">Also tag a department</span><p class="muted" style="margin:0">Plumbing tags Maintenance. A task with that tag is assigned to the department, and an order for it tags the department head.</p><div class="kwmap" id="kwMap"></div></div>` : ''}
        <div class="kwgrid" id="kwGrid"><table>
          <thead><tr><th>Word</th><th>Tag</th>${may ? '<th></th>' : ''}</tr></thead>
          <tbody id="kwBody"></tbody>
        </table></div>
      </div>`,
    mount() {
      $('#kwSearch').addEventListener('input', e => { st.q = e.target.value; S.draw(); });
      $('#kwTag').addEventListener('change', e => { st.tag = e.target.value; S.draw(); });
      $('#kwGrid').addEventListener('focusout', e => {
        const inp = e.target.closest('.kw-in'); if (!inp) return;
        const tr = inp.closest('tr');
        if (e.relatedTarget && tr.contains(e.relatedTarget)) return;
        S.commit(inp);
      });
      $('#kwGrid').addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('kw-in')) { e.preventDefault(); e.target.blur(); }
      });
      const form = $('#kwAdd');
      if (form) form.addEventListener('submit', e => { e.preventDefault(); S.addMany(); });
      const map = $('#kwMap');
      if (map) map.addEventListener('change', async e => {
        const sel = e.target.closest('[data-tag-dept]'); if (!sel) return;
        sel.disabled = true;
        const r = await act('wtm_save_tag_department', { p: { tag: sel.dataset.tagDept, department_id: sel.value } }, sel.value ? 'That tag now tags the department.' : 'That tag no longer tags a department.');
        sel.disabled = false;
        if (r && sheet === S) S.draw();
      });
      S.draw();
    },
    refresh() {
      const a = document.activeElement;
      if (a && a.closest && a.closest('#kwGrid, #kwAdd, #kwMap')) return;
      S.draw();
    },
    draw() {
      const body = $('#kwBody'); if (!body) return;
      const tags = Array.from(new Set(D.rules.map(r => r.tag))).sort(cmpStr);
      const counts = new Map();
      for (const r of D.rules) counts.set(r.tag, (counts.get(r.tag) || 0) + 1);
      const sel = $('#kwTag');
      const opt = `<option value="">All tags</option>` + tags.map(t => `<option value="${esc(t)}">${esc(t)} · ${counts.get(t)}</option>`).join('');
      if (sel.dataset.h !== opt) { sel.innerHTML = opt; sel.dataset.h = opt; }
      if (st.tag && !tags.includes(st.tag)) st.tag = '';
      sel.value = st.tag;
      const list = $('#kwTagList');
      if (list) list.innerHTML = tags.map(t => `<option value="${esc(t)}"></option>`).join('');
      const q = st.q.trim().toLowerCase();
      const rows = D.rules.filter(r => (!st.tag || r.tag === st.tag) && (!q || r.phrase.toLowerCase().includes(q) || r.tag.includes(q)))
        .slice().sort((a, b) => cmpStr(a.tag, b.tag) || cmpStr(a.phrase, b.phrase));
      const cell = (r, field) => may
        ? `<input class="kw-in" data-field="${field}" value="${esc(r[field])}" maxlength="${field === 'phrase' ? 60 : 40}" aria-label="${field === 'phrase' ? 'Word' : 'Tag'}">`
        : esc(r[field]);
      body.innerHTML = rows.map(r => `<tr data-id="${esc(r.id)}" data-phrase="${esc(r.phrase)}" data-tag="${esc(r.tag)}">
        <td class="word">${cell(r, 'phrase')}</td><td>${cell(r, 'tag')}</td>
        ${may ? `<td><button type="button" class="btn sm ghost" data-sh="kw-del" data-id="${esc(r.id)}">Remove</button></td>` : ''}
      </tr>`).join('') + (may ? `<tr data-id="">
        <td><input class="kw-in" data-field="phrase" maxlength="60" placeholder="New word" aria-label="New word"></td>
        <td><input class="kw-in" data-field="tag" maxlength="40" placeholder="Tag" aria-label="Tag" value="${esc(st.tag)}"></td>
        <td></td>
      </tr>` : '');
      const shown = $('#kwCount');
      if (shown) shown.textContent = `${rows.length} of ${D.rules.length} words · ${tags.length} tags`;
      const map = $('#kwMap');
      if (map && !(document.activeElement && map.contains(document.activeElement))) {
        const mapped = new Set(tags);
        for (const [slug] of TRADES) mapped.add(slug);
        const list = Array.from(mapped).filter(t => (!st.tag || t === st.tag) && (!q || t.includes(q) || ((D.depts.get(D.tagDepts.get(t)) || {}).name || '').toLowerCase().includes(q))).sort(cmpStr);
        const opts = liveDepts();
        map.innerHTML = list.map(t => {
          const cur = D.tagDepts.get(t) || '';
          return `<label><span>${esc(t)}</span><select class="field" data-tag-dept="${esc(t)}" aria-label="Department for ${esc(t)}"><option value="">No department</option>${opts.map(d => `<option value="${esc(d.id)}"${d.id === cur ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>`;
        }).join('') || '<p class="muted" style="margin:0">No tags match.</p>';
      }
    },
    async commit(inp) {
      const tr = inp.closest('tr'); if (!tr || tr.dataset.busy) return;
      const phrase = tr.querySelector('[data-field="phrase"]').value.trim();
      const tag = tr.querySelector('[data-field="tag"]').value.trim();
      const id = tr.dataset.id;
      if (id && phrase === tr.dataset.phrase && tag === tr.dataset.tag) return;
      if (!phrase && !tag) return;
      if (!phrase || !tag) { toast('Fill in both the word and the tag.'); return; }
      tr.dataset.busy = '1';
      const r = await act('wtm_save_rule', { p: id ? { id, phrase, tag } : { phrase, tag } }, id ? 'Keyword updated.' : 'Keyword added.');
      delete tr.dataset.busy;
      if (r && sheet === S) S.draw();
    },
    async addMany() {
      const tag = $('#kwNewTag').value.trim();
      const lines = $('#kwNewWords').value.split(/\n|,/).map(s => s.trim()).filter(Boolean);
      if (!tag || !lines.length) { toast('Add a tag and at least one word.'); return; }
      const btn = $('#kwAdd button'); btn.disabled = true;
      const r = await act('wtm_save_rules', { p: { rows: lines.map(phrase => ({ phrase, tag })) } });
      btn.disabled = false;
      if (!r) return;
      toast(r.saved ? `${r.saved} words saved${r.skipped ? `, ${r.skipped} already in the library` : ''}.` : 'Those words are already in the library.');
      $('#kwNewWords').value = '';
      if (sheet === S) S.draw();
    },
    click: async b => {
      if (b.dataset.sh !== 'kw-del') return;
      b.disabled = true;
      if (await act('wtm_delete_rule', { p_id: b.dataset.id }, 'Keyword removed.') && sheet === S) S.draw();
      else b.disabled = false;
    }
  };
  openSheet(S);
}

/* ================= settings view ================= */
const myPhoto = () => ((prof(me()) || D.me || {}).photo) || '';
function renderSettings() {
  if ($('#settingsOut').contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const m = D.me;
  $('#settingsOut').innerHTML = `
    <div class="panel">
      <h2>Your account</h2>
      <div class="profile-head">${avatar(m.id, 'lg')}<div><b>${esc(m.full_name || m.username || m.email)}</b><span class="muted">${esc(m.username || m.email || '')}</span></div></div>
      <dl class="kv"><dt>User name</dt><dd>${esc(m.username || '—')}</dd><dt>Phone</dt><dd>${esc(m.phone || '—')}</dd><dt>Email</dt><dd>${esc(m.email || '—')}</dd><dt>Role</dt><dd>${esc((ROLE[m.role] || {}).label)}</dd><dt>Departments</dt><dd>${esc(deptNames(m.id).join(', ') || '—')}</dd></dl>
      <div class="row"><button type="button" class="btn" data-act="upload-photo">${icon('camera')}${myPhoto() ? 'Change photo' : 'Upload photo'}</button>${myPhoto() ? '<button type="button" class="btn ghost" data-act="remove-photo">Remove photo</button>' : ''}<button type="button" class="btn" data-act="pick-face" aria-haspopup="dialog">Choose emoji</button><button type="button" class="btn" data-act="change-pw">Change password</button><button type="button" class="btn ghost" data-act="sign-out">Log out</button></div>
    </div>`;
}
function renderTry() {
  const el = $('#tryOut'); if (!el) return;
  const q = parseTokens($('#tryIn').value), det = detect(q.title);
  const tags = q.tags.slice();
  for (const d of det) if (d.tag && !tags.includes(d.tag)) tags.push(d.tag);
  const bits = q.assign.map(a => `<span class="tchip person">${icon('person')}→ ${esc(assigneeLabel(a))}</span>`)
    .concat(det.map(d => d.type === 'project' ? `<span class="tchip">${icon('folder')}${esc(d.label)}</span>` : d.tag ? tagChip(d.tag).replace('tchip word', 'tchip') : ''))
    .concat(deptsForTags(tags).map(id => deptChipHtml(D.depts.get(id), '→ ' + ((D.depts.get(id) || {}).name || 'Department'))))
    .concat(q.due ? [`<span class="tchip">${icon('cal')}Due ${esc(dueLabel(q.due))}</span>`] : []).concat(q.priority ? [`<span class="tchip">${icon('flag')}P${q.priority}</span>`] : []);
  el.innerHTML = bits.join('') || '<span class="muted" style="font-size:13px">Nothing picked up yet.</span>';
}

/* ================= notice board & order list ================= */
const ORDER_TABS = [['needed', 'Needed'], ['ordered', 'Ordered'], ['received', 'Received'], ['all', 'All']];
const ORDER_NEXT = { needed: ['ordered', 'Mark ordered'], ordered: ['received', 'Mark received'], received: ['needed', 'Need again'] };
function fillTradeSelect(el, current) {
  if (!el) return;
  const html = `<option value="">Any trade</option>` + TRADES.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('');
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
  el.value = current && Array.from(el.options).some(o => o.value === current) ? current : '';
}
const STALE_DAYS = 3;
const POST_COPY = {
  notice: { title: 'Notice title — everyone can read this', titleLbl: 'Notice title', body: 'Details (optional)', bodyLbl: 'Notice details', go: 'Post' },
  message: { title: 'Write a message…', titleLbl: 'Message', body: '', bodyLbl: '', go: 'Send' },
  task: { title: 'What needs doing?', titleLbl: 'Task title', body: 'Notes (optional)', bodyLbl: 'Task notes', go: 'Add task' }
};
function msgForMe(m) {
  if (m.sender === me()) return false;
  if (m.to_kind === 'all') return true;
  if (m.to_kind === 'user') return m.to_id === me();
  if (m.to_kind === 'dept') return D.depts.has(m.to_id) && myDepts().has(m.to_id);
  if (m.to_kind === 'group') return myGroups().has(m.to_id);
  return false;
}
function boardTasks() {
  const md = myDepts(), all = D.rank >= 3;
  return liveTasks().filter(t => t.status !== 'done' && (all || isMine(t) || taskInDepts(t, md)));
}
const isStale = (t, cutoff) => (t.updated_at || t.created_at || 0) < cutoff;
function boardTaskLine(t, today, note) {
  const over = t.due && t.due < today;
  const who = t.assignees.map(assigneeLabel).filter(Boolean).slice(0, 2).join(', ');
  const bits = [who, t.status === 'doing' || t.status === 'blocked' ? STATUS[t.status] : '', t.due ? (over ? 'Overdue · ' : 'Due ') + dueLabel(t.due) + (t.due_time ? ' ' + hhmm(t.due_time) : '') : '', note || ''].filter(Boolean);
  return `<li><button type="button" data-open-task="${esc(t.id)}"${over ? ' class="over"' : ''}>${esc(t.title)}${bits.length ? `<small>${esc(bits.join(' · '))}</small>` : ''}</button></li>`;
}
function boardMsgLine(m) {
  const k = convKeyOf(m), unread = m.id > (D.reads[k] || 0);
  const to = m.to_kind === 'user' ? 'To you' : m.to_kind === 'dept' ? (D.depts.get(m.to_id) || {}).name || 'Department' : m.to_kind === 'group' ? (D.groups.get(m.to_id) || {}).name || 'Group' : 'Everyone';
  const text = m.body || (m.photo ? 'Photo' : m.pin ? 'Pin' : m.task_id ? 'Linked task' : '');
  return `<li><button type="button" data-conv="${esc(m.to_kind === 'all' || m.to_kind === 'dept' ? ALL_CONV : k)}"${unread ? ' class="unread"' : ''}><span class="bmhead">${avatar(m.sender, 'sm')}<b>${esc(nameOf(m.sender))}</b><span>→ ${esc(to)} · ${esc(fmtWhen(m.at))}</span></span><small>${esc(trunc(text, 120))}</small></button></li>`;
}
function renderPostTo() {
  const sel = $('#postTo'); if (!sel) return;
  const task = NB.kind === 'task', md = myDepts();
  const depts = liveDepts(), mine = depts.filter(d => md.has(d.id)), rest = depts.filter(d => !md.has(d.id));
  const groups = liveGroups().filter(g => myGroups().has(g.id)).sort((a, b) => cmpStr(a.name, b.name));
  const others = activePeople().filter(p => p.id !== me());
  const byRole = ['it', 'admin', 'supervisor', 'staff'].map(role => ({ role, people: others.filter(p => p.role === role).sort((a, b) => cmpStr(a.full_name || '', b.full_name || '')) })).filter(g => g.people.length);
  const opt = (v, l) => `<option value="${esc(v)}">${esc(l)}</option>`;
  const html = (task ? opt('user:' + me(), 'Me') : opt(ALL_CONV, 'Everyone'))
    + (mine.length ? `<optgroup label="My department${mine.length === 1 ? '' : 's'}">${mine.map(d => opt('dept:' + d.id, d.name)).join('')}</optgroup>` : '')
    + (rest.length ? `<optgroup label="Other departments">${rest.map(d => opt('dept:' + d.id, d.name)).join('')}</optgroup>` : '')
    + (groups.length ? `<optgroup label="Groups">${groups.map(g => opt('group:' + g.id, g.name)).join('')}</optgroup>` : '')
    + byRole.map(g => `<optgroup label="${esc(ROLE[g.role].label)}">${g.people.map(p => opt('user:' + p.id, (p.full_name || p.username || '') + (p.title ? ' · ' + p.title : ''))).join('')}</optgroup>`).join('');
  if (sel.dataset.h !== html) {
    const keep = sel.value;
    sel.innerHTML = html; sel.dataset.h = html;
    sel.value = keep && Array.from(sel.options).some(o => o.value === keep) ? keep : (mine.length ? 'dept:' + mine[0].id : sel.options[0].value);
  }
}
function setPostKind(kind) {
  NB.kind = POST_COPY[kind] ? kind : 'notice';
  const c = POST_COPY[NB.kind], msg = NB.kind === 'message';
  for (const b of $$('#postKind [data-post]')) b.setAttribute('aria-pressed', String(b.dataset.post === NB.kind));
  const title = $('#noticeTitle');
  title.placeholder = c.title; title.maxLength = msg ? 4000 : 160;
  $('#noticeTitleLbl').textContent = c.titleLbl;
  $('#noticeBody').hidden = msg; $('#noticeBody').placeholder = c.body; $('#noticeBodyLbl').textContent = c.bodyLbl;
  $('#postGo').textContent = c.go;
  $('#postNoticeOpts').hidden = NB.kind !== 'notice';
  $('#postSendOpts').hidden = NB.kind === 'notice';
  $('#postToLbl').textContent = NB.kind === 'task' ? 'For' : 'To';
  $('#postDueWrap').hidden = NB.kind !== 'task';
  $('#postTo').dataset.h = '';
  renderPostTo();
}
function boardCalendarHtml() {
  const { grid } = calMonth();
  const title = parseDay(CAL.cursor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return `<section class="bcal" aria-label="Calendar">
    <div class="bcalbar"><h2>Calendar</h2><button type="button" class="iconbtn" data-bcal="prev" aria-label="Previous month">${I.back}</button><b>${esc(title)}</b><button type="button" class="iconbtn" data-bcal="next" aria-label="Next month"><svg class="ico" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button><button type="button" class="btn sm" data-bcal="today">Today</button><button type="button" class="btn sm ghost" data-bcal="open">Open calendar</button></div>
    <div class="calgrid">${grid}</div>
    <div class="calday">${calDayHtml(CAL.day)}</div>
  </section>`;
}
function renderBoard() {
  renderPostTo();
  const today = dayKey(), cutoff = now() - STALE_DAYS * 864e5;
  const notices = Array.from(D.notices.values()).filter(n => !n.archived_at).sort((a, b) => (b.pinned - a.pinned) || (b.created_at - a.created_at));
  const msgs = Array.from(D.msgs.values()).filter(msgForMe).sort((a, b) => b.id - a.id).slice(0, 6);
  const tasks = boardTasks();
  const stale = tasks.filter(t => isStale(t, cutoff)).sort((a, b) => (a.updated_at || a.created_at) - (b.updated_at || b.created_at));
  const fresh = tasks.filter(t => !isStale(t, cutoff)).sort((a, b) => smartRank(a, today) - smartRank(b, today) || cmpDue(a, b) || a.priority - b.priority);
  const unreadMsgs = totalUnread();
  $('#boardSummary').textContent = [
    `${tasks.length} open task${tasks.length === 1 ? '' : 's'} for you`,
    stale.length ? `${stale.length} waiting a while` : '',
    unreadMsgs ? `${unreadMsgs} unread message${unreadMsgs === 1 ? '' : 's'}` : ''
  ].filter(Boolean).join(' · ');
  const days = t => Math.max(STALE_DAYS, Math.floor((now() - (t.updated_at || t.created_at)) / 864e5));
  const more = (n, shown, go) => n > shown ? `<button type="button" class="btn sm ghost" data-board-go="${go}">See all ${n}</button>` : '';
  const noticeHtml = notices.map(n => {
    const may = n.created_by === me() || D.rank >= 2;
    return `<article class="notice${n.pinned ? ' pinned' : ''}">
      <h2>${n.pinned ? icon('pin', 'width:14px;height:14px;color:var(--bar-hi)') : ''}${esc(n.title)}</h2>
      ${n.body ? `<div class="body">${esc(n.body)}</div>` : ''}
      <div class="meta">${avatar(n.created_by, 'sm')}<span>${esc(nameOf(n.created_by))} · ${esc(fmtWhen(n.created_at))}${n.show_until ? ' · until ' + esc(fmtDay(n.show_until)) : ''}</span></div>
      ${may ? `<div class="acts"><button type="button" class="btn sm ghost" data-notice-pin="${esc(n.id)}" data-pinned="${n.pinned ? '0' : '1'}">${n.pinned ? 'Unpin' : 'Pin'}</button><button type="button" class="btn sm ghost" data-notice-remove="${esc(n.id)}">Remove</button></div>` : ''}
    </article>`;
  }).join('');
  $('#boardOut').innerHTML = `${noticeHtml}
    <div class="bfeed">
      <section class="hand"><h2>Latest messages for you</h2>${msgs.length ? `<ul class="bmsgs">${msgs.map(boardMsgLine).join('')}</ul>` : '<p class="muted">No messages for you or your department yet.</p>'}<button type="button" class="btn sm ghost" data-board-go="messages">Open messages</button></section>
      <section class="hand"><h2>Tasks for you and your department</h2>${fresh.length ? `<ul>${fresh.slice(0, 8).map(t => boardTaskLine(t, today)).join('')}</ul>` : `<p class="muted">${stale.length ? 'Nothing new. Older tasks are listed under Waiting a while.' : 'No open tasks for you or your department.'}</p>`}${more(fresh.length, 8, 'tasks')}</section>
      ${stale.length ? `<section class="hand stale"><h2>Waiting a while</h2><ul>${stale.slice(0, 8).map(t => boardTaskLine(t, today, `untouched ${days(t)} days`)).join('')}</ul>${more(stale.length, 8, 'tasks')}</section>` : ''}
    </div>
    ${boardCalendarHtml()}`;
}
function orderFromTask(t) {
  setView('orders');
  const trade = (t.tags.find(x => x.startsWith('trade:')) || '').slice(6);
  const dept = deptsForTags(t.tags)[0] || (trade && D.tagDepts.get(trade)) || '';
  OL.task = t.id;
  OL.deptLock = !!dept;
  $('#orderItem').value = t.title;
  $('#orderQty').value = '';
  $('#orderNote').value = '';
  fillTradeSelect($('#orderTrade'), trade);
  fillDeptSelect($('#orderDept'), dept, 'Department');
  renderOrderLink();
  renderOrderHeads();
  $('#orderItem').focus();
}
function renderOrderHeads() {
  const el = $('#orderHeads'); if (!el) return;
  const id = $('#orderDept') && $('#orderDept').value;
  if (!id) { el.textContent = 'Choose a department to tag its head.'; return; }
  const dept = D.depts.get(id);
  const heads = Array.from(headsOfDept(id)).map(nameOf).filter(Boolean);
  const name = dept ? dept.name : 'This department';
  el.textContent = heads.length ? `Tags the ${name} head: ${heads.join(', ')}.` : `${name} has no department head. The order records the department.`;
}
function renderOrderLink() {
  const el = $('#orderLink'); if (!el) return;
  const t = OL.task && D.tasks.get(OL.task);
  el.innerHTML = t && !t.deleted_at ? `<span class="dchip">${icon('link')}<span class="lbltxt">For ${esc(trunc(t.title, 42))}</span><button type="button" class="x" data-order-unlink aria-label="Remove the task link">${icon('close', 'width:13px;height:13px')}</button></span>` : '';
}
// The scraper keeps its own sign-in; the frame loads on first visit and stays loaded so a scan survives switching views.
function renderInvoices() {
  const url = CONFIG.invoicesUrl, f = $('#invFrame');
  $('#invNone').hidden = !!url; $('#invOpen').hidden = f.hidden = !url;
  if (!url) return;
  $('#invOpen').href = url;
  if (!f.getAttribute('src')) f.src = url;
}
// Mail is Relay Mail, a React app built from src/mail into js/mail/relay-mail.js. It loads the first time the
// section opens and stays mounted (drafts, scroll, open thread) until this person signs out.
const MAIL = { app: null, loading: null, error: '' };
function loadMail() {
  if (window.RelayMail) return Promise.resolve(window.RelayMail);
  if (!MAIL.loading) {
    // Under `npm run dev`, Vite serves the source so mail changes reload live.
    MAIL.loading = (document.querySelector('script[src="/@vite/client"]') ? import('/src/mail/embed.tsx') : new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'js/mail/relay-mail.js?v=1';
      s.onload = () => window.RelayMail ? ok(window.RelayMail) : fail(new Error('bad bundle'));
      s.onerror = () => { s.remove(); fail(new Error('network')); };
      document.head.append(s);
    })).catch(e => { MAIL.loading = null; throw e; });
  }
  return MAIL.loading;
}
function renderMail() {
  const host = $('#mailHost'), state = $('#mailState');
  if (MAIL.app) return;
  host.hidden = true; state.hidden = false;
  if (MAIL.error) { state.innerHTML = `<span>${esc(MAIL.error)}</span><button type="button" class="btn sm" id="mailRetry">Try again</button>`; return; }
  state.textContent = 'Opening mail…';
  const userId = D.me && D.me.id;
  loadMail().then(RelayMail => {
    if (MAIL.app || !D.ready || !D.me || D.me.id !== userId) return;
    MAIL.app = RelayMail.mount(host, {
      userId, supabaseUrl: CONFIG.url, supabaseAnonKey: CONFIG.anonKey, getSupabase: () => sb,
      isActive: () => D.ready && UI.view === 'mail' && !sheet && !pop && !$('#app').hidden
    });
    host.hidden = false; state.hidden = true;
  }, () => { MAIL.error = 'Mail didn\'t load. Check your internet connection.'; if (UI.view === 'mail') renderMail(); });
}
function unmountMail() {
  if (MAIL.app) { MAIL.app.unmount(); MAIL.app = null; }
}
function renderOrders() {
  fillTradeSelect($('#orderTrade'), $('#orderTrade').value);
  fillDeptSelect($('#orderDept'), $('#orderDept') && $('#orderDept').value, 'Department');
  renderOrderLink();
  renderOrderHeads();
  const q = OL.q.trim().toLowerCase();
  let all = Array.from(D.orders.values());
  const counts = {};
  for (const [k] of ORDER_TABS) counts[k] = k === 'all' ? all.length : all.filter(o => o.status === k).length;
  $('#orderTabs').innerHTML = ORDER_TABS.map(([k, l]) => `<button type="button" data-otab="${k}" aria-pressed="${OL.tab === k}">${l}<span class="n">${counts[k]}</span></button>`).join('');
  if (OL.tab !== 'all') all = all.filter(o => o.status === OL.tab);
  if (q) all = all.filter(o => [o.item, o.note, o.qty, tradeLabel(o.trade), (D.depts.get(o.department_id) || {}).name, ...(o.tagged || []).map(nameOf), nameOf(o.created_by)].join(' ').toLowerCase().includes(q));
  all.sort((a, b) => b.created_at - a.created_at);
  const open = Array.from(D.orders.values()).filter(o => o.status !== 'received').length;
  $('#orderSummary').textContent = `${open} still to come · ${D.orders.size} on the list`;
  const out = $('#orderOut');
  if (!all.length) { out.innerHTML = `<div class="empty"><h2>${q || (OL.tab !== 'needed' && D.orders.size) ? 'Nothing in this view' : 'Nothing to order'}</h2><p>${q ? 'Try a different search.' : 'Add an item above. Anyone can mark it ordered, then received.'}</p></div>`; return; }
  out.innerHTML = all.map(o => {
    const nxt = ORDER_NEXT[o.status] || ORDER_NEXT.needed;
    const may = o.created_by === me() || D.rank >= 2;
    return `<article class="order${o.status === 'received' ? ' received' : ''}">
      <div class="grow">
        <div class="item">${esc(o.item)} <span class="qty">${esc(o.qty || '1')}</span></div>
        <div class="meta"><span class="ost ${esc(o.status)}">${esc(orderLabel(o.status))}</span>${o.trade ? `<span class="tchip trade">${icon('trade')}${esc(tradeLabel(o.trade))}</span>` : ''}${o.department_id && D.depts.get(o.department_id) ? deptChipHtml(D.depts.get(o.department_id)) : ''}${(o.tagged || []).map(id => `<span class="tchip person">${icon('person')}${esc(nameOf(id))}</span>`).join('')}${o.task_id && D.tasks.get(o.task_id) && !D.tasks.get(o.task_id).deleted_at ? `<button type="button" class="btn sm ghost" data-open-task="${esc(o.task_id)}">${esc(trunc(D.tasks.get(o.task_id).title, 32))}</button>` : ''}<span>${esc(nameOf(o.created_by))} · ${esc(fmtWhen(o.created_at))}</span></div>
        ${o.note ? `<div class="note">${esc(o.note)}</div>` : ''}
      </div>
      <div class="acts">
        <button type="button" class="btn sm" data-order-status="${esc(o.id)}" data-status="${nxt[0]}">${esc(nxt[1])}</button>
        ${may ? `<button type="button" class="btn sm ghost" data-order-remove="${esc(o.id)}">Remove</button>` : ''}
      </div>
    </article>`;
  }).join('');
}

/* ================= daily tasks ================= */
const mayDaily = d => d.created_by === me() || D.rank >= 2;
function todayDailyTask(id) {
  const day = dayKey();
  for (const t of D.tasks.values()) if (t.daily_id === id && t.daily_on === day && !t.deleted_at) return t;
  return null;
}
function fillDeptSelect(el, current, blank) {
  if (!el) return;
  const html = (blank ? `<option value="">${esc(blank)}</option>` : '') + liveDepts().map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
  const want = current && Array.from(el.options).some(o => o.value === current) ? current : (blank ? '' : (el.options[0] ? el.options[0].value : ''));
  el.value = want;
}
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function weekdayLabel(days) {
  const set = new Set((days && days.length ? days : [0, 1, 2, 3, 4, 5, 6]).map(Number));
  if ([0, 1, 2, 3, 4, 5, 6].every(d => set.has(d))) return 'Every day';
  return [0, 1, 2, 3, 4, 5, 6].filter(d => set.has(d)).map(d => DAY_NAMES[d]).join(' ');
}
async function openDaily() {
  if (!sb || !D.ready) return;
  try {
    const n = new Date();
    const hm = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
    const opened = await call('wtm_open_daily', { p_day: dayKey(), p_now: hm });
    if (opened) await sync(true);
  } catch (e) { toast(toErr(e).message, { tone: 'danger' }); }
}
function renderDaily() {
  const depts = liveDepts();
  fillDeptSelect($('#dailyFilter'), DY.dept, 'All departments');
  const preferred = DY.dept || (myDepts().size ? Array.from(myDepts()).find(id => depts.some(d => d.id === id)) : '') || '';
  fillDeptSelect($('#dailyDept'), $('#dailyDept').value || preferred, 'Choose a department');
  const q = DY.q.trim().toLowerCase();
  let list = Array.from(D.daily.values());
  if (DY.dept) list = list.filter(d => d.department_id === DY.dept);
  if (q) list = list.filter(d => (d.title + ' ' + (d.notes || '') + ' ' + ((D.depts.get(d.department_id) || {}).name || '')).toLowerCase().includes(q));
  list.sort((a, b) => cmpStr((D.depts.get(a.department_id) || {}).name || '', (D.depts.get(b.department_id) || {}).name || '') || a.created_at - b.created_at);
  const running = Array.from(D.daily.values()).filter(d => d.active).length;
  const doneToday = Array.from(D.daily.values()).filter(d => { const t = todayDailyTask(d.id); return t && t.status === 'done'; }).length;
  $('#dailySummary').textContent = D.daily.size ? `${running} running · ${doneToday} done today · ${D.daily.size} set up` : 'A standing list for any department. Each day it opens as a task due today.';
  const out = $('#dailyOut');
  if (!depts.length) { out.innerHTML = '<div class="empty"><h2>No departments yet</h2><p>Add a department under People, then set up the work it does every day.</p></div>'; return; }
  if (!list.length) { out.innerHTML = `<div class="empty"><h2>${q || DY.dept ? 'Nothing in this view' : 'No daily tasks yet'}</h2><p>${q ? 'Try a different search.' : 'Add one above and choose the department that should do it every day.'}</p></div>`; return; }
  const groups = [];
  for (const d of list) {
    let g = groups.find(x => x.id === d.department_id);
    if (!g) { g = { id: d.department_id, name: (D.depts.get(d.department_id) || {}).name || 'Department', color: (D.depts.get(d.department_id) || {}).color || 'c8', rows: [] }; groups.push(g); }
    g.rows.push(d);
  }
  out.innerHTML = groups.map(g => `<section class="dgroup"><h2>${deptLead(D.depts.get(g.id), 22)}${esc(g.name)}</h2>${g.rows.map(d => {
    const t = d.active ? todayDailyTask(d.id) : null;
    const may = mayDaily(d);
    const status = !d.active ? '<span class="dst wait">Paused</span>' : !t ? '<span class="dst wait">Opens today</span>' : `<span class="dst ${t.status === 'done' ? 'done' : 'open'}">${t.status === 'done' ? 'Done today' : 'To do today'}</span>`;
    const act = t && t.status !== 'done' ? `<button type="button" class="btn sm" data-daily-done="${esc(t.id)}">Mark done</button>` : t && t.status === 'done' ? `<button type="button" class="btn sm ghost" data-daily-open="${esc(t.id)}">Open</button>` : '';
    const when = `${esc(weekdayLabel(d.weekdays))}${d.due_time ? ' · by ' + esc(hhmm(d.due_time)) : ''}`;
    const checks = t && t.checks && t.checks.length ? `<div class="checks">${t.checks.map((c, i) => `<button type="button" class="btn sm ghost${c.done ? ' on' : ''}" data-check="${esc(t.id)}" data-i="${i}" aria-pressed="${c.done ? 'true' : 'false'}">${c.done ? 'Done · ' : ''}${esc(c.t)}</button>`).join('')}</div>` : '';
    return `<article class="drow${d.active ? '' : ' paused'}">
      <div class="grow"><div class="item">${esc(d.title)}${d.priority <= 2 ? ` <span class="prio p${d.priority}">P${d.priority}</span>` : ''}</div>
        <div class="meta">${status}<span>${when}</span>${d.notes ? `<span>${esc(trunc(d.notes, 80))}</span>` : ''}</div>${checks}</div>
      <div class="acts">${act}
        ${may ? `<button type="button" class="btn sm ghost" data-daily-pause="${esc(d.id)}">${d.active ? 'Pause' : 'Resume'}</button><button type="button" class="btn sm ghost" data-daily-edit="${esc(d.id)}">Edit</button><button type="button" class="btn sm ghost" data-daily-remove="${esc(d.id)}">Remove</button>` : `<button type="button" class="btn sm ghost" data-daily-edit="${esc(d.id)}">View</button>`}
      </div></article>`;
  }).join('')}</section>`).join('');
}
function openDailyEditor(id, opener) {
  const row = D.daily.get(id); if (!row) return;
  const may = mayDaily(row);
  const dr = { priority: row.priority || 3 };
  const S = {
    opener, kind: 'daily',
    html: () => `${sheetHead('Daily task', 'Repeats for one department')}
      <div class="sh-body">
        <label class="fld"><span class="lbl" for="dy-title">Title</span><input class="field" id="dy-title" maxlength="300" value="${esc(row.title)}"${may ? '' : ' disabled'}></label>
        <label class="fld"><span class="lbl" for="dy-dept">Department</span><select class="field" id="dy-dept"${may ? '' : ' disabled'}>${liveDepts().map(d => `<option value="${esc(d.id)}"${d.id === row.department_id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
        <div class="fld"><span class="lbl">Days</span><div class="seg days" id="dy-days">${DAY_NAMES.map((n, i) => `<button type="button" data-day="${i}" aria-pressed="${(row.weekdays || []).map(Number).includes(i) ? 'true' : 'false'}"${may ? '' : ' disabled'}>${n}</button>`).join('')}</div></div>
        <label class="fld"><span class="lbl" for="dy-time">Due by</span><input class="field" id="dy-time" type="time" value="${esc(hhmm(row.due_time))}"${may ? '' : ' disabled'}></label>
        <div class="fld"><span class="lbl">Priority · ${PRIO[dr.priority]}</span><div class="seg" id="dy-prio" role="group">${[1, 2, 3, 4].map(p => `<button type="button" data-v="${p}" aria-pressed="${dr.priority === p}"${may ? '' : ' disabled'}>P${p}</button>`).join('')}</div></div>
        <label class="fld"><span class="lbl" for="dy-lines">Checklist</span><textarea class="field" id="dy-lines" rows="3" maxlength="1000" placeholder="One step per line"${may ? '' : ' disabled'}>${esc((row.checklist || []).join('\n'))}</textarea></label>
        <label class="fld"><span class="lbl" for="dy-notes">Notes</span><textarea class="field" id="dy-notes" rows="3" maxlength="5000"${may ? '' : ' disabled'}>${esc(row.notes || '')}</textarea></label>
        ${may ? `<label class="pinopt"><input type="checkbox" id="dy-active"${row.active ? ' checked' : ''}> Running</label>` : `<p class="muted" style="margin:0">${row.active ? 'Running.' : 'Paused.'} ${esc(weekdayLabel(row.weekdays))}.</p>`}
      </div>
      <footer class="sh-foot"><span class="spacer"></span>${may ? '<button type="button" class="btn danger" data-sh="remove">Remove</button><button type="button" class="btn primary" data-sh="save">Save changes</button>' : ''}</footer>`,
    focus: may ? '#dy-title' : null,
    onSeg: b => {
      if (!may || b.parentElement.id !== 'dy-prio') return;
      dr.priority = +b.dataset.v;
      for (const x of b.parentElement.children) x.setAttribute('aria-pressed', String(x === b));
      b.parentElement.previousElementSibling.textContent = 'Priority · ' + PRIO[dr.priority];
    },
    click: async b => {
      if (b.dataset.day != null) {
        if (!may) return;
        b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
        return;
      }
      if (b.dataset.sh === 'save') {
        b.disabled = true;
        const title = $('#dy-title').value.trim();
        if (!title) { toast('Give the daily task a title.'); $('#dy-title').focus(); b.disabled = false; return; }
        const wasActive = row.active;
        const active = $('#dy-active').checked;
        const weekdays = $$('#dy-days [data-day]').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => +b.dataset.day);
        if (!weekdays.length) { toast('Pick at least one day.'); b.disabled = false; return; }
        const checklist = $('#dy-lines').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 12);
        const r = await act('wtm_save_daily', { p: { id, day: dayKey(), title, department_id: $('#dy-dept').value, priority: dr.priority, notes: $('#dy-notes').value, active, weekdays, due_time: $('#dy-time').value || '', checklist } }, 'Daily task updated.');
        if (r) { closeSheet(true); if (active && !wasActive) await openDaily(); }
        else b.disabled = false;
      } else if (b.dataset.sh === 'remove') {
        b.disabled = true;
        if (await act('wtm_save_daily', { p: { id, archived: true, day: dayKey() } })) {
          closeSheet(true);
          toast(`Removed “${trunc(row.title, 36)}”`, { action: 'Undo', onAction: () => act('wtm_save_daily', { p: { id, archived: false, day: dayKey() } }, 'Daily task restored.').then(() => openDaily()) });
        } else b.disabled = false;
      }
    }
  };
  openSheet(S);
}

/* ================= toasts & files ================= */
function toast(msg, o = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (o.tone === 'danger' ? ' danger' : '');
  const span = document.createElement('span'); span.textContent = msg; el.appendChild(span);
  if (o.action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = o.action; b.onclick = () => { el.remove(); o.onAction(); }; el.appendChild(b); }
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), o.ms || (o.action ? 7000 : 3500));
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
}
function download(filename, text, mime) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime })), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  } catch (_) { toast('Your browser blocked the download.', { tone: 'danger' }); }
}
const csvCell = v => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function exportCsv() {
  const rows = logRows();
  const lines = [['No.', 'Date', 'Time', 'Action', 'Task', 'Project', 'Detail', 'Duration (min)', 'By', 'Departments'].join(',')];
  for (const e of rows) lines.push([e.id, e.day, fmtTime(e.ts), actionOf(e.action).label, e.task_title, e.project_name, e.detail, e.duration_ms != null ? (+e.duration_ms / 60000).toFixed(1) : '', e.actor ? nameOf(e.actor) : '', deptNames(e.actor).join('; ')].map(csvCell).join(','));
  download(`wtm-logbook-${dayKey()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
}
function exportJson() {
  const data = { app: 'WTM', exportedAt: new Date().toISOString(), exportedBy: D.me.email, people: Array.from(D.profiles.values()), departments: Array.from(D.depts.values()), groups: Array.from(D.groups.values()), projects: Array.from(D.projects.values()), tasks: Array.from(D.tasks.values()), notices: Array.from(D.notices.values()), orders: Array.from(D.orders.values()), daily: Array.from(D.daily.values()), log: Array.from(D.log.values()).sort((a, b) => a.id - b.id), messages: Array.from(D.msgs.values()).sort((a, b) => a.id - b.id) };
  download(`wtm-export-${dayKey()}.json`, JSON.stringify(data, null, 1), 'application/json');
}

/* ================= handover, rooms, trades ================= */
function mondayKey(day) {
  const d = parseDay(day || dayKey());
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return dayKey(d);
}
function handDepts() {
  if (D.rank >= 3) return liveDepts();
  return liveDepts().filter(d => myDepts().has(d.id));
}
function handTasks() {
  const depts = handDepts();
  if (!depts.length) return liveTasks().filter(isMine);
  const ids = new Set(depts.map(d => d.id));
  return liveTasks().filter(t => t.assignees.some(a => (a.kind === 'dept' && ids.has(a.id)) || (a.kind === 'user' && Array.from(deptsOf(a.id)).some(id => ids.has(id)))));
}
function taskLine(t) {
  const why = t.status === 'blocked' && t.blocked_note ? ` · ${esc(trunc(t.blocked_note, 48))}` : '';
  return `<li><button type="button" data-open-task="${esc(t.id)}">${esc(t.title)}${why}${t.due ? ` <small>${esc(dueLabel(t.due))}${t.due_time ? ' ' + esc(hhmm(t.due_time)) : ''}</small>` : ''}</button></li>`;
}
function renderHandover() {
  const today = dayKey(), start = mondayKey(today);
  const tasks = handTasks();
  const open = tasks.filter(t => t.status !== 'done');
  const overdue = open.filter(t => t.due && t.due < today);
  const blocked = open.filter(t => t.status === 'blocked');
  const unclaimed = open.filter(t => t.assignees.some(a => a.kind === 'dept') && !t.assignees.some(a => a.kind === 'user'));
  const needed = Array.from(D.orders.values()).filter(o => o.status === 'needed');
  const notices = Array.from(D.notices.values()).filter(n => n.pinned || n.show_until === today);
  const depts = handDepts();
  const deptIds = new Set(depts.map(d => d.id));
  const week = new Map();
  for (const d of depts) week.set(d.id, { name: d.name, created: 0, done: 0, reopened: 0, overdue: 0 });
  for (const e of D.log.values()) {
    if (e.day < start || e.day > today) continue;
    const task = e.task_id && D.tasks.get(e.task_id);
    let dep = task && (task.assignees.find(a => a.kind === 'dept') || {}).id;
    if (!dep && e.actor) dep = Array.from(deptsOf(e.actor)).find(id => deptIds.has(id));
    if (!dep || !week.has(dep)) continue;
    const row = week.get(dep);
    if (e.action === 'created') row.created++;
    else if (e.action === 'done') row.done++;
    else if (e.action === 'reopened') row.reopened++;
  }
  for (const t of open) if (t.due && t.due < today) {
    const dep = (t.assignees.find(a => a.kind === 'dept') || {}).id;
    if (dep && week.has(dep)) week.get(dep).overdue++;
  }
  const section = (title, rows, empty) => `<section class="hand"><h2>${esc(title)}</h2>${rows.length ? `<ul>${rows}</ul>` : `<p class="muted">${esc(empty)}</p>`}</section>`;
  const people = [];
  const seen = new Set();
  for (const d of depts) for (const id of membersOfDept(d.id)) seen.add(id);
  if (!depts.length && D.me) seen.add(me());
  for (const id of seen) {
    const theirs = liveTasks().filter(t => t.assignees.some(a => a.kind === 'user' && a.id === id));
    const nOpen = theirs.filter(t => t.status !== 'done' && t.status !== 'doing' && t.status !== 'blocked').length;
    const doing = theirs.filter(t => t.status === 'doing').length;
    const blk = theirs.filter(t => t.status === 'blocked').length;
    const doneToday = theirs.filter(t => t.status === 'done' && t.done_at && dayOfTs(t.done_at) === today).length;
    people.push(`<li><button type="button" data-hand-user="${esc(id)}">${esc(nameOf(id))}<small>${nOpen} open · ${doing} in progress · ${blk} blocked · ${doneToday} done today</small></button></li>`);
  }
  $('#handSummary').textContent = depts.length ? depts.map(d => d.name).join(', ') : 'Your own tasks';
  $('#handOut').innerHTML = [
    section('Overdue', overdue.map(taskLine), 'Nothing overdue.'),
    section('Blocked', blocked.map(taskLine), 'Nothing is blocked.'),
    section('Unclaimed', unclaimed.map(taskLine), 'Every department task has someone on it.'),
    section('Orders still needed', needed.map(o => `<li><button type="button" data-go-orders>${esc(o.item)} <small>${esc(o.qty || '1')}${o.trade ? ' · ' + esc(tradeLabel(o.trade)) : ''}</small></button></li>`), 'Nothing waiting to be ordered.'),
    section('Notices', notices.map(n => `<li><span>${n.pinned ? 'Pinned · ' : ''}${esc(n.title)}${n.show_until ? ' <small>until ' + esc(fmtDay(n.show_until)) + '</small>' : ''}</span></li>`), 'No pinned or expiring notices.'),
    section('This week', Array.from(week.values()).map(r => `<li><span>${esc(r.name)}<small>${r.created} created · ${r.done} completed · ${r.reopened} reopened · ${r.overdue} still overdue</small></span></li>`), 'No department to count.'),
    section('Who is carrying the work', people, 'No one to show.')
  ].join('');
}
function openRoom(name) {
  const tag = 'room:' + name;
  const today = dayKey();
  const tasks = liveTasks().filter(t => t.status !== 'done' && (t.tags || []).includes(tag));
  const tagged = new Set(liveTasks().filter(t => (t.tags || []).includes(tag)).map(t => t.id));
  const daily = Array.from(D.daily.values()).filter(d => (d.tags || []).includes(tag) || ((todayDailyTask(d.id) || {}).tags || []).includes(tag));
  const orders = Array.from(D.orders.values()).filter(o => (o.task_id && tagged.has(o.task_id)) || (o.item + ' ' + (o.note || '')).toLowerCase().includes(String(name).toLowerCase()));
  openSheet({
    kind: 'room',
    html: () => `${sheetHead(name, 'Open work for this room')}
      <div class="sh-body">
        <div class="fld"><span class="lbl">Open tasks</span>${tasks.length ? `<ul class="mini-list">${tasks.map(t => `<li><button type="button" class="btn sm ghost" data-sh="task" data-id="${esc(t.id)}">${esc(t.title)}</button></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">No open tasks.</p>'}</div>
        <div class="fld"><span class="lbl">Daily</span>${daily.length ? `<ul class="mini-list">${daily.map(d => `<li><span class="grow">${esc(d.title)}</span><small>${esc((D.depts.get(d.department_id) || {}).name || '')}${todayDailyTask(d.id) && todayDailyTask(d.id).daily_on === today ? ' · today' : ''}</small></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">No daily task for this room.</p>'}</div>
        <div class="fld"><span class="lbl">Orders</span>${orders.length ? `<ul class="mini-list">${orders.map(o => `<li><span class="grow">${esc(o.item)}</span><small>${esc(orderLabel(o.status))}</small></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">No orders mention this room.</p>'}</div>
      </div>`,
    click: b => { if (b.dataset.sh === 'task') { const id = b.dataset.id; closeSheet(true); openTask(id, b); } }
  });
}
function projectCounts(id) {
  let open = 0, done = 0;
  for (const t of liveTasks()) if (t.project_id === id) { if (t.status === 'done') done++; else open++; }
  return `${open} open · ${done} done`;
}

/* ================= calendar ================= */
const CAL_LABEL = { job: 'Job', event: 'Event', booking: 'Booking', holiday: 'Public holiday' };
const CAL = { cursor: dayKey().slice(0, 7) + '-01', day: dayKey(), on: { job: true, event: true, booking: true, holiday: true }, edit: null, dept: LS.get('wtm.cal.dept') || 'mine' };
// null = every department; 'mine' falls back to everything for people with no department.
function calDepts() {
  if (CAL.dept === 'mine') return myDepts().size ? myDepts() : null;
  return CAL.dept !== 'all' && D.depts.has(CAL.dept) ? new Set([CAL.dept]) : null;
}
const taskInDepts = (t, ids) => t.assignees.some(a => (a.kind === 'dept' && ids.has(a.id)) || (a.kind === 'user' && Array.from(deptsOf(a.id)).some(id => ids.has(id))));
function shiftMonth(s, n) { const d = parseDay(s.slice(0, 7) + '-01'); d.setMonth(d.getMonth() + n); return dayKey(d); }
function dailyOnDay(id, day) { for (const t of D.tasks.values()) if (t.daily_id === id && t.daily_on === day && !t.deleted_at) return t; return null; }
function calSpan(entry, day) {
  if (!entry || entry.deleted_at || !isDay(entry.day)) return false;
  const end = entry.end_day && isDay(entry.end_day) ? entry.end_day : entry.day;
  return day >= entry.day && day <= end && day <= addDays(entry.day, 45);
}
function calItems(day) {
  const out = [], ds = calDepts();
  if (CAL.on.job) {
    for (const t of liveTasks()) if (t.due === day && (!ds || taskInDepts(t, ds))) out.push({ kind: 'job', id: t.id, title: t.title, time: t.due_time, done: t.status === 'done', sub: t.status === 'done' ? 'Done' : (t.due_time || 'Job') });
    if (day >= dayKey()) {
      const wd = parseDay(day).getDay();
      for (const d of D.daily.values()) {
        if (d.archived_at || d.active === false) continue;
        if (ds && !ds.has(d.department_id)) continue;
        if (!(d.weekdays || []).map(Number).includes(wd)) continue;
        if (dailyOnDay(d.id, day)) continue;
        const dept = (D.depts.get(d.department_id) || {}).name || '';
        out.push({ kind: 'job', id: 'daily:' + d.id, title: d.title, time: d.due_time, done: false, sub: 'Daily' + (dept ? ' · ' + dept : ''), daily: true });
      }
    }
  }
  for (const c of D.calendar.values()) {
    if (!CAL.on[c.kind] || !calSpan(c, day)) continue;
    out.push({ kind: c.kind, id: c.id, title: c.title, time: c.starts, done: false, sub: CAL_LABEL[c.kind] + (c.starts ? ' · ' + c.starts : '') + (c.notes ? ' · ' + c.notes : ''), entry: c });
  }
  const order = { job: 0, event: 1, booking: 2, holiday: 3 };
  out.sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || order[a.kind] - order[b.kind] || cmpStr(a.title, b.title));
  return out;
}
function calMonth() {
  const month = CAL.cursor.slice(0, 7);
  const lead = (parseDay(CAL.cursor).getDay() + 6) % 7;
  const start = addDays(CAL.cursor, -lead);
  let grid = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="calwd">${d}</div>`).join('');
  const seen = { job: new Set(), event: new Set(), booking: new Set(), holiday: new Set() };
  for (let i = 0; i < 42; i++) {
    const day = addDays(start, i);
    const items = calItems(day);
    if (day.slice(0, 7) === month) for (const it of items) seen[it.kind].add(it.id);
    const dots = [...new Set(items.map(it => it.kind))].map(k => `<i class="k-${k}"></i>`).join('');
    grid += `<button type="button" class="calcell${day.slice(0, 7) === month ? '' : ' out'}${day === dayKey() ? ' today' : ''}${day === CAL.day ? ' on' : ''}" data-cal-day="${day}"><span class="n">${+day.slice(8)}</span><span class="cdots">${dots}</span></button>`;
  }
  return { grid, seen };
}
function calDayHtml(day) {
  const list = calItems(day);
  return `<h3>${esc(parseDay(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}</h3>`
    + (list.length ? `<ul>${list.map(it => `<li><button type="button" data-cal-open="${esc(it.kind + ':' + it.id)}"><span class="mark k-${it.kind}"></span><span><span class="ttl${it.done ? ' done' : ''}">${esc(it.title)}</span><span class="sub">${esc(it.sub)}</span></span></button></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Nothing on this day.</p>');
}
function openCalItem(b) {
  const raw = b.dataset.calOpen, i = raw.indexOf(':'), kind = raw.slice(0, i), id = raw.slice(i + 1);
  if (kind === 'job' && !id.startsWith('daily:')) { openTask(id, b); return; }
  const entry = D.calendar.get(id);
  if (!entry) return;
  if (UI.view !== 'calendar') { CAL.day = entry.day; setView('calendar'); }
  if (entry.kind === 'holiday' ? canSupervise() : entry.created_by === me() || canSupervise()) openCalForm(entry.day, entry);
}
function renderCalendar() {
  const title = $('#calTitle'); if (title) title.textContent = parseDay(CAL.cursor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const sel = $('#calDept');
  if (sel) {
    const mine = Array.from(myDepts()).map(id => D.depts.get(id)).filter(d => d && !d.archived);
    const mineLbl = mine.length === 1 ? `My department (${mine[0].name})` : mine.length ? 'My departments' : '';
    const html = (mineLbl ? `<option value="mine">${esc(mineLbl)}</option>` : '') + '<option value="all">All departments</option>' + liveDepts().map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
    if (sel.dataset.h !== html) { sel.innerHTML = html; sel.dataset.h = html; }
    sel.value = Array.from(sel.options).some(o => o.value === CAL.dept) ? CAL.dept : (mineLbl ? 'mine' : 'all');
  }
  const filters = $('#calFilters');
  if (filters) filters.innerHTML = ['job', 'event', 'booking', 'holiday'].map(k => `<button type="button" data-cal-kind="${k}" aria-pressed="${CAL.on[k] ? 'true' : 'false'}"><i class="k-${k}"></i>${k === 'holiday' ? 'Public holidays' : CAL_LABEL[k] + 's'}</button>`).join('');
  const { grid: cells, seen } = calMonth();
  const grid = $('#calGrid'); if (grid) grid.innerHTML = cells;
  const sum = $('#calSummary');
  const counts = { job: seen.job.size, event: seen.event.size, booking: seen.booking.size, holiday: seen.holiday.size };
  if (sum) sum.textContent = ['job', 'event', 'booking', 'holiday'].filter(k => counts[k]).map(k => `${counts[k]} ${counts[k] === 1 ? CAL_LABEL[k].toLowerCase() : (k === 'holiday' ? 'public holidays' : CAL_LABEL[k].toLowerCase() + 's')}`).join(' · ') || 'Nothing this month';
  const dayEl = $('#calDay');
  if (dayEl) { dayEl.className = 'calday'; dayEl.innerHTML = calDayHtml(CAL.day); }
  const hol = $('#calKind option[value="holiday"]'); if (hol) hol.hidden = !canSupervise();
  const box = $('#calHolBox'); if (box && $('#calKind')) box.hidden = $('#calKind').value !== 'holiday' || !canSupervise();
}
const ICS_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const icsFold = line => { const out = []; let s = line; while (s.length > 73) { out.push(s.slice(0, 73)); s = ' ' + s.slice(73); } out.push(s); return out.join('\r\n'); };
const icsDay = s => String(s).replace(/-/g, '');
function icsClock(day, hm, add) {
  const [h, m] = hm.split(':').map(Number), d = parseDay(day);
  d.setHours(h, m + (add || 0), 0, 0);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}
function buildIcs() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const from = addDays(dayKey(), -30), to = addDays(dayKey(), 180), ds = calDepts();
  const ev = [];
  const push = (uid, summary, start, end, extra) => {
    ev.push(['BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + stamp, start, end, 'SUMMARY:' + icsEsc(summary)].concat(extra || [], ['END:VEVENT']));
  };
  if (CAL.on.job) {
    for (const t of liveTasks()) {
      if (!t.due || t.due < from || t.due > to || (ds && !taskInDepts(t, ds))) continue;
      const when = t.due_time
        ? ['DTSTART:' + icsClock(t.due, t.due_time), 'DTEND:' + icsClock(t.due, t.due_time, 30)]
        : ['DTSTART;VALUE=DATE:' + icsDay(t.due), 'DTEND;VALUE=DATE:' + icsDay(addDays(t.due, 1))];
      push('job-' + t.id + '@wtm', t.title, when[0], when[1], ['CATEGORIES:Job'].concat(t.status === 'done' ? ['STATUS:COMPLETED'] : []));
    }
    for (const d of D.daily.values()) {
      if (d.archived_at || d.active === false || (ds && !ds.has(d.department_id))) continue;
      const by = (d.weekdays || []).map(n => ICS_DAY[Number(n)]).filter(Boolean);
      if (!by.length) continue;
      const dept = (D.depts.get(d.department_id) || {}).name || '';
      const when = d.due_time
        ? ['DTSTART:' + icsClock(dayKey(), d.due_time), 'DTEND:' + icsClock(dayKey(), d.due_time, 30)]
        : ['DTSTART;VALUE=DATE:' + icsDay(dayKey()), 'DTEND;VALUE=DATE:' + icsDay(addDays(dayKey(), 1))];
      push('daily-' + d.id + '@wtm', d.title, when[0], when[1], ['RRULE:FREQ=WEEKLY;BYDAY=' + by.join(','), 'CATEGORIES:Job'].concat(dept ? ['DESCRIPTION:' + icsEsc(dept)] : []));
    }
  }
  for (const c of D.calendar.values()) {
    if (c.deleted_at || !CAL.on[c.kind] || !isDay(c.day)) continue;
    const end = c.end_day && isDay(c.end_day) ? c.end_day : c.day;
    if (end < from || c.day > to) continue;
    const when = c.starts
      ? ['DTSTART:' + icsClock(c.day, String(c.starts).slice(0, 5)), 'DTEND:' + icsClock(c.day, String(c.starts).slice(0, 5), 60)]
      : ['DTSTART;VALUE=DATE:' + icsDay(c.day), 'DTEND;VALUE=DATE:' + icsDay(addDays(end, 1))];
    push(c.kind + '-' + c.id + '@wtm', c.title, when[0], when[1], ['CATEGORIES:' + CAL_LABEL[c.kind]].concat(c.notes ? ['DESCRIPTION:' + icsEsc(c.notes)] : []));
  }
  const head = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WTM//Work Task Manager//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:WTM'];
  return head.concat(...ev, ['END:VCALENDAR']).map(icsFold).join('\r\n') + '\r\n';
}
function downloadCalendar() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buildIcs()], { type: 'text/calendar' }));
  a.download = 'WTM.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Saved WTM.ics. Open it, or in Google Calendar use Settings, then Import.');
}
async function copyCalendarLink() {
  let token = '';
  try { token = await call('wtm_calendar_feed', { p_dept: CAL.dept || 'mine' }); }
  catch (e) { toast('The live link needs the latest database script. The file download works now.', { tone: 'danger', ms: 7000 }); return; }
  if (!token || !CONFIG.url) { toast('The live link is not available yet. The file download works now.', { tone: 'danger' }); return; }
  const url = CONFIG.url.replace(/\/$/, '') + '/functions/v1/wtm-calendar?token=' + token;
  try { await navigator.clipboard.writeText(url); }
  catch (e) { toast(url, { ms: 12000 }); return; }
  toast('Subscribe link copied. In Google Calendar choose Other calendars, then From URL. Outlook and Apple Calendar subscribe to the same link. It follows the department chosen here.', { ms: 9000 });
}
function openCalForm(day, entry) {
  const form = $('#calForm'); if (!form) return;
  CAL.edit = entry ? entry.id : null;
  CAL.day = day || (entry ? entry.day : CAL.day);
  form.hidden = false;
  $('#calKind').value = entry ? entry.kind : 'event';
  if (!canSupervise() && $('#calKind').value === 'holiday') $('#calKind').value = 'event';
  $('#calName').value = entry ? entry.title : '';
  $('#calDate').value = entry ? entry.day : CAL.day;
  $('#calEnd').value = entry && entry.end_day && entry.end_day !== entry.day ? entry.end_day : '';
  $('#calTime').value = entry && entry.starts ? entry.starts : '';
  $('#calNotes').value = entry ? entry.notes || '' : '';
  $('#calRemove').hidden = !entry;
  $('#calSave').textContent = entry ? 'Save changes' : 'Save';
  const holiday = $('#calKind').value === 'holiday';
  $('#calEndWrap').hidden = holiday;
  $('#calTimeWrap').hidden = holiday;
  $('#calHolBox').hidden = !holiday || !canSupervise();
  fillHolidayPickers();
  renderCalendar();
  form.scrollIntoView({ block: 'nearest' });
  if (!entry) $('#calName').focus();
}
function fillHolidayPickers() {
  const pack = window.WTM_HOLIDAYS || { countries: [], years: {} };
  const country = $('#calCountry'), year = $('#calYear');
  if (!country || country.options.length) return;
  country.innerHTML = (pack.countries || []).map(([code, name]) => `<option value="${esc(code)}">${esc(name)}</option>`).join('');
  const years = Object.keys((pack.years || {}).SG || { 2026: 1, 2027: 1 });
  year.innerHTML = years.map(y => `<option value="${esc(y)}"${String(y) === String(new Date().getFullYear()) ? ' selected' : ''}>${esc(y)}</option>`).join('');
}
function closeCalForm() { CAL.edit = null; const form = $('#calForm'); if (form) form.hidden = true; }

/* ================= navigation & events ================= */
function navIsDrawer() { return innerWidth < 900; }
function setNavOpen(open) {
  const nav = $('#nav'), panel = $('#navScroll'), scrim = $('#navScrim'), btn = $('#navToggle');
  if (!nav || !btn) return;
  if (!navIsDrawer()) open = false;
  nav.classList.toggle('open', open);
  if (scrim) scrim.classList.toggle('show', open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.setAttribute('aria-label', open ? 'Pull menu back' : 'Pull menu out');
  if (panel) { if (open || !navIsDrawer()) panel.removeAttribute('inert'); else panel.setAttribute('inert', ''); }
  nav.removeAttribute('inert');
}
function setView(v, initial) {
  if (!['tasks', 'messages', 'mail', 'board', 'orders', 'invoices', 'daily', 'calendar', 'handover', 'log', 'people', 'settings'].includes(v)) v = 'tasks';
  UI.view = v; LS.set('wtm.view', v);
  for (const k of ['tasks', 'messages', 'mail', 'board', 'orders', 'invoices', 'daily', 'calendar', 'handover', 'log', 'people', 'settings']) $('#view-' + k).hidden = k !== v;
  try { if (location.hash.slice(1) !== v) history.replaceState(null, '', '#' + v); } catch (_) {}
  closePop(); closeQaMenu(); closeMention(); closeConvMenu();
  renderNow();
  if (!initial) scrollTo({ top: 0 });
}
function wire() {
  $('#navToggle').addEventListener('click', () => setNavOpen(!$('#nav').classList.contains('open')));
  $('#navScrim').addEventListener('click', () => setNavOpen(false));
  $('#mailState').addEventListener('click', e => { if (e.target.closest('#mailRetry')) { MAIL.error = ''; renderMail(); } });
  const openSection = b => { if (b.dataset.view === 'messages' && !UI.conv) UI.conv = ALL_CONV; setView(b.dataset.view); if (navIsDrawer()) setNavOpen(false); };
  $('#nav').addEventListener('click', e => { const b = e.target.closest('#navScroll button[data-view]'); if (b) openSection(b); });
  $('#dock').addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) openSection(b); });
  if (navIsDrawer()) $('#navScroll').setAttribute('inert', '');
  $('#meBtn').addEventListener('click', () => openAccount($('#meBtn')));
  $('#calPrev').addEventListener('click', () => { CAL.cursor = shiftMonth(CAL.cursor, -1); renderCalendar(); });
  $('#calNext').addEventListener('click', () => { CAL.cursor = shiftMonth(CAL.cursor, 1); renderCalendar(); });
  $('#calToday').addEventListener('click', () => { CAL.cursor = dayKey().slice(0, 7) + '-01'; CAL.day = dayKey(); renderCalendar(); });
  $('#calAdd').addEventListener('click', () => openCalForm(CAL.day));
  $('#calDept').addEventListener('change', e => { CAL.dept = e.target.value; LS.set('wtm.cal.dept', CAL.dept); renderCalendar(); });
  $('#calSync').addEventListener('click', () => { const b = $('#calSyncBox'); b.hidden = !b.hidden; $('#calSync').setAttribute('aria-expanded', b.hidden ? 'false' : 'true'); });
  $('#calDownload').addEventListener('click', downloadCalendar);
  $('#calLink').addEventListener('click', copyCalendarLink);
  $('#calFilters').addEventListener('click', e => { const b = e.target.closest('[data-cal-kind]'); if (!b) return; CAL.on[b.dataset.calKind] = b.getAttribute('aria-pressed') !== 'true'; renderCalendar(); });
  $('#calGrid').addEventListener('click', e => { const b = e.target.closest('[data-cal-day]'); if (!b) return; CAL.day = b.dataset.calDay; renderCalendar(); });
  $('#calDay').addEventListener('click', e => {
    const b = e.target.closest('[data-cal-open]'); if (b) openCalItem(b);
  });
  $('#calKind').addEventListener('change', () => {
    if ($('#calKind').value === 'holiday' && !canSupervise()) { $('#calKind').value = 'event'; return; }
    const holiday = $('#calKind').value === 'holiday';
    $('#calEndWrap').hidden = holiday; $('#calTimeWrap').hidden = holiday; $('#calHolBox').hidden = !holiday || !canSupervise();
    if (holiday) fillHolidayPickers();
  });
  $('#calForm').addEventListener('submit', async e => {
    e.preventDefault();
    const kind = $('#calKind').value, title = $('#calName').value.trim(), day = $('#calDate').value;
    if (!title || !isDay(day)) { toast('Give it a name and a date.'); return; }
    const btn = $('#calSave'); btn.disabled = true;
    const p = { kind, title, day, end_day: kind === 'holiday' ? '' : $('#calEnd').value, starts: kind === 'holiday' ? '' : $('#calTime').value, notes: $('#calNotes').value };
    if (CAL.edit) p.id = CAL.edit;
    const r = await act('wtm_save_calendar', { p }, CAL.edit ? 'Calendar entry updated.' : 'Added to the calendar.');
    btn.disabled = false;
    if (r) { closeCalForm(); CAL.day = day; CAL.cursor = day.slice(0, 7) + '-01'; renderCalendar(); }
  });
  $('#calCancel').addEventListener('click', () => { closeCalForm(); renderCalendar(); });
  $('#calRemove').addEventListener('click', async () => {
    if (!CAL.edit) return;
    $('#calRemove').disabled = true;
    const r = await act('wtm_save_calendar', { p: { id: CAL.edit, deleted: true } }, 'Removed from the calendar.');
    $('#calRemove').disabled = false;
    if (r) { closeCalForm(); renderCalendar(); }
  });
  $('#calLoad').addEventListener('click', async () => {
    const pack = window.WTM_HOLIDAYS || {}, code = $('#calCountry').value, year = $('#calYear').value;
    const rows = pack.years && pack.years[code] && pack.years[code][year];
    if (!rows || !rows.length) { toast('No public holidays are listed for that country and year.'); return; }
    $('#calLoad').disabled = true;
    const r = await act('wtm_import_holidays', { p: { rows: rows.map(([day, title]) => ({ day, title })) } });
    $('#calLoad').disabled = false;
    if (r) toast(r.saved ? `Added ${r.saved} public holidays${r.skipped ? `. ${r.skipped} were already there` : ''}.` : 'Those holidays are already on the calendar.');
  });
  $('#stats').addEventListener('click', e => {
    const b = e.target.closest('[data-go]'); if (!b) return; const g = b.dataset.go;
    if (g === 'log') { LP.range = 'today'; LP.person = me(); saveLP(); setView('log'); return; }
    if (g === 'messages') { setView('messages'); return; }
    TP.tab = g; TP.scope = 'mine'; saveTP(); setView('tasks');
  });
  // quick add
  const qaMention = () => { const at = mentionAt($('#qaInput')); const hit = at && at.q ? findAssignee(at.q) : null; const taken = qaDraft().assign.filter(a => !(hit && a.kind === hit.kind && a.id === hit.id)); syncMention($('#qaInput'), 'token', null, taken); };
  $('#qaInput').addEventListener('input', () => { renderQa(); qaMention(); });
  $('#qaInput').addEventListener('click', qaMention);
  $('#qaInput').addEventListener('keyup', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') qaMention(); });
  $('#qa').addEventListener('submit', e => { e.preventDefault(); submitQuick(); });
  $('#qaTools').addEventListener('click', e => {
    if (e.target.closest('#qaDrop')) {
      e.preventDefault();
      const menu = $('#qaMenu'), open = menu.hidden;
      menu.hidden = !open;
      $('#qaDrop').setAttribute('aria-expanded', String(open));
      return;
    }
    const b = e.target.closest('[data-tool]'); if (!b) return;
    closeQaMenu();
    const anchor = b.closest('#qaMenu') ? $('#qaDrop') : b;
    const d = qaDraft();
    switch (b.dataset.tool) {
      case 'assign': pickAssignees(anchor, d.assign, l => { QA.assign = l; QA.dismissed.add('scope'); removeToken(w => /^@/.test(w) && findAssignee(w.slice(1))); renderQa(); }); break;
      case 'date': pickDate(anchor, d.due, v => { QA.due = v || null; if (!v) QA.noDefaultDue = true; removeToken(w => /^\^/.test(w) && parseDue(w.slice(1))); renderQa(); }); break;
      case 'priority': pickPriority(anchor, d.priority, p => { QA.priority = p; removeToken(w => /^![1-4]$/.test(w)); renderQa(); }); break;
      case 'room': pickRoom(anchor, t => { if (!QA.tags.includes(t)) QA.tags.push(t); renderQa(); }); break;
      case 'trade': pickTrade(anchor, t => { if (!QA.tags.includes(t)) QA.tags.push(t); renderQa(); }); break;
      case 'tag': pickTag(anchor, t => { if (!QA.tags.includes(t)) QA.tags.push(t); renderQa(); }); break;
      case 'project': pickProject(anchor, d.project, id => { QA.project = id; if (!id) { const det = detect(d.q.title).find(x => x.type === 'project'); if (det) QA.dismissed.add(dkey(det)); } renderQa(); }); break;
      case 'pin': openPinPicker(anchor, QA.pin, pin => { QA.pin = pin; renderQa(); }); break;
      case 'photo': pickImageFile().then(file => {
        if (!file) return;
        if (QA.photoPreview) URL.revokeObjectURL(QA.photoPreview);
        QA.photoFile = file; QA.photoPreview = URL.createObjectURL(file); renderQa();
      }); break;
      case 'more': openNewTask(null, anchor); break;
    }
  });
  $('#qaChips').addEventListener('click', e => {
    const as = e.target.closest('[data-assign]');
    if (as) { const t = as.dataset.assign, i = tagInfo(t); const a = { kind: i.type === 'person' ? 'user' : 'dept', id: i.id }; if (!QA.assign.some(x => x.kind === a.kind && x.id === a.id)) QA.assign.push(a); QA.dismissed.add('scope'); QA.dismissed.add(i.type + ':' + i.id); QA.tags = QA.tags.filter(x => x !== t); renderQa(); return; }
    const x = e.target.closest('.x'); if (!x) return; const c = x.closest('[data-chip]'); onQaChip(c.dataset.chip, c.dataset.src);
  });
  // task list
  $('#taskTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; TP.tab = b.dataset.tab; saveTP(); renderTasks(); });
  $('#taskSearch').addEventListener('input', e => { TP.q = e.target.value; renderTasks(); });
  $('#taskScope').addEventListener('change', e => { TP.scope = e.target.value; QA.dismissed.delete('scope'); saveTP(); renderTasks(); });
  $('#taskSort').addEventListener('change', e => { TP.sort = e.target.value; TP.dir = 1; saveTP(); renderTasks(); });
  $('#taskRoom').addEventListener('change', e => { TP.room = e.target.value; saveTP(); renderTasks(); });
  $('#taskDir').addEventListener('click', () => { TP.dir = -TP.dir; saveTP(); renderTasks(); });
  $('#taskOut').addEventListener('click', e => {
    const room = e.target.closest('[data-room]');
    if (room) { openRoom(room.dataset.room); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const li = b.closest('[data-id]'), id = li && li.dataset.id, t = id && D.tasks.get(id);
    switch (b.dataset.act) {
      case 'toggle': if (t) { b.disabled = true; toggleDone(t); } break;
      case 'open': openTask(id, b); break;
      case 'scope-all': TP.scope = 'all'; saveTP(); renderTasks(); break;
      case 'take': if (t) { b.disabled = true; takeTask(t); } break;
      case 'start': if (t) { b.disabled = true; act('wtm_save_task', { p: { id: t.id, status: 'doing' } }); } break;
      case 'block': if (t) askBlock(b, note => act('wtm_save_task', { p: { id: t.id, status: 'blocked', blocked_note: note } })); break;
      case 'tradie': if (t) { const cur = (t.tags.find(x => x.startsWith('trade:')) || ''); pickTrade(b, tag => stampTrade(t, tag), { title: 'Tradie', current: cur }); } break;
    }
  });
  // notice board
  $('#postKind').addEventListener('click', e => { const b = e.target.closest('[data-post]'); if (!b) return; setPostKind(b.dataset.post); $('#noticeTitle').focus(); });
  $('#noticeAdd').addEventListener('submit', async e => {
    e.preventDefault();
    const title = $('#noticeTitle').value.trim();
    if (!title) { $('#noticeTitle').focus(); return; }
    const btn = $('#postGo'); btn.disabled = true;
    const body = $('#noticeBody').value.trim(), dest = $('#postTo').value || ALL_CONV;
    const [kind, id] = dest.split(':');
    let r = null;
    if (NB.kind === 'message') {
      r = await act('wtm_send_message', { p_kind: kind, p_to: id, p_body: title, p_task: null, p_pin: null, p_photo: null });
      if (r) toast('Message sent.', { action: 'Open', onAction: () => openConv(kind === 'all' || kind === 'dept' ? ALL_CONV : dest) });
    } else if (NB.kind === 'task') {
      const due = $('#postDue').value;
      r = await act('wtm_save_task', { p: { title, notes: body, priority: 3, due: isDay(due) ? due : null, tags: [], assignees: [{ kind, id }] } });
      if (r) toast('Task added.', { action: 'Open', onAction: () => openTask(r.id) });
    } else {
      const until = $('#noticeUntil').value;
      r = await act('wtm_save_notice', { p: { title, body, pinned: $('#noticePin').checked, show_until: isDay(until) ? until : '' } }, 'Notice posted.');
    }
    btn.disabled = false;
    if (r) { $('#noticeTitle').value = ''; $('#noticeBody').value = ''; $('#noticePin').checked = false; $('#noticeUntil').value = ''; $('#postDue').value = ''; }
  });
  $('#boardOut').addEventListener('click', async e => {
    const task = e.target.closest('[data-open-task]'); if (task) { openTask(task.dataset.openTask, task); return; }
    const conv = e.target.closest('[data-conv]'); if (conv) { openConv(conv.dataset.conv); return; }
    const go = e.target.closest('[data-board-go]');
    if (go) { if (go.dataset.boardGo === 'tasks') { TP.scope = 'mine'; TP.tab = 'open'; saveTP(); } setView(go.dataset.boardGo); return; }
    const day = e.target.closest('[data-cal-day]');
    if (day) { CAL.day = day.dataset.calDay; if (CAL.day.slice(0, 7) !== CAL.cursor.slice(0, 7)) CAL.cursor = CAL.day.slice(0, 7) + '-01'; renderBoard(); return; }
    const calOpen = e.target.closest('[data-cal-open]'); if (calOpen) { openCalItem(calOpen); return; }
    const nav = e.target.closest('[data-bcal]');
    if (nav) {
      const k = nav.dataset.bcal;
      if (k === 'open') { setView('calendar'); return; }
      if (k === 'today') { CAL.cursor = dayKey().slice(0, 7) + '-01'; CAL.day = dayKey(); }
      else CAL.cursor = shiftMonth(CAL.cursor, k === 'prev' ? -1 : 1);
      renderBoard(); return;
    }
    const pin = e.target.closest('[data-notice-pin]'), rm = e.target.closest('[data-notice-remove]');
    if (pin) { pin.disabled = true; await act('wtm_save_notice', { p: { id: pin.dataset.noticePin, pinned: pin.dataset.pinned === '1' } }); }
    else if (rm) {
      const id = rm.dataset.noticeRemove, n = D.notices.get(id);
      rm.disabled = true;
      if (await act('wtm_save_notice', { p: { id, archived: true } })) toast(`Removed “${trunc(n ? n.title : 'notice', 36)}”`, { action: 'Undo', onAction: () => act('wtm_save_notice', { p: { id, archived: false } }, 'Notice restored.') });
    }
  });
  // order list
  $('#orderAdd').addEventListener('submit', async e => {
    e.preventDefault();
    const item = $('#orderItem').value.trim();
    if (!item) { $('#orderItem').focus(); return; }
    const btn = e.target.querySelector('button[type="submit"]'); btn.disabled = true;
    const r = await act('wtm_save_order', { p: { item, qty: $('#orderQty').value.trim() || '1', note: $('#orderNote').value.trim(), trade: $('#orderTrade').value, department_id: $('#orderDept').value, task_id: OL.task || null } }, 'Added to the order list.');
    btn.disabled = false;
    if (r) { $('#orderItem').value = ''; $('#orderQty').value = ''; $('#orderNote').value = ''; $('#orderTrade').value = ''; $('#orderDept').value = ''; OL.task = ''; OL.deptLock = false; renderOrderLink(); renderOrderHeads(); }
  });
  $('#orderTrade').addEventListener('change', () => {
    if (OL.deptLock) return;
    const id = D.tagDepts.get($('#orderTrade').value) || '';
    if (id && $('#orderDept')) $('#orderDept').value = id;
    renderOrderHeads();
  });
  $('#orderDept').addEventListener('change', () => { OL.deptLock = true; renderOrderHeads(); });
  $('#orderAdd').addEventListener('click', e => { if (e.target.closest('[data-order-unlink]')) { e.preventDefault(); OL.task = ''; renderOrderLink(); } });
  $('#orderSearch').addEventListener('input', e => { OL.q = e.target.value; renderOrders(); });
  $('#orderTabs').addEventListener('click', e => { const b = e.target.closest('[data-otab]'); if (!b) return; OL.tab = b.dataset.otab; renderOrders(); });
  $('#orderOut').addEventListener('click', async e => {
    const open = e.target.closest('[data-open-task]');
    if (open) { openTask(open.dataset.openTask, open); return; }
    const st = e.target.closest('[data-order-status]'), rm = e.target.closest('[data-order-remove]');
    if (st) { st.disabled = true; await act('wtm_save_order', { p: { id: st.dataset.orderStatus, status: st.dataset.status } }); }
    else if (rm) { rm.disabled = true; await act('wtm_save_order', { p: { id: rm.dataset.orderRemove, deleted: true } }, 'Removed from the order list.'); }
  });
  // daily tasks
  $('#dailyAdd').addEventListener('submit', async e => {
    e.preventDefault();
    const title = $('#dailyTitle').value.trim(), department_id = $('#dailyDept').value;
    if (!title) { $('#dailyTitle').focus(); return; }
    if (!department_id) { toast('Choose a department.'); $('#dailyDept').focus(); return; }
    const btn = e.target.querySelector('button[type="submit"]'); btn.disabled = true;
    const r = await act('wtm_save_daily', { p: { title, department_id, day: dayKey() } }, 'Added to the daily list.');
    btn.disabled = false;
    if (r) { $('#dailyTitle').value = ''; await openDaily(); }
  });
  $('#dailySearch').addEventListener('input', e => { DY.q = e.target.value; renderDaily(); });
  $('#dailyFilter').addEventListener('change', e => { DY.dept = e.target.value; renderDaily(); });
  $('#handOut').addEventListener('click', e => {
    const task = e.target.closest('[data-open-task]');
    if (task) { openTask(task.dataset.openTask, task); return; }
    const person = e.target.closest('[data-hand-user]');
    if (person) { TP.scope = 'user:' + person.dataset.handUser; TP.tab = 'open'; saveTP(); setView('tasks'); return; }
    if (e.target.closest('[data-go-orders]')) setView('orders');
  });
  $('#dailyOut').addEventListener('click', async e => {
    const ck = e.target.closest('[data-check]');
    if (ck) { ck.disabled = true; toggleChecks(ck.dataset.check, +ck.dataset.i); return; }
    const done = e.target.closest('[data-daily-done]'), open = e.target.closest('[data-daily-open]');
    const pause = e.target.closest('[data-daily-pause]'), edit = e.target.closest('[data-daily-edit]'), rm = e.target.closest('[data-daily-remove]');
    if (done) { done.disabled = true; await act('wtm_save_task', { p: { id: done.dataset.dailyDone, status: 'done' } }); }
    else if (open) openTask(open.dataset.dailyOpen, open);
    else if (edit) openDailyEditor(edit.dataset.dailyEdit, edit);
    else if (pause) {
      const row = D.daily.get(pause.dataset.dailyPause); if (!row) return;
      pause.disabled = true;
      if (await act('wtm_save_daily', { p: { id: row.id, active: !row.active, day: dayKey() } }, row.active ? 'Paused. Today’s copy stays as it is.' : 'Running again.')) {
        if (!row.active) await openDaily();
      }
    } else if (rm) {
      const row = D.daily.get(rm.dataset.dailyRemove); if (!row) return;
      rm.disabled = true;
      if (await act('wtm_save_daily', { p: { id: row.id, archived: true, day: dayKey() } })) toast(`Removed “${trunc(row.title, 36)}”`, { action: 'Undo', onAction: () => act('wtm_save_daily', { p: { id: row.id, archived: false, day: dayKey() } }, 'Daily task restored.').then(() => openDaily()) });
    }
  });
  // messages
  $('#newMsg').addEventListener('click', () => openNewMessageSheet());
  $('#convList').addEventListener('click', e => {
    if (e.target.closest('#convPick')) {
      if (innerWidth >= 900) return;
      const list = $('#convList'), open = list.classList.toggle('open');
      $('#convPick').setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }
    const c = e.target.closest('[data-conv]'); if (c) openConv(c.dataset.conv);
  });
  $('#thread').addEventListener('click', e => {
    const b = e.target.closest('[data-act],[data-open-task]'); if (!b) return;
    if (b.dataset.openTask) { openTask(b.dataset.openTask, b); return; }
    if (b.dataset.act === 'conv-back') { openConv(ALL_CONV); }
    else if (b.dataset.act === 'msg-stamp') insertAtCursor($('#msgBody'), stamp());
    else if (b.dataset.act === 'msg-pin') openPinPicker(b, UI.msgPin, pin => { UI.msgPin = pin; renderThread(); });
    else if (b.dataset.act === 'msg-photo') pickImageFile().then(file => {
      if (!file) return;
      if (UI.msgPhotoPreview) URL.revokeObjectURL(UI.msgPhotoPreview);
      UI.msgPhotoFile = file; UI.msgPhotoPreview = URL.createObjectURL(file); renderThread();
    });
    else if (b.dataset.act === 'msg-clear-pin') { UI.msgPin = null; renderThread(); }
    else if (b.dataset.act === 'msg-clear-photo') { if (UI.msgPhotoPreview) URL.revokeObjectURL(UI.msgPhotoPreview); UI.msgPhotoFile = null; UI.msgPhotoPreview = ''; renderThread(); }
    else if (b.dataset.act === 'msg-link') pickTask(b, id => { UI.linkTask = id; renderThread(); });
    else if (b.dataset.act === 'msg-unlink') { UI.linkTask = null; renderThread(); }
  });
  $('#thread').addEventListener('change', e => { if (e.target.id === 'msgDept') { UI.msgDept = e.target.value; } });
  $('#thread').addEventListener('submit', e => { if (e.target.id === 'msgForm') { e.preventDefault(); sendMessage(); } });
  const msgPick = item => { if (item.kind === 'task') { UI.linkTask = item.id; renderThread(); } };
  const msgMention = el => syncMention(el, 'msg', msgPick, null, '@#^');
  $('#thread').addEventListener('input', e => { if (e.target.id === 'msgBody') { autosize(e.target); msgMention(e.target); } });
  $('#thread').addEventListener('click', e => { if (e.target.id === 'msgBody') msgMention(e.target); });
  $('#thread').addEventListener('keyup', e => { if (e.target.id === 'msgBody' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) msgMention(e.target); });
  $('#thread').addEventListener('keydown', e => {
    if (mention && mention.input === e.target && (e.key === 'Escape' || (mention.items.length && ['Enter', 'Tab', 'ArrowDown', 'ArrowUp'].includes(e.key)))) return;
    if (e.target.id === 'msgBody' && e.key === 'Enter' && !e.shiftKey && innerWidth > 640) { e.preventDefault(); sendMessage(); }
  });
  // log book
  $('#logAdd').addEventListener('submit', async e => {
    e.preventDefault();
    const txt = $('#logNote').value.trim(); if (!txt) { $('#logNote').focus(); return; }
    if (await act('wtm_note', { p_text: txt, p_task: $('#logTask').value || null }, 'Entry logged.')) $('#logNote').value = '';
  });
  $('#logStamp').addEventListener('click', () => insertAtCursor($('#logNote'), stamp()));
  const relog = () => { UI.logLimit = 300; saveLP(); renderLog(); };
  $('#logCtlToggle').addEventListener('click', () => { LP.ctl = !LP.ctl; saveLP(); renderLog(); });
  $('#logSearch').addEventListener('input', e => { LP.q = e.target.value; UI.logLimit = 300; renderLog(); });
  $('#logRange').addEventListener('change', e => { LP.range = e.target.value; if (LP.range === 'custom' && !LP.from) { LP.from = addDays(dayKey(), -13); LP.to = dayKey(); } relog(); });
  $('#logFrom').addEventListener('change', e => { LP.from = e.target.value; relog(); });
  $('#logTo').addEventListener('change', e => { LP.to = e.target.value; relog(); });
  $('#logPerson').addEventListener('change', e => { LP.person = e.target.value; relog(); });
  $('#logDept').addEventListener('change', e => { LP.dept = e.target.value; relog(); });
  $('#logGroup').addEventListener('change', e => { LP.group = e.target.value; relog(); });
  $('#catChips').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]');
    if (b) { const k = b.dataset.cat; LP.cats = LP.cats.includes(k) ? LP.cats.filter(x => x !== k) : LP.cats.concat(k); relog(); }
    else if (e.target.closest('[data-act="cats-clear"]')) { LP.cats = []; relog(); }
  });
  $('#sortChain').addEventListener('click', e => {
    const f = e.target.closest('[data-sflip]'), d = e.target.closest('[data-sdel]');
    if (f) { const s = LP.sort[+f.dataset.sflip]; s.d = -s.d; relog(); }
    else if (d) { LP.sort.splice(+d.dataset.sdel, 1); relog(); }
    else if (e.target.closest('[data-act="sort-reset"]')) { LP.sort = [{ k: 'n', d: -1 }]; relog(); }
  });
  $('#sortChain').addEventListener('change', e => { if (e.target.id === 'sortAdd' && e.target.value) { const k = e.target.value; LP.sort.push({ k, d: LKEYS[k].def }); relog(); } });
  $('#logOut').addEventListener('click', e => {
    const sh = e.target.closest('[data-sort]');
    if (sh) {
      const k = sh.dataset.sort, i = LP.sort.findIndex(s => s.k === k);
      if (e.shiftKey) { if (i >= 0) LP.sort[i].d = -LP.sort[i].d; else if (LP.sort.length < 4) LP.sort.push({ k, d: LKEYS[k].def }); }
      else LP.sort = [{ k, d: i === 0 ? -LP.sort[0].d : LKEYS[k].def }];
      relog(); return;
    }
    const b = e.target.closest('[data-act]');
    if (b) {
      if (b.dataset.act === 'more') { UI.logLimit += 300; renderLog(); }
      else if (b.dataset.act === 'csv') exportCsv();
      else if (b.dataset.act === 'older') { b.disabled = true; loadOlder(); }
      else if (b.dataset.act === 'filters-clear') { LP.q = ''; $('#logSearch').value = ''; LP.range = 'all'; LP.person = ''; LP.dept = ''; LP.cats = []; relog(); }
      return;
    }
    const row = e.target.closest('tr.lrow.linked'); if (row) openTask(row.dataset.task, row);
  });
  $('#logOut').addEventListener('keydown', e => { if (e.key === 'Enter') { const row = e.target.closest('tr.lrow.linked'); if (row) openTask(row.dataset.task, row); } });
  // people
  $('#peopleTabs').addEventListener('click', e => { const b = e.target.closest('[data-ptab]'); if (b) { PP.tab = b.dataset.ptab; savePP(); renderPeople(); } });
  $('#peopleActions').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return; if (b.dataset.act === 'add-person') addPersonSheet(); else if (b.dataset.act === 'add-dept') deptSheet(null); else groupSheet(null); });
  $('#peopleSearch').addEventListener('input', e => { PP.q = e.target.value; renderPeople(); });
  $('#peopleDept').addEventListener('change', e => { PP.dept = e.target.value; savePP(); renderPeople(); });
  $('#peopleRole').addEventListener('change', e => { PP.role = e.target.value; savePP(); renderPeople(); });
  $('#peopleOut').addEventListener('click', e => {
    const p = e.target.closest('[data-person]'), d = e.target.closest('[data-dept]'), g = e.target.closest('[data-group]');
    if (p) personSheet(p.dataset.person); else if (d) deptSheet(d.dataset.dept); else if (g) groupSheet(g.dataset.group);
  });
  // settings
  $('#settingsOut').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'pick-face') {
      openPicker(b, {
        title: 'Profile picture',
        html: emojiPickerHtml('me-face', (D.me && D.me.emoji) || ''),
        onFace: async emoji => {
          closePop();
          const old = myPhoto();
          if ((D.me.emoji || '') === emoji && !old) return;
          if (await act('wtm_admin_update_user', { p_user: me(), p: { emoji, photo: '' } }, 'Picture saved.') && old) sb.storage.from('wtm-photos').remove([old]);
        }
      });
      return;
    }
    if (b.dataset.act === 'upload-photo') {
      const file = await pickImageFile(); if (!file) return;
      b.disabled = true;
      const old = myPhoto(), path = await putImage('wtm-photos', me(), file);
      if (!path) { b.disabled = false; return; }
      const ok = await act('wtm_admin_update_user', { p_user: me(), p: { photo: path } }, 'Photo saved.');
      b.disabled = false;
      if (!ok) sb.storage.from('wtm-photos').remove([path]);
      else if (old) sb.storage.from('wtm-photos').remove([old]);
      return;
    }
    if (b.dataset.act === 'remove-photo') {
      const old = myPhoto(); b.disabled = true;
      if (await act('wtm_admin_update_user', { p_user: me(), p: { photo: '' } }, 'Photo removed.') && old) sb.storage.from('wtm-photos').remove([old]);
      b.disabled = false;
      return;
    }
    if (b.dataset.act === 'change-pw') showChangePassword(false);
    else if (b.dataset.act === 'sign-out') signOut();
    else if (b.dataset.act === 'export') exportJson();
    else if (b.dataset.act === 'keywords') openKeywordLibrary(b);
    else if (b.dataset.delRoom) { b.disabled = true; await act('wtm_delete_room', { p_id: b.dataset.delRoom }, 'Room removed.'); }
    else if (b.dataset.delLoc) {
      b.disabled = true;
      const paths = await act('wtm_delete_location', { p_id: b.dataset.delLoc }, 'Location removed.');
      if (Array.isArray(paths) && paths.length) sb.storage.from('wtm-maps').remove(paths);
    } else if (b.dataset.delMap) {
      const path = (D.maps.get(b.dataset.delMap) || {}).image_path;
      b.disabled = true;
      if (await act('wtm_delete_map', { p_id: b.dataset.delMap }, 'Map removed.') && path) sb.storage.from('wtm-maps').remove([path]);
    }
    else if (b.dataset.delRule) { b.disabled = true; await act('wtm_delete_rule', { p_id: b.dataset.delRule }, 'Keyword removed.'); }
    else if (b.dataset.projArch) { b.disabled = true; await act('wtm_save_project', { p: { id: b.dataset.projArch, archived: b.dataset.arch === 'true' } }); }
  });
  $('#settingsOut').addEventListener('change', async e => {
    const sel = e.target.closest('[data-proj-owner]'); if (!sel) return;
    sel.disabled = true;
    await act('wtm_save_project', { p: { id: sel.dataset.projOwner, owner_id: sel.value || null } }, 'Owner saved.');
    sel.disabled = false;
  });
  $('#settingsOut').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    if (f.id === 'roomAdd') { const n = $('#roomName').value.trim(); if (!n) return; if (await act('wtm_save_room', { p: { name: n, aliases: $('#roomAlias').value.split(',').map(s => s.trim()).filter(Boolean) } }, 'Room added.')) { $('#roomName').value = ''; $('#roomAlias').value = ''; $('#roomName').blur(); renderSettings(); } }
    if (f.id === 'locAdd') {
      const n = $('#locName').value.trim(); if (!n) return;
      if (await act('wtm_save_location', { p: { name: n } }, 'Location added.')) { $('#locName').value = ''; $('#locName').blur(); renderSettings(); }
    }
    if (f.classList.contains('map-add')) {
      const name = (f.mapName.value || '').trim();
      const file = f.mapFile.files && f.mapFile.files[0];
      if (!name || !file) { toast('Name the map and choose an image.'); return; }
      const path = await putImage('wtm-maps', f.dataset.loc, file);
      if (!path) return;
      const ok = await act('wtm_save_map', { p: { location_id: f.dataset.loc, name, image_path: path } }, 'Map added.');
      if (!ok) sb.storage.from('wtm-maps').remove([path]);
      else { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); renderSettings(); }
    }
    if (f.id === 'projAdd') { const n = $('#projName').value.trim(); if (!n) return; if (await act('wtm_save_project', { p: { name: n } }, 'Project added.')) { $('#projName').value = ''; $('#projName').blur(); renderSettings(); } }
  });
  $('#settingsOut').addEventListener('input', e => { if (e.target.id === 'tryIn') renderTry(); });
  // sheet
  $('#sheetWrap').addEventListener('click', e => {
    if (!sheet) return;
    const cp = e.target.closest('[data-copy]');
    if (cp) { const txt = cp.dataset.copy; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Copied.'), () => toast('Select the text and copy it.')); return; }
    const x = e.target.closest('.dchip .x'); if (x && sheet.onRemove) { sheet.onRemove(x.closest('.dchip')); return; }
    const sg = e.target.closest('[data-sugg]'); if (sg && sheet.onSugg) { sheet.onSugg(sg.dataset.sugg); return; }
    const seg = e.target.closest('.seg button'); if (seg && !seg.hasAttribute('data-day') && sheet.onSeg) { sheet.onSeg(seg); return; }
    const b = e.target.closest('[data-sh],[data-color],[data-day],[data-face]'); if (!b) return;
    if (b.dataset.face != null) {
      const box = b.closest('.faces');
      if (box) for (const x of box.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
      return;
    }
    if (b.dataset.sh === 'close') { closeSheet(false); return; }
    if (sheet.click) sheet.click(b, e);
  });
  $('#sheet').addEventListener('input', e => { if (sheet && sheet.onInput) sheet.onInput(e.target); });
  $('#sheet').addEventListener('change', e => { if (sheet && sheet.foot) sheet.foot(); });
  $('#sheet').addEventListener('keydown', e => {
    if (!sheet || sheet.kind !== 'task') return;
    if (mention && mention.input === e.target && mention.items.length && (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape')) return;
    if (e.key === 'Enter' && e.target.id === 'f-title') { e.preventDefault(); sheet.save(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sheet.save(); }
  });
  $('#sheet').addEventListener('keyup', e => {
    if (!sheet || !sheet.onInput) return;
    if ((e.target.id === 'f-title' || e.target.id === 'f-assign-in') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End')) sheet.onInput(e.target);
  });
  $('#sheet').addEventListener('click', e => { if (sheet && sheet.onInput && (e.target.id === 'f-title' || e.target.id === 'f-assign-in')) sheet.onInput(e.target); });
  // picker
  $('#pop').addEventListener('click', e => {
    if (!pop) return;
    const faceBtn = e.target.closest('[data-face]');
    if (faceBtn && pop.onFace) {
      const emoji = faceBtn.dataset.face === '-1' ? '' : (FACES[+faceBtn.dataset.face] || '');
      pop.onFace(emoji);
      return;
    }
    if (e.target.closest('[data-pop="close"]')) { closePop(); return; }
    const pinBtn = e.target.closest('[data-pin]');
    if (pinBtn && pop.onPin) { pop.onPin(pinBtn.dataset.pin, pinBtn.dataset.id, e); return; }
    const dt = e.target.closest('[data-date]'); if (dt && pop.onDate) { pop.onDate(dt.dataset.date || null); closePop(); return; }
    const it = e.target.closest('.pop-item'); if (it && pop.onPick) { const item = findPopItem(it.dataset.key); if (item) pop.onPick(item); }
  });
  $('#pop').addEventListener('submit', e => {
    e.preventDefault(); if (!pop) return;
    if (e.target.id === 'popCustom' && pop.onCustom) pop.onCustom($('#popCustomIn').value);
    if (e.target.id === 'popBlock' && pop.onBlock) {
      const note = $('#popBlockIn').value.trim();
      if (!note) { toast('Say why this task is blocked.'); return; }
      const fn = pop.onBlock; closePop(); fn(note);
    }
    if (e.target.id === 'popDate' && pop.onDate) { const v = $('#popDateIn').value; if (isDay(v)) { pop.onDate(v); closePop(); } }
  });
  $('#pop').addEventListener('input', e => { if (e.target.id === 'popSearch') { pop.q = e.target.value; pop.hl = 0; drawPop(); } });
  $('#pop').addEventListener('keydown', e => {
    if (e.target.id !== 'popSearch') return;
    const items = popItems();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); pop.hl = Math.max(0, Math.min(items.length - 1, pop.hl + (e.key === 'ArrowDown' ? 1 : -1))); items.forEach((x, i) => x.classList.toggle('hl', i === pop.hl)); if (items[pop.hl]) items[pop.hl].scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter') { e.preventDefault(); const x = items[pop.hl]; if (x) x.click(); else if (pop.custom) { $('#popCustomIn').value = e.target.value; pop.onCustom(e.target.value); } }
  });
  $('#mention').addEventListener('pointerdown', e => e.preventDefault());
  $('#mention').addEventListener('click', e => {
    const b = e.target.closest('[data-i]'); if (!b || !mention) return;
    acceptMention(+b.dataset.i);
  });
  document.addEventListener('pointerdown', e => {
    if (mention && !e.target.closest('#mention') && e.target !== mention.input) closeMention();
    if (pop && !e.target.closest('#pop') && !(pop.anchor && pop.anchor.contains(e.target))) closePop();
    if ($('#qaMenu') && !$('#qaMenu').hidden && !e.target.closest('#qaTools')) closeQaMenu();
    if ($('#convList') && $('#convList').classList.contains('open') && !e.target.closest('#convList')) closeConvMenu();
  }, true);
  addEventListener('resize', debounce(() => { if (mention) placeMention(); if (pop && pop.anchor && document.contains(pop.anchor)) placePop(pop.anchor); if (!navIsDrawer()) setNavOpen(false); }, 100));
  // keyboard
  document.addEventListener('keydown', e => {
    if (mention && e.target === mention.input) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!mention.items.length) return;
        e.preventDefault();
        mention.hl = (mention.hl + (e.key === 'ArrowDown' ? 1 : mention.items.length - 1)) % mention.items.length;
        drawMention(); return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && mention.items.length) { e.preventDefault(); acceptMention(mention.hl); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMention(); return; }
    }
    if (e.key === 'Escape') { if (mention) { e.preventDefault(); closeMention(); return; } if (pop) { e.preventDefault(); closePop(); return; } if ($('#qaMenu') && !$('#qaMenu').hidden) { e.preventDefault(); closeQaMenu(); return; } if ($('#convList') && $('#convList').classList.contains('open')) { e.preventDefault(); closeConvMenu(); return; } if (sheet) { e.preventDefault(); closeSheet(false); return; } if (navIsDrawer() && $('#nav').classList.contains('open')) { e.preventDefault(); setNavOpen(false); return; } }
    if (!D.ready || $('#app').hidden || sheet || pop || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) { if (e.key === 'Escape') e.target.blur(); return; }
    // Mail has its own single-key shortcuts (c, e, r, / ...); its keys come from inside a shadow root, so e.target is #mailHost.
    if (UI.view === 'mail') return;
    const k = e.key.toLowerCase();
    if (k === 'n') { e.preventDefault(); setView('tasks'); $('#qaInput').focus(); }
    else if (e.key === '/') { e.preventDefault(); const map = { tasks: '#taskSearch', orders: '#orderSearch', daily: '#dailySearch', log: '#logSearch', people: '#peopleSearch' }; if (!map[UI.view]) setView('tasks'); $(map[UI.view] || '#taskSearch').focus(); }
    else if (k === 't') setView('tasks'); else if (k === 'd') setView('daily'); else if (k === 'c') setView('calendar'); else if (k === 'h') setView('handover'); else if (k === 'm') setView('messages'); else if (k === 'e') setView('mail'); else if (k === 'b') setView('board'); else if (k === 'o') setView('orders'); else if (k === 'i') setView('invoices'); else if (k === 'l') setView('log'); else if (k === 'p') setView('people'); else if (k === 's') setView('settings');
  });
  addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v && v !== UI.view && D.ready) setView(v); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && D.ready) sync(); });
  addEventListener('online', () => { if (D.ready) sync(); });
}

/* ================= live clock ================= */
let lastMinute = -1, lastDay = dayKey();
function tick() {
  if (!D.ready) return;
  const m = new Date().getMinutes();
  if (m !== lastMinute) { lastMinute = m; renderClock(); if (dayKey() !== lastDay) { lastDay = dayKey(); openDaily(); render(); } }
}

/* ================= start ================= */
UI.view = location.hash.slice(1) || LS.get('wtm.view') || 'tasks';
wire();
setInterval(tick, 5000);
window.WTM = { D, detect, parseTokens, sync, get sb() { return sb; } };
connect();
})();
