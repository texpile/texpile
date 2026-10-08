<script lang="ts">
	// the notices over the editor: a managed file, an unreadable encoding, Typst without tinymist, places a
	// merge marked, a file deleted on disk
	import { CircleAlert, Info } from '@lucide/svelte';
	import EditorNotice from '$lib/components/EditorNotice.svelte';
	import TypstMissingBar from '$lib/languages/typst/TypstMissingBar.svelte';
	import ConflictNotice from './ConflictNotice.svelte';
	import { isTexpileManaged } from '$lib/comments/managed';
	import { fileMode } from '$lib/workspace/fileMode.svelte';
	import type { FileKind } from '$lib/workspace/documentBuffer.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		loadedPath: string | null;
		comparing: boolean;
		encodingIssue: string | null;
		kind: FileKind;
		guest: boolean;
		conflicted: boolean;
		conflictsLeft: number;
		conflictStray: boolean;
		onLeaveConflicts?: () => void;
		fileDeleted: boolean;
	};
	const props: Props = $props();
</script>

<!-- not in diff mode: DiffPane carries its own, and both rendered gave two stacked banners -->
{#if props.loadedPath && !props.comparing && isTexpileManaged(props.loadedPath)}
	<!-- Above the editor, not in it: .texpile is hidden from the tree, so anyone who has this
	     open reached it deliberately from Source Control and deserves the warning before they
	     touch it. One short line everywhere a managed file appears - the same sentence as the
	     SCM badge tooltip and the diff bar, so the notice reads as one voice. -->
	<EditorNotice icon={Info} tone="info" title="{m.vcs_texpile_managed()}." note={m.texpile_managed_note()} />
{/if}
{#if props.loadedPath && props.encodingIssue}
	<EditorNotice icon={CircleAlert} tone="warning" title="{m.wsview_read_only()}." note={props.encodingIssue} />
{/if}
<!-- a guest's Typst runs on the host's tinymist, and a lone file runs none: no language server, no compile -->
{#if props.loadedPath && props.kind === 'typ' && !props.guest && !fileMode.current && !props.comparing}
	<TypstMissingBar />
{/if}
{#if props.loadedPath && props.conflicted && !props.comparing}
	<ConflictNotice left={props.conflictsLeft} stray={props.conflictStray} onLeave={props.onLeaveConflicts} />
{/if}
<!-- the buffer is now the only copy, so it stays on screen; what a save will do is spelled out
     because it recreates the old name rather than following the rename -->
{#if props.loadedPath && props.fileDeleted && !props.comparing}
	<EditorNotice icon={CircleAlert} tone="warning" title="{m.wsview_file_deleted_title()}." note={m.wsview_file_deleted_note()} />
{/if}
