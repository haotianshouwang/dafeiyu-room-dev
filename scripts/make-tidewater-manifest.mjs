import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root = path.resolve('public/tidewater');
const files = [];
const walk = dir => {
  for (const entry of fs.readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (entry.name === '.DS_Store') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      const rel = path.relative(root, full).replaceAll('\\','/');
      if (rel === 'manifest.json') continue;
      let license = 'Tidewater upstream / asset-specific (see CREDITS.md)';
      if (rel === 'models/characters/dafeiyu.glb') license = 'Dafeiyu.glb - authorized first-party model (THIRD-PARTY-NOTICES.md)';
      if (rel === 'models/whale-skeleton/east_whale.glb') license = 'Petalwake MIT commit 25443ce; generated with Meshy/fal (THIRD-PARTY-NOTICES.md)';
      files.push({path: rel, bytes: fs.statSync(full).size, sha256: createHash('sha256').update(fs.readFileSync(full)).digest('hex'), license});
    }
  }
};
walk(root);
const manifest = {
  format: 1,
  project: 'Tidewater',
  source: 'https://github.com/dgreenheck/tidewater/tree/4811ba48d795197de5621985f404e765c0b7c0ef',
  files,
};
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${files.length} files, ${files.reduce((n,f)=>n+f.bytes,0)} bytes`);
