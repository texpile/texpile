// The command line for the agent the reader picked in Preferences. The prompt always goes on stdin, so nothing the
// reader wrote ever becomes part of a command line

/** the agents Texpile knows how to run, and to ask for their models */
export type PresetAgent = 'claude' | 'codex' | 'agy';
export type AgentChoice = PresetAgent | 'custom';

export const PRESET_AGENTS: PresetAgent[] = ['claude', 'codex', 'agy'];

/** where an agent that writes its answer to a file (rather than stdout) is told to put it */
export const ANSWER_FILE = '{answer}';
/** a file holding the rules of the task, for an agent that takes them in place of its own instructions. Written into the
 * run's folder, which the agent runs in, so the name alone reaches it and no path needs quoting */
export const SYSTEM_FILE = '{system}';

const CODEX_TOOL_FEATURES = [
	'shell_tool',
	'unified_exec',
	'view_image',
	'multi_agent',
	'image_generation',
	'browser_use',
	'computer_use',
	'plugins',
	'apps',
	'skill_search',
	'tool_suggest',
	'sleep_tool',
	'goals'
];

// Codex's instructions are replaced by the rules (experimental_instructions_file is the older name), its notes on the
// sandbox and folder go, and so do the features that hand it tools: a rewrite calls none, and describing them was most
// of every request. Settings with -c, which a version lacking one passes over
const CODEX_QUIET = [
	'include_environment_context=false',
	'include_permissions_instructions=false',
	'include_apps_instructions=false',
	...CODEX_TOOL_FEATURES.map((feature) => `features.${feature}=false`)
];
const CODEX_SETTINGS = [`model_instructions_file='${SYSTEM_FILE}'`, `experimental_instructions_file='${SYSTEM_FILE}'`, ...CODEX_QUIET];

const PRESETS: Record<PresetAgent, string[]> = {
	// no tools and none of the reader's MCP servers: a rewrite needs neither, and each slows the start. Its own system
	// prompt is a coding agent's, three times the size of a request. Not --bare, which never reads the sign-in
	claude: [
		'claude',
		'-p',
		'--tools',
		'',
		'--strict-mcp-config',
		'--no-session-persistence',
		'--output-format',
		'text',
		'--system-prompt-file',
		SYSTEM_FILE
	],
	// "-" reads the prompt from stdin; the last message goes to a file. The sandbox is named because exec otherwise takes
	// the reader's config, and --ephemeral keeps these runs out of their saved sessions
	codex: [
		'codex',
		'exec',
		'--skip-git-repo-check',
		'--ephemeral',
		'--sandbox',
		'read-only',
		'--output-last-message',
		ANSWER_FILE,
		...CODEX_SETTINGS.flatMap((setting) => ['-c', setting]),
		'-'
	],
	// one JSON message per turn on stdin (agentStdio.ts): Antigravity drops a prompt given on its command line. Slash
	// commands are off, or a passage whose line begins with one would be read as a command of its own
	agy: ['agy', '--input-format', 'stream-json', '--output-format', 'stream-json', '--disable-slash-commands']
};

/** Claude Code kept running between requests: its rules in system.txt, a turn at a time in stream JSON */
export function claudeWarmArgs(model: string): string[] {
	return [
		...(model ? [`--model=${model}`] : []),
		'-p',
		'--input-format',
		'stream-json',
		'--output-format',
		'stream-json',
		'--verbose',
		'--tools',
		'',
		'--strict-mcp-config',
		'--no-session-persistence',
		'--system-prompt-file',
		'system.txt'
	];
}

/** Codex's app server, quiet in the same ways as a run; each thread brings its own rules and model */
export const CODEX_WARM_ARGS = ['app-server', '--listen', 'stdio://', ...CODEX_QUIET.flatMap((setting) => ['-c', setting])];

/** where --model goes: Codex takes it after exec, which has options of its own */
const MODEL_AT: Record<PresetAgent, number> = { claude: 1, codex: 2, agy: 1 };

/** a command line split the way a shell splits words, quotes holding spaces together, without running a shell */
export function splitCommandLine(line: string): string[] {
	const out: string[] = [];
	let word = '';
	let quote: string | null = null;
	let started = false;
	for (const ch of line) {
		if (quote) {
			if (ch === quote) quote = null;
			else word += ch;
		} else if (ch === '"' || ch === "'") {
			quote = ch;
			started = true;
		} else if (/\s/.test(ch)) {
			if (started) out.push(word);
			word = '';
			started = false;
		} else {
			word += ch;
			started = true;
		}
	}
	if (started) out.push(word);
	return out;
}

/** the program and its arguments, or null when no agent is set. A custom command names its own model */
export function agentArgv(choice: unknown, custom: unknown, model?: unknown): string[] | null {
	if (PRESET_AGENTS.includes(choice as PresetAgent)) {
		const argv = [...PRESETS[choice as PresetAgent]];
		// one word with "=", so a model name can never read as a flag of its own
		if (typeof model === 'string' && model) argv.splice(MODEL_AT[choice as PresetAgent], 0, `--model=${model}`);
		return argv;
	}
	if (choice !== 'custom' || typeof custom !== 'string') return null;
	const argv = splitCommandLine(custom);
	return argv.length ? argv : null;
}
