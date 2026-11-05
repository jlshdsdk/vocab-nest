/* Maintenance only: node tools/split-data.cjs. GitHub Pages serves the committed JSON directly. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {makeManifest,makeSearchIndex} = require('../js/data-loader.js');
const root = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(root,'js/data.js'),'utf8');
const context = {window:{}};
vm.runInNewContext(source+'\n;window.canonical=GROUPS;',context,{timeout:5000});
const groups = JSON.parse(JSON.stringify(context.window.canonical));
const ids = new Set();
for (const g of groups) {
  if (!/^[A-Za-z0-9_-]+$/.test(g.id) || ids.has(g.id)) throw Error('Invalid or duplicate group ID: '+g.id);
  ids.add(g.id);
  if (new Set(g.words.map(w=>w.word)).size!==g.words.length) throw Error('Duplicate words in '+g.id);
}
const version = crypto.createHash('sha256').update(source).digest('hex').slice(0,12);
const dataRoot = path.join(root,'data');
fs.mkdirSync(path.join(dataRoot,'groups'),{recursive:true});
for (const g of groups) fs.writeFileSync(path.join(dataRoot,'groups',g.id+'.json'),JSON.stringify(g)+'\n');
const manifest = makeManifest(groups,version);
fs.writeFileSync(path.join(dataRoot,'manifest.json'),JSON.stringify(manifest)+'\n');
fs.writeFileSync(path.join(dataRoot,'search-index.json'),JSON.stringify(makeSearchIndex(groups))+'\n');
console.log(JSON.stringify({version,groups:groups.length,words:manifest.totalWords,manifestBytes:fs.statSync(path.join(dataRoot,'manifest.json')).size}));
