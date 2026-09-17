// Pure notification diffing for the AuthContext poll loop.
//
// The poll compares each fresh fetch against a STABLE snapshot of the
// previous fetch (kept in a ref). An earlier revision compared the fetch
// against the render-time closure's own array — the same reference on both
// sides — so "new" was provably always empty and arrival toasts could never
// fire. This helper owns that comparison so it stays testable; the
// component owns fetching and snapshotting.

export interface NotifLite {
  id: string | number;
  isRead?: boolean;
}

export interface NotifDiff {
  /** In fresh, absent from prev (any read state), fresh order preserved. */
  trulyNew: NotifLite[];
  /** Unread in prev, read in fresh. */
  newlyRead: NotifLite[];
}

const keyOf = (n: NotifLite): string => String(n.id);

export const diffNotifications = (
  prev: ReadonlyMap<string, boolean>,
  fresh: NotifLite[]
): NotifDiff => {
  const freshByKey = new Map<string, NotifLite>();
  for (const n of fresh ?? []) {
    if (n == null || n.id === undefined || n.id === null) continue;
    if (!freshByKey.has(keyOf(n))) freshByKey.set(keyOf(n), n);
  }
  const trulyNew: NotifLite[] = [];
  const newlyRead: NotifLite[] = [];
  for (const [key, item] of freshByKey) {
    if (!prev.has(key)) {
      trulyNew.push(item);
    } else if (prev.get(key) === false && item.isRead === true) {
      newlyRead.push(item);
    }
  }
  return { trulyNew, newlyRead };
};

// Snapshot helper: the map the NEXT poll diffs against.
export const snapshotNotifications = (fresh: NotifLite[]): Map<string, boolean> =>
  new Map(
    (fresh ?? [])
      .filter((n) => n != null && n.id !== undefined && n.id !== null)
      .map((n) => [keyOf(n), n.isRead === true])
  );
