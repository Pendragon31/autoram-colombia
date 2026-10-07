// Produce our own regional copies. Never prefetch the OSM/CARTO tile servers.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
const run = promisify(execFile);
const regions = JSON.parse(await readFile('data/map-regions.json', 'utf8'));
const root = 'public/maps';
await mkdir(root, { recursive: true });
const cliRoot = path.join(tmpdir(), 'autoram-pmtiles-1.31.2');
await mkdir(cliRoot, { recursive: true });
const cli = path.join(cliRoot, 'pmtiles');
const sha = buffer => createHash('sha256').update(buffer).digest('hex');
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`Map build download failed: ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
try { await stat(cli); } catch {
  const archive = await download('https://github.com/protomaps/go-pmtiles/releases/download/v1.31.2/go-pmtiles_1.31.2_Linux_x86_64.tar.gz');
  if (sha(archive) !== '3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f') throw new Error('PMTiles CLI checksum mismatch');
  await writeFile(path.join(cliRoot, 'cli.tar.gz'), archive);
  await run('tar', ['--no-same-owner', '-xzf', path.join(cliRoot, 'cli.tar.gz'), '-C', cliRoot, 'pmtiles']);
}
const source = 'https://data.source.coop/protomaps/openstreetmap/v4.pmtiles';
const catalog = [];
// At most two extracts concurrently; each CLI has two download workers.
for (let i = 0; i < regions.length; i += 2) {
  const entries = await Promise.all(regions.slice(i, i + 2).map(async region => {
    const file = `${root}/${region.id}.pmtiles`;
    try { await stat(file); } catch {
      console.log(`Preparing map: ${region.name}`);
      await run(cli, ['extract', source, file, `--bbox=${region.bounds.join(',')}`, `--maxzoom=${region.maxZoom}`, '--download-threads=2', '--quiet'], { timeout: 240_000, maxBuffer: 1_000_000 });
    }
    const content = await readFile(file);
    if (content.subarray(0, 7).toString() !== 'PMTiles' || content[7] !== 3 || content.length < 127) throw new Error(`Invalid regional map: ${region.id}`);
    const metadata = { ...region, path: `/maps/${region.id}.pmtiles`, bytes: content.length, sha256: sha(content) };
    console.log(`${region.name}: ${(content.length / 1048576).toFixed(1)} MB`);
    return metadata;
  }));
  catalog.push(...entries);
}
for (const range of ['0-255', '256-511']) {
  const dir = `${root}/fonts/Noto Sans Regular`;
  await mkdir(dir, { recursive: true });
  const file = `${dir}/${range}.pbf`;
  try { await stat(file); } catch {
    await writeFile(file, await download(`https://protomaps.github.io/basemaps-assets/fonts/Noto%20Sans%20Regular/${range}.pbf`));
  }
}
try { await stat(`${root}/fonts/OFL.txt`); } catch { await writeFile(`${root}/fonts/OFL.txt`, await download('https://raw.githubusercontent.com/notofonts/latin-greek-cyrillic/main/OFL.txt')); }
await writeFile(`${root}/catalog.json`, JSON.stringify({ version: 1, preparedAt: new Date().toISOString(), source, regions: catalog }));
await writeFile(`${root}/README.txt`, 'Basemap produced by Protomaps from OpenStreetMap. Open Database License produced work. Attribution: © OpenStreetMap contributors. https://www.openstreetmap.org/copyright\nFont: Noto Sans, SIL Open Font License. https://github.com/notofonts/latin-greek-cyrillic\n');
