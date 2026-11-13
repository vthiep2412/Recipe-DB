import { useState, useEffect, useMemo } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import {
  FileText,
  Users,
  ClipboardList,
  Check,
  X,
  Trash2,
  Edit3,
  UserCheck,
  UserMinus,
  Archive,
} from 'lucide-preact';
import { renderAppMarkdown } from '../utils/markdown';
import { toast } from 'sonner';
import { authStore } from '../services/authStore';
import { adminService } from '../services/adminService';
import { invalidateRecipeCache } from '../recipes';
import { ConfirmModal } from './ConfirmModal';
import type {
  CloudRecipe,
  UserProfile,
  CreatorApplication,
  CloudRecipeStatus,
  UserRole,
  CreatorApplicationStatus,
} from '../types/cloud';

function renderPitchMarkdown(rawMarkdown: string): string {
  return renderAppMarkdown(rawMarkdown, {
    profile: 'admin'
  });
}

export interface AdminPanelProps {
  onNavigate: (path: string) => void;
}

export function AdminPanel({ onNavigate }: AdminPanelProps) {
  const [authState, setAuthState] = useState(authStore.getState());
  const [activeTab, setActiveTab] = useState<'recipes' | 'users' | 'applications'>('recipes');

  // Recipes Tab State
  const [recipes, setRecipes] = useState<CloudRecipe[]>([]);
  const [recipesSearch, setRecipesSearch] = useState('');
  const [recipesFilter, setRecipesFilter] = useState<'all' | CloudRecipeStatus>('all');
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipesError, setRecipesError] = useState<string | null>(null);

  // Users Tab State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersFilter, setUsersFilter] = useState<'all' | UserRole>('all');
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  // Applications Tab State
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [appsSearch, setAppsSearch] = useState('');
  const [appsFilter, setAppsFilter] = useState<'all' | CreatorApplicationStatus>('all');
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [pitchViewModes, setPitchViewModes] = useState<Record<string, 'rendered' | 'raw'>>({});

  // Modal confirmation state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: ComponentChildren;
    confirmLabel?: string;
    confirmVariant?: 'primary' | 'danger';
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = authStore.subscribe((state) => {
      setAuthState(state);
      if (!state.user && !state.isAuthLoading) {
        onNavigate('/auth');
      } else if (state.role && state.role !== 'admin') {
        onNavigate('/');
      }
    });

    const current = authStore.getState();
    if (!current.user && !current.isAuthLoading) {
      onNavigate('/auth');
    } else if (current.role && current.role !== 'admin') {
      onNavigate('/');
    }

    // Proactively preload applications so pending count badge is accurate immediately
    adminService.listApplications().then((list) => {
      if (list) setApplications(list);
    }).catch(() => {});

    return () => unsubscribe();
  }, [onNavigate]);

  const loadData = async () => {
    const currentAuth = authStore.getState();
    const userRole = currentAuth.role || currentAuth.profile?.role;
    if (!currentAuth.user || userRole !== 'admin') {
      return;
    }
    if (activeTab === 'recipes') {
      setRecipesLoading(true);
      setRecipesError(null);
      try {
        const list = await adminService.listModerationRecipes();
        setRecipes(list || []);
      } catch (err: unknown) {
        setRecipesError(err instanceof Error ? err.message : 'Failed to load recipes');
      } finally {
        setRecipesLoading(false);
      }
    } else if (activeTab === 'users') {
      setUsersLoading(true);
      setUsersError(null);
      try {
        const list = await adminService.listProfiles();
        setUsers(list || []);
      } catch (err: unknown) {
        setUsersError(err instanceof Error ? err.message : 'Failed to load user accounts');
      } finally {
        setUsersLoading(false);
      }
    } else if (activeTab === 'applications') {
      setAppsLoading(true);
      setAppsError(null);
      try {
        const list = await adminService.listApplications();
        setApplications(list || []);
      } catch (err: unknown) {
        setAppsError(err instanceof Error ? err.message : 'Failed to load creator applications');
      } finally {
        setAppsLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const pendingAppsCount = useMemo(() => {
    return applications.filter((a) => a.status === 'pending').length;
  }, [applications]);

  // Recipe Actions
  const handleUpdateRecipeStatus = async (recipeId: string, status: CloudRecipeStatus) => {
    try {
      const res = await adminService.updateRecipeStatus(recipeId, status);
      if (res?.error) {
        toast.error(res.error, { duration: 4000 });
      } else {
        invalidateRecipeCache();
        toast.success(`Recipe status updated to ${status}.`, { duration: 4000 });
        setRecipes((prev) =>
          prev.map((r) => (r.id === recipeId ? { ...r, status } : r))
        );
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Action failed.', { duration: 4000 });
    }
  };

  const promptTakeDownRecipe = (recipe: CloudRecipe) => {
    setConfirmModal({
      isOpen: true,
      title: 'Take Down Recipe',
      message: (
        <>
          Are you sure you want to take down <strong>{recipe.title}</strong> from the public catalog? It will no longer be visible to users.
        </>
      ),
      confirmLabel: 'Take Down',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setIsConfirmLoading(true);
        try {
          await handleUpdateRecipeStatus(recipe.id, 'rejected');
        } finally {
          setIsConfirmLoading(false);
          setConfirmModal(null);
        }
      }
    });
  };

  const promptDeleteRecipe = (recipe: CloudRecipe) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Recipe',
      message: (
        <>
          Are you sure you want to permanently delete <strong>{recipe.title}</strong>? This action cannot be undone.
        </>
      ),
      confirmLabel: 'Delete Recipe',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setIsConfirmLoading(true);
        try {
          const res = await adminService.deleteRecipe(recipe.id);
          if (res?.error) {
            toast.error(res.error, { duration: 4000 });
          } else {
            invalidateRecipeCache();
            toast.success('Recipe deleted.', { duration: 4000 });
            setRecipes((prev) => prev.filter((r) => r.id !== recipe.id));
          }
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : 'Action failed.', { duration: 4000 });
        } finally {
          setIsConfirmLoading(false);
          setConfirmModal(null);
        }
      }
    });
  };

  // User Actions
  const handleUpdateUserRole = async (userId: string, role: UserRole) => {
    if (userId === authState.user?.id) {
      toast.error('You cannot change your own administrator role.', { duration: 4000 });
      return;
    }
    try {
      const res = await adminService.updateUserRole(userId, role);
      if (res?.error) {
        toast.error(res.error, { duration: 4000 });
      } else {
        toast.success(`User role updated to ${role}.`, { duration: 4000 });
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role } : u))
        );
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Action failed.', { duration: 4000 });
    }
  };

  const promptToggleArchive = (user: UserProfile) => {
    if (user.id === authState.user?.id) {
      toast.error('You cannot archive your own administrator account.', { duration: 4000 });
      return;
    }
    const willArchive = !user.isArchived;
    setConfirmModal({
      isOpen: true,
      title: willArchive ? 'Archive User Account' : 'Unarchive User Account',
      message: willArchive ? (
        <>
          Are you sure you want to archive <strong>@{user.username}</strong> ({user.displayName})? Their access will be suspended immediately.
        </>
      ) : (
        <>
          Are you sure you want to unarchive <strong>@{user.username}</strong> ({user.displayName})? Their account access will be restored.
        </>
      ),
      confirmLabel: willArchive ? 'Archive Account' : 'Unarchive Account',
      confirmVariant: willArchive ? 'danger' : 'primary',
      onConfirm: async () => {
        setIsConfirmLoading(true);
        try {
          const res = await adminService.setUserArchived(user.id, willArchive);
          if (res?.error) {
            toast.error(res.error, { duration: 4000 });
          } else {
            toast.success(`User ${willArchive ? 'archived' : 'unarchived'}.`, { duration: 4000 });
            setUsers((prev) =>
              prev.map((u) => (u.id === user.id ? { ...u, isArchived: willArchive } : u))
            );
          }
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : 'Action failed.', { duration: 4000 });
        } finally {
          setIsConfirmLoading(false);
          setConfirmModal(null);
        }
      }
    });
  };

  const promptScheduleUserDeletion = (user: UserProfile) => {
    if (user.id === authState.user?.id) {
      toast.error('You cannot schedule your own administrator account for deletion.', { duration: 4000 });
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: 'Schedule User Deletion',
      message: (
        <>
          Are you sure you want to schedule <strong>@{user.username}</strong> ({user.displayName}) for permanent deletion in 30 days?
        </>
      ),
      confirmLabel: 'Schedule Deletion',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setIsConfirmLoading(true);
        try {
          const res = await adminService.scheduleUserDeletion(user.id);
          if (res?.error) {
            toast.error(res.error, { duration: 4000 });
          } else {
            toast.success('User scheduled for deletion.', { duration: 4000 });
            loadData();
          }
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : 'Action failed.', { duration: 4000 });
        } finally {
          setIsConfirmLoading(false);
          setConfirmModal(null);
        }
      }
    });
  };

  // Application Actions
  const promptApproveApplication = (app: CreatorApplication) => {
    const applicantName = app.profile?.displayName || app.profile?.username || 'Applicant';
    setConfirmModal({
      isOpen: true,
      title: 'Approve Creator Application',
      message: (
        <>
          Are you sure you want to approve the application from <strong>{applicantName}</strong>? This will promote their role to Creator.
        </>
      ),
      confirmLabel: 'Approve Application',
      confirmVariant: 'primary',
      onConfirm: async () => {
        setIsConfirmLoading(true);
        try {
          const res = await adminService.approveApplication(app.id);
          if (res?.error) {
            toast.error(res.error, { duration: 4000 });
          } else {
            toast.success('Creator application approved.', { duration: 4000 });
            setApplications((prev) =>
              prev.map((a) => (a.id === app.id ? { ...a, status: 'approved' } : a))
            );
          }
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : 'Action failed.', { duration: 4000 });
        } finally {
          setIsConfirmLoading(false);
          setConfirmModal(null);
        }
      }
    });
  };

  const promptRejectApplication = (app: CreatorApplication) => {
    const applicantName = app.profile?.displayName || app.profile?.username || 'Applicant';
    setConfirmModal({
      isOpen: true,
      title: 'Reject Creator Application',
      message: (
        <>
          Are you sure you want to reject the application from <strong>{applicantName}</strong>?
        </>
      ),
      confirmLabel: 'Reject Application',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setIsConfirmLoading(true);
        try {
          const res = await adminService.rejectApplication(app.id);
          if (res?.error) {
            toast.error(res.error, { duration: 4000 });
          } else {
            toast.success('Creator application rejected.', { duration: 4000 });
            setApplications((prev) =>
              prev.map((a) => (a.id === app.id ? { ...a, status: 'rejected' } : a))
            );
          }
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : 'Action failed.', { duration: 4000 });
        } finally {
          setIsConfirmLoading(false);
          setConfirmModal(null);
        }
      }
    });
  };

  // Filtered lists
  const filteredRecipes = useMemo(() => {
    return recipes.filter((r) => {
      const matchesSearch =
        !recipesSearch ||
        r.title.toLowerCase().includes(recipesSearch.toLowerCase()) ||
        r.tags.some((t) => t.toLowerCase().includes(recipesSearch.toLowerCase())) ||
        (r.slug && r.slug.toLowerCase().includes(recipesSearch.toLowerCase()));
      const matchesFilter = recipesFilter === 'all' || r.status === recipesFilter;
      return matchesSearch && matchesFilter;
    });
  }, [recipes, recipesSearch, recipesFilter]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        !usersSearch ||
        u.username.toLowerCase().includes(usersSearch.toLowerCase()) ||
        u.displayName.toLowerCase().includes(usersSearch.toLowerCase());
      const matchesFilter = usersFilter === 'all' || u.role === usersFilter;
      return matchesSearch && matchesFilter;
    });
  }, [users, usersSearch, usersFilter]);

  const filteredApplications = useMemo(() => {
    return applications.filter((a) => {
      const username = a.profile?.username || '';
      const matchesSearch =
        !appsSearch || username.toLowerCase().includes(appsSearch.toLowerCase());
      const matchesFilter = appsFilter === 'all' || a.status === appsFilter;
      return matchesSearch && matchesFilter;
    });
  }, [applications, appsSearch, appsFilter]);

  const userRole = authState.role || authState.profile?.role;
  if (authState.isAuthLoading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <p style={{ color: 'var(--text-muted)' }}>Checking admin authorization...</p>
      </div>
    );
  }
  if (!authState.user || userRole !== 'admin') {
    return null;
  }

  return (
    <div className="admin-shell">
      {/* Sidebar Navigation */}
      <aside className="admin-sidebar">
        <div className="sidebar-category">Moderation</div>

        <button
          type="button"
          className={`sidebar-tab-btn ${activeTab === 'recipes' ? 'active' : ''}`}
          onClick={() => setActiveTab('recipes')}
        >
          <FileText size={16} />
          <span>Recipe Moderation</span>
        </button>

        <button
          type="button"
          className={`sidebar-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={16} />
          <span>User Management</span>
        </button>

        <button
          type="button"
          className={`sidebar-tab-btn ${activeTab === 'applications' ? 'active' : ''}`}
          onClick={() => setActiveTab('applications')}
        >
          <ClipboardList size={16} />
          <span>Creator Applications</span>
          {pendingAppsCount > 0 && <span className="sidebar-count">{pendingAppsCount}</span>}
        </button>
      </aside>

      {/* Main Admin Content */}
      <div className="admin-content">
        {/* Tab 1: Recipe Moderation */}
        {activeTab === 'recipes' && (
          <>
            <div className="admin-header">
              <div>
                <h1 className="admin-title">Recipe Moderation</h1>
                <p className="admin-subtitle">
                  Review incoming submissions, approve for public catalog, or take down.
                </p>
              </div>
            </div>

            <div className="admin-toolbar">
              <input
                className="search-box"
                type="text"
                placeholder="Search recipes by title, slug, or tag..."
                value={recipesSearch}
                onInput={(e) => setRecipesSearch((e.target as HTMLInputElement).value)}
              />
              <button
                type="button"
                className={`filter-pill ${recipesFilter === 'all' ? 'active' : ''}`}
                onClick={() => setRecipesFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`filter-pill ${recipesFilter === 'pending' ? 'active' : ''}`}
                onClick={() => setRecipesFilter('pending')}
              >
                Pending
              </button>
              <button
                type="button"
                className={`filter-pill ${recipesFilter === 'approved' ? 'active' : ''}`}
                onClick={() => setRecipesFilter('approved')}
              >
                Published
              </button>
              <button
                type="button"
                className={`filter-pill ${recipesFilter === 'rejected' ? 'active' : ''}`}
                onClick={() => setRecipesFilter('rejected')}
              >
                Taken Down
              </button>
            </div>

            <div className="admin-body">
              {recipesError ? (
                <div className="admin-error-banner" role="alert" style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-red, #ef4444)', borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <span style={{ color: 'var(--color-red, #ef4444)', fontSize: '0.9rem' }}>{recipesError}</span>
                  <button type="button" className="studio-btn studio-btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={loadData}>
                    Retry
                  </button>
                </div>
              ) : recipesLoading ? (
                <div className="admin-empty-state">Loading recipes...</div>
              ) : filteredRecipes.length === 0 ? (
                <div className="admin-empty-state">No recipes found matching current filters.</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Recipe</th>
                      <th>Tags</th>
                      <th>Status</th>
                      <th>Submitted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecipes.map((recipe) => (
                      <tr key={recipe.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{recipe.title}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>
                            {recipe.slug || recipe.id}
                          </div>
                        </td>
                        <td>
                          {recipe.tags && recipe.tags.length > 0 ? (
                            recipe.tags.map((tag) => (
                              <span key={tag} className="recipe-card-tag">
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: 'var(--text-faint)', fontSize: '0.75rem' }}>
                              None
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              recipe.status === 'approved'
                                ? 'badge-approved'
                                : recipe.status === 'rejected'
                                ? 'badge-rejected'
                                : 'badge-pending'
                            }`}
                          >
                            {recipe.status === 'approved'
                              ? 'Published'
                              : recipe.status === 'rejected'
                              ? 'Taken Down'
                              : 'Pending'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                          {new Date(recipe.createdAt).toLocaleDateString()}
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="row-action-btn accent"
                              onClick={() => onNavigate(`/kitchen-studio/making-recipe/${recipe.id}`)}
                            >
                              <Edit3 size={13} /> Edit
                            </button>
                            {recipe.status !== 'approved' && (
                              <button
                                type="button"
                                className="row-action-btn green"
                                onClick={() => handleUpdateRecipeStatus(recipe.id, 'approved')}
                              >
                                <Check size={13} /> Publish
                              </button>
                            )}
                            {recipe.status === 'approved' && (
                              <button
                                type="button"
                                className="row-action-btn"
                                onClick={() => promptTakeDownRecipe(recipe)}
                              >
                                Take Down
                              </button>
                            )}
                            <button
                              type="button"
                              className="row-action-btn red"
                              onClick={() => promptDeleteRecipe(recipe)}
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* Tab 2: User Management */}
        {activeTab === 'users' && (
          <>
            <div className="admin-header">
              <div>
                <h1 className="admin-title">User Management</h1>
                <p className="admin-subtitle">
                  Promote or demote roles, archive accounts, and schedule deletions.
                </p>
              </div>
            </div>

            <div className="admin-toolbar">
              <input
                className="search-box"
                type="text"
                placeholder="Search by username or display name..."
                value={usersSearch}
                onInput={(e) => setUsersSearch((e.target as HTMLInputElement).value)}
              />
              <button
                type="button"
                className={`filter-pill ${usersFilter === 'all' ? 'active' : ''}`}
                onClick={() => setUsersFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`filter-pill ${usersFilter === 'user' ? 'active' : ''}`}
                onClick={() => setUsersFilter('user')}
              >
                Users
              </button>
              <button
                type="button"
                className={`filter-pill ${usersFilter === 'recipe_creator' ? 'active' : ''}`}
                onClick={() => setUsersFilter('recipe_creator')}
              >
                Creators
              </button>
              <button
                type="button"
                className={`filter-pill ${usersFilter === 'admin' ? 'active' : ''}`}
                onClick={() => setUsersFilter('admin')}
              >
                Admins
              </button>
            </div>

            <div className="admin-body">
              {usersError ? (
                <div className="admin-error-banner" role="alert" style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-red, #ef4444)', borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <span style={{ color: 'var(--color-red, #ef4444)', fontSize: '0.9rem' }}>{usersError}</span>
                  <button type="button" className="studio-btn studio-btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={loadData}>
                    Retry
                  </button>
                </div>
              ) : usersLoading ? (
                <div className="admin-empty-state">Loading users...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="admin-empty-state">No users found.</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Joined</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => {
                      const isSelf = u.id === authState.user?.id;
                      return (
                      <tr key={u.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontWeight: 600 }}>{u.displayName}</span>
                            {isSelf && (
                              <span className="badge badge-admin" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>
                                You
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>
                            @{u.username}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              u.role === 'admin'
                                ? 'badge-admin'
                                : u.role === 'recipe_creator'
                                ? 'badge-creator'
                                : 'badge-user'
                            }`}
                          >
                            {u.role === 'recipe_creator'
                              ? 'Creator'
                              : u.role === 'admin'
                              ? 'Admin'
                              : 'User'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td>
                          {u.scheduledDeleteAt ? (
                            <span style={{ color: 'var(--color-red, #ef4444)', fontSize: '0.8rem', fontWeight: 600 }}>
                              Scheduled Deletion
                            </span>
                          ) : u.isArchived ? (
                            <span style={{ color: '#f97316', fontSize: '0.8rem', fontWeight: 600 }}>
                              Archived
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-green, #22c55e)', fontSize: '0.8rem' }}>
                              Active
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="table-actions">
                            {isSelf ? (
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-faint)', fontStyle: 'italic', padding: '0.2rem 0' }}>
                                Your Account (Protected)
                              </span>
                            ) : (
                              <>
                                {u.role === 'user' && (
                                  <button
                                    type="button"
                                    className="row-action-btn green"
                                    onClick={() => handleUpdateUserRole(u.id, 'recipe_creator')}
                                  >
                                    <UserCheck size={13} /> Promote to Creator
                                  </button>
                                )}
                                {u.role === 'recipe_creator' && (
                                  <button
                                    type="button"
                                    className="row-action-btn"
                                    onClick={() => handleUpdateUserRole(u.id, 'user')}
                                  >
                                    <UserMinus size={13} /> Demote
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="row-action-btn orange"
                                  onClick={() => promptToggleArchive(u)}
                                >
                                  <Archive size={13} /> {u.isArchived ? 'Unarchive' : 'Archive'}
                                </button>
                                {!u.scheduledDeleteAt && (
                                  <button
                                    type="button"
                                    className="row-action-btn red"
                                    onClick={() => promptScheduleUserDeletion(u)}
                                  >
                                    <Trash2 size={13} /> Schedule delete
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* Tab 3: Creator Applications */}
        {activeTab === 'applications' && (
          <>
            <div className="admin-header">
              <div>
                <h1 className="admin-title">Creator Applications</h1>
                <p className="admin-subtitle">
                  Review potential recipe maker Applications.
                </p>
              </div>
            </div>

            <div className="admin-toolbar">
              <input
                className="search-box"
                type="text"
                placeholder="Search applicant usernames..."
                value={appsSearch}
                onInput={(e) => setAppsSearch((e.target as HTMLInputElement).value)}
              />
              <button
                type="button"
                className={`filter-pill ${appsFilter === 'all' ? 'active' : ''}`}
                onClick={() => setAppsFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`filter-pill ${appsFilter === 'pending' ? 'active' : ''}`}
                onClick={() => setAppsFilter('pending')}
              >
                Pending
              </button>
              <button
                type="button"
                className={`filter-pill ${appsFilter === 'reviewed' ? 'active' : ''}`}
                onClick={() => setAppsFilter('reviewed')}
              >
                Reviewed
              </button>
              <button
                type="button"
                className={`filter-pill ${appsFilter === 'approved' ? 'active' : ''}`}
                onClick={() => setAppsFilter('approved')}
              >
                Approved
              </button>
              <button
                type="button"
                className={`filter-pill ${appsFilter === 'rejected' ? 'active' : ''}`}
                onClick={() => setAppsFilter('rejected')}
              >
                Rejected
              </button>
            </div>

            <div className="admin-body">
              {appsError ? (
                <div className="admin-error-banner" role="alert" style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-red, #ef4444)', borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <span style={{ color: 'var(--color-red, #ef4444)', fontSize: '0.9rem' }}>{appsError}</span>
                  <button type="button" className="studio-btn studio-btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={loadData}>
                    Retry
                  </button>
                </div>
              ) : appsLoading ? (
                <div className="admin-empty-state">Loading applications...</div>
              ) : filteredApplications.length === 0 ? (
                <div className="admin-empty-state">No creator applications found.</div>
              ) : (
                filteredApplications.map((app) => {
                  const viewMode = pitchViewModes[app.id] || 'rendered';
                  const initials = (app.profile?.displayName || 'Applicant')
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <div key={app.id} className="creator-pitch-card">
                      <div className="pitch-header">
                        <div className="pitch-user-row">
                          <div className="pitch-avatar">{initials}</div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                              {app.profile?.displayName || 'Applicant'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              @{app.profile?.username || 'user'}
                            </div>
                          </div>
                          <span
                            className={`badge ${
                              app.status === 'approved'
                                ? 'badge-approved'
                                : app.status === 'rejected'
                                ? 'badge-rejected'
                                : 'badge-pending'
                            }`}
                            style={{ marginLeft: '0.5rem' }}
                          >
                            {app.status}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <div className="source-switch">
                            <button
                              type="button"
                              className={`source-switch-btn ${
                                viewMode === 'rendered' ? 'active' : ''
                              }`}
                              onClick={() =>
                                setPitchViewModes((prev) => ({ ...prev, [app.id]: 'rendered' }))
                              }
                            >
                              Preview
                            </button>
                            <button
                              type="button"
                              className={`source-switch-btn ${
                                viewMode === 'raw' ? 'active' : ''
                              }`}
                              onClick={() =>
                                setPitchViewModes((prev) => ({ ...prev, [app.id]: 'raw' }))
                              }
                            >
                              Source
                            </button>
                          </div>

                          {app.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                className="row-action-btn green"
                                onClick={() => promptApproveApplication(app)}
                              >
                                <Check size={13} /> Approve
                              </button>
                              <button
                                type="button"
                                className="row-action-btn red"
                                onClick={() => promptRejectApplication(app)}
                              >
                                <X size={13} /> Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {viewMode === 'rendered' ? (
                        <div
                          className="pitch-rendered"
                          dangerouslySetInnerHTML={{
                            __html: renderPitchMarkdown(app.applicationMd || ''),
                          }}
                        />
                      ) : (
                        <pre className="pitch-raw">{app.applicationMd}</pre>
                      )}

                      <div className="pitch-footer">
                        Applied {new Date(app.createdAt).toLocaleDateString()}
                        {app.reviewedAt && (
                          <span> • Reviewed {new Date(app.reviewedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {confirmModal && (
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          confirmVariant={confirmModal.confirmVariant}
          isLoading={isConfirmLoading}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => {
            if (!isConfirmLoading) {
              setConfirmModal(null);
            }
          }}
        />
      )}
    </div>
  );
}
