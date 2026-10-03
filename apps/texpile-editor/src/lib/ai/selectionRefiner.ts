// Refine: the selected text rewritten by the reader's own agent, landing as a suggestion by that agent
import { box } from '$lib/runes/box.svelte';
import { settings } from '$lib/settings';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { buildAnchor, dialectOfPath } from '$lib/comments/anchor';
import { resolveExactly } from '$lib/comments/anchorSearch';
import { projectIntelStore } from '$lib/stores/projectIntel';
import type { SourceEdit } from '$lib/workspace/suggestionsController';
import { agentEditProblem, knownCiteKeys } from './agentEditGuard';
import { contextAround, refinedText, refinePrompt } from './refinePrompt';
import type { RefineAction } from './refineActions';
import { refineAgentsOffered } from './refineAgents.svelte';

type AgentBridge = {
	run(
		id: string,
		prompt: string,
		system: string,
		agent: RefineAgent
	): Promise<{ ok: true; text: string } | { ok: false; error: string; cancelled?: true }>;
	cancel(id: string): void;
	detect(): Promise<Record<PresetAgent, boolean>>;
	models(agent: PresetAgent): Promise<AgentModelList>;
};

/** the agents with a preset command line, which can list their models */
export type PresetAgent = 'claude' | 'codex' | 'agy';
export const PRESET_AGENTS: PresetAgent[] = ['claude', 'codex', 'agy'];

export function isPresetAgent(v: string): v is PresetAgent {
	return PRESET_AGENTS.includes(v as PresetAgent);
}

/** a preset, or the reader's own command line */
export type RefineAgent = PresetAgent | 'custom';

/** id '' is the agent's own default */
export type AgentModel = { id: string; name: string; description: string };
export type AgentModelList = { ok: true; models: AgentModel[] } | { ok: false; error: string };

export function agentBridge(): AgentBridge | undefined {
	return (globalThis as { texpileAgent?: AgentBridge }).texpileAgent;
}

export type RefinerDeps = {
	/** the selection as a span of the open file's text, or null when it cannot be mapped to one */
	selection(): { from: number; to: number } | null;
	activeText(): string;
	path(): string | null;
	/** false wherever no suggestion can be recorded: a guest, a single file, a hosted session */
	canSuggest(): boolean;
	suggestAs(by: string, edit: SourceEdit, note: string): Promise<string | null>;
	reveal(id: string): void;
};

/** the agent's name as the suggestion's author */
export function agentName(agent: RefineAgent): string {
	if (agent === 'claude') return 'Claude';
	if (agent === 'codex') return 'Codex';
	if (agent === 'agy') return 'Antigravity';
	const { aiAgentCommand } = settings.current;
	// the program a custom command runs, without its folder or extension
	const program =
		aiAgentCommand
			.trim()
			.replace(/^["']/, '')
			.split(/["'\s]/)[0] ?? '';
	return (
		program
			.split(/[\\/]/)
			.pop()
			?.replace(/\.(exe|cmd|bat)$/i, '') || 'AI agent'
	);
}

export class SelectionRefiner {
	private running: string | null = null;

	constructor(private deps: RefinerDeps) {}

	get available(): boolean {
		return refineAgentsOffered().length > 0 && !!agentBridge() && this.deps.canSuggest();
	}

	get busy(): boolean {
		return this.running !== null;
	}

	async refine(action: RefineAction, by: RefineAgent): Promise<void> {
		const bridge = agentBridge();
		if (!bridge || this.running) return;
		const agent = agentName(by);
		const span = this.deps.selection();
		if (!span) {
			toaster.info({ title: m.ai_refine_no_span(), duration: 5000 });
			return;
		}
		const text = this.deps.activeText();
		const dialect = dialectOfPath(this.deps.path() ?? '');
		const passage = text.slice(span.from, span.to);
		const anchor = buildAnchor(text, span.from, span.to);
		const { system, request } = refinePrompt({
			ask: action.ask,
			path: this.deps.path() ?? '',
			passage,
			...contextAround(text, span.from, span.to, action.context)
		});
		const id = crypto.randomUUID();
		this.running = id;
		const toast = toaster.create({
			type: 'loading',
			title: m.ai_refine_running({ agent }),
			duration: Infinity,
			action: { label: m.ai_refine_cancel(), onClick: () => bridge.cancel(id) }
		});
		try {
			const answer = await bridge.run(id, request, system, by);
			toaster.dismiss(toast);
			if (!answer.ok) {
				if (!answer.cancelled) toaster.error({ title: m.ai_refine_failed({ agent }), description: answer.error });
				return;
			}
			const replacement = refinedText(answer.text, passage);
			if (replacement === passage) return void toaster.info({ title: m.ai_refine_unchanged({ agent }), duration: 5000 });
			const now = this.deps.activeText();
			// the reader may have typed on while the agent worked; its answer only fits the words it was given
			const at = resolveExactly(now, anchor);
			if (!at) return void toaster.info({ title: m.ai_refine_moved({ agent }), duration: 6000 });
			const problem = agentEditProblem(
				dialect,
				passage,
				replacement,
				knownCiteKeys(
					now,
					projectIntelStore.current.bibEntries.map((e) => e.key)
				)
			);
			if (problem) {
				const description =
					'invented' in problem
						? m.ai_refine_invented({ keys: problem.invented.join(', ') })
						: m.ai_refine_lost_label({ labels: problem.lost.join(', ') });
				return void toaster.error({ title: m.ai_refine_refused({ agent }), description });
			}
			const made = await this.deps.suggestAs(agent, { from: at.from, to: at.to, insert: replacement }, action.label());
			if (made) this.deps.reveal(made);
			else toaster.error({ title: m.ai_refine_not_made() });
		} finally {
			toaster.dismiss(toast);
			this.running = null;
		}
	}
}

/** the open workspace's refiner, for the right-click menus; null while no folder is open */
export const refiner = box<SelectionRefiner | null>(null);
