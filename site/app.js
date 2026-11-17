(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;

  /* ---------------------------------------------------------- theme */

  const ICONS = {
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"/></svg>',
  };
  const themeBtn = $('#themeBtn');
  const paintThemeIcon = () => {
    if (!themeBtn) return;
    themeBtn.innerHTML = root.getAttribute('data-theme') === 'light' ? ICONS.moon : ICONS.sun;
    themeBtn.setAttribute('aria-label', root.getAttribute('data-theme') === 'light' ? '切换到深色' : '切换到浅色');
  };
  paintThemeIcon();
  themeBtn?.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('mqf-theme', next); } catch (e) {}
    paintThemeIcon();
  });

  /* ---------------------------------------------------------- resume */

  const docEl = $('.doc');
  const LAST_KEY = 'mqf-last';
  if (docEl) {
    try {
      localStorage.setItem(
        LAST_KEY,
        JSON.stringify({
          n: Number(docEl.dataset.ch),
          label: docEl.dataset.label,
          href: docEl.dataset.href,
          ts: Date.now(),
        })
      );
    } catch (e) {}
  } else {
    try {
      const last = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
      if (last && last.href && last.n) {
        const cta = $('#ctaStart');
        const label = $('#ctaLabel');
        if (cta && label) {
          cta.href = last.href;
          label.textContent = '继续阅读 · 第 ' + String(last.n).padStart(2, '0') + ' 章';
        }
        const card = document.querySelector('.card[href="' + last.href + '"]');
        if (card) {
          card.classList.add('is-last');
          const meta = card.querySelector('.card-meta');
          if (meta) meta.innerHTML = '<span class="last-dot"></span>上次读到 · ' + meta.textContent;
        }
      }
    } catch (e) {}
  }

  /* ---------------------------------------------------------- progress */

  const bar = $('#progressBar');
  const toTop = $('#toTop');
  toTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  const pager = {
    prev: $('.pager-prev')?.getAttribute('href'),
    next: $('.pager-next')?.getAttribute('href'),
  };
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (bar) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        bar.style.width = (p * 100).toFixed(2) + '%';
        toTop?.classList.toggle('is-visible', window.scrollY > 700);
      }
      spy();
    });
  };

  /* ---------------------------------------------------------- nav drawer */

  const body = document.body;
  const menuBtn = $('#menuBtn');
  const scrim = $('#scrim');
  const closeNav = () => {
    body.classList.remove('nav-open');
    menuBtn?.setAttribute('aria-expanded', 'false');
  };
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeNav();
  });
  menuBtn?.addEventListener('click', () => {
    const open = body.classList.toggle('nav-open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  scrim?.addEventListener('click', closeNav);
  $$('.sidebar a').forEach((a) => a.addEventListener('click', closeNav));

  /* ---------------------------------------------------------- toc spy */

  const tocLinks = $$('.toc-nav a');
  const headings = tocLinks
    .map((a) => document.getElementById(a.hash.slice(1)))
    .filter(Boolean);
  let currentId = null;

  function spy() {
    if (!headings.length) return;
    const line = window.scrollY + window.innerHeight * 0.28;
    let active = headings[0];
    for (const h of headings) {
      if (h.offsetTop <= line) active = h;
      else break;
    }
    if (!active || active.id === currentId) return;
    currentId = active.id;
    tocLinks.forEach((a) => a.classList.toggle('is-current', a.hash === '#' + active.id));
  }

  /* ---------------------------------------------------------- search */

  const overlay = $('#searchOverlay');
  const input = $('#searchInput');
  const results = $('#searchResults');
  let indexPromise = null;
  let data = [];
  let hits = [];
  let active = -1;

  const loadIndex = () => {
    if (!indexPromise) {
      indexPromise = fetch('search.json')
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []);
    }
    return indexPromise;
  };

  function score(q, text) {
    const t = text.toLowerCase();
    let s = 0, i = 0, last = -2;
    for (const ch of q) {
      const p = t.indexOf(ch, i);
      if (p < 0) return -1;
      s += p === last + 1 ? 2 : 1;
      i = p + 1;
      last = p;
    }
    if (t.includes(q)) s += 10;
    if (t.startsWith(q)) s += 6;
    return s - t.length * 0.004;
  }

  function render(list, q) {
    hits = list;
    active = -1;
    if (!list.length) {
      results.innerHTML = `<div class="sr-empty">没有匹配「${q.replace(/[<>&]/g, '')}」的章节</div>`;
      return;
    }
    results.innerHTML = list
      .map(
        (h) => `<a class="sr-item" href="${h.href}">
  <span class="sr-c">第 ${String(h.c).padStart(2, '0')} 章</span>
  <span class="sr-t">${h.t}</span>
  ${h.x ? `<span class="sr-x">${h.x}</span>` : ''}
</a>`
      )
      .join('');
    $$('.sr-item', results).forEach((el, i) =>
      el.addEventListener('mouseenter', () => setActive(i))
    );
  }

  function setActive(i) {
    if (!hits.length) return;
    active = (i + hits.length) % hits.length;
    $$('.sr-item', results).forEach((el, k) => el.classList.toggle('is-active', k === active));
    const el = $$('.sr-item', results)[active];
    el?.scrollIntoView({ block: 'nearest' });
  }

  function search(q) {
    q = q.trim().toLowerCase();
    if (!q) {
      render([], '');
      return;
    }
    const scored = [];
    for (const item of data) {
      const base = score(q, (item.t || '') + ' ' + (item.k || ''));
      const bodyScore = item.x ? score(q, item.x) - 8 : -1;
      const best = Math.max(base, bodyScore);
      if (best > 0) scored.push([best, item]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    render(scored.slice(0, 14).map((x) => x[1]), q);
  }

  function openSearch() {
    if (!overlay) return;
    overlay.hidden = false;
    closeNav();
    loadIndex().then((d) => {
      data = d;
      if (input.value.trim()) search(input.value);
      else render([], '');
    });
    setTimeout(() => input.focus(), 10);
  }
  function closeSearch() {
    if (!overlay) return;
    overlay.hidden = true;
    input.value = '';
  }

  $('#searchBtn')?.addEventListener('click', openSearch);
  overlay?.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeSearch();
  });
  input?.addEventListener('input', (e) => search(e.target.value));
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') {
      const target = hits[active] || hits[0];
      if (target) window.location.href = target.href;
    } else if (e.key === 'Escape') closeSearch();
  });

  /* ---------------------------------------------------------- keys */

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === 'Escape') { closeSearch(); closeNav(); return; }
    if (typing) return;
    if (e.key === '/') { e.preventDefault(); openSearch(); return; }
    if (e.key === 'ArrowLeft' && pager.prev) window.location.href = pager.prev;
    if (e.key === 'ArrowRight' && pager.next) window.location.href = pager.next;
    if (e.key === 'k') { e.preventDefault(); openSearch(); }
  });

  /* ---------------------------------------------------------- overflow hints */

  const markX = (el, probe) => {
    const check = () => {
      const more = probe.scrollWidth > probe.clientWidth + 4;
      const atEnd = probe.scrollLeft + probe.clientWidth >= probe.scrollWidth - 4;
      el.classList.toggle('is-scrollable', more && !atEnd);
    };
    check();
    probe.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
  };

  $$('.math--display, .table-wrap').forEach((el) => markX(el, el));
  $$('.prose .code-block').forEach((fig) => {
    const pre = fig.querySelector('pre');
    if (pre) markX(fig, pre);
  });

  /* ---------------------------------------------------------- init */

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
  spy();
})();
