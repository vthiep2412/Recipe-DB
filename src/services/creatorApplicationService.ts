import { supabase } from './supabaseClient';
import type { CreatorApplication, CreatorApplicationStatus } from '../types/cloud';

function mapRow(row: any): CreatorApplication {
  return {
    id: row.id,
    userId: row.user_id,
    applicationMd: row.application_md || '',
    status: (row.status as CreatorApplicationStatus) || 'pending',
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at || null
  };
}

export const creatorApplicationService = {
  async getLatestUserApplication(userId: string): Promise<{
    application: CreatorApplication | null;
    error?: string;
  }> {
    try {
      if (!userId) {
        return { application: null };
      }

      const { data, error } = await supabase
        .from('creator_applications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return { application: null, error: error.message };
      }

      return { application: data ? mapRow(data) : null };
    } catch (err: any) {
      return { application: null, error: err?.message || 'Failed to fetch application status' };
    }
  },

  async submitApplication(userId: string, applicationMd: string): Promise<{
    application?: CreatorApplication;
    error?: string;
  }> {
    try {
      if (!userId) {
        return { error: 'You must be signed in to submit an application.' };
      }

      const trimmed = applicationMd.trim();
      if (!trimmed || trimmed.length < 20) {
        return { error: 'Please write at least a few sentences describing your recipe background and motivation.' };
      }

      if (trimmed.length > 20000) {
        return { error: 'Application exceeds maximum allowed length of 20,000 characters.' };
      }

      const { data, error } = await supabase
        .from('creator_applications')
        .insert({
          user_id: userId,
          application_md: trimmed,
          status: 'pending'
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505' || error.message.includes('unique_pending_creator_application_per_user')) {
          return { error: 'You already have a creator application pending review.' };
        }
        return { error: error.message };
      }

      return { application: mapRow(data) };
    } catch (err: any) {
      return { error: err?.message || 'Failed to submit creator application.' };
    }
  }
};
