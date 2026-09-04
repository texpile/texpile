<script lang="ts">
	let { rows }: { rows: { keys: string; label: string }[] } = $props();
</script>

<div class="not-prose border-surface-200 my-6 overflow-x-auto rounded-lg border">
	<table class="w-full text-left text-sm">
		<tbody class="divide-surface-200 divide-y">
			{#each rows as row (row.label)}
				<tr>
					<td class="text-surface-700 w-40 px-4 py-2.5 whitespace-nowrap">
						{#each row.keys.split(' ') as key (key)}
							<kbd class="border-surface-300 bg-surface-50 text-surface-700 rounded-base mr-1 border px-1.5 py-0.5 font-mono text-xs"
								>{key}</kbd
							>
						{/each}
					</td>
					<td class="text-surface-600 px-4 py-2.5">{row.label}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
