import { Box, CircleAlert, Link2, Paintbrush, PenLine, SpellCheck, TriangleAlert } from '@lucide/svelte';
import type { Component } from 'svelte';
import { m } from '$lib/paraglide/messages';
import type { ProblemFilter } from '../problemTypes';

export type ProblemLook = { icon: Component<{ class?: string }>; ink: string; name: () => string };

export const PROBLEM_LOOKS: Record<ProblemFilter, ProblemLook> = {
	error: { icon: CircleAlert, ink: 'text-error-ink', name: m.problems_filter_error },
	warning: { icon: TriangleAlert, ink: 'text-warning-ink', name: m.problems_filter_warning },
	spelling: { icon: SpellCheck, ink: 'text-[var(--proof-correctness)]', name: m.problems_filter_spelling },
	grammar: { icon: PenLine, ink: 'text-[var(--proof-correctness)]', name: m.problems_filter_grammar },
	style: { icon: Paintbrush, ink: 'text-[var(--proof-clarity)]', name: m.problems_filter_style },
	reference: { icon: Link2, ink: 'text-[var(--ref-fg)]', name: m.problems_filter_reference },
	box: { icon: Box, ink: 'text-faint', name: m.problems_filter_box }
};
