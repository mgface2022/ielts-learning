const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

const root = path.join(__dirname, '..');
const src = path.join(root, 'assets', 'audio');
const dest = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'audio');
if (!fs.existsSync(src)) {
  console.error('missing', src);
  process.exit(1);
}
fs.rmSync(dest, { recursive: true, force: true });
copyDir(src, dest);
console.log('synced android assets audio');
