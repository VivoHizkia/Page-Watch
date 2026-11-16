// Compares two snapshots line by line.

export type Diff = { added: string[]; removed: string[] };

// Above this size the LCS table gets too large, so a coarser set comparison is used instead.
const MAX_CELLS = 4_000_000;

// Lines present on both sides in the same order count as unchanged (longest common
// subsequence). Of the rest, lines only in `before` were removed and lines only in `after`
// were added. A line that moved shows up in both lists, and that is a real change.
export function diffLines(before: string[], after: string[]): Diff {
  // Trim the shared start and end first: most pages change in one place only.
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }

  const a = before.slice(start, endBefore);
  const b = after.slice(start, endAfter);
  if (a.length === 0) return { added: b, removed: [] };
  if (b.length === 0) return { added: [], removed: a };
  if (a.length * b.length > MAX_CELLS) return diffAsSets(a, b);

  // length[i][j] = length of the longest common subsequence of a[i..] and b[j..].
  const width = b.length + 1;
  const length = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      length[i * width + j] =
        a[i] === b[j]
          ? length[(i + 1) * width + j + 1] + 1
          : Math.max(length[(i + 1) * width + j], length[i * width + j + 1]);
    }
  }

  const added: string[] = [];
  const removed: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (length[(i + 1) * width + j] >= length[i * width + j + 1]) {
      removed.push(a[i++]);
    } else {
      added.push(b[j++]);
    }
  }
  removed.push(...a.slice(i));
  added.push(...b.slice(j));
  return { added, removed };
}

function diffAsSets(a: string[], b: string[]): Diff {
  const inA = new Set(a);
  const inB = new Set(b);
  return {
    added: b.filter((line) => !inA.has(line)),
    removed: a.filter((line) => !inB.has(line)),
  };
}

export const hasChanges = (diff: Diff) => diff.added.length > 0 || diff.removed.length > 0;
