<script lang="ts">
	// An editor slot in a window of its own, the slot mounted into it; the window lives as long as this component
	import { getAllContexts, mount, onMount, unmount, type ComponentProps } from 'svelte';
	import GroupCell from '../GroupCell.svelte';
	import { openChildWindow, type ChildWindow } from '$lib/childWindows/childWindow';
	import { editorWindowFeatures } from './editorWindowBounds';

	type CellProps = Omit<ComponentProps<typeof GroupCell>, 'style'>;
	type Props = {
		id: number;
		/** where on the screen it was dropped */
		at: { x: number; y: number };
		title: string;
		cell: CellProps;
		/** the window came forward without a click in it (the keyboard, its frame) */
		onWindowFocus: () => void;
		/** the user closed the window */
		onClosed: () => void;
	};
	const props: Props = $props();
	const context = getAllContexts();
	let child = $state<ChildWindow | null>(null);
	// what the slot last read: it is torn down after the loop entry these props came from
	let alive = true;
	let lastCell: CellProps | null = null;
	function cell(): CellProps {
		if (alive || !lastCell) lastCell = props.cell;
		return lastCell;
	}

	onMount(() => {
		const opened = openChildWindow({
			name: `texpile-editor-${props.id}`,
			title: props.title,
			features: editorWindowFeatures(props.at, window.screen),
			onGone: props.onClosed
		});
		if (!opened) {
			props.onClosed();
			return;
		}
		child = opened;
		const app = mount(GroupCell, {
			target: opened.target,
			context,
			// getters, so the slot follows these props as a declarative child would
			props: {
				style: 'height: 100%',
				get id() {
					return cell().id;
				},
				get pane() {
					return cell().pane;
				},
				get hint() {
					return cell().hint;
				},
				get register() {
					return cell().register;
				},
				get onPointerDown() {
					return cell().onPointerDown;
				},
				get onFocusIn() {
					return cell().onFocusIn;
				},
				get onDragOver() {
					return cell().onDragOver;
				},
				get onDragOff() {
					return cell().onDragOff;
				},
				get onDrop() {
					return cell().onDrop;
				}
			}
		});
		function onFocus(): void {
			props.onWindowFocus();
		}
		opened.win.addEventListener('focus', onFocus);
		return () => {
			alive = false;
			opened.win.removeEventListener('focus', onFocus);
			try {
				unmount(app);
			} catch (e) {
				console.error('editor window unmount:', e);
			}
			opened.close();
		};
	});

	$effect(() => {
		if (child) child.win.document.title = props.title;
	});
</script>
