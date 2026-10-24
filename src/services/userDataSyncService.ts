import { supabase, isSupabaseConfigured } from './supabaseClient';
import { authStore } from './authStore';
import type { UserRecipeProgress } from '../types/cloudSync';

const LOCAL_DEBOUNCE_MS = 100;
const CLOUD_DEBOUNCE_MS = 5000;

const STORAGE_KEYS = {
  progressPrefix: 'recipe_view_',
  settings: 'recipedb_settings',
  bookmarks: 'recipedb_bookmarks'
};

// In-memory cache for 0ms latency UI access
const progressCache = new Map<string, Partial<UserRecipeProgress>>();
let settingsCache: Record<string, unknown> | null = null;
let bookmarksCache: Set<string> | null = null;

// Dirty change tracking
const dirtyProgress = new Set<string>();
let dirtySettings = false;
const dirtyBookmarks = new Map<string, 'add' | 'remove'>();

let localTimer: ReturnType<typeof setTimeout> | null = null;
let cloudTimer: ReturnType<typeof setTimeout> | null = null;

function getUserId(): string | null {
  return authStore.getState().user?.id ?? null;
}

// ----------------------------------------------------------------------------
// Local Storage Read / Write (100ms Debounced)
// ----------------------------------------------------------------------------
function loadLocalBookmarks(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.bookmarks);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function scheduleLocalCommit(): void {
  if (localTimer) clearTimeout(localTimer);
  localTimer = setTimeout(() => {
    commitLocalStorage();
  }, LOCAL_DEBOUNCE_MS);
}

function commitLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    // Commit dirty progress
    for (const recipeId of dirtyProgress) {
      const data = progressCache.get(recipeId);
      if (data) {
        localStorage.setItem(`${STORAGE_KEYS.progressPrefix}${recipeId}`, JSON.stringify(data));
      }
    }
    // Commit dirty settings
    if (dirtySettings && settingsCache) {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settingsCache));
    }
    // Commit dirty bookmarks
    if (dirtyBookmarks.size > 0 && bookmarksCache) {
      localStorage.setItem(STORAGE_KEYS.bookmarks, JSON.stringify(Array.from(bookmarksCache)));
    }
  } catch {
    // Ignore storage quota errors
  }
}

// ----------------------------------------------------------------------------
// Cloud Synchronization (5000ms Inactivity Debounced)
// ----------------------------------------------------------------------------
function scheduleCloudSync(): void {
  if (!isSupabaseConfigured) return;
  if (cloudTimer) clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => {
    void flushPendingSync();
  }, CLOUD_DEBOUNCE_MS);
}

export async function flushPendingSync(): Promise<void> {
  const userId = getUserId();
  if (!userId || !isSupabaseConfigured) return;

  if (cloudTimer) {
    clearTimeout(cloudTimer);
    cloudTimer = null;
  }
  // Ensure local store is flushed as well
  commitLocalStorage();

  // Snapshot dirty collections
  const pendingProgress = Array.from(dirtyProgress);
  dirtyProgress.clear();

  const syncSettings = dirtySettings;
  dirtySettings = false;

  const pendingBookmarks = new Map(dirtyBookmarks);
  dirtyBookmarks.clear();

  // 1. Sync Recipe Progress
  for (const recipeId of pendingProgress) {
    const item = progressCache.get(recipeId);
    if (!item) continue;
    try {
      await supabase.from('user_recipe_progress').upsert({
        user_id: userId,
        recipe_id: recipeId,
        sidebar_mode: item.sidebarMode || 'prep',
        checked_prep_items: item.checkedPrepItems || [],
        checked_cooking_items: item.checkedCookingItems || [],
        active_step_index: item.activeStepIndex ?? 0,
        active_section_id: item.activeSectionId ?? null,
        client_updated_at: item.clientUpdatedAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,recipe_id' });
    } catch {
      // Re-queue on failure for subsequent flush
      dirtyProgress.add(recipeId);
    }
  }

  // 2. Sync Settings
  if (syncSettings && settingsCache) {
    try {
      await supabase.from('user_settings').upsert({
        user_id: userId,
        settings: settingsCache,
        client_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    } catch {
      dirtySettings = true;
    }
  }

  // 3. Sync Bookmarks
  for (const [recipeId, action] of pendingBookmarks) {
    try {
      if (action === 'add') {
        await supabase.from('user_bookmarks').upsert({
          user_id: userId,
          recipe_id: recipeId,
          created_at: new Date().toISOString()
        }, { onConflict: 'user_id,recipe_id' });
      } else {
        await supabase.from('user_bookmarks').delete()
          .eq('user_id', userId)
          .eq('recipe_id', recipeId);
      }
    } catch {
      dirtyBookmarks.set(recipeId, action);
    }
  }
}

// ----------------------------------------------------------------------------
// Public API: Recipe Progress
// ----------------------------------------------------------------------------
export function updateRecipeProgress(recipeId: string, progress: Partial<UserRecipeProgress>): void {
  const current = progressCache.get(recipeId) || {};
  const updated: Partial<UserRecipeProgress> = {
    ...current,
    ...progress,
    recipeId,
    clientUpdatedAt: new Date().toISOString()
  };

  progressCache.set(recipeId, updated);
  dirtyProgress.add(recipeId);

  scheduleLocalCommit();
  scheduleCloudSync();
}

export function getRecipeProgress(recipeId: string): Partial<UserRecipeProgress> | null {
  if (progressCache.has(recipeId)) {
    return progressCache.get(recipeId)!;
  }
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.progressPrefix}${recipeId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      progressCache.set(recipeId, parsed);
      return parsed;
    }
  } catch {
    // Ignore error
  }
  return null;
}

export async function hydrateRecipeProgress(recipeId: string): Promise<UserRecipeProgress | null> {
  const userId = getUserId();
  if (!userId || !isSupabaseConfigured) {
    return (getRecipeProgress(recipeId) as UserRecipeProgress) || null;
  }
  try {
    const { data, error } = await supabase
      .from('user_recipe_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('recipe_id', recipeId)
      .maybeSingle();

    if (error || !data) {
      return (getRecipeProgress(recipeId) as UserRecipeProgress) || null;
    }

    const progress: UserRecipeProgress = {
      id: data.id,
      userId: data.user_id,
      recipeId: data.recipe_id,
      sidebarMode: data.sidebar_mode,
      checkedPrepItems: data.checked_prep_items || [],
      checkedCookingItems: data.checked_cooking_items || [],
      activeStepIndex: data.active_step_index ?? 0,
      activeSectionId: data.active_section_id,
      clientUpdatedAt: data.client_updated_at,
      updatedAt: data.updated_at
    };

    progressCache.set(recipeId, progress);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`${STORAGE_KEYS.progressPrefix}${recipeId}`, JSON.stringify(progress));
    }
    return progress;
  } catch {
    return (getRecipeProgress(recipeId) as UserRecipeProgress) || null;
  }
}

// ----------------------------------------------------------------------------
// Public API: User Settings
// ----------------------------------------------------------------------------
export function updateSettingsData(settings: Record<string, unknown>): void {
  settingsCache = { ...settingsCache, ...settings };
  dirtySettings = true;
  scheduleLocalCommit();
  scheduleCloudSync();
}

export async function hydrateSettingsData(): Promise<Record<string, unknown> | null> {
  const userId = getUserId();
  if (!userId || !isSupabaseConfigured) return settingsCache;
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data?.settings) {
      settingsCache = data.settings as Record<string, unknown>;
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settingsCache));
      }
    }
  } catch {
    // Ignore error
  }
  return settingsCache;
}

// ----------------------------------------------------------------------------
// Public API: Bookmarks
// ----------------------------------------------------------------------------
export function getBookmarks(): string[] {
  if (!bookmarksCache) {
    bookmarksCache = loadLocalBookmarks();
  }
  return Array.from(bookmarksCache);
}

export function isBookmarked(recipeId: string): boolean {
  if (!bookmarksCache) {
    bookmarksCache = loadLocalBookmarks();
  }
  return bookmarksCache.has(recipeId);
}

export function toggleBookmark(recipeId: string): boolean {
  if (!bookmarksCache) {
    bookmarksCache = loadLocalBookmarks();
  }
  const newState = !bookmarksCache.has(recipeId);
  if (newState) {
    bookmarksCache.add(recipeId);
    dirtyBookmarks.set(recipeId, 'add');
  } else {
    bookmarksCache.delete(recipeId);
    dirtyBookmarks.set(recipeId, 'remove');
  }
  scheduleLocalCommit();
  scheduleCloudSync();
  return newState;
}

export async function hydrateBookmarks(): Promise<string[]> {
  const userId = getUserId();
  if (!userId || !isSupabaseConfigured) return getBookmarks();
  try {
    const { data, error } = await supabase
      .from('user_bookmarks')
      .select('recipe_id')
      .eq('user_id', userId);

    if (!error && data) {
      bookmarksCache = new Set(data.map((row: { recipe_id: string }) => row.recipe_id));
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.bookmarks, JSON.stringify(Array.from(bookmarksCache)));
      }
    }
  } catch {
    // Fall back to local
  }
  return getBookmarks();
}

// ----------------------------------------------------------------------------
// Lifecycle Listeners: Visibility Change & Online Recovery
// ----------------------------------------------------------------------------
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushPendingSync();
    }
  });

  window.addEventListener('pagehide', () => {
    void flushPendingSync();
  });

  window.addEventListener('online', () => {
    if (dirtyProgress.size > 0 || dirtySettings || dirtyBookmarks.size > 0) {
      void flushPendingSync();
    }
  });
}

export const userDataSyncService = {
  updateRecipeProgress,
  getRecipeProgress,
  hydrateRecipeProgress,
  updateSettingsData,
  hydrateSettingsData,
  getBookmarks,
  isBookmarked,
  toggleBookmark,
  hydrateBookmarks,
  flushPendingSync
};
