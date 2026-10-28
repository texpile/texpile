import { m } from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';
import type { AgentCommand, ContextUsage } from '../../agentPanel.types';

const CONTEXT_NEARLY_FULL = 0.8;
const COMPACT_COMMAND = 'compact';

export const COMPACT_CHAT_MESSAGE = `/${COMPACT_COMMAND}`;

export function contextShare(usage: ContextUsage): number {
	return Math.min(1, usage.used / usage.size);
}

export function isContextNearlyFull(usage: ContextUsage): boolean {
	return contextShare(usage) >= CONTEXT_NEARLY_FULL;
}

export function contextUsagePercent(usage: ContextUsage): string {
	return new Intl.NumberFormat(getLocale(), { style: 'percent' }).format(contextShare(usage));
}

function formatTokens(usage: ContextUsage): { used: string; size: string } {
	const tokens = new Intl.NumberFormat(getLocale(), { notation: 'compact', maximumFractionDigits: 1 });
	return { used: tokens.format(usage.used), size: tokens.format(usage.size) };
}

export function contextUsageTokens(usage: ContextUsage): string {
	return m.agent_panel_context_tokens(formatTokens(usage));
}

export function contextUsageLabel(usage: ContextUsage): string {
	return m.agent_panel_context({ percent: contextUsagePercent(usage), ...formatTokens(usage) });
}

export function compactBlockedReason(commands: AgentCommand[], working: boolean, agent: string): string | null {
	if (!commands.some((c) => c.name === COMPACT_COMMAND)) return m.agent_panel_compact_unavailable({ agent });
	return working ? m.agent_panel_compact_busy({ agent }) : null;
}
