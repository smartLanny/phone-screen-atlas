import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'vendor/svm');
const original = await fs.readFile(path.join(dir, 'original.html'));
const originalSha256 = '203687d157558338f50317f730bc6536bb33f6824de5e6513db5bbc38a6d1db1';
assert.equal(crypto.createHash('sha256').update(original).digest('hex'), originalSha256, 'Pinned original.html bytes changed');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'data/svm/manifest.original.json'), 'utf8'));
const files = manifest.map(entry => entry.file);
assert.equal(files.length, 17);
const replacements = {
  'settings.v2': 1, 'prefs.v2': 1, 'userRecords.v2': 1, 'bundledEdits.v2': 1, 'removedBundled.v2': 1,
  'svm.persist.pending.v1': 1, 'svm.stats.ui': 1, 'svm-export-prefs.v1': 1, 'svm.shell.ui.v1': 2,
  'svm-full-range-visualizer': 1, kv: 1, 'keyval-store': 1, keyval: 1,
};
let html = original.toString('utf8');
for (const [key, expected] of Object.entries(replacements)) {
  const literal = JSON.stringify(key);
  const count = html.split(literal).length - 1;
  assert.equal(count, expected, `Unexpected persistence literal count: ${key}`);
  html = html.replaceAll(literal, JSON.stringify(`atlas-embed.${key}`));
}
const css = await fs.readFile(path.join(dir, 'embed.css'), 'utf8');
const bridge = (await fs.readFile(path.join(dir, 'bridge.js'), 'utf8')).replace('__ATLAS_SVM_FILES__', JSON.stringify(files));
assert.ok(!bridge.includes('</script>'));
html = html.replace('</head>', `<style id="atlas-svm-embed-css">\n${css}\n</style>\n</head>`)
  .replace('</body>', `<script id="atlas-svm-bridge">\n${bridge}\n</script>\n</body>`);
assert.ok(html.includes('window.__svm={store:Be,timeline:x2}'));
assert.equal(html.match(/id="atlas-svm-bridge"/g)?.length, 1);
for (const [, attributes, code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  const args = ['--check', ...(attributes.includes('module') ? ['--input-type=module'] : [])];
  const result = spawnSync(process.execPath, args, { input: code, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
if (process.argv.includes('--check')) assert.equal(await fs.readFile(path.join(dir, 'embed.html'), 'utf8'), html);
else await fs.writeFile(path.join(dir, 'embed.html'), html);
console.log(`${process.argv.includes('--check') ? 'Verified' : 'Built'} original SVM embed: ${files.length} records; storage namespaced; inline JavaScript syntax valid.`);
