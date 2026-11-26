// The command lines Claude Code and Codex are kept running with, and a custom agent's split into words. The prompt always
// goes on stdin, so nothing the reader wrote ever becomes part of a command line

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

// Codex's notes on the sandbox and folder go, and so do the features that hand it tools: a rewrite calls none, and
// describing them was most of every request. Settings with -c, which a version lacking one passes over
const CODEX_QUIET = [
	'include_environment_context=false',
	'include_permissions_instructions=false',
	'include_apps_instructions=false',
	...CODEX_TOOL_FEATURES.map((feature) => `features.${feature}=false`)
];

/** Claude Code kept running between requests: its rules in system.txt, a turn at a time in stream JSON */
export function claudeWarmArgs(model: string, effort: string): string[] {
	return [
		...(model ? [`--model=${model}`] : []),
		...(effort ? ['--effort', effort] : []),
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

/** Codex's app server, quiet; each thread brings its own rules and model */
export const CODEX_WARM_ARGS = ['app-server', '--listen', 'stdio://', ...CODEX_QUIET.flatMap((setting) => ['-c', setting])];

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
