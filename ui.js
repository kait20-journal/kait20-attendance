/* Общие элементы интерфейса */
(function (G) {
  'use strict';
  var K = G.KAIT, S = K.Store, esc = K.esc;
  var UI = {};

  function $(s, r) { return (r || document).querySelector(s); }
  UI.$ = $;

  var tt;
  UI.toast = function (m) {
    var t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('on'); }, 1600);
  };

  UI.ask = function (text, okLabel) {
    return new Promise(function (res) {
      var ov = document.createElement('div'); ov.className = 'ov on'; ov.style.zIndex = 90; ov.style.alignItems = 'center';
      ov.innerHTML = '<div class="modal"><div style="font-size:15px;line-height:1.45">' + esc(text) + '</div><div class="acts" style="display:flex;gap:8px;margin-top:16px"><button class="btn ghost" data-r="0" style="flex:1">Отмена</button><button class="btn" data-r="1" style="flex:1">' + esc(okLabel || 'Да') + '</button></div></div>';
      ov.addEventListener('click', function (e) { var b = e.target.closest('[data-r]'); if (b || e.target === ov) { ov.remove(); res(!!b && b.dataset.r === '1'); } });
      document.body.appendChild(ov);
    });
  };


  /* форма в модальном окне: fields [{id,label,type:'text'|'date'|'select',value,options:[[v,l]],req,hint}] → Promise(values|null) */
  UI.form = function (title, fields, okLabel) {
    return new Promise(function (res) {
      var ov = document.createElement('div'); ov.className = 'ov on'; ov.style.zIndex = 90; ov.style.alignItems = 'center';
      var st = 'width:100%;border:1px solid var(--line);border-radius:11px;padding:10px 12px;margin-top:4px;background:#fff;font:inherit';
      var h = '<div class="modal"><h3>' + esc(title) + '</h3>';
      fields.forEach(function (f) {
        h += '<label class="sm mut" style="display:block;margin-top:10px">' + esc(f.label);
        if (f.type === 'select') h += '<select data-f="' + f.id + '" style="' + st + '">' + f.options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === f.value ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
        else h += '<input data-f="' + f.id + '" type="' + (f.type || 'text') + '" value="' + esc(f.value || '') + '" style="' + st + '" autocomplete="off">';
        h += '</label>' + (f.hint ? '<div class="xs mut" style="margin-top:3px">' + esc(f.hint) + '</div>' : '');
      });
      h += '<div class="acts" style="display:flex;gap:8px;margin-top:16px"><button class="btn ghost" data-r="0" style="flex:1">Отмена</button><button class="btn" data-r="1" style="flex:1">' + esc(okLabel || 'Готово') + '</button></div></div>';
      ov.innerHTML = h;
      function done(ok) {
        if (!ok) { ov.remove(); return res(null); }
        var v = {}, bad = false; fields.forEach(function (f) { var e = ov.querySelector('[data-f="' + f.id + '"]'); v[f.id] = e.value.trim(); if (f.req && !v[f.id]) { bad = true; e.style.borderColor = '#d33'; } });
        if (bad) return; ov.remove(); res(v);
      }
      ov.addEventListener('click', function (e) { var b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); else if (e.target === ov) done(false); });
      ov.addEventListener('keydown', function (e) { if (e.key === 'Enter') done(true); });
      document.body.appendChild(ov); var f0 = ov.querySelector('input,select'); if (f0) f0.focus();
    });
  };
  /* окно со строкой, которую можно выделить и скопировать */
  UI.copyBox = function (title, text, hint) {
    return new Promise(function (res) {
      var ov = document.createElement('div'); ov.className = 'ov on'; ov.style.zIndex = 90; ov.style.alignItems = 'center';
      ov.innerHTML = '<div class="modal"><h3>' + esc(title) + '</h3>' + (hint ? '<div class="mut sm" style="margin-top:6px">' + esc(hint) + '</div>' : '') + '<textarea readonly rows="4" style="width:100%;margin-top:10px;border:1px solid var(--line);border-radius:11px;padding:10px;font:13px monospace">' + esc(text) + '</textarea><div class="acts" style="display:flex;gap:8px;margin-top:12px"><button class="btn ghost" data-r="0" style="flex:1">Закрыть</button><button class="btn" data-r="1" style="flex:1">Скопировать</button></div></div>';
      ov.addEventListener('click', function (e) {
        var b = e.target.closest('[data-r]');
        if (b && b.dataset.r === '1') { var ta = ov.querySelector('textarea'); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (x) {} try { navigator.clipboard.writeText(text); ok = true; } catch (x) {} UI.toast(ok ? 'Скопировано' : 'Выделено — нажмите Ctrl+C'); }
        else if (b || e.target === ov) { ov.remove(); res(); }
      });
      document.body.appendChild(ov); ov.querySelector('textarea').select();
    });
  };

  UI.st = function (code, label) {
    if (!code) return '<span class="st k-none">·</span>';
    var c = K.CODES[code]; return '<span class="st k-' + c.key + '" title="' + esc(c.label) + '">' + (label || code) + '</span>';
  };

  UI.demoBar = function (host, text) {
    if (K.REMOTE) {
      host.className = 'demo sync'; host.innerHTML = '<div class="wrap"><span id="syncB">● Подключено</span></div>';
      var L = { ok: '✔ Всё сохранено', saving: '⏳ Сохраняю…', error: '⚠ Нет связи — повторяю, данные не потеряны', idle: '● Подключено' };
      K.Net.onState(function (s) { var e = $('#syncB'); if (e) { e.textContent = L[s] || ''; e.style.color = s === 'error' ? '#b42318' : ''; } });
      return;
    }
    host.innerHTML = '<div class="wrap"><span>🧪 <b>Демо-версия.</b> ' + (text || 'Данные: октябрь (2–4 курсы) и ноябрь (1 курс), ФИО студентов обезличены. Отметки сохраняются только в этом браузере.') + '</span><button id="demoReset">Сбросить мои отметки</button></div>';
    $('#demoReset').onclick = function () { UI.ask('Удалить все отметки и изменения календаря, внесённые в демо?', 'Сбросить').then(function (ok) { if (ok) { S.reset(); UI.toast('Демо сброшено'); } }); };
  };

  /* ---------- шторка выбора статуса ---------- */
  var sheetEl, cur;
  function ensureSheet() {
    if (sheetEl) return;
    sheetEl = document.createElement('div'); sheetEl.className = 'ov'; sheetEl.id = 'sheetOv';
    sheetEl.innerHTML = '<div class="sheet" role="dialog"><h3 id="shName"></h3><div class="sub" id="shDate"></div><div class="opts" id="shOpts"></div>' +
      '<div class="until" id="shUntil">Так же отметить <b>по</b><input type="date" id="shTo"><div class="xs mut" style="margin-top:6px">Будни до этой даты включительно (для больничного, заявления, ИУП, практики)</div></div>' +
      '<div class="acts"><button class="btn ghost" id="shClear">Очистить</button><button class="btn ghost" id="shClose">Закрыть</button></div></div>';
    document.body.appendChild(sheetEl);
    sheetEl.addEventListener('click', function (e) { if (e.target === sheetEl) UI.closeSheet(); });
    $('#shClose').onclick = UI.closeSheet;
    $('#shClear').onclick = function () { apply(''); };
    var o = $('#shOpts');
    o.innerHTML = K.ORDER.map(function (c) { var d = K.CODES[c]; return '<button class="opt k-' + d.key + '" data-c="' + c + '"><b>' + (c === '+' ? '✓' : c) + '</b>' + d.label + '</button>'; }).join('');
    o.addEventListener('click', function (e) { var b = e.target.closest('.opt'); if (b) apply(b.dataset.c); });
  }
  function apply(code) {
    var who = S.who(), dates = [cur.date], to = $('#shTo').value;
    if (code && ['б', 'з', 'п', 'и', 'р'].indexOf(code) >= 0 && to && to > cur.date) dates = K.rangeDates(cur.date, to, false).filter(function (d) { return !S.isOff(d); });
    dates.forEach(function (d) { S.set(cur.gid, cur.sid, d, code, who, true); });
    S.commit(); UI.closeSheet();
    UI.toast(dates.length > 1 ? 'Отмечено дней: ' + dates.length : (code ? 'Сохранено' : 'Отметка снята'));
    if (cur.onDone) cur.onDone();
  }
  UI.openSheet = function (o) {
    if (S.isOff(o.date)) { UI.toast('Выходной день — отметки закрыты'); return; }
    ensureSheet(); cur = o;
    var st = S.student(o.sid), v = S.get(o.gid, o.sid, o.date);
    $('#shName').textContent = st.s.fio; $('#shDate').textContent = K.fmtLong(o.date) + ' · ' + st.g.name;
    $('#shTo').value = ''; $('#shTo').min = o.date;
    [].forEach.call(sheetEl.querySelectorAll('.opt'), function (b) { b.classList.toggle('sel', b.dataset.c === v); });
    $('#shUntil').classList.add('on');
    sheetEl.classList.add('on');
  };
  UI.closeSheet = function () { if (sheetEl) sheetEl.classList.remove('on'); };

  /* ---------- табель (матрица месяц × студенты) ---------- */
  UI.matrix = function (host, gid, dates, opt) {
    opt = opt || {};
    var g = S.group(gid), sd = K.studyDates(dates[0], dates[dates.length - 1]), ros = S.rosterIn(g, dates);
    var h = '<div class="mwrap"><table class="mx"><thead><tr><th class="nm">' + esc(g.name) + ' · ' + ros.length + ' студ.</th>';
    dates.forEach(function (d) { var dt = K.parse(d); var di = S.dayInfo(d); h += '<th class="' + (di.off ? 'wk' : '') + '" title="' + K.fmtLong(d) + (di.label ? ' · ' + esc(di.label) : '') + '">' + dt.getDate() + '<br><span class="xs" style="font-weight:400">' + K.DOW[dt.getDay()] + '</span></th>'; });
    h += '<th class="sum">%</th><th class="sum">н</th><th class="sum">б з п</th><th class="sum">о</th></tr></thead><tbody>';
    ros.forEach(function (s) {
      h += '<tr><td class="nm" title="' + esc(s.fio) + '">' + esc(s.fio) + '</td>';
      dates.forEach(function (d) {
        var v = S.get(gid, s.id, d), c = v ? K.CODES[v] : null;
        var off = S.isOff(d); h += '<td class="c' + (off ? ' off' : '') + (c && !off ? ' k-' + c.key : '') + '" data-s="' + s.id + '" data-d="' + d + '">' + (off ? '' : (v === '+' ? '·' : v)) + '</td>';
      });
      var c = K.studentCnt(gid, s.id, sd), dv = K.derive(c);
      h += '<td class="sum">' + (dv.pct === null ? '–' : Math.round(dv.pct) + '%') + '</td><td class="sum">' + (dv.unexc || '') + '</td><td class="sum">' + (dv.excused || '') + '</td><td class="sum">' + (c['о'] || '') + '</td></tr>';
    });
    h += '</tbody></table></div>';
    host.innerHTML = h;
    if (opt.editable) host.querySelector('table').addEventListener('click', function (e) {
      var td = e.target.closest('td.c'); if (!td) return; if (td.classList.contains('off')) { UI.toast('Выходной день — отметки закрыты'); return; }
      UI.openSheet({ gid: gid, sid: td.dataset.s, date: td.dataset.d, onDone: opt.onEdit });
    });
  };

  UI.legend = function () {
    return '<div class="legend">' + K.ORDER.map(function (c) { var d = K.CODES[c]; return '<span><span class="st k-' + d.key + '">' + (c === '+' ? '✓' : c) + '</span>' + d.label + '</span>'; }).join('') + '</div>';
  };

  /* ---------- тема: светлая / тёмная (по умолчанию как на устройстве) ---------- */
  var SUN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  UI.theme = function () { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; };
  UI.themeBtn = function (b) {
    if (!b) return;
    function draw() { var l = UI.theme() === 'light'; b.innerHTML = l ? MOON : SUN; b.title = l ? 'Включить тёмную тему' : 'Включить светлую тему'; var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = l ? '#eef2f8' : '#2c2724'; }
    b.onclick = function () { var n = UI.theme() === 'light' ? 'dark' : 'light'; document.documentElement.setAttribute('data-theme', n); try { localStorage.setItem('kait.theme', n); } catch (e) {} draw(); };
    b.style.display = 'inline-grid'; b.style.placeItems = 'center'; draw();
  };

  G.UI = UI;
})(window);
