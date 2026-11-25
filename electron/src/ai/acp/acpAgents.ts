// The program each agent starts to speak ACP. Main reads the choice from settings.json; a request from a window never
// names a program
import * as path from 'node:path';
import { splitCommandLine } from '../agentCommand';
import { PRESET_AGENTS, type PresetAgent } from '../agentChoice';

type Preset = {
	/** the agent's own program, found on PATH or in the folders under Toolchain */
	cli: string;
	/** an adapter shipped with Texpile that speaks ACP for a program that does not */
	adapter?: string;
	/** where the adapter is told the program is */
	cliEnv?: string;
	/** for a program that speaks ACP itself */
	args?: string[];
};

const PRESETS: Record<PresetAgent, Preset> = {
	codex: { cli: 'codex', adapter: 'codex-acp.mjs', cliEnv: 'CODEX_PATH' },
	claude: { cli: 'claude', adapter: 'claude-agent-acp.mjs', cliEnv: 'CLAUDE_CODE_EXECUTABLE' },
	opencode: { cli: 'opencode', args: ['acp'] },
	copilot: { cli: 'copilot', args: ['--acp'] },
	gemini: { cli: 'gemini', args: ['--acp'] }
};

export type AgentLaunch =
	| { ok: true; program: string; args: string[]; env: Record<string, string> }
	| { ok: false; reason: 'unset' }
	| { ok: false; reason: 'missing'; program: string };

export type LaunchContext = {
	findProgram(name: string): string | null;
	/** where the shipped adapters are */
	adapterDir: string;
	/** Electron itself, which runs an adapter as plain Node */
	execPath: string;
};

export function presetProgram(agent: PresetAgent): string {
	return PRESETS[agent].cli;
}

export function agentLaunch(choice: unknown, custom: unknown, cx: LaunchContext): AgentLaunch {
	if (choice === 'custom') {
		const argv = typeof custom === 'string' ? splitCommandLine(custom) : [];
		if (!argv.length) return { ok: false, reason: 'unset' };
		const program = cx.findProgram(argv[0]);
		return program ? { ok: true, program, args: argv.slice(1), env: {} } : { ok: false, reason: 'missing', program: argv[0] };
	}
	if (!PRESET_AGENTS.includes(choice as PresetAgent)) return { ok: false, reason: 'unset' };
	const preset = PRESETS[choice as PresetAgent];
	const cli = cx.findProgram(preset.cli);
	if (!cli) return { ok: false, reason: 'missing', program: preset.cli };
	if (!preset.adapter) return { ok: true, program: cli, args: preset.args ?? [], env: {} };
	return {
		ok: true,
		program: cx.execPath,
		args: [path.join(cx.adapterDir, preset.adapter)],
		env: { ELECTRON_RUN_AS_NODE: '1', [preset.cliEnv!]: cli }
	};
}
