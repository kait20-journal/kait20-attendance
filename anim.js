/* лёгкие анимации: появление блоков, счётчики, кольцо, столбцы. Отключаются при prefers-reduced-motion */
(function () {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var app = document.getElementById('app'), timer = 0;
  if (!app) return;
  function enter() { app.classList.add('enter'); clearTimeout(timer); timer = setTimeout(function () { app.classList.remove('enter'); }, 1400); }
  function countUp(el) {
    var t = el.textContent, m = t.match(/^(\D*)(\d+(?:[.,]\d+)?)(.*)$/); if (!m) return;
    var dec = (m[2].split(/[.,]/)[1] || '').length, end = parseFloat(m[2].replace(',', '.')), t0 = performance.now(), D = 800;
    (function step(now) {
      var p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - p, 3), v = (end * e).toFixed(dec).replace('.', ',');
      el.textContent = m[1] + (dec ? v : Math.round(end * e)) + m[3]; if (p < 1) requestAnimationFrame(step); else el.textContent = t;
    })(t0);
  }
  var busy = false;
  new MutationObserver(function () {
    if (busy || !app.classList.contains('enter')) return; busy = true;
    requestAnimationFrame(function () {
      [].forEach.call(app.querySelectorAll('.kpi .v, .trio3 b, .ring text:not(:last-child)'), countUp);
      busy = false;
    });
  }).observe(app, { childList: true });
  document.addEventListener('click', function (e) { if (e.target.closest('#tabs button, .rail button, .gcard, #back')) enter(); }, true);
  enter();
  setTimeout(enter, 300);
})();
