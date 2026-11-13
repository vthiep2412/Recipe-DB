/**
 * Unified Cloud Synchronization Type Contracts
 * Governs the 2-tier local / cloud sync engine and database payload shapes.
 */

export interface UserRecipeProgress {
  id?: string;
  userId: string;
  recipeId: string;
  sidebarMode?: 'prep' | 'cook' | 'all' | string;
  checkedPrepItems: string[];
  checkedCookingItems: string[];
  activeStepIndex: number;
  activeSectionId?: string | null;
  clientUpdatedAt: string;
  updatedAt?: string;
}

export interface UserSettingsPayload {
  userId: string;
  settings: Record<string, unknown>;
  clientUpdatedAt: string;
  updatedAt?: string;
}

export interface UserBookmarkItem {
  id?: string;
  userId: string;
  recipeId: string;
  createdAt?: string;
}

export type SyncEntityType = 'progress' | 'settings' | 'bookmark';
export type SyncOperationType = 'upsert' | 'delete';

export interface SyncQueueItem {
  id: string;
  entityType: SyncEntityType;
  operation: SyncOperationType;
  entityKey: string; // e.g. recipeId or setting key
  payload: unknown;
  queuedAt: number;
  retryCount: number;
}
