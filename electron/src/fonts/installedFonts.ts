import { execFile } from 'node:child_process';

function sortedFamilies(names: Iterable<string>): string[] {
	const seen = new Set<string>();
	for (const raw of names) {
		const name = raw.trim();
		if (name && !name.startsWith('.') && !name.startsWith('@')) seen.add(name);
	}
	return [...seen].sort((a, b) => a.localeCompare(b));
}

/** `fc-list : family` prints one font per line; a font with localized names lists them comma separated, primary first */
export function parseFcList(text: string): string[] {
	return sortedFamilies(text.split(/\r?\n/).map((line) => line.split(',')[0]));
}

/** one family per line */
export function parseFamilyLines(text: string): string[] {
	return sortedFamilies(text.split(/\r?\n/));
}

/** `atsutil fonts -list`: the font names, then the families under `System Families:`, one per indented line */
export function parseAtsutil(text: string): string[] {
	const at = text.indexOf('System Families:');
	return at < 0 ? [] : parseFamilyLines(text.slice(at + 'System Families:'.length));
}

function run(file: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(file, args, { maxBuffer: 64 * 1024 * 1024, windowsHide: true, encoding: 'utf8' }, (err, stdout) =>
			err ? reject(err) : resolve(stdout)
		);
	});
}

const WINDOWS_SCRIPT =
	'[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;Add-Type -AssemblyName System.Drawing;' +
	'(New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }';

async function listFamilies(): Promise<string[]> {
	if (process.platform === 'win32') {
		return parseFamilyLines(await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SCRIPT]));
	}
	// system_profiler lists the same families in about 11 s; atsutil in under 0.1 s
	if (process.platform === 'darwin') return parseAtsutil(await run('/usr/bin/atsutil', ['fonts', '-list']));
	return parseFcList(await run('fc-list', [':', 'family']));
}

let cached: Promise<string[]> | null = null;

/** the font families installed on this computer; read once per launch, on the first call */
export function installedFonts(): Promise<string[]> {
	cached ??= listFamilies().catch((e: unknown) => {
		cached = null;
		throw e;
	});
	return cached;
}
