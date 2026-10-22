import { supabase } from './supabaseClient';
import type {
  AdminServiceAPI,
  CloudRecipe,
  CloudRecipeStatus,
  CreatorApplication,
  CreatorApplicationStatus,
  UserProfile,
  UserRole
} from '../types/cloud';

function mapProfileRow(row: any): UserProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: (row.role as UserRole) || 'user',
    usernameLastChangedAt: row.username_last_changed_at ?? null,
    displayNameLastChangedAt: row.display_name_last_changed_at ?? null,
    isArchived: Boolean(row.is_archived),
    scheduledDeleteAt: row.scheduled_delete_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRecipeRow(row: any): CloudRecipe {
  return {
    id: row.id,
    slug: row.slug ?? null,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description ?? '',
    imageUrl: row.image_url ?? '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: (row.status as CloudRecipeStatus) || 'pending',
    saveCount: Number(row.save_count || 0),
    comments: Array.isArray(row.comments) ? row.comments : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapApplicationRow(row: any): CreatorApplication {
  return {
    id: row.id,
    userId: row.user_id,
    applicationMd: row.application_md ?? '',
    status: (row.status as CreatorApplicationStatus) || 'pending',
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at ?? null,
    profile: row.profile
      ? {
          username: row.profile.username ?? '',
          displayName: row.profile.display_name ?? ''
        }
      : undefined
  };
}

export const adminService: AdminServiceAPI = {
  async listModerationRecipes(params?: {
    status?: CloudRecipeStatus;
    searchQuery?: string;
  }): Promise<CloudRecipe[]> {
    try {
      let query = supabase.from('recipes').select('*').order('created_at', { ascending: false });

      if (params?.status) {
        query = query.eq('status', params.status);
      }

      if (params?.searchQuery?.trim()) {
        const clean = params.searchQuery.trim();
        query = query.ilike('title', `%${clean}%`);
      }

      const { data, error } = await query;
      if (error || !data) {
        return [];
      }

      return data.map(mapRecipeRow);
    } catch {
      return [];
    }
  },

  async updateRecipeStatus(
    recipeId: string,
    status: CloudRecipeStatus
  ): Promise<{ error?: string }> {
    try {
      const { error } = await supabase
        .from('recipes')
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', recipeId);

      if (error) {
        return { error: error.message };
      }
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to update recipe status' };
    }
  },

  async deleteRecipe(recipeId: string): Promise<{ error?: string }> {
    try {
      const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
      if (error) {
        return { error: error.message };
      }
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to delete recipe' };
    }
  },

  async listProfiles(params?: {
    role?: UserRole;
    searchQuery?: string;
  }): Promise<UserProfile[]> {
    try {
      let query = supabase.from('profiles').select('*').order('created_at', { ascending: false });

      if (params?.role) {
        query = query.eq('role', params.role);
      }

      if (params?.searchQuery?.trim()) {
        const q = params.searchQuery.trim().replace(/[(),]/g, '');
        if (q) {
          query = query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
        }
      }

      const { data, error } = await query;
      if (error || !data) {
        return [];
      }

      return data.map(mapProfileRow);
    } catch {
      return [];
    }
  },

  async updateUserRole(userId: string, role: UserRole): Promise<{ error?: string }> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          role,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        return { error: error.message };
      }
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to update user role' };
    }
  },

  async setUserArchived(userId: string, isArchived: boolean): Promise<{ error?: string }> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          is_archived: isArchived,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        return { error: error.message };
      }
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to update user archive state' };
    }
  },

  async scheduleUserDeletion(userId: string): Promise<{ error?: string }> {
    try {
      const targetDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from('profiles')
        .update({
          scheduled_delete_at: targetDate,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        return { error: error.message };
      }
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to schedule user deletion' };
    }
  },

  async listApplications(params?: {
    status?: CreatorApplicationStatus;
    searchQuery?: string;
  }): Promise<CreatorApplication[]> {
    try {
      let query = supabase
        .from('creator_applications')
        .select('*, profile:profiles(username, display_name)')
        .order('created_at', { ascending: false });

      if (params?.status) {
        query = query.eq('status', params.status);
      }

      const { data, error } = await query;
      if (error || !data) {
        return [];
      }

      let apps = data.map(mapApplicationRow);
      if (params?.searchQuery?.trim()) {
        const q = params.searchQuery.trim().toLowerCase();
        apps = apps.filter(
          a =>
            a.applicationMd.toLowerCase().includes(q) ||
            a.profile?.username.toLowerCase().includes(q) ||
            a.profile?.displayName.toLowerCase().includes(q)
        );
      }

      return apps;
    } catch {
      return [];
    }
  },

  async approveApplication(applicationId: string): Promise<{ error?: string }> {
    try {
      const { error: rpcError } = await supabase.rpc('approve_creator_application', {
        app_id: applicationId
      });

      if (!rpcError) {
        return {};
      }

      const { data: appData, error: fetchError } = await supabase
        .from('creator_applications')
        .select('user_id')
        .eq('id', applicationId)
        .single();

      if (fetchError || !appData) {
        return { error: fetchError?.message || 'Application not found' };
      }

      const { error: appUpdateError } = await supabase
        .from('creator_applications')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', applicationId);

      if (appUpdateError) {
        return { error: appUpdateError.message };
      }

      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          role: 'recipe_creator',
          updated_at: new Date().toISOString()
        })
        .eq('id', appData.user_id);

      if (profileUpdateError) {
        return { error: profileUpdateError.message };
      }

      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to approve application' };
    }
  },

  async rejectApplication(applicationId: string): Promise<{ error?: string }> {
    try {
      const { error } = await supabase
        .from('creator_applications')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', applicationId);

      if (error) {
        return { error: error.message };
      }
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to reject application' };
    }
  }
};
