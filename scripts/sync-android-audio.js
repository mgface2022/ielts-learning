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
const assetsDir = path.join(root, 'android', 'app', 'src', 'main', 'assets');

// 音频：原生 MediaPlayer（桌面小组件后台播放）和 JS 端 expo-audio 都从这里读
const audioSrc = path.join(root, 'assets', 'audio');
const audioDest = path.join(assetsDir, 'audio');
if (!fs.existsSync(audioSrc)) {
  console.error('missing', audioSrc);
  process.exit(1);
}
fs.rmSync(audioDest, { recursive: true, force: true });
copyDir(audioSrc, audioDest);

// 文章目录：桌面小组件需要在原生侧知道文章顺序、标题和音频路径
const catalogSrc = path.join(root, 'assets', 'articles.json');
if (!fs.existsSync(catalogSrc)) {
  console.error('missing', catalogSrc);
  process.exit(1);
}
fs.mkdirSync(assetsDir, { recursive: true });
fs.copyFileSync(catalogSrc, path.join(assetsDir, 'articles.json'));

console.log('synced android assets: audio + articles.json');
