// PATH with extra folders in front of it, for a child process
/**
 * `base` with `dirs` in front of PATH: a folder the user listed beats a stale copy the system PATH
 * holds. `last` puts them behind it instead, for a fallback that must not shadow anything.
 */
export function withPathDirs(base: NodeJS.ProcessEnv, dirs: (string | null | undefined)[], last = false): NodeJS.ProcessEnv {
	const clean = dirs.filter((d): d is string => !!d && d.trim().length > 0);
	if (!clean.length) return { ...base };

	const sep = process.platform === 'win32' ? ';' : ':';
	const env = { ...base };
	// Windows spells it Path and reads it case-insensitively: reuse the key, or the child sees two
	const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
	const current = env[key] ?? '';
	const existing = current.split(sep).filter(Boolean);

	// don't grow PATH on every spawn: a directory already on it keeps its position
	const seen = new Set(existing.map((p) => (process.platform === 'win32' ? p.toLowerCase() : p)));
	const added = clean.filter((d) => !seen.has(process.platform === 'win32' ? d.toLowerCase() : d));
	if (!added.length) return env;

	env[key] = (last ? [...existing, ...added] : [...added, ...existing]).join(sep);
	return env;
}
