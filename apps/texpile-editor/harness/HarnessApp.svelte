<script lang="ts">
	import VisualEditorHost from '../src/views/workspace/VisualEditorHost.svelte';
	import { references } from '$lib/workspace/citations';
	import type { HarnessSession } from './harnessSession.svelte';

	let { session }: { session: HarnessSession } = $props();
</script>

<!-- the editor column of EditorPane: the scroller the canvas scrolls in, filling the window -->
<div class="flex h-screen w-screen flex-col">
	<div class="relative min-h-0 min-w-0 flex-1">
		<div class="group/pane scroll-inset-r h-full w-full [scrollbar-gutter:stable] overflow-auto">
			{#if session.shown && session.kind}
				<div class="flex min-h-full items-stretch">
					<div class="isolate min-w-0 flex-1">
						<VisualEditorHost
							kind={session.kind}
							loadedPath={session.path}
							visualDoc={session.doc}
							docMeta={session.meta}
							texSource={session.texSource}
							allReferences={references.current}
							showRenderBar={false}
							onVisualChange={session.onVisualChange}
							onVisualReady={session.onReady}
							onMdLink={() => false}
							onEditFrontmatter={session.editFrontmatter}
							commentRanges={[]}
							sourceMap={session.sourceMap}
							regionParser={session.regionParser}
							selectedComment={null}
							commentPendingActive={false}
						/>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
