import { describe, it, expect } from 'vitest';
import { diffNotifications, snapshotNotifications } from './notifications';

// The poll-loop contract: every poll diffs the FRESH fetch against the
// previous snapshot — new arrivals must be detected (the old code compared
// a stale closure against itself, so this was always empty).
describe('diffNotifications (poll arrival detection)', () => {
  it('detects newly received notifications against the previous snapshot', () => {
    const prev = snapshotNotifications([
      { id: 'a', isRead: true },
      { id: 'b', isRead: false },
    ]);
    const { trulyNew, newlyRead } = diffNotifications(prev, [
      { id: 'a', isRead: true },
      { id: 'b', isRead: false },
      { id: 'c', isRead: false },
    ]);
    expect(trulyNew.map((n) => n.id)).toEqual(['c']);
    expect(newlyRead).toEqual([]);
  });

  it('reports nothing new when nothing changed', () => {
    const prev = snapshotNotifications([{ id: 'a', isRead: false }]);
    const { trulyNew, newlyRead } = diffNotifications(prev, [{ id: 'a', isRead: false }]);
    expect(trulyNew).toEqual([]);
    expect(newlyRead).toEqual([]);
  });

  it('detects newly-read items without flagging them as new', () => {
    const prev = snapshotNotifications([
      { id: 'a', isRead: false },
      { id: 'b', isRead: false },
    ]);
    const { trulyNew, newlyRead } = diffNotifications(prev, [
      { id: 'a', isRead: true },
      { id: 'b', isRead: false },
    ]);
    expect(trulyNew).toEqual([]);
    expect(newlyRead.map((n) => n.id)).toEqual(['a']);
  });

  it('ignores malformed rows and dedupes repeated ids', () => {
    const prev = snapshotNotifications([]);
    const { trulyNew } = diffNotifications(prev, [
      { id: 'a', isRead: false },
      { id: 'a', isRead: false },
      null as any,
      { isRead: false } as any,
    ]);
    expect(trulyNew.map((n) => n.id)).toEqual(['a']);
  });
});

describe('snapshotNotifications', () => {
  it('captures id -> read state for the next diff', () => {
    const snap = snapshotNotifications([
      { id: 1, isRead: false },
      { id: 'x' },
    ]);
    expect(snap.get('1')).toBe(false);
    // Missing isRead counts as unread.
    expect(snap.get('x')).toBe(false);
  });
});
