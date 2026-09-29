// A file both sides changed that is settled by keeping one whole side, not by choosing place by
// place: one side deleted it, or it is not text (a figure, a PDF). VS Code asks about a deletion
// with Keep Our Version / Delete File when it is staged; the same question is asked here when the
// row is clicked, and about a figure too, where git would otherwise keep yours without a word.
import { promptAsk } from '$lib/modals/confirm.svelte';
import { m } from '$lib/paraglide/messages';

export type WholeFileChoice = 'deleted-by-them' | 'deleted-by-us' | 'binary';
type Side = 'mine' | 'theirs';

/** what keeping `side` does to a file with this choice, as the menu and the question say it */
export function keepLabel(choose: WholeFileChoice | undefined, side: Side): string {
	if (choose === 'deleted-by-them') return side === 'mine' ? m.vcs_keep_my_version() : m.vcs_delete_the_file();
	if (choose === 'deleted-by-us') return side === 'theirs' ? m.vcs_keep_their_version() : m.vcs_delete_the_file();
	if (choose === 'binary') return side === 'mine' ? m.vcs_keep_my_version() : m.vcs_keep_their_version();
	return side === 'mine' ? m.vcs_keep_file_mine() : m.vcs_keep_file_theirs();
}

/** the row's note: what happened to the file */
export function chooseNote(choose: WholeFileChoice): string {
	if (choose === 'deleted-by-them') return m.vcs_choose_deleted_by_them();
	if (choose === 'deleted-by-us') return m.vcs_choose_deleted_by_us();
	return m.vcs_choose_binary();
}

/** the side to keep, or null when the author backed out. The side that keeps the file comes first. */
export async function askWholeFile(name: string, choose: WholeFileChoice): Promise<Side | null> {
	const message =
		choose === 'deleted-by-them'
			? m.vcs_ask_deleted_by_them({ name })
			: choose === 'deleted-by-us'
				? m.vcs_ask_deleted_by_us({ name })
				: m.vcs_ask_binary({ name });
	const kept: Side = choose === 'deleted-by-us' ? 'theirs' : 'mine';
	const other: Side = kept === 'mine' ? 'theirs' : 'mine';
	const answer = await promptAsk({
		title: m.vcs_ask_whole_title(),
		message,
		buttons: [
			{ id: kept, label: keepLabel(choose, kept), primary: true },
			{ id: other, label: keepLabel(choose, other) },
			{ id: 'cancel', label: m.vcs_cancel() }
		],
		cancelId: 'cancel'
	});
	return answer === 'mine' || answer === 'theirs' ? answer : null;
}
