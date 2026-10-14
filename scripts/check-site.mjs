// Sanity checks on a built site directory (default: _site):
//   - expected pages exist
//   - every internal link / script / stylesheet points at a file that exists
//   - no Liquid tags leaked through unrendered
// Usage: node scripts/check-site.mjs [dir]

import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] || '_site');
const expected = ['index.html', 'projects.html', 'interests.html', 'cv.html', 'book.html', '404.html', 'assets/css/style.css', 'assets/js/spacetime/main.js'];
const errors = [];

function walk(d) {
    return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        return e.isDirectory() ? walk(p) : [p];
    });
}

for (const file of expected) {
    if (!fs.existsSync(path.join(dir, file))) errors.push(`missing ${file}`);
}

const htmlFiles = walk(dir).filter((f) => f.endsWith('.html'));
for (const file of htmlFiles) {
    const rel = path.relative(dir, file).replace(/\\/g, '/');
    const html = fs.readFileSync(file, 'utf8');
    if (/\{\{|\{%/.test(html.replace(/<script type="application\/json"[\s\S]*?<\/script>/g, ''))) {
        errors.push(`${rel}: unrendered Liquid`);
    }
    // Data embedded for scripts (e.g. the booking settings) must be valid JSON
    for (const match of html.matchAll(/<script id="([^"]+)" type="application\/json">([\s\S]*?)<\/script>/g)) {
        try {
            const data = JSON.parse(match[2]);
            if (match[1] === 'booking-config' && !(data && data.timezone && data.weekly)) errors.push(`${rel}: booking settings missing timezone/weekly`);
        } catch (err) {
            errors.push(`${rel}: #${match[1]} is not valid JSON (${err.message})`);
        }
    }
    for (const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
        const url = match[1];
        if (url.startsWith('//')) continue;
        let target = path.join(dir, decodeURIComponent(url));
        if (url.endsWith('/')) target = path.join(target, 'index.html');
        if (!fs.existsSync(target) && !fs.existsSync(`${target}.html`)) errors.push(`${rel}: broken link ${url}`);
    }
}

if (errors.length) {
    for (const e of errors) console.log(process.env.GITHUB_ACTIONS ? `::error title=Site check::${e}` : `ERROR ${e}`);
    process.exit(1);
}
console.log(`Site check passed (${htmlFiles.length} pages).`);
