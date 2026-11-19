// Bundles the app into one self-contained HTML file (dist-single/relay-mail.html)
// for previews and hosting where a dev server isn't available.
// Usage: node scripts/build-single.mjs [--dev]
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const out = resolve(root, 'dist-single');
mkdirSync(out, { recursive: true });

const result = await build({
  entryPoints: [resolve(root, 'src/main.tsx')],
  bundle: true,
  write: false,
  outdir: out,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  minify: !dev,
  sourcemap: false,
  legalComments: 'none',
  loader: { '.css': 'css' },
  define: {
    'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
    'import.meta.env': JSON.stringify({ VITE_DATA_SOURCE: 'mock', MODE: dev ? 'development' : 'production' }),
  },
  logLevel: 'warning',
});

const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';

const template = readFileSync(resolve(root, 'index.html'), 'utf8');
// Function replacers: the bundle contains `$&` (e.g. in React), which a string replacement would expand.
const html = template
  .replace(/\s*<script type="module" src="\/src\/main.tsx"><\/script>/, '')
  .replace('</head>', () => `    <style>${css}</style>\n  </head>`)
  .replace('</body>', () => `    <script>${js}</script>\n  </body>`);

const file = resolve(out, 'relay-mail.html');
writeFileSync(file, html);
console.log(`Wrote ${file} (${(html.length / 1024).toFixed(0)} KB)`);
