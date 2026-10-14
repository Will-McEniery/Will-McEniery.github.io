// Approximate local preview of the Jekyll site without Ruby.
//
//   npm run preview         -> builds into .preview/ and serves http://localhost:4000, rebuilding on change
//   npm run preview -- --build-only
//
// It re-implements just the Jekyll features this site uses (front matter, layouts, includes,
// collections, _data, a few Jekyll filters) on top of liquidjs + markdown-it. Markdown output differs
// slightly from kramdown, so treat the GitHub Actions / GitHub Pages build as the source of truth.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { Liquid, Tag } from 'liquidjs';
import MarkdownIt from 'markdown-it';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.preview');
const PORT = Number(process.env.PORT) || 4000;

const md = new MarkdownIt({ html: true, typographer: true, linkify: false });

function readFrontMatter(file) {
    const text = fs.readFileSync(file, 'utf8');
    const match = /^---\r?\n([\s\S]*?)\r?\n?---\r?\n?/.exec(text);
    if (!match) return null;
    return { data: YAML.parse(match[1]) || {}, body: text.slice(match[0].length) };
}

function toDate(value) {
    if (value instanceof Date) return value;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return new Date(value.length === 10 ? `${value}T00:00:00` : value);
    return value;
}

function loadData(dir) {
    const data = {};
    if (!fs.existsSync(dir)) return data;
    for (const name of fs.readdirSync(dir)) {
        const file = path.join(dir, name);
        const key = name.replace(/\.(ya?ml|json)$/, '');
        if (/\.ya?ml$/.test(name)) data[key] = YAML.parse(fs.readFileSync(file, 'utf8'));
        else if (name.endsWith('.json')) data[key] = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    return data;
}

function applyDefaults(config, type, data) {
    const merged = {};
    for (const rule of config.defaults || []) {
        if (rule.scope?.type === type) Object.assign(merged, rule.values);
    }
    return { ...merged, ...data };
}

function makeEngine(site) {
    const engine = new Liquid({
        root: [path.join(ROOT, '_includes')],
        extname: '',
        jekyllInclude: true,
        dynamicPartials: false,
        strictFilters: false,
        cache: false,
    });
    const baseurl = site.baseurl || '';
    engine.registerFilter('relative_url', (v) => baseurl + String(v ?? ''));
    engine.registerFilter('absolute_url', (v) => (site.url || '') + baseurl + String(v ?? ''));
    engine.registerFilter('jsonify', (v) => JSON.stringify(v ?? null));
    engine.registerFilter('markdownify', (v) => md.render(String(v ?? '')));
    engine.registerFilter('date_to_xmlschema', (v) => {
        const d = toDate(v);
        return d instanceof Date ? d.toISOString() : '';
    });
    engine.registerFilter('push', (arr, item) => [...(Array.isArray(arr) ? arr : []), item]);
    engine.registerFilter('xml_escape', (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    engine.registerTag('seo', class extends Tag {
        * render(ctx) {
            const page = ctx.getAll().page || {};
            const title = page.title && page.title !== site.title ? `${page.title} | ${site.title}` : site.title;
            return `<title>${title}</title>\n<meta name="description" content="${page.description || site.description || ''}">`;
        }
    });
    return engine;
}

function collectPages(config) {
    const pages = [];
    for (const name of fs.readdirSync(ROOT)) {
        if (!/\.(html|md)$/.test(name) || (config.exclude || []).includes(name)) continue;
        const fm = readFrontMatter(path.join(ROOT, name));
        if (!fm) continue;
        const stem = name.replace(/\.(html|md)$/, '');
        const url = fm.data.permalink || (stem === 'index' ? '/' : `/${stem}.html`);
        pages.push({ ...fm.data, url, path: name, _body: fm.body, _ext: path.extname(name) });
    }
    return pages;
}

function collectCollections(config) {
    const collections = {};
    for (const [label, opts] of Object.entries(config.collections || {})) {
        const dir = path.join(ROOT, `_${label}`);
        const docs = [];
        if (fs.existsSync(dir)) {
            for (const name of fs.readdirSync(dir)) {
                if (!/\.(md|html)$/.test(name)) continue;
                const fm = readFrontMatter(path.join(dir, name));
                if (!fm) continue;
                const data = applyDefaults(config, label, fm.data);
                if (data.published === false) continue;
                const stem = name.replace(/\.(md|html)$/, '');
                docs.push({
                    ...data,
                    date: toDate(data.date),
                    collection: label,
                    url: `/${label}/${stem}.html`,
                    path: `_${label}/${name}`,
                    output: opts.output,
                    _body: fm.body,
                    _ext: path.extname(name),
                });
            }
        }
        docs.sort((a, b) => (a.date - b.date) || a.path.localeCompare(b.path));
        collections[label] = docs;
    }
    return collections;
}

async function renderPage(engine, site, page) {
    let content = await engine.parseAndRender(page._body, { site, page });
    if (page._ext === '.md') content = md.render(content);
    let layoutName = page.layout;
    while (layoutName) {
        const file = path.join(ROOT, '_layouts', `${layoutName}.html`);
        const fm = readFrontMatter(file) || { data: {}, body: fs.readFileSync(file, 'utf8') };
        content = await engine.parseAndRender(fm.body, { site, page, content, layout: fm.data });
        layoutName = fm.data.layout;
    }
    return content;
}

function copyDir(src, dest) {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(from, to);
        } else {
            fs.mkdirSync(dest, { recursive: true });
            fs.copyFileSync(from, to);
        }
    }
}

export async function build() {
    const config = YAML.parse(fs.readFileSync(path.join(ROOT, '_config.yml'), 'utf8'));
    const collections = collectCollections(config);
    const site = { ...config, time: new Date(), data: loadData(path.join(ROOT, '_data')), ...collections };
    const pages = collectPages(config);
    site.pages = pages;
    const engine = makeEngine(site);

    fs.rmSync(OUT, { recursive: true, force: true });
    copyDir(path.join(ROOT, 'assets'), path.join(OUT, 'assets'));

    const outputs = [...pages, ...Object.values(collections).flat().filter((d) => d.output)];
    for (const page of outputs) {
        const html = await renderPage(engine, site, page);
        const file = page.url.endsWith('/') ? `${page.url}index.html` : page.url;
        const target = path.join(OUT, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, html);
    }
    return outputs.length;
}

const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

function serve() {
    http.createServer((req, res) => {
        let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (urlPath.endsWith('/')) urlPath += 'index.html';
        let file = path.join(OUT, urlPath);
        if (!file.startsWith(OUT)) { res.writeHead(403).end(); return; }
        if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404, { 'Content-Type': MIME['.html'] });
            res.end(fs.existsSync(path.join(OUT, '404.html')) ? fs.readFileSync(path.join(OUT, '404.html')) : 'Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        fs.createReadStream(file).pipe(res);
    }).listen(PORT, () => console.log(`Preview: http://localhost:${PORT}`));
}

async function safeBuild() {
    try {
        const t = Date.now();
        const n = await build();
        console.log(`Built ${n} pages in ${Date.now() - t} ms`);
    } catch (err) {
        console.error('Build failed:', err.message);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await safeBuild();
    if (!process.argv.includes('--build-only')) {
        serve();
        let timer = null;
        fs.watch(ROOT, { recursive: true }, (_event, name) => {
            if (!name || /^(\.preview|node_modules|\.git)([\\/]|$)/.test(name)) return;
            clearTimeout(timer);
            timer = setTimeout(safeBuild, 150);
        });
    }
}
