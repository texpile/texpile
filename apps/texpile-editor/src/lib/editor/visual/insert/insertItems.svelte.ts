// what the open file offers to insert, set by its language when the file is read and when its preamble changes
import type { Node } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { box } from '$lib/runes/box.svelte';
import type { BlockInsertItem, CaretArgument, InsertItem } from './insertItem';

export const insertItems = box<readonly InsertItem[]>([]);

/** the optional arguments the nodes around the caret do not have yet */
export const insertArguments = box<(state: EditorState) => CaretArgument[]>(() => []);

/** what source mode writes for a block item: its node as the file's language saves it */
export const insertSourceOf = box<((item: BlockInsertItem) => string | null) | null>(null);

/** the environments of the open file that are a paragraph's style */
export const styleEnvironment = box<(node: Node) => boolean>(() => false);
