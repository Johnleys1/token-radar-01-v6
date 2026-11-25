// Size Curve Radar — token-radar-01 v6 entry program (Node 22, standard library only).
//
// Reads the sealed snapshot, fits the pooled log-log size curve on the token
// protocols, tests every extra term on two blind tests, ranks the pre-token
// protocols by fitted implied value, prices a farm plan for every board row,
// and writes board.json, data.js, the dashboard, the screenshots and the
// dossier the judge reads.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|dir>
//
// The grader mounts the sealed snapshot at /input and takes /output. Nothing
// here touches the network, the clock, or Math.random, so two runs of the same
// input produce byte-identical output.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from './lib/curve.ts';
import { boardIssue, buildRadar, dataScript } from './lib/board.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read `--name value` or `--name=value` from the arguments, else the fallback. */
function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1] as string;
  const joined = process.argv.find((a) => a.startsWith(`--${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`size curve radar: ${message}\n`);
  process.exit(1);
}

const inputGiven = flag('input', '/input');
const inputFile = inputGiven.endsWith('.json') ? inputGiven : join(inputGiven, 'snapshot.json');
if (!existsSync(inputFile)) {
  fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`);
}
const outDir = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const radar = buildRadar(snapshot);
const issue = boardIssue(radar, snapshot);
if (issue !== null) fail(`the board fails its own gate check: ${issue}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: radar.rows })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar, snapshot));

/** Copy a directory's regular files, skipping dot-names, into `to`. */
function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    names.push(name);
  }
  return names;
}

const dashFiles = copyDir(join(here, 'dashboard'), join(outDir, 'dashboard'));
const shots = copyDir(join(here, 'screenshots'), join(outDir, 'screenshots'));
if (shots.length < 3) {
  fail(`screenshots/ holds ${shots.length} image(s): hand in 3 — the board, a detail view and a filtered view`);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}

// The dossier is written last: the scorer rebuilds it from this output and compares bytes.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: SCREENSHOT_CAPS,
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

const v = radar.validation;
process.stdout.write(
  `size curve radar: ${radar.counts.protocols} protocols (${radar.counts.live} live, ${radar.counts.preToken} pre-token), watchlist ${radar.counts.watchlistCovered}/${radar.counts.watchlist}\n` +
    `size curve radar: ${radar.modelLine}\n` +
    `size curve radar: walk-forward curve ${Math.round(v.walkForward.curveHit * 1000) / 10}% vs flat ${Math.round(v.walkForward.flatHit * 1000) / 10}% (edge x${v.walkForward.hitRatio.toFixed(2)}), ` +
    `leave-one-out curve ${Math.round(v.leaveOneOut.curveHit * 1000) / 10}% vs flat ${Math.round(v.leaveOneOut.flatHit * 1000) / 10}% (edge x${v.leaveOneOut.hitRatio.toFixed(2)})\n` +
    `size curve radar: terms kept: ${v.keptTerms.length === 0 ? 'none — pure size curve' : v.keptTerms.join(', ')}\n` +
    `size curve radar: wrote ${radar.rows.length} rows to ${join(outDir, 'board.json')}, dashboard (${dashFiles.length} files), ${shots.length} screenshots and ${join(outDir, 'dossier.json')}\n`,
);
