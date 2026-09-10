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

	if (electronPlatformName === 'win32' && packager.config.extraMetadata?.portable === true) {
		const publish = Array.isArray(packager.config.publish) ? packager.config.publish[0] : packager.config.publish;
		const feed = [
			`provider: ${publish.provider}`,
			`url: ${publish.url}`,
			`useMultipleRangeRequest: ${publish.useMultipleRangeRequest !== false}`,
			`updaterCacheDirName: ${packager.appInfo.name}-updater`,
			''
		].join('\n');
		fs.writeFileSync(path.join(resources, 'app-update.yml'), feed);
		console.log('after-pack: wrote app-update.yml for the portable build');
	}

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
	//
	// NOT on a universal build's per-arch staging dirs. asarUnpack records node-pty in the asar
	// INDEX while the bytes live in app.asar.unpacked, so deleting the bytes here leaves the index
	// pointing at files that are gone. Nothing reads those entries on a single-arch build, but
	// mergeASARs walks every entry of both asars and extracts it, so the universal merge died on
	// the first pruned file (ENOENT on win32-arm64/conpty.node).
	//
	// macPackager stages the two arches in `${appOutDir}-${arch}-temp`, merges them, and then runs
	// this hook AGAIN on the merged app -- so skipping the temps still prunes, just once, after the
	// only step that needed the files to be there.
	const prebuilds = path.join(unpacked, 'node_modules', 'node-pty', 'prebuilds');
	if (appOutDir.endsWith('-temp')) {
		console.log('after-pack: staging dir for a universal merge, leaving prebuilds for mergeASARs');
	} else if (fs.existsSync(prebuilds)) {
		const keep = electronPlatformName === 'darwin' ? /^darwin-/ : electronPlatformName === 'win32' ? /^win32-/ : /$^/;
		for (const dir of fs.readdirSync(prebuilds)) {
			if (!keep.test(dir)) {
				fs.rmSync(path.join(prebuilds, dir), { recursive: true, force: true });
				console.log('after-pack: pruned prebuild', dir);
			}
		}
	}
};
