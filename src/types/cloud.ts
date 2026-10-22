import type { StudioWorkspace } from './orchestration';

export type UserRole = 'user' | 'recipe_creator' | 'admin';

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  usernameLastChangedAt: string | null;
  displayNameLastChangedAt: string | null;
  isArchived: boolean;
  scheduledDeleteAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthState {
  user: AuthUser | null;
  profile: UserProfile | null;
  role: UserRole | null;
  isAuthLoading: boolean;
  showModal: boolean;
  modalContextCaption: string | null;
}

export type CreatorApplicationStatus = 'pending' | 'reviewed' | 'approved' | 'rejected';

export interface CreatorApplication {
  id: string;
  userId: string;
  applicationMd: string;
  status: CreatorApplicationStatus;
  createdAt: string;
  reviewedAt: string | null;
  profile?: {
    username: string;
    displayName: string;
  };
}

export type CloudRecipeStatus = 'pending' | 'approved' | 'rejected';

export interface CloudRecipe {
  id: string;
  slug: string | null;
  ownerId: string;
  title: string;
  description: string;
  imageUrl: string;
  tags: string[];
  status: CloudRecipeStatus;
  saveCount: number;
  comments: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface CloudRecipeDetails {
  recipeId: string;
  sectionsAst: Record<string, unknown>;
  ingredientsIndex: unknown[];
  cookwareIndex: unknown[];
  rawFablang: string;
  importantNotes: string;
}

export type CloudinaryAssetType = 'image' | 'video';

export interface CloudinaryResult {
  secure_url: string;
  public_id: string;
  resource_type: CloudinaryAssetType;
}

export interface AuthStoreAPI {
  useAuth(): AuthState;
  getState(): AuthState;
  openAuthModal(caption?: string): void;
  closeAuthModal(): void;
  signIn(email: string, password: string): Promise<{ error?: string }>;
  signUp(params: {
    email: string;
    password: string;
    username: string;
    displayName: string;
  }): Promise<{ error?: string }>;
  signOut(): Promise<void>;
  signOutAll(): Promise<void>;
  updateDisplayName(name: string): Promise<{ error?: string }>;
  updateUsername(handle: string): Promise<{ error?: string }>;
  updateCredentials(params: { email?: string; password?: string }): Promise<{ error?: string }>;
  scheduleAccountDeletion(): Promise<{ error?: string }>;
  cancelAccountDeletion(): Promise<{ error?: string }>;
  subscribe(listener: (state: AuthState) => void): () => void;
}

export interface LocalMediaStoreAPI {
  saveBlob(key: string, blob: Blob): Promise<void>;
  loadBlob(key: string): Promise<Blob | null>;
  deleteBlob(key: string): Promise<void>;
  clearWorkspace(workspaceId: string): Promise<void>;
}

export interface CloudinaryServiceAPI {
  uploadAsset(
    blob: Blob,
    type: CloudinaryAssetType,
    folder: 'recipes/images' | 'recipes/videos'
  ): Promise<CloudinaryResult>;
}

export interface CloudRecipeStorageAPI {
  submitRecipe(
    workspace: StudioWorkspace,
    targetStatus: 'pending' | 'approved'
  ): Promise<{ ok: boolean; id?: string; error?: string }>;

  listUserRecipes(ownerId: string): Promise<CloudRecipe[]>;

  fetchRecipeBySlugOrId(identifier: string): Promise<{
    recipe: CloudRecipe;
    details: CloudRecipeDetails;
  } | null>;
}

export interface AdminServiceAPI {
  listModerationRecipes(params?: {
    status?: CloudRecipeStatus;
    searchQuery?: string;
  }): Promise<CloudRecipe[]>;
  updateRecipeStatus(recipeId: string, status: CloudRecipeStatus): Promise<{ error?: string }>;
  deleteRecipe(recipeId: string): Promise<{ error?: string }>;

  listProfiles(params?: {
    role?: UserRole;
    searchQuery?: string;
  }): Promise<UserProfile[]>;
  updateUserRole(userId: string, role: UserRole): Promise<{ error?: string }>;
  setUserArchived(userId: string, isArchived: boolean): Promise<{ error?: string }>;
  scheduleUserDeletion(userId: string): Promise<{ error?: string }>;

  listApplications(params?: {
    status?: CreatorApplicationStatus;
    searchQuery?: string;
  }): Promise<CreatorApplication[]>;
  approveApplication(applicationId: string): Promise<{ error?: string }>;
  rejectApplication(applicationId: string): Promise<{ error?: string }>;
}
