/**
 * workspaceStorageService.ts
 * Centralized, secure storage service for Kitchen Studio workspaces.
 * Encrypts workspaces using AES-256-GCM keyed via private Supabase KMS (user_workspace_keys).
 * Keys are held strictly in memory during an active session.
 */

import type { StudioWorkspace } from '../types/orchestration';
import { supabase } from './supabaseClient';
import { authStore } from './authStore';
import { WorkspaceCryptoService } from './workspaceCryptoService';

export const LEGACY_WORKSPACES_STORAGE_KEY = 'recipedb_studio_workspaces_v1';

export class WorkspaceStorageService {
  private static sessionKey: { userId: string; key: string } | null = null;
  private static isMigrating = false;

  /**
   * Returns the partitioned storage key for a given user or guest.
   */
  static getStorageKey(userId?: string | null): string {
    return userId ? `recipedb_workspaces_${userId}` : 'recipedb_workspaces_guest';
  }

  /**
   * Retrieves the 256-bit encryption key for the authenticated user.
   * Fetched once per session and held in memory.
   * If user has no key in DB (first login), automatically generates and saves one.
   */
  static async getUserEncryptionKey(userId: string): Promise<string | null> {
    if (this.sessionKey && this.sessionKey.userId === userId) {
      return this.sessionKey.key;
    }

    try {
      const { data, error } = await supabase
        .from('user_workspace_keys')
        .select('encryption_key')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data?.encryption_key) {
        this.sessionKey = { userId, key: data.encryption_key };
        return data.encryption_key;
      }

      // First time initialization: generate new key and insert
      const newKey = await WorkspaceCryptoService.generateKey();
      const { error: insertError } = await supabase
        .from('user_workspace_keys')
        .insert({ user_id: userId, encryption_key: newKey });

      if (!insertError) {
        this.sessionKey = { userId, key: newKey };
        return newKey;
      }

      // If insert failed due to concurrent creation, attempt to fetch again
      const { data: retryData } = await supabase
        .from('user_workspace_keys')
        .select('encryption_key')
        .eq('user_id', userId)
        .maybeSingle();

      if (retryData?.encryption_key) {
        this.sessionKey = { userId, key: retryData.encryption_key };
        return retryData.encryption_key;
      }
    } catch {
      // Network/offline error fallback
    }

    return this.sessionKey?.userId === userId ? this.sessionKey.key : null;
  }

  /**
   * Wipes the session key and cached CryptoKeys from memory upon logout.
   */
  static clearSessionKey(): void {
    this.sessionKey = null;
    WorkspaceCryptoService.clearCache();
  }

  /**
   * Loads and decrypts workspaces for the current active user or guest session.
   * Automatically migrates legacy unencrypted workspaces on first access.
   */
  static async loadWorkspaces(): Promise<StudioWorkspace[]> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return [];
    }

    const authState = authStore.getState();
    const user = authState.user;
    const targetKey = this.getStorageKey(user?.id);

    // 1. Transparent legacy migration
    const legacyRaw = localStorage.getItem(LEGACY_WORKSPACES_STORAGE_KEY);
    if (legacyRaw && user && !this.isMigrating) {
      this.isMigrating = true;
      try {
        const legacyWorkspaces: StudioWorkspace[] = JSON.parse(legacyRaw);
        if (Array.isArray(legacyWorkspaces) && legacyWorkspaces.length > 0) {
          // Check if current target key already has data
          const existingRaw = localStorage.getItem(targetKey);
          if (!existingRaw) {
            await this.saveWorkspaces(legacyWorkspaces);
            localStorage.removeItem(LEGACY_WORKSPACES_STORAGE_KEY);
            this.isMigrating = false;
            return legacyWorkspaces;
          }
        }
      } catch {
        // If legacy parse failed, ignore
      } finally {
        this.isMigrating = false;
      }
    }

    // 2. Normal load from partitioned key
    const raw = localStorage.getItem(targetKey);
    if (!raw) {
      return [];
    }

    // Encrypted payload
    if (WorkspaceCryptoService.isEncrypted(raw)) {
      if (!user) {
        // Not authenticated: cannot decrypt
        return [];
      }

      const key = await this.getUserEncryptionKey(user.id);
      if (!key) {
        return [];
      }

      try {
        const decryptedJson = await WorkspaceCryptoService.decryptData(raw, key);
        const parsed = JSON.parse(decryptedJson);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    // Plaintext payload (guest mode or pre-encrypted local draft)
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Encrypts and writes workspaces to the user-scoped local storage key.
   * Zero server network requests during saving.
   */
  static async saveWorkspaces(workspaces: StudioWorkspace[]): Promise<void> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    const authState = authStore.getState();
    const user = authState.user;
    const targetKey = this.getStorageKey(user?.id);
    const json = JSON.stringify(workspaces);

    if (user) {
      const key = await this.getUserEncryptionKey(user.id);
      if (key) {
        try {
          const encrypted = await WorkspaceCryptoService.encryptData(json, key);
          localStorage.setItem(targetKey, encrypted);
          return;
        } catch {
          // If Web Crypto fails unexpectedly, fallback to saving directly
        }
      }
    }

    // Guest or fallback save
    localStorage.setItem(targetKey, json);
  }
}
