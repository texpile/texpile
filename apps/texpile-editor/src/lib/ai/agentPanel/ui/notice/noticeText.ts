// what the tab says when the agent cannot talk: not signed in, not installed, not chosen, or stopped
import { m } from '$lib/paraglide/messages';
import type { AgentState } from '../../agentPanel.types';

export type AgentNoticeProps = {
	state: AgentState;
	agent: string;
	/** what to run in the terminal to sign in; null when unknown */
	signIn: string | null;
	program: string;
	detail: string;
	onOpenTerminal: () => void;
	onRetry: () => void;
};

type NoticeFacts = Pick<AgentNoticeProps, 'state' | 'agent' | 'program' | 'detail'>;

export function noticeTitle(n: NoticeFacts): string {
	if (n.state === 'signed-out') return m.agent_panel_signed_out({ agent: n.agent });
	if (n.state === 'missing') return m.agent_panel_missing({ agent: n.program || n.agent });
	if (n.state === 'unset') return m.agent_panel_unset();
	if (n.state === 'no-folder') return m.agent_panel_no_folder();
	return m.agent_panel_stopped({ agent: n.agent });
}

export function noticeNote(n: NoticeFacts): string {
	if (n.state === 'signed-out') return m.agent_panel_signed_out_note();
	if (n.state === 'missing') return m.agent_panel_missing_note();
	if (n.state === 'unset') return m.agent_panel_unset_note();
	if (n.state === 'no-folder') return '';
	return n.detail;
}
