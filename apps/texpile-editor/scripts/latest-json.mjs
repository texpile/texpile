// Emit the latest.json release manifest that release.yml uploads to R2 (and the updates worker
// serves): version + download file paths + notes from the newest CHANGELOG.md entry. Run in CI
// at tag time so the notes ride with the binary they describe.
//   node apps/texpile-editor/scripts/latest-json.mjs > dist/latest.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { latestReleased } from './changelog.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const entry = latestReleased();
const notes = entry?.version === version ? entry.notes : undefined;

const manifest = {
	version,
	publishedAt: new Date().toISOString(),
	files: {
		windows: `v${version}/Texpile-Setup-${version}.exe`,
		windowsPortable: `v${version}/Texpile-${version}-portable.zip`,
		mac: `v${version}/Texpile-${version}.dmg`,
		linuxAppImage: `v${version}/Texpile-${version}.AppImage`,
		linuxDeb: `v${version}/texpile-${version}.deb`
	},
	...(notes && notes.length ? { notes } : {})
};
console.log(JSON.stringify(manifest, null, '\t'));
