<script lang="ts">
	let { rows }: { rows: { keys: string; label: string }[] } = $props();
</script>

<div class="not-prose border-surface-200-800 rounded-container my-6 overflow-x-auto border">
	<table class="w-full text-left text-sm">
		<tbody class="divide-surface-200-800 divide-y">
			{#each rows as row (row.label)}
				<tr>
					<td class="text-muted w-40 px-4 py-2.5 whitespace-nowrap">
						{#each row.keys.split(' ') as key (key)}
							<kbd
								class="text-surface-700-300 border-surface-300-700 bg-surface-100-900 rounded-base mr-1 inline-flex h-5 min-w-5 items-center justify-center border px-1.5 font-sans text-xs leading-none shadow-[0_1px_0_var(--color-surface-300-700)]"
								>{key}</kbd
							>
						{/each}
					</td>
					<td class="text-muted px-4 py-2.5">{row.label}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
