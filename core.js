/* КАИТ-20 · Посещаемость — ядро данных (демо: localStorage; боевая версия подменяет Store на Apps Script) */
(function (G) {
  'use strict';

  var CODES = {
    '+': { key: 'plus', label: 'Присутствует', kind: 'present' },
    'о': { key: 'late', label: 'Опоздание', kind: 'late' },
    'н': { key: 'nev', label: 'Неуважительная причина', kind: 'unexc' },
    'у': { key: 'left', label: 'Ушёл с занятий', kind: 'unexc' },
    'б': { key: 'sick', label: 'Больничный лист', kind: 'exc' },
    'з': { key: 'appl', label: 'Заявление', kind: 'exc' },
    'п': { key: 'order', label: 'По приказу', kind: 'exc' },
    'и': { key: 'iup', label: 'ИУП', kind: 'skip' },
    'р': { key: 'prac', label: 'Производственная практика', kind: 'skip' }
  };
  var ORDER = ['+', 'о', 'н', 'у', 'б', 'з', 'п', 'и', 'р'];
  var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function today() { return iso(new Date()); }
  function isWeekend(s) { var w = parse(s).getDay(); return w === 0 || w === 6; }
  function monthDates(y, m, weekdaysOnly) {
    var out = [], d = new Date(y, m, 1);
    while (d.getMonth() === m) { var s = iso(d); if (!weekdaysOnly || !isWeekend(s)) out.push(s); d.setDate(d.getDate() + 1); }
    return out;
  }
  function rangeDates(a, b, weekdaysOnly) {
    var out = [], d = parse(a), e = parse(b);
    while (d <= e) { var s = iso(d); if (!weekdaysOnly || !isWeekend(s)) out.push(s); d.setDate(d.getDate() + 1); }
    return out;
  }
  function fmtShort(s) { var d = parse(s); return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()]; }
  function fmtLong(s) { var d = parse(s); return DOW[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + ' ' + d.getFullYear(); }
  function shortName(fio) { var p = fio.split(' '); return p[0] + ' ' + (p[1] ? p[1][0] + '.' : '') + (p[2] ? p[2][0] + '.' : ''); }

  /* ---------- Store ---------- */
  var LS = 'kait20-attendance-demo-v1';
  var seed = G.SEED || { groups: [], marks: {} };
  var ov = { marks: {}, journal: [], who: '', days: {} };
  try { var raw = G.localStorage && G.localStorage.getItem(LS); if (raw) ov = JSON.parse(raw); } catch (e) {}
  if (!ov.marks) ov.marks = {}; if (!ov.journal) ov.journal = []; if (!ov.days) ov.days = {};
  var CFG = G.KAIT_CONFIG || {}, REMOTE = !!CFG.api;
  if (REMOTE) ov = { marks: {}, journal: [], who: '', days: {} };
  var listeners = [];
  function notify() { listeners.forEach(function (f) { f(); }); }
  function save() { if (!REMOTE) { try { G.localStorage.setItem(LS, JSON.stringify(ov)); } catch (e) {} } notify(); }

  /* студент «действует» в день d, если d входит в [from, left]; g.all — все, g.students — действующие сегодня */
  function activeOn(s, d) { return (!s.from || d >= s.from) && (!s.left || d <= s.left); }
  var byId = {}, studById = {};
  function rebuild() {
    byId = {}; studById = {}; var t = today();
    seed.groups.forEach(function (g) {
      if (!g.all) g.all = g.students.slice();
      g.students = g.all.filter(function (s) { return activeOn(s, t) || (s.from && s.from > t && !s.left); });
      byId[g.id] = g; g.all.forEach(function (s) { studById[s.id] = { s: s, g: g }; });
    });
  }
  rebuild();

  /* календарь: по умолчанию сб/вс — выходные (кроме суббот, где в данных есть занятия); заведующая может менять любой день */
  /* производственный календарь РФ (учебный 2025/26–2027/28; с учётом переносов): постановления Правительства РФ от 24.09.2025 № 1466 и от 17.09.2026 № 1187 */
  var HOLIDAYS = {
    '2026-02-23': 'День защитника Отечества', '2026-03-09': 'Международный женский день (перенос с 8 марта)', '2026-05-01': 'Праздник Весны и Труда', '2026-05-11': 'День Победы (перенос с 9 мая)', '2026-06-12': 'День России',
    '2026-11-04': 'День народного единства', '2026-12-31': 'Предновогодний выходной (перенос)',
    '2027-02-22': 'День защитника Отечества (перенос с 20 февраля)', '2027-02-23': 'День защитника Отечества', '2027-03-08': 'Международный женский день', '2027-05-03': 'Праздник Весны и Труда (перенос с 1 мая)',
    '2027-05-10': 'День Победы (перенос с 9 мая)', '2027-06-14': 'День России (перенос с 12 июня)', '2027-11-04': 'День народного единства', '2027-11-05': 'Выходной (перенос со 2 января)', '2027-12-31': 'Предновогодний выходной (перенос)'
  };
  for (var hd = 1; hd <= 11; hd++) HOLIDAYS['2026-01-' + (hd < 10 ? '0' : '') + hd] = hd === 7 ? 'Рождество Христово' : 'Новогодние каникулы';
  for (var hd2 = 1; hd2 <= 10; hd2++) HOLIDAYS['2027-01-' + (hd2 < 10 ? '0' : '') + hd2] = hd2 === 7 ? 'Рождество Христово' : 'Новогодние каникулы';
  var WORKSAT = { '2027-02-20': 'Рабочая суббота (перенос на 22 февраля)' };
  var seedWk = {};
  if (!REMOTE) Object.keys(seed.marks).forEach(function (gid) { Object.keys(seed.marks[gid]).forEach(function (sid) { Object.keys(seed.marks[gid][sid]).forEach(function (d) { if (isWeekend(d)) seedWk[d] = 1; }); }); });
  function dayInfo(d) {
    var o = ov.days[d];
    if (o) return { off: o.t === 'off', label: o.l || '', custom: true, mode: (o.t === 'elearn' || o.t === 'remote') ? o.t : '' };
    if (HOLIDAYS[d]) return { off: true, label: HOLIDAYS[d], custom: false };
    if (WORKSAT[d]) return { off: false, label: WORKSAT[d], custom: false, mode: '' };
    if (isWeekend(d)) return seedWk[d] ? { off: false, label: 'Учебная суббота', custom: false } : { off: true, label: 'Выходной', custom: false };
    return { off: false, label: '', custom: false, mode: '' };
  }

  var Store = {
    isOff: function (d) { return dayInfo(d).off; },
    dayInfo: dayInfo,
    /* type: 'off' | 'work' | null (вернуть по умолчанию) */
    setDay: function (d, type, label, who) {
      var prev = dayInfo(d);
      if (!type) delete ov.days[d]; else ov.days[d] = { t: type, l: label || '' };
      if (REMOTE) post({ act: 'setDay', date: d, type: type || '', label: label || '' }).then(function (r) { if (r.v) net.v = r.v; });
      ov.journal.unshift({ t: Date.now(), who: who || 'Заведующая', day: d, dayType: type, label: label || '', prevOff: prev.off });
      save();
    },
    calendarOverrides: function () { return ov.days; },
    groups: function () { return seed.groups; },
    curators: function () {
      var m = {}; seed.groups.forEach(function (g) { if (g.curator) (m[g.curator] = m[g.curator] || []).push(g.id); });
      return Object.keys(m).sort().map(function (n) { return { name: n, groups: m[n] }; });
    },
    group: function (id) { return byId[id]; },
    student: function (sid) { return studById[sid]; },
    get: function (gid, sid, date) {
      var o = ov.marks[gid] && ov.marks[gid][sid] && ov.marks[gid][sid][date];
      if (o !== undefined) return o === '' ? '' : o;
      var m = seed.marks[gid] && seed.marks[gid][sid]; return (m && m[date]) || '';
    },
    set: function (gid, sid, date, code, who, silent) {
      if (dayInfo(date).off) return; var prev = Store.get(gid, sid, date); if (prev === code) return;
      ((ov.marks[gid] = ov.marks[gid] || {})[sid] = ov.marks[gid][sid] || {})[date] = code;
      ov.journal.unshift({ t: Date.now(), who: who || ov.who || '—', gid: gid, sid: sid, date: date, code: code, prev: prev });
      if (ov.journal.length > 500) ov.journal.length = 500;
      if (REMOTE) { net.q.push({ gid: gid, sid: sid, date: date, code: code }); schedule(500); }
      if (!silent) save();
    },
    /* отмена последней правки (или пачки правок, сделанных за пару секунд): возвращает число отменённых отметок */
    undoLast: function () {
      var j = ov.journal, i, n = 0, t0 = null;
      for (i = 0; i < j.length; i++) {
        var e = j[i]; if (!e.gid || e.u || e.undone) continue;
        if (t0 !== null && Math.abs(t0 - e.t) > 2500) break;
        if (Store.get(e.gid, e.sid, e.date) !== e.code) { if (t0 === null) { e.undone = true; continue; } else break; }
        if (t0 === null) t0 = e.t; e.undone = true; var wh = e.who; Store.set(e.gid, e.sid, e.date, e.prev, wh, true); if (j[0]) j[0].u = true; n++;
      }
      if (n) save(); return n;
    },
    canUndo: function () { return ov.journal.some(function (e) { return e.gid && !e.u && !e.undone && Store.get(e.gid, e.sid, e.date) === e.code; }); },
    commit: save,
    who: function (v) { if (v !== undefined) { ov.who = v; save(); } return ov.who; },
    journal: function () { return ov.journal; },
    onChange: function (f) { listeners.push(f); },
    reset: function () { ov = { marks: {}, journal: [], who: ov.who, days: {}, tasks: ov.tasks || [], events: ov.events || [] }; save(); },
    events: function () { return REMOTE ? eventsR : (ov.events = ov.events || []); },
    tasks: function () { return REMOTE ? tasksR : (ov.tasks = ov.tasks || []); },
    /* сколько студентов группы отмечено на дату */
    rosterOn: function (g, d) { return g.all.filter(function (s) { return activeOn(s, d); }); },
    rosterIn: function (g, dates) { var a = dates[0], b = dates[dates.length - 1]; return g.all.filter(function (s) { return (!s.left || s.left >= a) && (!s.from || s.from <= b); }); },
    activeOn: activeOn,
    marked: function (gid, date) {
      var g = byId[gid], n = 0; Store.rosterOn(g, date).forEach(function (s) { if (Store.get(gid, s.id, date)) n++; }); return n;
    }
  };

  /* ---------- сеть (боевой режим: Google Apps Script) ---------- */
  var net = { q: [], v: 0, auth: null, role: null, name: '', state: 'idle', timer: null, poll: null, onState: null };
  function setState(s) { net.state = s; if (net.onState) net.onState(s); }
  function post(body) {
    var o = {}; Object.keys(net.auth || {}).forEach(function (k) { o[k] = net.auth[k]; }); Object.keys(body).forEach(function (k) { o[k] = body[k]; });
    return G.fetch(CFG.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(o) }).then(function (r) { return r.json(); });
  }
  var tasksR = [], eventsR = [];
  function applyLoad(res) {
    tasksR = res.tasks || []; eventsR = res.events || [];
    seed.groups = res.groups; seed.marks = res.marks; ov.days = res.days || {}; if (res.journal) ov.journal = res.journal;
    net.v = res.v; net.role = res.role; net.name = res.name; ov.who = res.name; rebuild();
  }
  function schedule(ms) { clearTimeout(net.timer); net.timer = setTimeout(flush, ms); }
  function flush() {
    if (!net.q.length || net.busy) return; net.busy = true; setState('saving');
    var ops = net.q.splice(0, 200);
    post({ act: 'mark', ops: ops.map(function (o) { return { sid: o.sid, date: o.date, code: o.code }; }) }).then(function (r) {
      if (r.err) throw new Error(r.err);
      ops.forEach(function (o) {
        var m = ((seed.marks[o.gid] = seed.marks[o.gid] || {})[o.sid] = seed.marks[o.gid][o.sid] || {});
        if (o.code) m[o.date] = o.code; else delete m[o.date];
        var ovm = ov.marks[o.gid] && ov.marks[o.gid][o.sid]; if (ovm && ovm[o.date] === o.code) delete ovm[o.date];
      });
      net.v = r.v || net.v; net.busy = false; setState(net.q.length ? 'saving' : 'ok'); if (net.q.length) schedule(100);
    }).catch(function (e) { net.q = ops.concat(net.q); net.busy = false; setState('error'); schedule(6000); });
  }
  function refresh() {
    return post({ act: 'load' }).then(function (r) { if (r.err) throw new Error(r.err); applyLoad(r); notify(); });
  }
  function startPoll() {
    clearInterval(net.poll);
    net.poll = setInterval(function () {
      if (net.q.length || net.busy || (G.document && G.document.hidden)) return;
      post({ act: 'load', v: net.v }).then(function (r) { if (r.err || r.same) return; applyLoad(r); notify(); }).catch(function () {});
    }, 20000);
  }
  var Net = {
    enabled: REMOTE, state: function () { return net.state; }, role: function () { return net.role; }, name: function () { return net.name; },
    onState: function (f) { net.onState = f; },
    /* auth: {k:'токен'} или {pin:'123456'} */
    login: function (auth) {
      net.auth = auth; setState('saving');
      return post({ act: 'load' }).then(function (r) {
        if (r.err) { net.auth = null; setState('idle'); throw new Error(r.err); }
        applyLoad(r); setState('ok'); startPoll(); notify(); return r;
      });
    },
    tokens: function () { return post({ act: 'tokens' }).then(function (r) { return r.tokens || []; }); }
  };
  window.addEventListener && window.addEventListener('beforeunload', function (e) { if (net.q.length) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- состав групп (заведующая) ---------- */
  function dayBefore(d) { var x = parse(d); x.setDate(x.getDate() - 1); return iso(x); }
  function adminOp(body, local) {
    if (REMOTE) return post(body).then(function (r) { if (r.err) throw new Error(r.err); return refresh().then(function () { return r; }); });
    local(); rebuild(); save(); return Promise.resolve({ ok: true });
  }
  function newId() { return 'S' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  Store.addStudent = function (gid, fio, from) {
    return adminOp({ act: 'addStudent', gid: gid, fio: fio, from: from || '' }, function () { byId[gid].all.push({ id: newId(), fio: fio, from: from || undefined }); });
  };
  Store.removeStudent = function (sid, lastDay) {
    return adminOp({ act: 'removeStudent', sid: sid, left: lastDay }, function () { studById[sid].s.left = lastDay; });
  };
  Store.restoreStudent = function (sid) {
    return adminOp({ act: 'restoreStudent', sid: sid }, function () { delete studById[sid].s.left; });
  };
  Store.renameStudent = function (sid, fio) {
    return adminOp({ act: 'renameStudent', sid: sid, fio: fio }, function () { studById[sid].s.fio = fio; });
  };
  Store.moveStudent = function (sid, gid, from) {
    return adminOp({ act: 'moveStudent', sid: sid, gid: gid, from: from, from_left: dayBefore(from) }, function () {
      var o = studById[sid].s; o.left = dayBefore(from); byId[gid].all.push({ id: newId(), fio: o.fio, from: from });
    });
  };
  Store.setCurator = function (gid, name) {
    return adminOp({ act: 'setCurator', gid: gid, curator: name }, function () { byId[gid].curator = name; });
  };
  /* ---------- массовая загрузка списков, новый учебный год, ссылки ---------- */
  function srv(body, local) {
    if (REMOTE) return post(body).then(function (r) { if (r.err) throw new Error(r.err === 'unknown act' ? 'сервер ещё не обновлён (нужен новый Code.gs)' : r.err); return refresh().then(function () { return r; }); });
    var res = local(); rebuild(); save(); return Promise.resolve(res || { ok: true });
  }
  function normFio(s) { return String(s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); }
  /* groups: [{id, course, spec, curator, students:[ФИО]}]; opts: {from, left, sync} */
  Store.bulkRoster = function (groups, opts) {
    opts = opts || {};
    return srv({ act: 'bulkRoster', groups: groups, from: opts.from || '', left: opts.left || '', sync: !!opts.sync }, function () {
      var cnt = { groups: 0, added: 0, left: 0 };
      groups.forEach(function (x) {
        var g = byId[x.id];
        if (!g) { g = { id: x.id, name: x.id, course: x.course || 1, spec: x.spec || '', curator: x.curator || '', students: [], all: [] }; seed.groups.push(g); byId[x.id] = g; cnt.groups++; }
        else if (x.curator && !g.curator) g.curator = x.curator;
        var seen = {};
        (x.students || []).forEach(function (f) {
          var k = normFio(f); if (!k || seen[k]) return; seen[k] = 1;
          if (g.all.some(function (s) { return !s.left && normFio(s.fio) === k; })) return;
          g.all.push({ id: newId() + cnt.added, fio: String(f).trim().replace(/\s+/g, ' '), from: opts.from || undefined }); cnt.added++;
        });
        if (opts.sync) g.all.forEach(function (s) { if (!s.left && !seen[normFio(s.fio)]) { s.left = opts.left; cnt.left++; } });
      });
      return { ok: true, cnt: cnt };
    });
  };
  /* items: [{id, to, grad}] */
  Store.rollYear = function (items) {
    return srv({ act: 'rollYear', items: items }, function () {
      var moved = 0, grads = 0;
      items.forEach(function (it) {
        var g = byId[it.id]; if (!g) return;
        if (it.grad) { seed.groups = seed.groups.filter(function (x) { return x !== g; }); grads++; return; }
        g.course = (g.course || 0) + 1; moved++;
        if (it.to && it.to !== g.id) { if (seed.marks[g.id]) { seed.marks[it.to] = seed.marks[g.id]; delete seed.marks[g.id]; } g.id = it.to; g.name = it.to; }
      });
      return { ok: true, moved: moved, grads: grads };
    });
  };
  Store.resetToken = function (cur) {
    if (!REMOTE) return Promise.resolve([]);
    return post({ act: 'tokenReset', curator: cur }).then(function (r) { if (r.err) throw new Error(r.err === 'unknown act' ? 'сервер ещё не обновлён (нужен новый Code.gs)' : r.err); return r.tokens || []; });
  };
  /* чтение Excel/CSV: → Promise<[{name, rows:[[строки]]}]> */
  function inflateRaw(u8) { var ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(u8); w.close(); return new Response(ds.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  function unzipText(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf), e = -1, i;
    for (i = u8.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) return Promise.reject(new Error('Это не файл Excel (.xlsx)'));
    var cnt = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true), jobs = [], files = {}, td = new TextDecoder('utf-8');
    for (var k = 0; k < cnt; k++) {
      var method = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      var name = td.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
      if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^\/]+\.xml)$/.test(name)) continue;
      var st = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true), data = u8.subarray(st, st + cs);
      (function (nm, m, d) { jobs.push((m === 0 ? Promise.resolve(d) : inflateRaw(d)).then(function (b) { files[nm] = td.decode(b); })); })(name, method, data);
    }
    return Promise.all(jobs).then(function () { return files; });
  }
  function colIdx(ref) { var m = /^([A-Z]+)/.exec(ref), n = 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + m[1].charCodeAt(i) - 64; return n - 1; }
  function readXlsx(buf) {
    return unzipText(buf).then(function (f) {
      var dp = new DOMParser(), X = function (t) { return dp.parseFromString(t, 'application/xml'); }, strs = [];
      if (f['xl/sharedStrings.xml']) [].forEach.call(X(f['xl/sharedStrings.xml']).getElementsByTagName('si'), function (si) { strs.push([].map.call(si.getElementsByTagName('t'), function (t) { return t.textContent; }).join('')); });
      var rels = {}; if (f['xl/_rels/workbook.xml.rels']) [].forEach.call(X(f['xl/_rels/workbook.xml.rels']).getElementsByTagName('Relationship'), function (r) { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
      var out = [];
      [].forEach.call(X(f['xl/workbook.xml'] || '<a/>').getElementsByTagName('sheet'), function (sh, idx) {
        var rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'), t = rels[rid] || ('worksheets/sheet' + (idx + 1) + '.xml');
        t = 'xl/' + t.replace(/^\/?(xl\/)?/, ''); var xml = f[t]; if (!xml) return;
        var rows = [];
        [].forEach.call(X(xml).getElementsByTagName('row'), function (row) {
          var r = [], rn = +row.getAttribute('r') - 1;
          [].forEach.call(row.getElementsByTagName('c'), function (c) {
            var ci = colIdx(c.getAttribute('r')), ty = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], val = '';
            if (ty === 's') val = v ? strs[+v.textContent] || '' : ''; else if (ty === 'inlineStr') val = [].map.call(c.getElementsByTagName('t'), function (x) { return x.textContent; }).join(''); else val = v ? v.textContent : '';
            r[ci] = String(val).trim();
          });
          for (var q = 0; q < r.length; q++) if (r[q] == null) r[q] = '';
          rows[rn] = r;
        });
        for (var z = 0; z < rows.length; z++) if (!rows[z]) rows[z] = [];
        out.push({ name: sh.getAttribute('name') || ('Лист ' + (idx + 1)), rows: rows });
      });
      return out;
    });
  }
  function readText(text, name) {
    var lines = String(text).replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); });
    var d = (lines[0] || '').indexOf('\t') >= 0 ? '\t' : ((lines[0] || '').split(';').length > (lines[0] || '').split(',').length ? ';' : ',');
    return [{ name: name || 'Список', rows: lines.map(function (l) { return l.split(d).map(function (c) { return c.replace(/^"|"$/g, '').trim(); }); }) }];
  }
  function readSheets(file) {
    return new Promise(function (res, rej) {
      var nm = (file.name || '').replace(/\.[^.]+$/, ''), isX = /\.xlsx$/i.test(file.name || '');
      var fr = new FileReader(); fr.onerror = function () { rej(new Error('Не удалось прочитать файл')); };
      fr.onload = function () { if (isX) readXlsx(fr.result).then(res, rej); else res(readText(fr.result, nm)); };
      if (isX) fr.readAsArrayBuffer(file); else fr.readAsText(file, 'utf-8');
    });
  }
  var LAT = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х' };
  function cleanGid(s) { return String(s || '').replace(/\s+/g, '').replace(/[A-Z]/g, function (c) { return LAT[c] || c; }); }
  function looksFio(s) { s = String(s || '').replace(/^\s*\d+[.)\s]+/, '').trim(); return /^[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z'’\-]+(\s+[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z'’\-]+){1,3}$/.test(s) ? s : ''; }
  /* sheets → [{id, course, spec, curator, students}] */
  function parseRoster(sheets, fname) {
    var byG = {}, order = [];
    sheets.forEach(function (sh) {
      var rows = sh.rows, hdr = -1, cF = -1, cG = -1, cC = -1, shCur = '', i, j;
      for (i = 0; i < Math.min(rows.length, 20) && hdr < 0; i++) for (j = 0; j < (rows[i] || []).length; j++) if (/^(фио|ф\.и\.о|студент|фамилия)/i.test(rows[i][j] || '')) { hdr = i; cF = j; break; }
      if (hdr >= 0) (rows[hdr] || []).forEach(function (c, k) { if (/^групп/i.test(c)) cG = k; if (/^куратор/i.test(c)) cC = k; });
      for (i = 0; i < (hdr < 0 ? Math.min(rows.length, 6) : hdr); i++) (rows[i] || []).forEach(function (c, k) { var m = /^куратор[:\s]+(.+)$/i.exec(c || ''); if (m) shCur = m[1].trim(); else if (/^куратор:?$/i.test(c || '') && rows[i][k + 1]) shCur = rows[i][k + 1]; });
      if (hdr < 0) { var best = 0, bc = -1, cnt = {}; rows.forEach(function (r) { (r || []).forEach(function (c, k) { if (looksFio(c)) cnt[k] = (cnt[k] || 0) + 1; }); }); Object.keys(cnt).forEach(function (k) { if (cnt[k] > best) { best = cnt[k]; bc = +k; } }); cF = bc; }
      if (cF < 0) return;
      for (i = hdr + 1; i < rows.length; i++) {
        var r = rows[i] || [], fio = looksFio(r[cF]); if (!fio) continue;
        var gid = cleanGid(cG >= 0 && r[cG] ? r[cG] : sh.name); if (!gid || /^(лист|sheet|список)\d*$/i.test(gid)) gid = cleanGid(fname || '');
        if (!gid) continue;
        var g = byG[gid]; if (!g) { var m = /^(\D+)(\d)/.exec(gid); g = byG[gid] = { id: gid, course: m ? +m[2] : 1, spec: m ? m[1] : '', curator: '', students: [] }; order.push(gid); }
        var cur = (cC >= 0 && r[cC] ? r[cC] : shCur) || ''; if (cur && !g.curator) g.curator = cur.trim();
        g.students.push(fio);
      }
    });
    return order.map(function (k) { return byG[k]; });
  }
  /* ---------- задачи по кураторству ---------- */
  function tid() { return 'T' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  function taskOp(body, local) {
    if (REMOTE) return post(body).then(function (r) { if (r.err) throw new Error(r.err === 'unknown act' ? 'сервер ещё не обновлён (нужен новый Code.gs)' : r.err); return refresh().then(function () { return r; }); });
    ov.tasks = ov.tasks || []; local(ov.tasks); save(); return Promise.resolve({ ok: true });
  }
  Store.addTask = function (curators, title, desc, due) {
    return taskOp({ act: 'taskAdd', curators: curators, title: title, desc: desc || '', due: due || '' }, function (L) {
      curators.forEach(function (c) { L.push({ id: tid(), cur: c, title: title, desc: desc || '', due: due || '', created: today(), done: '' }); });
    });
  };
  Store.editTask = function (id, title, desc, due) {
    return taskOp({ act: 'taskEdit', id: id, title: title, desc: desc || '', due: due || '' }, function (L) { L.forEach(function (t) { if (t.id === id) { t.title = title; t.desc = desc || ''; t.due = due || ''; } }); });
  };
  Store.delTask = function (id) {
    return taskOp({ act: 'taskDel', id: id }, function (L) { for (var i = L.length - 1; i >= 0; i--) if (L[i].id === id) L.splice(i, 1); });
  };
  Store.doneTask = function (id, flag) {
    return taskOp({ act: 'taskDone', id: id, done: flag ? 1 : 0 }, function (L) { L.forEach(function (t) { if (t.id === id) t.done = flag ? today() : ''; }); });
  };
  /* ---------- кураторские мероприятия (календарь) ---------- */
  Store.addEvent = function (v) {
    return taskOp({ act: 'eventAdd', date: v.date, title: v.title, desc: v.desc || '', courses: v.courses || [], curators: v.curators || [] }, function () {
      ov.events = ov.events || []; ov.events.push({ id: tid(), date: v.date, title: v.title, desc: v.desc || '', courses: v.courses || [], curators: v.curators || [] });
    });
  };
  Store.editEvent = function (id, v) {
    return taskOp({ act: 'eventEdit', id: id, date: v.date, title: v.title, desc: v.desc || '', courses: v.courses || [], curators: v.curators || [] }, function () {
      (ov.events || []).forEach(function (e) { if (e.id === id) { e.date = v.date; e.title = v.title; e.desc = v.desc || ''; e.courses = v.courses || []; e.curators = v.curators || []; } });
    });
  };
  Store.delEvent = function (id) {
    return taskOp({ act: 'eventDel', id: id }, function () { ov.events = (ov.events || []).filter(function (e) { return e.id !== id; }); });
  };
  /* мероприятия, касающиеся куратора: явно названные или (если никого не называли) все кураторы указанных курсов */
  Store.eventsFor = function (name) {
    var cs = {}; seed.groups.forEach(function (g) { if (g.curator === name) cs[g.course] = 1; });
    return Store.events().filter(function (e) {
      if (REMOTE) return true;
      if (e.curators && e.curators.length) return e.curators.indexOf(name) >= 0;
      return !e.courses || !e.courses.length || e.courses.some(function (c) { return cs[c]; });
    });
  };
  Store.refresh = refresh;
  /* синхронизация вкладок: куратор отмечает — панель заведующей обновляется */
  if (G.addEventListener && !REMOTE) G.addEventListener('storage', function (e) {
    if (e.key === LS && e.newValue) { try { ov = JSON.parse(e.newValue); listeners.forEach(function (f) { f(); }); } catch (x) {} }
  });

  /* ---------- Статистика ----------
     Посещаемость % = (пришёл + опоздал) / (пришёл + опоздал + б + з + п + н + у).
     «и» (ИУП) и «р» (практика) в расчёт не входят. Неотмеченные дни не считаются. */
  /* учебные даты периода: без выходных и праздников из календаря */
  function studyDates(a, b) { return rangeDates(a, b, false).filter(function (d) { return !dayInfo(d).off; }); }
  function emptyCnt() { var c = {}; ORDER.forEach(function (k) { c[k] = 0; }); c.total = 0; return c; }
  function studentCnt(gid, sid, dates) {
    var c = emptyCnt();
    dates.forEach(function (d) { var v = Store.get(gid, sid, d); if (v && c[v] !== undefined) { c[v]++; c.total++; } });
    return c;
  }
  function derive(c) {
    var present = c['+'] + c['о'], excused = c['б'] + c['з'] + c['п'], unexc = c['н'] + c['у'];
    var counted = present + excused + unexc;
    return { present: present, late: c['о'], excused: excused, unexc: unexc, absent: excused + unexc, counted: counted, skip: c['и'] + c['р'], pct: counted ? present / counted * 100 : null };
  }
  function addCnt(a, b) { ORDER.forEach(function (k) { a[k] += b[k]; }); a.total += b.total; return a; }
  function groupCnt(gid, dates) {
    var c = emptyCnt(); byId[gid].all.forEach(function (s) { addCnt(c, studentCnt(gid, s.id, dates)); }); return c;
  }
  function longestStreak(gid, sid, dates, codes) {
    var best = 0, cur = 0;
    dates.forEach(function (d) { var v = Store.get(gid, sid, d); if (!v) return; if (codes.indexOf(v) >= 0) { cur++; if (cur > best) best = cur; } else cur = 0; });
    return best;
  }

  /* ---------- XLSX без библиотек ---------- */
  var CRCT = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRCT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function u16(n) { return [n & 255, (n >> 8) & 255]; }
  function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }
  function zipStore(files) {
    var enc = new TextEncoder(), parts = [], cds = [], off = 0, size = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      var lh = new Uint8Array([0x50, 0x4b, 3, 4].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)));
      parts.push(lh, name, data);
      cds.push(new Uint8Array([0x50, 0x4b, 1, 2].concat(u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off))), name);
      off += lh.length + name.length + data.length;
    });
    var cdStart = off; cds.forEach(function (c) { parts.push(c); off += c.length; });
    parts.push(new Uint8Array([0x50, 0x4b, 5, 6].concat(u16(0), u16(0), u16(files.length), u16(files.length), u32(off - cdStart), u32(cdStart), u16(0))));
    parts.forEach(function (p) { size += p.length; });
    var out = new Uint8Array(size), pos = 0; parts.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  /* sheets: [{name, rows:[[cell]], widths:[..], headerRows:n}] ; cell: string | number | null */
  function buildXlsx(sheets) {
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    var wbs = '', rels = '';
    sheets.forEach(function (s, i) {
      ct += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      wbs += '<sheet name="' + esc(s.name.replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      rels += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
    });
    ct += '</Types>';
    var n = sheets.length;
    rels += '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
    var files = [
      { name: '[Content_Types].xml', data: ct },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + wbs + '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>' },
      { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEFF"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBBBBBB"/></left><right style="thin"><color rgb="FFBBBBBB"/></right><top style="thin"><color rgb="FFBBBBBB"/></top><bottom style="thin"><color rgb="FFBBBBBB"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/></cellXfs></styleSheet>' }
    ];
    sheets.forEach(function (s, i) {
      var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
      if (s.widths) x += '<cols>' + s.widths.map(function (w, k) { return '<col min="' + (k + 1) + '" max="' + (k + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>';
      x += '<sheetData>';
      s.rows.forEach(function (row, r) {
        x += '<row r="' + (r + 1) + '">';
        row.forEach(function (v, c) {
          if (v === null || v === undefined || v === '') {
            if (r >= (s.headerRows || 0)) x += '<c r="' + colName(c) + (r + 1) + '" s="2"/>';
            return;
          }
          var head = r < (s.headerRows || 0), st = head ? 1 : (c === 1 && s.nameCol ? 3 : 2), ref = colName(c) + (r + 1);
          if (typeof v === 'number') x += '<c r="' + ref + '" s="' + st + '"><v>' + v + '</v></c>';
          else x += '<c r="' + ref + '" s="' + st + '" t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
        });
        x += '</row>';
      });
      x += '</sheetData></worksheet>';
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: x });
    });
    return zipStore(files);
  }

  /* Табель в привычном формате: лист на группу, дни, итоги; «+» = пустая клетка, как в старых файлах */
  function exportTabel(y, m, groupIds) {
    var dates = monthDates(y, m, false), sheets = [];
    var sum = [['Группа', 'Студентов', 'Посещаемость, %', 'Опозданий', 'Больничный', 'Заявление', 'По приказу', 'Неуважительно (н+у)', 'ИУП', 'Практика', 'Куратор']];
    groupIds.forEach(function (gid) {
      var g = byId[gid], head = ['№ п/п', 'ФИО'].concat(dates.map(function (d) { return parse(d).getDate(); }), ['Опозданий', 'ИУП', 'Больничный', 'Заявление', 'По приказу', 'Неуважительно', 'Итого пропусков']);
      var rows = [[g.name + ' · куратор: ' + (g.curator || '—')], [], head];
      Store.rosterIn(g, dates).forEach(function (s, i) {
        var c = studentCnt(gid, s.id, dates), d = derive(c);
        rows.push([i + 1, s.fio].concat(dates.map(function (dt) { var v = Store.get(gid, s.id, dt); return v === '+' ? '' : v; }), [c['о'], c['и'], c['б'], c['з'], c['п'], d.unexc, d.absent]));
      });
      rows.push([]);
      rows.push(['', 'Обозначения: о — опоздание, и — ИУП, б — больничный, з — заявление, п — по приказу, н — неуважительная, у — ушёл с занятий, р — практика']);
      var w = [6, 34].concat(dates.map(function () { return 3.4; }), [11, 7, 11, 11, 11, 13, 14]);
      sheets.push({ name: g.name, rows: rows, widths: w, headerRows: 3, nameCol: true });
      var gc = groupCnt(gid, dates), gd = derive(gc);
      sum.push([g.name, Store.rosterIn(g, dates).length, gd.pct === null ? '' : Math.round(gd.pct * 10) / 10, gc['о'], gc['б'], gc['з'], gc['п'], gd.unexc, gc['и'], gc['р'], g.curator || '']);
    });
    sheets.unshift({ name: 'Сводка', rows: [['Сводка за ' + MONTHS[m].toLowerCase() + ' ' + y], []].concat(sum), widths: [14, 11, 16, 11, 12, 11, 12, 20, 8, 10, 26], headerRows: 3 });
    return buildXlsx(sheets);
  }

  G.KAIT = {
    CODES: CODES, ORDER: ORDER, MONTHS: MONTHS, MONTHS_GEN: MONTHS_GEN, DOW: DOW,
    pad: pad, iso: iso, parse: parse, today: today, isWeekend: isWeekend, monthDates: monthDates, rangeDates: rangeDates,
    fmtShort: fmtShort, fmtLong: fmtLong, shortName: shortName, esc: esc,
    Net: Net, REMOTE: REMOTE, Store: Store, readSheets: readSheets, parseRoster: parseRoster, normFio: normFio, studyDates: studyDates, studentCnt: studentCnt, groupCnt: groupCnt, derive: derive, addCnt: addCnt, emptyCnt: emptyCnt, longestStreak: longestStreak,
    buildXlsx: buildXlsx, exportTabel: exportTabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
