import { describe, expect, it } from 'vitest';
import { resolveMergeOnto, tryResolveMerge, type MergeEdit } from '../../../../../src/lib/diff/comparison/mergeResolve';

const JAVA_BASE = `
  public static class ChangeData {
    @NotNull public final ChangeKind kind;
    public final int otherPath;

    public ChangeData(@NotNull ChangeKind kind, int otherPath) {
      this.kind = kind;
      this.otherPath = otherPath;
    }

    public boolean isRename() {
      return kind.equals(ChangeKind.RENAMED_FROM) || kind.equals(ChangeKind.RENAMED_TO);
    }

    @Override
    public int hashCode() {
      return Objects.hash(kind, otherPath);
    }
  }

  private enum ChangeKind {
    MODIFIED((byte)0),
    RENAMED_FROM((byte)1),
    RENAMED_TO((byte)2);`;

const JAVA_LEFT = `
  public enum ChangeKind {
    NOT_CHANGED((byte)-1),
    MODIFIED((byte)0),
    ADDED((byte)1),
    REMOVED((byte)2);`;

const JAVA_RIGHT = `
  public static class ChangeData {
  @NotNull public final ChangeKind kind;
  public final int otherPath;

  public ChangeData(@NotNull ChangeKind kind, int otherPath) {
    this.kind = kind;
    this.otherPath = otherPath;
  }

  public boolean isRename() {
    return kind.equals(ChangeKind.RENAMED_FROM) || kind.equals(ChangeKind.RENAMED_TO);
  }

  @Override
  public int hashCode() {
    return Objects.hash(kind, otherPath);
  }
}

private enum ChangeKind {
  MODIFIED((byte)0),
  RENAMED_FROM((byte)1),
  RENAMED_TO((byte)2);`;

const JAVA_EXPECTED = `
  public enum ChangeKind {
    NOT_CHANGED((byte)-1),
  MODIFIED((byte)0),
  ADDED((byte)1),
  REMOVED((byte)2);`;

// [name, base, left, right, expected]
const CASES: [string, string, string, string, string | null][] = [
	['empty', '', '', '', ''],
	['unchanged', 'x x x', 'x x x', 'x x x', 'x x x'],
	['left change', 'x x x', 'x Y x', 'x x x', 'x Y x'],
	['right insertion', 'x x', 'x x', 'x Y x', 'x Y x'],
	['left deletion', 'x X x', 'x x', 'x X x', 'x x'],
	['same modification', 'x x x', 'x Y x', 'x Y x', 'x Y x'],
	['same insertion', 'x x', 'x Y x', 'x Y x', 'x Y x'],
	['same deletion', 'x X x', 'x x', 'x x', 'x x'],
	['independent changes', 'x x x', 'x Y x x', 'x x Z x', 'x Y x Z x'],
	['insertions at both ends', 'x', 'x Y', 'Z x', 'Z x Y'],
	['deletion and insertion', 'x x', 'x', 'Z x x', 'Z x'],
	['different modifications', 'x x x', 'x Y x', 'x Z x', null],
	['different insertions', 'x x', 'x Y x', 'x Z x', null],
	['IDEA-200696', 'version: 1.0.0', 'version: 2.0.0', 'version: 1.0.4', 'version: 2.0.4'],
	['newline insertion against deletion', 'i\n', 'i', '\ni', 'i'],
	['whitespace-only change next to edit', 'Y X Y', 'Y C\nX\nC Y', 'Y \nX\n Y', 'Y \nC\nX\nC Y'],
	['java regression', JAVA_BASE, JAVA_LEFT, JAVA_RIGHT, JAVA_EXPECTED]
];

function applyEdits(text: string, edits: MergeEdit[]): string {
	let result = '';
	let last = 0;
	for (const edit of edits) {
		result += text.slice(last, edit.from) + edit.insert;
		last = edit.to;
	}
	return result + text.slice(last);
}

describe('tryResolveMerge', () => {
	it.each(CASES)('%s', (_name, base, left, right, expected) => {
		expect(tryResolveMerge(left, base, right)).toBe(expected);
	});
});

describe('resolveMergeOnto', () => {
	it.each(CASES.filter(([, , , , expected]) => expected !== null))(
		'turns right into the merged text: %s',
		(_name, base, left, right, expected) => {
			const edits = resolveMergeOnto(left, base, right);
			expect(edits).not.toBeNull();
			expect(applyEdits(right, edits!)).toBe(expected);
		}
	);

	it('merges a word changed on disk with another word changed in memory', () => {
		const base = '\\section{Intro}\nThe quick brown fox jumps over the lazy dog.\n';
		const left = '\\section{Intro}\nThe quick brown fox leaps over the lazy dog.\n';
		const right = '\\section{Intro}\nThe quick brown fox jumps over the sleepy dog.\n';
		const edits = resolveMergeOnto(left, base, right)!;
		const wordStart = right.indexOf('jumps');
		expect(edits).toHaveLength(1);
		expect(edits[0].from).toBeGreaterThanOrEqual(wordStart);
		expect(edits[0].to).toBeLessThanOrEqual(wordStart + 5);
		expect(applyEdits(right, edits)).toBe('\\section{Intro}\nThe quick brown fox leaps over the sleepy dog.\n');
	});

	it('returns null when both sides change the same word', () => {
		const base = 'The quick brown fox.\n';
		expect(resolveMergeOnto('The quick red fox.\n', base, 'The quick green fox.\n')).toBeNull();
	});

	it('returns no edits when memory already holds the merge', () => {
		expect(resolveMergeOnto('x Y x', 'x x', 'x Y x')).toEqual([]);
	});

	it('keeps surrogate pairs whole', () => {
		const base = 'a \u{1F600} b c';
		const edits = resolveMergeOnto('a \u{1F600} b d', base, 'a \u{1F601} b c')!;
		expect(applyEdits('a \u{1F601} b c', edits)).toBe('a \u{1F601} b d');
	});
});
