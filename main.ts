// SENJA EXPRESS — Island Courier Run: entrypoint program.
//
// This file is the program that hands the game in to make.fun. It runs on
// Node 22 with the standard library only, inside a fresh sandbox with no
// network, a read-only copy of the repository, and a writable /output.
// Its job is deliberately small and boring, because the grader runs it
// twice and demands byte-identical output both times:
//
//   1. Copy the whole game/ folder (plain static files: the HTML page, the
//      styles, the JavaScript modules, and the vendored Three.js build)
//      into /output/game.
//   2. Copy screenshots/ (the four real renders of the game) into
//      /output/screenshots, when the folder exists.
//   3. Write /output/dossier.json with buildDossier from the vendored
//      make.fun library, which summarises the game, its screenshots and
//      its source exactly the way the sealed scorer re-derives it.
//
// Nothing here fetches, generates, or rewrites anything: the game is
// already finished before this program runs, so the two runs agree byte
// for byte. Outside the grader, MAKEFUN_OUTPUT_DIR stands in for
// /output, so a local check is: mkdir -p out && MAKEFUN_OUTPUT_DIR=out
// node main.ts — then inspect out/ and compare two runs.
//
// The caps below mirror the scorer's own limits (see the competition's
// RULES.txt, gate section): at most 4 screenshots of 256 KiB, at most
// 993 files and 48 MiB under game/, and the dossier text capped at
// 160 KiB. Keeping the program inside those caps is what makes an entry
// valid; the game itself is judged on its screenshots and its source.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's caps: only text_max_bytes shapes the dossier's bytes; the
// rest refuse an entry the scorer would refuse (more than 4 screenshots
// or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files in all; a path under game/ over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
