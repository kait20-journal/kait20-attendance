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
  var HOLIDAYS = { '2026-11-04': 'День народного единства', '2027-11-04': 'День народного единства', '2027-02-23': 'День защитника Отечества', '2027-03-08': 'Международный женский день', '2027-05-01': 'Праздник Весны и Труда', '2027-05-09': 'День Победы', '2027-06-12': 'День России' };
  for (var hd = 1; hd <= 8; hd++) HOLIDAYS['2027-01-0' + hd] = 'Новогодние каникулы';
  var seedWk = {};
  if (!REMOTE) Object.keys(seed.marks).forEach(function (gid) { Object.keys(seed.marks[gid]).forEach(function (sid) { Object.keys(seed.marks[gid][sid]).forEach(function (d) { if (isWeekend(d)) seedWk[d] = 1; }); }); });
  function dayInfo(d) {
    var o = ov.days[d];
    if (o) return { off: o.t === 'off', label: o.l || '', custom: true };
    if (HOLIDAYS[d]) return { off: true, label: HOLIDAYS[d], custom: false };
    if (isWeekend(d)) return seedWk[d] ? { off: false, label: 'Учебная суббота', custom: false } : { off: true, label: 'Выходной', custom: false };
    return { off: false, label: '', custom: false };
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
    commit: save,
    who: function (v) { if (v !== undefined) { ov.who = v; save(); } return ov.who; },
    journal: function () { return ov.journal; },
    onChange: function (f) { listeners.push(f); },
    reset: function () { ov = { marks: {}, journal: [], who: ov.who, days: {} }; save(); },
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
  function applyLoad(res) {
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
    var sum = [['Группа', 'Студентов', 'Посещаемость, %', 'Опозданий', 'Больничный', 'Заявление', 'По приказу', 'Неуважительно (н+у)', 'ИУП', 'Практика']];
    groupIds.forEach(function (gid) {
      var g = byId[gid], head = ['№ п/п', 'ФИО'].concat(dates.map(function (d) { return parse(d).getDate(); }), ['Опозданий', 'ИУП', 'Больничный', 'Заявление', 'По приказу', 'Неуважительно', 'Итого пропусков']);
      var rows = [[g.name], [], head];
      Store.rosterIn(g, dates).forEach(function (s, i) {
        var c = studentCnt(gid, s.id, dates), d = derive(c);
        rows.push([i + 1, s.fio].concat(dates.map(function (dt) { var v = Store.get(gid, s.id, dt); return v === '+' ? '' : v; }), [c['о'], c['и'], c['б'], c['з'], c['п'], d.unexc, d.absent]));
      });
      rows.push([]);
      rows.push(['', 'Обозначения: о — опоздание, и — ИУП, б — больничный, з — заявление, п — по приказу, н — неуважительная, у — ушёл с занятий, р — практика']);
      var w = [6, 34].concat(dates.map(function () { return 3.4; }), [11, 7, 11, 11, 11, 13, 14]);
      sheets.push({ name: g.name, rows: rows, widths: w, headerRows: 3, nameCol: true });
      var gc = groupCnt(gid, dates), gd = derive(gc);
      sum.push([g.name, Store.rosterIn(g, dates).length, gd.pct === null ? '' : Math.round(gd.pct * 10) / 10, gc['о'], gc['б'], gc['з'], gc['п'], gd.unexc, gc['и'], gc['р']]);
    });
    sheets.unshift({ name: 'Сводка', rows: [['Сводка за ' + MONTHS[m].toLowerCase() + ' ' + y], []].concat(sum), widths: [14, 11, 16, 11, 12, 11, 12, 20, 8, 10], headerRows: 3 });
    return buildXlsx(sheets);
  }

  G.KAIT = {
    CODES: CODES, ORDER: ORDER, MONTHS: MONTHS, MONTHS_GEN: MONTHS_GEN, DOW: DOW,
    pad: pad, iso: iso, parse: parse, today: today, isWeekend: isWeekend, monthDates: monthDates, rangeDates: rangeDates,
    fmtShort: fmtShort, fmtLong: fmtLong, shortName: shortName, esc: esc,
    Net: Net, REMOTE: REMOTE, Store: Store, studyDates: studyDates, studentCnt: studentCnt, groupCnt: groupCnt, derive: derive, addCnt: addCnt, emptyCnt: emptyCnt, longestStreak: longestStreak,
    buildXlsx: buildXlsx, exportTabel: exportTabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
