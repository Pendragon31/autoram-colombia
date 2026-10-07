import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}
const built = await files('out');
const assets = built.filter(file => /\.(js|css|woff2?|ttf|png|svg|ico|webmanifest|pbf)$/.test(file) && !/\.map$/.test(file) && !/\bog\.(png|jpg)$/.test(file)).map(file => '/' + path.relative('out', file).split(path.sep).join('/'));
assets.push('/', '/mapas', '/maps/catalog.json');
const buildId = createHash('sha256').update(assets.join('\n')).update(await readFile('out/index.html')).digest('hex').slice(0, 16);
const template = await readFile('scripts/offline-worker.template.js', 'utf8');
await writeFile('out/sw.js', template.replace('__VERSION__', buildId).replace('__ASSETS__', JSON.stringify(assets)));
console.log(`Offline app shell: ${assets.length} public assets, version ${buildId}`);
