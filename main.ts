// main.ts — the AZAHAR HEAT hand-in program.
//
// What it does, in order:
//   1. resolves the output directory (MAKEFUN_OUTPUT_DIR, else argv[2], else ./out)
//   2. empties it, then copies this repo's game/ and screenshots/ into it
//   3. builds the entry dossier with the vendored make.fun library under the
//      gta6-01 gate caps and writes it as <output>/dossier.json
//   4. prints a receipt: what was copied and exactly how big the dossier is
//
// Run it the way the bounty does:
//   MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

/** The gta6-01 gate caps, mirrored so this program refuses where the scorer would. */
const GATE_CAPS = {
  text_max_bytes: 163_840,
  screenshots: { max: 4, max_bytes: 262_144 },
  game_max_files: 993,
  game_max_bytes: 50_331_648,
  game_path_max_bytes: 1_000,
} as const;

const entryDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const outputDir = resolve(
  process.env.MAKEFUN_OUTPUT_DIR ?? process.argv[2] ?? join(entryDir, 'out'),
);

/** Every file under a directory, as paths relative to it, sorted. */
function listFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(full.slice(base.length + 1));
  }
  return out;
}

function requirePath(path: string, what: string): void {
  if (!existsSync(path)) throw new Error(`hand-in: missing ${what} at ${path}`);
}

function main(): void {
  const gameDir = join(entryDir, 'game');
  const shotsDir = join(entryDir, 'screenshots');
  requirePath(join(gameDir, 'index.html'), 'game/index.html');
  requirePath(shotsDir, 'screenshots/');

  const shotNames = readdirSync(shotsDir)
    .filter((n) => /\.(png|jpe?g)$/i.test(n))
    .sort();
  if (shotNames.length < 3 || shotNames.length > GATE_CAPS.screenshots.max) {
    throw new Error(`hand-in: screenshots/ must hold 3-4 images, found ${shotNames.length}`);
  }
  for (const name of shotNames) {
    const bytes = statSync(join(shotsDir, name)).size;
    if (bytes > GATE_CAPS.screenshots.max_bytes) {
      throw new Error(`hand-in: screenshot ${name} is ${bytes} bytes, over the ${GATE_CAPS.screenshots.max_bytes} cap`);
    }
  }

  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
  cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });

  const gameFiles = listFiles(join(outputDir, 'game'));
  const dossier = buildDossier(outputDir, GATE_CAPS);
  writeFileSync(join(outputDir, 'dossier.json'), dossier);

  // Read the dossier back and prove it parses before calling this a hand-in:
  // the scorer compares bytes, so a malformed write must fail loudly here.
  const parsed = JSON.parse(readFileSync(join(outputDir, 'dossier.json'), 'utf8')) as {
    schema?: string;
    text?: string;
    images?: unknown[];
  };
  if (parsed.schema !== 'makefun/dossier/v1') {
    throw new Error(`hand-in: unexpected dossier schema ${String(parsed.schema)}`);
  }
  const imageCount = Array.isArray(parsed.images) ? parsed.images.length : 0;
  const textBytes = typeof parsed.text === 'string' ? Buffer.byteLength(parsed.text, 'utf8') : 0;

  console.log(`AZAHAR HEAT — hand-in for make.fun gta6-01`);
  console.log(`  game/        ${gameFiles.length} files copied`);
  console.log(`  screenshots/ ${shotNames.length} images: ${shotNames.join(', ')}`);
  console.log(`  dossier.json ${dossier.byteLength} bytes -> ${join(outputDir, 'dossier.json')}`);
  console.log(`  verified:    schema ${parsed.schema}, ${imageCount} embedded images, source text ${textBytes} of ${GATE_CAPS.text_max_bytes} bytes`);
}

main();
