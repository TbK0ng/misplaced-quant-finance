import fs from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import katex from 'katex';
import hljs from 'highlight.js/lib/common';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'docs');
const KATEX_DIST = path.join(ROOT, 'node_modules', 'katex', 'dist');

const BOOK = {
  title: '错位的量化金融',
  author: '栀染',
  lede:
    '用一条信息论的线，把 trend、套利、组合与执行串起来。从「价格里到底有多少信息」问起，到 ' +
    '<span class="greek">η</span> 的度量、因子的多重检验、组合里的 <span class="greek">Σ</span>，' +
    '以及执行端的 <span class="greek">L/τ</span>。',
};

const NAV_TITLES = [
  '预测的边界',
  '特征工程',
  '第一个策略',
  '搜因子',
  '因子流水线',
  'Stacking',
  '中证 500',
  '组合',
  '结语',
  '套利',
  '卖方业务',
  '工程实现',
];

const SLUGS = [
  'prediction-boundary',
  'feature-engineering',
  'first-strategy',
  'factor-search',
  'factor-pipeline',
  'stacking',
  'csi500-enhanced',
  'portfolio',
  'roadmap',
  'arbitrage',
  'sell-side',
  'engineering',
];

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function cnToInt(s) {
  if (s.length === 1) return CN_NUM[s] ?? NaN;
  if (s[0] === '十') return 10 + (CN_NUM[s[1]] ?? 0);
  if (s[1] === '十') return (CN_NUM[s[0]] ?? 0) * 10 + (s[2] ? CN_NUM[s[2]] ?? 0 : 0);
  return NaN;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');

// ---------------------------------------------------------------- discover

function discover() {
  const files = fs
    .readdirSync(ROOT)
    .filter((f) => f.startsWith('错位的量化金融') && f.endsWith('.md'));

  const chapters = files
    .map((file) => {
      const raw = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
      const lines = raw.split('\n');
      const h1 = (lines.find((l) => /^#\s+\S/.test(l)) || '').replace(/^#\s+/, '').trim();
      const numCn = (h1.match(/第([一二三四五六七八九十]+)章/) || [])[1];
      const num = cnToInt(numCn);
      const rest = h1.replace(/^.*?第[一二三四五六七八九十]+章\s*/, '').trim();
      const ci = rest.search(/[：:]/);
      const title = ci >= 0 ? rest.slice(0, ci).trim() : rest;
      const subtitle = ci >= 0 ? rest.slice(ci + 1).trim() : '';

      const metaIdx = lines.findIndex((l) => l.startsWith('> 原文：'));
      const metaLine = lines.find((l) => l.startsWith('> 作者')) || '';
      const date = (metaLine.match(/发布[：:]\s*([\d-]+)/) || [])[1] || '';
      const likes = (metaLine.match(/赞同\s*(\d+)/) || [])[1] || '0';
      const comments = (metaLine.match(/评论\s*(\d+)/) || [])[1] || '0';
      const source = ((lines[metaIdx] || '').match(/https?:\/\/\S+/) || [])[0] || '';

      let body = lines.slice(metaIdx + 1).join('\n');
      body = body.replace(/^\s*\n?---\s*\n/, '');

      return {
        file, num, title, subtitle, date, likes, comments, source, body,
        slug: SLUGS[num - 1],
      };
    })
    .sort((a, b) => a.num - b.num);

  if (chapters.length !== 12 || chapters.some((c, i) => c.num !== i + 1)) {
    throw new Error('章节顺序异常: ' + chapters.map((c) => c.num).join(','));
  }
  return chapters;
}

// ---------------------------------------------------------------- math

function installMath(md) {
  const render = (src, display) =>
    katex.renderToString(src, {
      displayMode: display,
      throwOnError: false,
      strict: false,
      trust: false,
      output: 'html',
    });

  // $$ ... $$ block
  md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (state.src.slice(start, start + 2) !== '$$') return false;
    if (silent) return true;

    let pos = start + 2;
    let content = state.src.slice(pos, max);
    let nextLine = startLine;
    let closed = content.trim().endsWith('$$');

    if (closed) {
      content = content.trim().slice(0, -2);
    } else {
      for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
        const s = state.bMarks[nextLine] + state.tShift[nextLine];
        const e = state.eMarks[nextLine];
        const line = state.src.slice(s, e);
        const idx = line.indexOf('$$');
        if (idx >= 0) {
          content += '\n' + line.slice(0, idx);
          closed = true;
          break;
        }
        content += '\n' + line;
      }
    }
    if (!closed) return false;

    state.line = nextLine + 1;
    const token = state.push('math_block', 'math', 0);
    token.block = true;
    token.content = content.trim();
    token.markup = '$$';
    return true;
  });

  md.renderer.rules.math_block = (tokens, idx) =>
    `<div class="math math--display">${render(tokens[idx].content, true)}</div>`;

  // $ ... $ inline
  md.inline.ruler.after('escape', 'math_inline', (state, silent) => {
    if (state.src[state.pos] !== '$') return false;
    const start = state.pos;
    let pos = start + 1;
    if (state.src[pos] === '$') return false;
    while (pos < state.posMax) {
      const ch = state.src[pos];
      if (ch === '\\') { pos += 2; continue; }
      if (ch === '\n') return false;
      if (ch === '$') break;
      pos++;
    }
    if (pos >= state.posMax || state.src[pos] !== '$') return false;
    const content = state.src.slice(start + 1, pos);
    if (!content.trim()) return false;
    if (!silent) {
      const token = state.push('math_inline', 'math', 0);
      token.content = content;
      token.markup = '$';
    }
    state.pos = pos + 1;
    return true;
  });

  md.renderer.rules.math_inline = (tokens, idx) => {
    let inner = tokens[idx].content;
    // A CJK comma inside math mode makes KaTeX unhappy; the author means a separator.
    inner = inner.replace(/，/g, ',\\;');
    return `<span class="math math--inline">${render(inner, false)}</span>`;
  };
}

// ---------------------------------------------------------------- highlight

const LANG_HINTS = [
  ['python', /(^|\n)\s*(import\s+\w|from\s+\w+\s+import|def\s+\w+\(|class\s+\w+[: (])|np\.|pd\.|\.rolling\(|\.values\b/],
  ['bash', /(^|\n)\s*(#!\/|zpool\s|zfs\s|apt\s|sudo\s|export\s|nvidia-smi|mpirun|pip\s|docker\s|git\s|vllm\s|python\s)/],
  ['yaml', /(^|\n)\s*[\w.-]+:\s*(\n|$)|(^|\n)\s*-\s+\w/],
  ['sql', /\b(SELECT|INSERT|CREATE TABLE|FROM|WHERE)\b/i],
];

function guessLang(code) {
  for (const [lang, re] of LANG_HINTS) if (re.test(code)) return lang;
  return null;
}

function installHighlight(md) {
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const code = token.content;
    let lang = (token.info || '').trim().split(/\s+/)[0];
    if (!lang || !hljs.getLanguage(lang)) lang = guessLang(code);
    let html;
    try {
      html = lang && hljs.getLanguage(lang)
        ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
        : hljs.highlightAuto(code, ['python', 'bash', 'yaml', 'json', 'sql']).value;
    } catch {
      html = esc(code);
    }
    const label = lang && hljs.getLanguage(lang) ? lang : 'text';
    return `<figure class="code-block"><figcaption>${label}</figcaption><pre><code class="hljs">${html}</code></pre></figure>`;
  };
}

// ---------------------------------------------------------------- transform

function preprocess(body, ch, idMap) {
  const lines = body.split('\n');
  const out = [];
  let inFence = false;

  for (const rawLine of lines) {
    let line = rawLine;

    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    // "## # 前言" -> "## 前言"
    line = line.replace(/^(#{1,6})\s+#\s+/, '$1 ');

    // a lone inline formula on its own line is really display math
    const lone = line.trim().match(/^\$([^$\n]+)\$([，。；、,.;]?)$/);
    if (lone) {
      out.push('');
      out.push(`$$${lone[1]}$$`);
      if (lone[2]) out.push('');
      out.push('');
      continue;
    }

    // bare cross-post link on its own line -> in-site chapter jump
    const jump = line.trim().match(/^\[([^\]]*)\]\((https?:\/\/zhuanlan\.zhihu\.com\/p\/(\d+)[^)]*)\)$/);
    if (jump) {
      const target = idMap[jump[3]];
      if (target) {
        const dir = target.num > ch.num ? 'next' : target.num < ch.num ? 'prev' : 'ref';
        const label = dir === 'prev' ? '上一篇' : dir === 'next' ? '下一篇' : '相关章节';
        out.push(
          `<p class="jump jump--${dir}"><a href="${target.href}"><span class="jump-k">${label}</span><span class="jump-t">${esc(target.label)}</span></a></p>`
        );
        continue;
      }
    }

    // inline cross-post links -> in-site
    line = line.replace(
      /\[([^\]]*)\]\((https?:\/\/zhuanlan\.zhihu\.com\/p\/(\d+)[^)]*)\)/g,
      (whole, text, _url, id) => (idMap[id] ? `[${text === '链接' ? idMap[id].label : text}](${idMap[id].href})` : whole)
    );

    // images
    line = line.replace(/\((images\/[^)]+)\)/g, '(assets/$1)');

    out.push(line);
  }

  return out.join('\n');
}

// ---------------------------------------------------------------- render

function makeMd() {
  const md = new MarkdownIt({ html: true, linkify: false, breaks: false, typographer: false });
  installMath(md);
  installHighlight(md);

  const defaultLink = md.renderer.rules.link_open || ((t, i, o, e, s) => s.renderToken(t, i, o));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet('href') || '';
    if (/^https?:/.test(href)) {
      tokens[idx].attrSet('target', '_blank');
      tokens[idx].attrSet('rel', 'noopener noreferrer');
      tokens[idx].attrJoin('class', 'ext');
    }
    return defaultLink(tokens, idx, options, env, self);
  };

  md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n';
  md.renderer.rules.table_close = () => '</table></div>\n';

  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const tag = tokens[idx].tag;
    const level = Number(tag[1]);
    if (level === 2 || level === 3) {
      const text = tokens[idx + 1] ? tokens[idx + 1].content : '';
      const id = `s${env.toc.length + 1}`;
      tokens[idx].attrSet('id', id);
      env.toc.push({ level, text: demath(text), id });
    }
    return self.renderToken(tokens, idx, options);
  };

  return md;
}

const GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
  rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ',
  Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};

function demath(s) {
  return String(s)
    .replace(/\$\$?([^$]*)\$\$?/g, (_, inner) =>
      inner
        .replace(/\\[a-zA-Z]+/g, (m) => GREEK[m.slice(1)] ?? '')
        .replace(/\\([{}_,;:! ])/g, '$1')
        .replace(/[{}^_]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function plainText(mdSrc) {
  return mdSrc
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$?[^$]*\$\$?/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[>#\-*|\s]+/gm, ' ')
    .replace(/[*_`]/g, '');
}

function countWords(text) {
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latin = (text.match(/[A-Za-z][A-Za-z0-9'-]*/g) || []).length;
  return cjk + latin;
}

// ---------------------------------------------------------------- templates

const ICON = {
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  arrowL: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  arrowR: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M19 14v5.5A1.5 1.5 0 0 1 17.5 21H5A1.5 1.5 0 0 1 3.5 19.5V7A1.5 1.5 0 0 1 5 5.5h5"/></svg>',
};

const chapterHref = (ch) => `${String(ch.num).padStart(2, '0')}-${ch.slug}.html`;
const NAMES = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const chapterLabel = (ch) => `第${NAMES[ch.num - 1] || ch.num}章 ${ch.title}${ch.subtitle ? '：' + ch.subtitle : ''}`;

function head({ title, desc, bodyClass = '', crumb = '' }) {
  return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${escAttr(desc)}">
<meta name="color-scheme" content="dark light">
<meta property="og:title" content="${escAttr(title)}">
<meta property="og:description" content="${escAttr(desc)}">
<meta property="og:type" content="article">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230b0d10'/%3E%3Ctext x='32' y='44' font-size='34' font-family='Georgia,serif' fill='%23d9a05b' text-anchor='middle'%3E%CE%B7%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="assets/katex/katex.min.css">
<link rel="stylesheet" href="assets/style.css">
<script>
  try {
    var t = new URLSearchParams(location.search).get('theme') || localStorage.getItem('mqf-theme');
    if (t) document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
</script>
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
<div class="progress" aria-hidden="true"><span id="progressBar"></span></div>
<header class="topbar">
  <button class="icon-btn" id="menuBtn" aria-label="目录" aria-expanded="false">${ICON.menu}</button>
  <a class="topbar-brand" href="index.html">${esc(BOOK.title)}</a>
  <span class="topbar-crumb">${esc(crumb)}</span>
  <div class="topbar-actions">
    <button class="search-btn" id="searchBtn" aria-label="搜索">${ICON.search}<span>搜索</span><kbd>/</kbd></button>
    <button class="icon-btn" id="themeBtn" aria-label="切换主题">${ICON.moon}</button>
  </div>
</header>
`;
}

function sidebar(chapters, current, toc) {
  const items = chapters
    .map((c) => {
      const active = current && c.num === current.num ? ' is-active' : '';
      return `<a class="ch${active}" href="${chapterHref(c)}"><span class="ch-n">${String(c.num).padStart(2, '0')}</span><span class="ch-t">${esc(NAV_TITLES[c.num - 1] || c.title)}</span></a>`;
    })
    .join('\n');

  const tocHtml = (toc || [])
    .map((t) => `<a class="toc-l${t.level}" href="#${t.id}">${esc(t.text)}</a>`)
    .join('\n');

  return `<aside class="sidebar" id="sidebar">
  <div class="sidebar-head">
    <a class="brand" href="index.html">
      <span class="brand-mark">η</span>
      <span class="brand-text"><strong>${esc(BOOK.title)}</strong><em>${esc(BOOK.author)}</em></span>
    </a>
  </div>
  <div class="sidebar-body">
    <p class="side-label">目录</p>
    <nav class="chapter-nav">
${items}
    </nav>
    ${tocHtml ? `<p class="side-label side-label--toc">本章</p><nav class="toc-nav">${tocHtml}</nav>` : ''}
  </div>
  <div class="sidebar-foot">
    <a href="https://zhuanlan.zhihu.com/p/2080446408805691909" target="_blank" rel="noopener">知乎专栏 ${ICON.ext}</a>
  </div>
</aside>
<div class="scrim" id="scrim"></div>
`;
}

function pageShell({ title, desc, chapters, current, toc, content, pager }) {
  return `${head({ title, desc, crumb: current ? `第 ${String(current.num).padStart(2, '0')} 章 · ${current.title}` : '' })}
<div class="layout">
${sidebar(chapters, current, toc)}
<main class="main">
${content}
${pager || ''}
<footer class="site-foot">
  <p>${esc(BOOK.title)} · ${esc(BOOK.author)}</p>
  <p class="muted">文字与图表版权归作者所有。本站为阅读排版，数学公式由 KaTeX 渲染。</p>
</footer>
</main>
</div>
<button class="to-top" id="toTop" aria-label="回到顶部"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg></button>
<button class="to-top" id="toTop" aria-label="回到顶部"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg></button>
<div class="search-overlay" id="searchOverlay" hidden>
  <div class="search-panel">
    <input id="searchInput" type="search" placeholder="搜索章节、小节与术语…" autocomplete="off" spellcheck="false">
    <div class="search-results" id="searchResults"></div>
    <div class="search-hint"><kbd>↑</kbd><kbd>↓</kbd> 选择 <kbd>↵</kbd> 打开 <kbd>esc</kbd> 关闭</div>
  </div>
</div>
<script src="assets/app.js" defer></script>
</body>
</html>`;
}

function extractSections(src) {
  const out = [];
  let cur = null;
  let inFence = false;
  for (const line of src.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const h = line.match(/^(#{2,3})\s+(.+)$/);
    if (h) {
      cur = { text: demath(h[2]), buf: [] };
      out.push(cur);
      continue;
    }
    if (cur) cur.buf.push(line);
  }
  return out.map((sec) => ({
    text: sec.text,
    x: plainText(sec.buf.join(' ')).replace(/\s+/g, ' ').trim().slice(0, 120),
  }));
}

const texInline = (src) =>
  `<span class="math math--inline">${katex.renderToString(src, { throwOnError: false, strict: false })}</span>`;

// ---------------------------------------------------------------- build

function main() {
  const chapters = discover();
  const idMap = {};
  for (const ch of chapters) {
    const id = (ch.source.match(/\/p\/(\d+)/) || [])[1];
    if (id) idMap[id] = { num: ch.num, href: chapterHref(ch), label: chapterLabel(ch) };
  }

  const md = makeMd();

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'assets', 'katex', 'fonts'), { recursive: true });

  // assets
  const katexCss = fs
    .readFileSync(path.join(KATEX_DIST, 'katex.min.css'), 'utf8')
    .replace(/,url\(fonts\/[^)]+\.(woff|ttf)\) format\("(woff|truetype)"\)/g, '');
  fs.writeFileSync(path.join(OUT, 'assets', 'katex', 'katex.min.css'), katexCss);
  for (const f of fs.readdirSync(path.join(KATEX_DIST, 'fonts'))) {
    if (f.endsWith('.woff2')) {
      fs.copyFileSync(path.join(KATEX_DIST, 'fonts', f), path.join(OUT, 'assets', 'katex', 'fonts', f));
    }
  }
  fs.copyFileSync(path.join(ROOT, 'site', 'style.css'), path.join(OUT, 'assets', 'style.css'));
  fs.copyFileSync(path.join(ROOT, 'site', 'app.js'), path.join(OUT, 'assets', 'app.js'));
  if (fs.existsSync(path.join(ROOT, 'images'))) {
    fs.mkdirSync(path.join(OUT, 'assets', 'images'), { recursive: true });
    for (const f of fs.readdirSync(path.join(ROOT, 'images'))) {
      if (f !== '.gitkeep') fs.copyFileSync(path.join(ROOT, 'images', f), path.join(OUT, 'assets', 'images', f));
    }
  }
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  const searchIndex = [];

  // chapter pages
  chapters.forEach((ch, i) => {
    const body = preprocess(ch.body, ch, idMap);
    const env = { toc: [] };
    const html = md.render(body, env);

    const formulas = (body.match(/\$\$[\s\S]*?\$\$/g) || []).length + (body.match(/\$[^$\n]+\$/g) || []).length;
    const words = countWords(plainText(body));

    const chapterToc = env.toc.filter((t) => t.level === 3);
    const sections = extractSections(body);
    env.toc.forEach((t, n) => {
      searchIndex.push({
        c: ch.num,
        t: t.text,
        href: `${chapterHref(ch)}#${t.id}`,
        k: `${chapterLabel(ch)} · ${t.text}`,
        x: (sections[n] && sections[n].text === t.text ? sections[n].x : '') || '',
      });
    });

    const content = `<article class="doc" data-ch="${ch.num}" data-label="${escAttr(chapterLabel(ch))}" data-href="${chapterHref(ch)}">
  <header class="chapter-head" data-num="${String(ch.num).padStart(2, '0')}">
    <p class="eyebrow"><span>Ch. ${String(ch.num).padStart(2, '0')}</span><i></i></p>
    <h1>${esc(ch.title)}</h1>
    ${ch.subtitle ? `<p class="chapter-sub">${esc(ch.subtitle)}</p>` : ''}
    <div class="chapter-meta">
      <span>${esc(BOOK.author)}</span><span class="dot"></span>
      <span>${esc(ch.date)}</span><span class="dot"></span>
      <span>${words.toLocaleString('en-US')} 字</span><span class="dot"></span>
      <span>${chapterToc.length} 节</span>
      ${ch.source ? `<a class="source-link" href="${ch.source}" target="_blank" rel="noopener noreferrer">知乎原文 ${ICON.ext}</a>` : ''}
    </div>
  </header>
  <div class="prose">
${html}
  </div>
</article>`;

    const prev = chapters[i - 1];
    const next = chapters[i + 1];
    const pager = `<nav class="pager">
  ${prev
    ? `<a class="pager-link pager-prev" href="${chapterHref(prev)}"><span class="pager-k">${ICON.arrowL} 上一章</span><span class="pager-t">${esc(prev.title)}</span></a>`
    : `<a class="pager-link pager-prev" href="index.html"><span class="pager-k">${ICON.arrowL} 返回</span><span class="pager-t">目录</span></a>`}
  ${next
    ? `<a class="pager-link pager-next" href="${chapterHref(next)}"><span class="pager-k">下一章 ${ICON.arrowR}</span><span class="pager-t">${esc(next.title)}</span></a>`
    : `<a class="pager-link pager-next" href="index.html"><span class="pager-k">读完 ${ICON.arrowR}</span><span class="pager-t">回到目录</span></a>`}
</nav>`;

    const page = pageShell({
      title: `${chapterLabel(ch)} · ${BOOK.title}`,
      desc: ch.subtitle || chapterLabel(ch),
      chapters,
      current: ch,
      toc: env.toc,
      content,
      pager,
    });
    fs.writeFileSync(path.join(OUT, chapterHref(ch)), page);
  });

  // index
  const totalWords = chapters.reduce((s, ch) => s + countWords(plainText(preprocess(ch.body, ch, idMap))), 0);
  const totalSections = searchIndex.length;

  const items = chapters
    .map((ch) => {
      const body = preprocess(ch.body, ch, idMap);
      const secs = (body.match(/^###\s+\S/gm) || []).length;
      const words = countWords(plainText(body));
      return `<li>
      <a class="card" href="${chapterHref(ch)}">
        <span class="card-n">${String(ch.num).padStart(2, '0')}</span>
        <span class="card-body">
          <span class="card-title">${esc(ch.title)}${ch.subtitle ? `<em>${esc(ch.subtitle)}</em>` : ''}</span>
          <span class="card-meta">${secs} 节 · ${words.toLocaleString('en-US')} 字</span>
        </span>
        <span class="card-arrow">${ICON.arrowR}</span>
      </a>
    </li>`;
    })
    .join('\n');

  const indexContent = `<div class="home">
  <section class="hero">
    <p class="eyebrow"><span>Quant / Information Theory</span><i></i></p>
    <h1>错位的<br><em>量化金融</em></h1>
    <p class="lede">${BOOK.lede}</p>
    <div class="hero-foot">
      <a class="cta" id="ctaStart" href="${chapterHref(chapters[0])}"><span id="ctaLabel">开始阅读</span> <span>${ICON.arrowR}</span></a>
      <p class="hero-stats"><strong>12</strong> 章 · <strong>${totalSections}</strong> 节 · 约 <strong>${(totalWords / 10000).toFixed(1)}</strong> 万字</p>
    </div>
  </section>

  <section class="contents">
    <div class="contents-head">
      <h2>目录</h2>
      <p>${esc(BOOK.author)} · 2026</p>
    </div>
    <ol class="card-list">
${items}
    </ol>
  </section>

  <section class="note">
    <h2>怎么读</h2>
    <p>第一章定义度量 ${texInline('\\eta = I_{\\mathcal V}(\\Phi \\to Y) / H(Y)')}：可预测的部分占目标熵的比例。此后每一章都是同一个问题在不同尺度上的投影 —— 特征工程在抬分子，打标在压分母，核验在防止你误以为抬高了 η。</p>
    <p>如果只读三章：第一章（信息预算）、第五章（多重检验）、第十章（套利守恒律）。</p>
  </section>
</div>`;

  const homeHtml = `<div class="layout layout--home">
<main class="main">
<div class="home-wrap">
${indexContent}
<footer class="site-foot site-foot--home">
  <p>${esc(BOOK.title)} · ${esc(BOOK.author)}</p>
  <p class="muted">文字与图表版权归作者所有 · 数学公式由 KaTeX 渲染</p>
</footer>
</div>
</main>
</div>
<button class="to-top" id="toTop" aria-label="回到顶部"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg></button>
<button class="to-top" id="toTop" aria-label="回到顶部"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg></button>
<div class="search-overlay" id="searchOverlay" hidden>
  <div class="search-panel">
    <input id="searchInput" type="search" placeholder="搜索章节、小节与术语…" autocomplete="off" spellcheck="false">
    <div class="search-results" id="searchResults"></div>
    <div class="search-hint"><kbd>↑</kbd><kbd>↓</kbd> 选择 <kbd>↵</kbd> 打开 <kbd>esc</kbd> 关闭</div>
  </div>
</div>
<script src="assets/app.js" defer></script>
</body>
</html>`;

  fs.writeFileSync(
    path.join(OUT, 'index.html'),
    head({ title: `${BOOK.title} · ${BOOK.author}`, desc: BOOK.lede, bodyClass: 'is-home' }) + homeHtml
  );

  fs.writeFileSync(path.join(OUT, 'search.json'), JSON.stringify(searchIndex));
  console.log(
    `built ${chapters.length} chapters, ${totalSections} sections, ${(totalWords / 10000).toFixed(1)} 万字 -> docs/`
  );
}

main();
