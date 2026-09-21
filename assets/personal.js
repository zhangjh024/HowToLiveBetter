const reader = document.getElementById('personal-reader');
const selectedId = new URLSearchParams(location.search).get('article');

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function articleUrl(id) {
  return 'personal.html?' + new URLSearchParams({article: id});
}

function buildNavigation(articles, current) {
  document.querySelectorAll('[data-personal-count]').forEach(node => {
    node.textContent = `${articles.length} 篇`;
  });
  document.querySelectorAll('[data-personal-links]').forEach(nav => {
    const links = articles.map(article => {
      const link = element('a', undefined, 'personal-entry');
      link.href = articleUrl(article.id);
      link.append(element('span', article.title), element('small', article.subtitle));
      if (reader && article.id === current) link.setAttribute('aria-current', 'page');
      return link;
    });
    nav.replaceChildren(...links);
  });
}

// The reader accepts text, headings, emphasis, links, quotes and simple lists.
// Create DOM nodes instead of inserting Markdown as HTML.
function inline(parent, text) {
  const tokens = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let offset = 0;
  for (const match of text.matchAll(tokens)) {
    parent.append(document.createTextNode(text.slice(offset, match.index)));
    if (match[1]) {
      parent.append(element('strong', match[1]));
    } else if (match[2]) {
      parent.append(element('code', match[2]));
    } else {
      let url;
      try { url = new URL(match[4], location.href); } catch {}
      if (url && ['https:', 'http:', 'mailto:'].includes(url.protocol)) {
        const link = element('a', match[3]);
        link.href = url.href;
        if (url.origin !== location.origin) link.rel = 'noopener noreferrer';
        parent.append(link);
      } else {
        parent.append(document.createTextNode(match[3]));
      }
    }
    offset = match.index + match[0].length;
  }
  parent.append(document.createTextNode(text.slice(offset)));
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const body = document.createDocumentFragment();
  const headings = [];
  const listItem = /^\s*(?:[-*]|\d+\.)\s+(.+)$/;
  const startsBlock = line => /^#{1,3}\s|^>\s?|^\s*(?:[-*]|\d+\.)\s/.test(line);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || /^#\s+/.test(line)) { i++; continue; }
    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    if (heading) {
      const node = element(`h${heading[1].length}`);
      inline(node, heading[2]);
      node.id = `part-${headings.length + 1}`;
      headings.push({id: node.id, title: node.textContent, level: heading[1].length});
      body.append(node);
      i++;
    } else if (line.startsWith('>')) {
      const quote = element('blockquote');
      const content = [];
      while (i < lines.length && /^>/.test(lines[i].trim())) {
        content.push(lines[i++].trim().replace(/^>\s?/, ''));
      }
      const paragraph = element('p');
      inline(paragraph, content.join(' '));
      quote.append(paragraph);
      body.append(quote);
    } else if (listItem.test(line)) {
      const ordered = /^\d+\./.test(line);
      const list = element(ordered ? 'ol' : 'ul');
      while (i < lines.length && listItem.test(lines[i]) && /^\d+\./.test(lines[i].trim()) === ordered) {
        const item = element('li');
        inline(item, lines[i++].match(listItem)[1]);
        list.append(item);
      }
      body.append(list);
    } else {
      const content = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !startsBlock(lines[i].trim())) {
        content.push(lines[i++].trim());
      }
      const paragraph = element('p');
      inline(paragraph, content.join(' '));
      body.append(paragraph);
    }
  }
  return {body, headings};
}

function wireReader() {
  const sidebar = document.getElementById('reader-sidebar');
  const backdrop = document.getElementById('reader-backdrop');
  const menu = document.getElementById('reader-menu');
  function setMenu(open) {
    sidebar.classList.toggle('open', open);
    backdrop.classList.toggle('on', open);
    menu.setAttribute('aria-expanded', String(open));
  }
  menu.addEventListener('click', () => setMenu(!sidebar.classList.contains('open')));
  backdrop.addEventListener('click', () => setMenu(false));
  sidebar.addEventListener('click', event => {
    if (event.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sidebar.classList.contains('open')) {
      setMenu(false);
      menu.focus();
    }
  });
  const theme = document.getElementById('reader-theme');
  theme.setAttribute('aria-pressed', String(document.documentElement.classList.contains('dark')));
  theme.addEventListener('click', () => {
    const dark = document.documentElement.classList.toggle('dark');
    theme.setAttribute('aria-pressed', String(dark));
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch {}
  });
}

function showError(title, message) {
  document.title = `${title} · 个人体会`;
  const status = document.getElementById('reader-status');
  status.className = 'reader-error';
  status.setAttribute('role', 'alert');
  const retry = element('button', '重新加载', 'reader-retry');
  retry.addEventListener('click', () => location.reload());
  const back = element('a', '返回个人体会');
  back.href = 'personal.html';
  status.replaceChildren(element('h1', title), element('p', message), retry, back);
}

async function load() {
  try {
    const response = await fetch('assets/articles.json', {cache: 'no-cache'});
    if (!response.ok) throw new Error('Article index unavailable');
    const articles = await response.json();
    if (!Array.isArray(articles) || !articles.length) throw new Error('Article index empty');
    const current = selectedId || articles[0].id;
    buildNavigation(articles, current);
    if (!reader) return;
    const article = articles.find(item => item.id === current);
    if (!article) {
      showError('没有找到这篇文章', '可以从侧边栏选择已收录的文章。');
      return;
    }
    const textResponse = await fetch(article.file, {cache: 'no-cache'});
    if (!textResponse.ok) throw new Error('Article unavailable');
    const markdown = await textResponse.text();
    const rendered = renderMarkdown(markdown);
    document.getElementById('reader-title').textContent = article.title;
    document.getElementById('reader-description').textContent = article.description;
    const date = document.getElementById('reader-date');
    date.dateTime = article.date;
    date.textContent = article.date;
    const characters = markdown.replace(/\s|[#*`]/g, '').length;
    document.getElementById('reader-length').textContent = `约 ${Math.ceil(characters / 400)} 分钟阅读`;
    document.getElementById('reader-source').textContent = article.source || '';
    document.getElementById('reader-note').textContent = article.note || '';
    document.getElementById('reader-body').replaceChildren(rendered.body);
    const toc = rendered.headings.filter(heading => heading.level === 2).map(heading => {
      const item = element('li');
      const link = element('a', heading.title);
      link.href = '#' + heading.id;
      item.append(link);
      return item;
    });
    document.getElementById('reader-toc').replaceChildren(...toc);
    document.getElementById('reader-toc-group').hidden = !toc.length;
    const canonical = new URL(articleUrl(article.id), 'https://zhangjh024.github.io/HowToLiveBetter/').href;
    document.title = `${article.title} · 个人体会 · 高性价比人生指南`;
    document.querySelector('link[rel="canonical"]').href = canonical;
    for (const [selector, value] of [
      ['meta[name="description"]', article.description],
      ['meta[property="og:title"]', `${article.title} · 个人体会`],
      ['meta[property="og:description"]', article.description],
      ['meta[property="og:url"]', canonical]
    ]) document.querySelector(selector).content = value;
    document.getElementById('reader-status').remove();
    document.getElementById('reader-article').hidden = false;
    if (location.hash) requestAnimationFrame(() => {
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
    });
  } catch {
    // The homepage keeps its static article link if the index is temporarily unavailable.
    if (reader) showError('文章暂时无法加载', '请检查网络后重试，也可以稍后再来阅读。');
  }
}

if (reader) wireReader();
load();
