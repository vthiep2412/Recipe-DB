/**
 * Self-check verification for userDataSyncService.
 * Validates in-memory caching (0ms latency), bookmark toggling, and flush safety.
 */
import {
  updateRecipeProgress,
  getRecipeProgress,
  toggleBookmark,
  isBookmarked,
  getBookmarks,
  flushPendingSync
} from './userDataSyncService';

export async function runUserDataSyncServiceSelfCheck(): Promise<boolean> {
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }

  // Test 1: Immediate cache write
  updateRecipeProgress('test-recipe-1', {
    activeStepIndex: 2,
    checkedPrepItems: ['item-1', 'item-2'],
    sidebarMode: 'cook'
  });
  const cached = getRecipeProgress('test-recipe-1');
  if (!cached || cached.activeStepIndex !== 2) {
    throw new Error('Progress cache write failed');
  }

  // Test 2: Synchronous bookmark toggle
  const added = toggleBookmark('recipe-alpha');
  if (!added || !isBookmarked('recipe-alpha') || !getBookmarks().includes('recipe-alpha')) {
    throw new Error('Bookmark add failed');
  }
  const removed = toggleBookmark('recipe-alpha');
  if (removed || isBookmarked('recipe-alpha') || getBookmarks().includes('recipe-alpha')) {
    throw new Error('Bookmark remove failed');
  }

  // Test 3: Unauthenticated flush safety
  await flushPendingSync();

  return true;
}

if ((import.meta as unknown as Record<string, unknown>).main) {
  runUserDataSyncServiceSelfCheck().then(() => {
    console.log('userDataSyncService self-check passed.');
  }).catch((err) => {
    console.error('userDataSyncService self-check failed:', err);
    const proc = (globalThis as Record<string, unknown>).process as { exit?: (code: number) => void } | undefined;
    proc?.exit?.(1);
  });
}
