import { it, expect } from 'vitest';
import * as path from 'node:path';
import { agentLaunch } from '../../../../../../electron/src/ai/acp/acpAgents';

const cx = {
	findProgram: (name: string) => (name === 'claude' || name === 'opencode' ? `/usr/bin/${name}` : null),
	adapterDir: '/app/agents',
	execPath: '/app/texpile'
};

it("runs a shipped adapter under Electron's own Node, pointed at the reader's own CLI", () => {
	expect(agentLaunch('claude', '', cx)).toEqual({
		ok: true,
		program: '/app/texpile',
		args: [path.join('/app/agents', 'claude-agent-acp.mjs')],
		env: { ELECTRON_RUN_AS_NODE: '1', CLAUDE_CODE_EXECUTABLE: '/usr/bin/claude' }
	});
	expect(agentLaunch('opencode', '', cx)).toEqual({ ok: true, program: '/usr/bin/opencode', args: ['acp'], env: {} });
	expect(agentLaunch('codex', '', cx)).toEqual({ ok: false, reason: 'missing', program: 'codex' });
	expect(agentLaunch('custom', 'opencode acp --port 0', cx)).toEqual({
		ok: true,
		program: '/usr/bin/opencode',
		args: ['acp', '--port', '0'],
		env: {}
	});
	expect(agentLaunch('/bin/sh', '', cx)).toEqual({ ok: false, reason: 'unset' });
});
