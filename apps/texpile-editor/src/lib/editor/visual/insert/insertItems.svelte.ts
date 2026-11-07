import type { Node } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { box } from '$lib/runes/box.svelte';
import type { BlockInsertItem, CaretArgument, InsertItem } from './insertItem';

export const insertItems = box<readonly InsertItem[]>([]);

export const insertArguments = box<(state: EditorState) => CaretArgument[]>(() => []);

export const insertSourceOf = box<((item: BlockInsertItem) => string | null) | null>(null);

export const styleEnvironment = box<(node: Node) => boolean>(() => false);
