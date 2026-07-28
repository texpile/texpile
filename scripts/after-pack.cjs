// node-pty's prebuilt spawn-helper ships without the exec bit, which fails spawns with
// "posix_spawnp failed". electron-builder has no per-file mode option, so chmod +x every
// spawn-helper under the unpacked tree after packing (covers prebuilds/<arch> and build/Release).
const fs = require('fs');
const path = require('path');

function findFiles(root, predicate, out = []) {
	if (!fs.existsSync(root)) return out;
	for (const name of fs.readdirSync(root)) {
		const p = path.join(root, name);
		let st;
		try {
			st = fs.statSync(p);
		} catch {
			continue;
		}
		if (st.isDirectory()) findFiles(p, predicate, out);
		else if (predicate(p)) out.push(p);
	}
	return out;
}

exports.default = async function afterPack(context) {
	const { appOutDir, electronPlatformName, packager } = context;
	const resources =
		electronPlatformName === 'darwin'
			? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
			: path.join(appOutDir, 'resources');
	const unpacked = path.join(resources, 'app.asar.unpacked');

	const helpers = findFiles(unpacked, (p) => path.basename(p) === 'spawn-helper');
	for (const p of helpers) {
		fs.chmodSync(p, 0o755);
		console.log('after-pack: chmod 755', p);
	}
	if (!helpers.length) console.log('after-pack: no spawn-helper found under', unpacked);

	// prune OTHER platforms' node-pty prebuilds. This cannot live in per-platform `files` blocks:
	// a file set with only exclusions is implicitly '**/*' minus them, which once shipped the
	// whole repo in the asar. darwin keeps both arches (the universal merge needs them); linux
	// keeps none (it loads from build/Release).
	const prebuilds = path.join(unpacked, 'node_modules', 'node-pty', 'prebuilds');
	if (fs.existsSync(prebuilds)) {
		const keep = electronPlatformName === 'darwin' ? /^darwin-/ : electronPlatformName === 'win32' ? /^win32-/ : /$^/;
		for (const dir of fs.readdirSync(prebuilds)) {
			if (!keep.test(dir)) {
				fs.rmSync(path.join(prebuilds, dir), { recursive: true, force: true });
				console.log('after-pack: pruned prebuild', dir);
			}
		}
	}
};
