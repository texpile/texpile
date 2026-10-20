<script lang="ts">
	import type { ChipSettingsProps } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
	import * as Panel from '$lib/editor/visual/extensions/drawnChips/panel';
	import { projectIntelStore } from '$lib/stores/projectIntel';
	import { templateFeaturesStore } from '$lib/stores/editorStore';
	import { DEFAULT_CROSS_REF_NAMES } from '../crossRefNames';
	import { crossRefText } from '../crossRefText';
	import { labelList, readCrossRef, writeCrossRef, type CrossRefCommand } from './crossRefCommand';
	import LabelField from './LabelField.svelte';
	import { m } from '$lib/paraglide/messages';

	const ALL = ['ref', 'eqref', 'pageref', 'cref', 'Cref', 'autoref', 'nameref'];
	// what each prints, in words: before a compile the editor knows only the label, so every result would read the same
	const DESCRIPTIONS: Record<string, () => string> = {
		ref: m.drawn_chip_ref_number,
		eqref: m.drawn_chip_ref_number_parens,
		pageref: m.drawn_chip_ref_page,
		cref: m.drawn_chip_ref_name_number,
		Cref: m.drawn_chip_ref_sentence_start,
		autoref: m.drawn_chip_ref_full_name,
		nameref: m.drawn_chip_ref_title
	};

	const props: ChipSettingsProps = $props();

	const command = $derived(readCrossRef(props.source));
	const labels = $derived(command ? labelList(command.labels) : []);
	const options = $derived.by((): Panel.PanelChoice[] => {
		const offered = templateFeaturesStore.current.refCommands ?? ALL;
		const intel = projectIntelStore.current;
		const aux = { numbers: intel.auxNumbers, pages: intel.auxPages, kinds: intel.auxKinds, titles: intel.auxTitles };
		const names = templateFeaturesStore.current.crossRefNames ?? DEFAULT_CROSS_REF_NAMES;
		// a paper already using a command keeps it on offer
		const commands = command && !offered.includes(command.name) ? [command.name, ...offered] : offered;
		return commands.map((name) => {
			const printed = crossRefText(name, labels, aux, names);
			return {
				value: name,
				label: DESCRIPTIONS[name]?.() ?? name,
				detail: printed.known ? printed.text : `\\${name}`,
				hint: `\\${name}`
			};
		});
	});
	const compiled = $derived(options.some((option) => !option.detail.startsWith('\\')));

	function write(next: Partial<CrossRefCommand>) {
		if (command) props.write(writeCrossRef(props.source, { ...command, ...next }, templateFeaturesStore.current.refStars));
	}
</script>

{#if command}
	<div class="flex flex-col gap-2">
		<Panel.Header title={m.drawn_chip_ref_title_reference()} command={`\\${command.name}${command.star ? '*' : ''}`} />
		<LabelField
			value={command.labels}
			view={props.view}
			oninput={(value) => {
				if (!/[{}]/.test(value)) write({ labels: value });
			}}
			onjump={() => {
				if (!labels[0]) return;
				// the panel goes first: the jump takes the page away from its chip
				props.close();
				props.jump(labels[0]);
			}}
		/>
		<span class="text-muted mt-1 text-xs">{m.drawn_chip_ref_shows_as()}</span>
		<Panel.Choices {options} selected={command.name} label={m.drawn_chip_ref_shows_as()} onpick={(name) => write({ name })} />
		{#if !compiled}
			<p class="text-muted text-xs">{m.drawn_chip_ref_compile_hint()}</p>
		{/if}
	</div>
{/if}
