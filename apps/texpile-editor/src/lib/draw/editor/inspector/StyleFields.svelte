<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { ShapeStyle } from '../figure/figureLanguage';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import type { SelectionStyle } from '../state/selection/selectionStyle';
	import ChoiceField from './fields/ChoiceField.svelte';
	import ColorField from './fields/ColorField.svelte';
	import { dashLabel, widthLabel } from './styleLabels';

	const CORNERS = [
		{ value: 'sharp', label: m.figure_style_sharp() },
		{ value: 'rounded', label: m.figure_style_rounded() }
	];

	type Props = { editor: FigureEditorState; shown: SelectionStyle; onpick: (change: Partial<ShapeStyle>) => void };
	const props: Props = $props();

	const choices = $derived(props.editor.language.styleChoices);
	const widthOptions = $derived(choices.widths.map((w) => ({ value: w, label: widthLabel(w) })));
	const dashOptions = $derived(choices.dashes.map((d) => ({ value: d, label: dashLabel(d) })));
	const opacityOptions = $derived(choices.opacities.map((o) => ({ value: o, label: `${o}%` })));
	const fields = $derived(props.shown.fields);
	const targets = $derived(props.shown.targets);
	const nodes = $derived([...targets].every((t) => t === 'node'));

	// a field the shapes disagree on shows no value until one is picked
	function valueOf<K extends keyof ShapeStyle>(key: K) {
		return props.shown.mixed.has(key) ? null : props.shown.style[key];
	}
</script>

{#if fields.stroke}
	<ColorField
		label={nodes ? m.figure_style_border() : m.figure_style_stroke()}
		value={valueOf('stroke')}
		mixed={props.shown.mixed.has('stroke')}
		allowNone={[...targets].every((t) => t === 'node' || t === 'path')}
		colors={choices.colors}
		onpick={(c) => props.onpick({ stroke: c })}
	/>
{/if}
{#if fields.fill}
	<ColorField
		label={nodes ? m.figure_style_background() : m.figure_style_fill()}
		value={valueOf('fill')}
		mixed={props.shown.mixed.has('fill')}
		allowNone={!targets.has('fill')}
		colors={choices.colors}
		onpick={(c) => props.onpick({ fill: c })}
	/>
{/if}
{#if fields.text}
	<ColorField
		label={m.figure_style_text()}
		value={valueOf('textColor')}
		mixed={props.shown.mixed.has('textColor')}
		allowNone={false}
		colors={choices.colors}
		onpick={(c) => props.onpick({ textColor: c })}
	/>
	<ChoiceField
		label={m.figure_style_text_size()}
		options={choices.textSizes}
		value={valueOf('textSize')}
		onpick={(s) => props.onpick({ textSize: s })}
	/>
{/if}
{#if fields.width}
	<ChoiceField
		label={m.figure_style_line_width()}
		options={widthOptions}
		value={valueOf('width')}
		onpick={(w) => props.onpick({ width: w })}
	/>
{/if}
{#if fields.dash}
	<ChoiceField label={m.figure_style_dash()} options={dashOptions} value={valueOf('dash')} onpick={(d) => props.onpick({ dash: d })} />
{/if}
{#if fields.corners}
	<ChoiceField
		label={m.figure_style_corners()}
		options={CORNERS}
		value={valueOf('corners')}
		onpick={(c) => props.onpick({ corners: c as 'sharp' | 'rounded' })}
	/>
{/if}
{#if fields.opacity && opacityOptions.length}
	<ChoiceField
		label={m.figure_style_opacity()}
		options={opacityOptions}
		value={valueOf('opacity')}
		onpick={(o) => props.onpick({ opacity: o })}
	/>
{/if}
{#if fields.arrows}
	<ChoiceField
		label={m.figure_style_arrows()}
		options={choices.arrows}
		value={valueOf('arrows')}
		onpick={(a) => props.onpick({ arrows: a })}
	/>
{/if}
