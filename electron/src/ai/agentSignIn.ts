// an agent's own error for a missing or expired sign-in, said as what to do
import type { AiAgent } from './agentChoice';

const SIGNED_OUT =
	/\/login|\blog ?in\b|\bsign ?in\b|not logged|unauthori[sz]ed|\b401\b|authenticat|invalid api key|api key|credentials|oauth token/i;

const SIGN_IN: Record<AiAgent, string> = {
	claude: 'Sign in to Claude Code. Run claude in a terminal and type /login.',
	codex: 'Sign in to Codex. Run codex login in a terminal.',
	opencode: 'Sign in to OpenCode. Run opencode auth login in a terminal.',
	gemini: 'Sign in to Gemini. Run gemini in a terminal and pick a way to sign in.',
	copilot: 'Sign in to Copilot. Run copilot in a terminal and type /login.',
	custom: 'Sign in to the agent. Run its command in a terminal to sign in.'
};

export function signInError(agent: AiAgent, error: string): string | null {
	return SIGNED_OUT.test(error) ? SIGN_IN[agent] : null;
}
