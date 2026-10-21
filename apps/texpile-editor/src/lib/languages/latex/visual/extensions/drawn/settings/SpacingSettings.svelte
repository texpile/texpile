<script lang="ts">
	import type { ChipSettingsProps } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
	import * as Panel from '$lib/editor/visual/extensions/drawnChips/panel';
	import {
		AMOUNT,
		HORIZONTAL_NAMED,
		NAMED_LENGTHS,
		SPACING_UNITS,
		VERTICAL_NAMED,
		readSpacing,
		writeSpacing,
		type SpacingCommand
	} from './spacingCommand';
	import { m } from '$lib/paraglide/messages';

	const CUSTOM = 'custom';

	const props: ChipSettingsProps = $props();

	const command = $derived(readSpacing(props.source));
	const named = $derived(command !== null && !command.amount);
	const amount = $derived(command ? command.amount || NAMED_LENGTHS[command.name]?.[0] || '' : '');
	const unit = $derived(command ? command.unit || NAMED_LENGTHS[command.name]?.[1] || 'pt' : 'pt');
	const units = $derived(SPACING_UNITS.includes(unit) ? SPACING_UNITS : [...SPACING_UNITS, unit]);
	const sizes = $derived.by((): Panel.PanelSegment[] => {
		const labels: Record<string, string> = {
			smallskip: m.drawn_chip_space_small(),
			medskip: m.drawn_chip_space_medium(),
			bigskip: m.drawn_chip_space_big(),
			vfill: m.drawn_chip_space_fill(),
			hfill: m.drawn_chip_space_fill(),
			',': m.drawn_chip_space_thin(),
			quad: '1 em',
			qquad: '2 em'
		};
		const names = command?.vertical ? VERTICAL_NAMED : HORIZONTAL_NAMED;
		return [
			...names.map((name) => ({ value: name, label: labels[name], hint: `\\${name}` })),
			{ value: CUSTOM, label: m.drawn_chip_space_custom() }
		];
	});

	function write(next: Partial<SpacingCommand>) {
		if (command) props.write(writeSpacing({ ...command, ...next }));
	}

	/** a named space becomes \vspace or \hspace once its length or star is changed */
	function asLength(next: Partial<SpacingCommand>) {
		if (command) write({ name: command.vertical ? 'vspace' : 'hspace', amount: amount || '1', unit, ...next });
	}

	function pick(value: string) {
		if (value === CUSTOM) asLength({});
		else write({ name: value, star: false, amount: '', unit: '' });
	}
</script>

{#if command}
	<div class="flex flex-col gap-2">
		<Panel.Header
			title={command.vertical ? m.drawn_chip_space_vertical() : m.drawn_chip_space_horizontal()}
			command={`\\${command.name}${command.star ? '*' : ''}`}
		/>
		<Panel.Row label={m.drawn_chip_space_size()}>
			<Panel.Segments options={sizes} selected={named ? command.name : CUSTOM} label={m.drawn_chip_space_size()} onpick={pick} />
		</Panel.Row>
		<Panel.Row label={m.drawn_chip_space_length()}>
			<div class="border-surface-300-700 rounded-base focus-within:border-primary-500 flex h-7 overflow-hidden border">
				<input
					class="min-w-0 flex-1 bg-transparent px-2 text-sm tabular-nums outline-none {named ? 'text-muted' : ''}"
					inputmode="decimal"
					spellcheck="false"
					aria-label={m.drawn_chip_space_amount()}
					data-autofocus
					value={amount}
					oninput={(e) => {
						const value = e.currentTarget.value.trim();
						if (AMOUNT.test(value)) asLength({ amount: value });
					}}
				/>
				<select
					class="border-surface-300-700 text-muted border-0 border-l bg-transparent px-2 text-xs outline-none"
					aria-label={m.drawn_chip_space_unit()}
					value={unit}
					onchange={(e) => asLength({ unit: e.currentTarget.value })}
				>
					{#each units as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</div>
		</Panel.Row>
		{#if !named}
			<Panel.Switch
				label={command.vertical ? m.drawn_chip_space_keep_vertical() : m.drawn_chip_space_keep_horizontal()}
				checked={command.star}
				onchange={(star) => asLength({ star })}
			/>
		{:else}
			<p class="text-muted text-xs">{m.drawn_chip_space_custom_hint()}</p>
		{/if}
	</div>
{/if}
