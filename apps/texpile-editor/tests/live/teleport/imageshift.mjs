// How often a compile numbers the document's images anew: node tests/live/teleport/imageshift.mjs <folder> <main.tex> [rounds] [--page]
// Each round appends words to a prose line somewhere in the main file, compiles what is saved, and compares the
// compile's image list with the last one's. A changed list is what makes every waiting engine leave.
import fs from 'node:fs';
import path from 'node:path';
import { Gate, seeded } from './gate.mjs';

const [srcDir, mainFile, rounds = '10'] = process.argv.slice(2);
const rand = seeded(7);
const { gate: g, compiled } = await Gate.open(srcDir, mainFile, {});
if (!g) {
	console.log(JSON.stringify(compiled).slice(0, 300));
	process.exit(3);
}
function newestList() {
	const found = [];
	const draft = path.join(g.root, '_draft');
	for (const dir of fs.readdirSync(draft)) {
		const file = path.join(draft, dir, 'tele', 'images.lua');
		if (fs.existsSync(file)) found.push([fs.statSync(file).mtimeMs, file]);
	}
	found.sort((a, b) => b[0] - a[0]);
	return found[0] ? fs.readFileSync(found[0][1], 'utf8') : null;
}
const objects = (list) => [...(list ?? '').matchAll(/\bn\s*=\s*(\d+)/g)].map((m) => +m[1]);
let last = newestList();
console.log('images in the first compile:', objects(last).length, 'at objects', objects(last).join(' '));
let changed = 0;
for (let k = 0; k < +rounds; k++) {
	const lines = g.texts.get(mainFile).split('\n');
	const prose = lines.map((l, i) => [l, i]).filter(([l]) => l.length > 120 && !/^\s*[\\%]/.test(l) && !l.includes('&'));
	const [, at] = prose[rand(prose.length)];
	// every third round adds a line or two; with --page, enough text for most of a page
	const more = ' more words here to push the text along a line or two and move what follows';
	const words = k % 3 === 2 ? (process.argv.includes('--page') ? more.repeat(45) : more) : ' word';
	lines[at] += words;
	g.texts.set(mainFile, lines.join('\n'));
	const res = await g.compileSaved();
	const list = newestList();
	const same = list === last;
	if (!same) changed++;
	console.log(
		`${k + 1}. line ${at + 1} of ${lines.length}, +${words.length} chars: ${res.ok ? `${res.pages.length} pages` : 'compile failed'}, image list ${same ? 'the same' : 'CHANGED: ' + objects(list).join(' ')}`
	);
	last = list;
}
console.log(JSON.stringify({ rounds: +rounds, imageListChanged: changed }));
process.exit(0);
