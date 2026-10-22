import { useState, useEffect, useMemo } from 'preact/hooks';
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
import { marked } from 'marked';
import { authStore } from '../services/authStore';
import { adminService } from '../services/adminService';
import type {
  CloudRecipe,
  UserProfile,
  CreatorApplication,
  CloudRecipeStatus,
  UserRole,
  CreatorApplicationStatus,
} from '../types/cloud';

function sanitizeMarkdownHtml(rawHtml: string): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return '';
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');

  const forbiddenTags = [
    'script', 'style', 'iframe', 'frame', 'object', 'embed', 'applet',
    'link', 'meta', 'base', 'form', 'input', 'button', 'select', 'textarea',
    'svg', 'math'
  ];

  for (const tag of forbiddenTags) {
    const elements = doc.querySelectorAll(tag);
    elements.forEach(el => el.remove());
  }

  const allElements = doc.querySelectorAll('*');
  for (const el of allElements) {
    const attributeNames = el.getAttributeNames();
    for (const attr of attributeNames) {
      if (attr.toLowerCase().startsWith('on')) {
        el.removeAttribute(attr);
      }
    }

    if (el.hasAttribute('href')) {
      const href = el.getAttribute('href') || '';
      const cleanHref = href.trim().toLowerCase();
      if (
        cleanHref.startsWith('javascript:') ||
        cleanHref.startsWith('vbscript:') ||
        cleanHref.startsWith('data:')
      ) {
        el.removeAttribute('href');
      } else {
        el.setAttribute('rel', 'noopener noreferrer');
        el.setAttribute('target', '_blank');
      }
    }

    if (el.hasAttribute('src')) {
      const src = el.getAttribute('src') || '';
      const cleanSrc = src.trim().toLowerCase();
      if (!cleanSrc.startsWith('https://') && !cleanSrc.startsWith('http://')) {
        el.removeAttribute('src');
      }
    }
  }

  return doc.body.innerHTML;
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

  // Users Tab State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersFilter, setUsersFilter] = useState<'all' | UserRole>('all');
  const [usersLoading, setUsersLoading] = useState(false);

  // Applications Tab State
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [appsSearch, setAppsSearch] = useState('');
  const [appsFilter, setAppsFilter] = useState<'all' | CreatorApplicationStatus>('all');
  const [appsLoading, setAppsLoading] = useState(false);
  const [pitchViewModes, setPitchViewModes] = useState<Record<string, 'rendered' | 'raw'>>({});

  // Feedback message
  const [actionNotice, setActionNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

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

    return () => unsubscribe();
  }, [onNavigate]);

  const loadData = async () => {
    if (activeTab === 'recipes') {
      setRecipesLoading(true);
      try {
        const list = await adminService.listModerationRecipes();
        setRecipes(list || []);
      } catch {
        // Data fetch error fallback
      } finally {
        setRecipesLoading(false);
      }
    } else if (activeTab === 'users') {
      setUsersLoading(true);
      try {
        const list = await adminService.listProfiles();
        setUsers(list || []);
      } catch {
        // Data fetch error fallback
      } finally {
        setUsersLoading(false);
      }
    } else if (activeTab === 'applications') {
      setAppsLoading(true);
      try {
        const list = await adminService.listApplications();
        setApplications(list || []);
      } catch {
        // Data fetch error fallback
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
    setActionNotice(null);
    try {
      const res = await adminService.updateRecipeStatus(recipeId, status);
      if (res?.error) {
        setActionNotice({ type: 'error', text: res.error });
      } else {
        setActionNotice({ type: 'success', text: `Recipe status updated to ${status}.` });
        setRecipes((prev) =>
          prev.map((r) => (r.id === recipeId ? { ...r, status } : r))
        );
      }
    } catch (err: unknown) {
      setActionNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Action failed.',
      });
    }
  };

  const handleDeleteRecipe = async (recipeId: string) => {
    if (!confirm('Are you sure you want to permanently delete this recipe?')) return;
    setActionNotice(null);
    try {
      const res = await adminService.deleteRecipe(recipeId);
      if (res?.error) {
        setActionNotice({ type: 'error', text: res.error });
      } else {
        setActionNotice({ type: 'success', text: 'Recipe deleted.' });
        setRecipes((prev) => prev.filter((r) => r.id !== recipeId));
      }
    } catch (err: unknown) {
      setActionNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Action failed.',
      });
    }
  };

  // User Actions
  const handleUpdateUserRole = async (userId: string, role: UserRole) => {
    setActionNotice(null);
    try {
      const res = await adminService.updateUserRole(userId, role);
      if (res?.error) {
        setActionNotice({ type: 'error', text: res.error });
      } else {
        setActionNotice({ type: 'success', text: `User role updated to ${role}.` });
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role } : u))
        );
      }
    } catch (err: unknown) {
      setActionNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Action failed.',
      });
    }
  };

  const handleToggleArchive = async (userId: string, currentArchived: boolean) => {
    setActionNotice(null);
    try {
      const res = await adminService.setUserArchived(userId, !currentArchived);
      if (res?.error) {
        setActionNotice({ type: 'error', text: res.error });
      } else {
        setActionNotice({
          type: 'success',
          text: `User ${currentArchived ? 'unarchived' : 'archived'}.`,
        });
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, isArchived: !currentArchived } : u))
        );
      }
    } catch (err: unknown) {
      setActionNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Action failed.',
      });
    }
  };

  const handleScheduleUserDeletion = async (userId: string) => {
    if (!confirm('Are you sure you want to schedule this user for deletion in 30 days?')) return;
    setActionNotice(null);
    try {
      const res = await adminService.scheduleUserDeletion(userId);
      if (res?.error) {
        setActionNotice({ type: 'error', text: res.error });
      } else {
        setActionNotice({ type: 'success', text: 'User scheduled for deletion.' });
        loadData();
      }
    } catch (err: unknown) {
      setActionNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Action failed.',
      });
    }
  };

  // Application Actions
  const handleApproveApplication = async (appId: string) => {
    setActionNotice(null);
    try {
      const res = await adminService.approveApplication(appId);
      if (res?.error) {
        setActionNotice({ type: 'error', text: res.error });
      } else {
        setActionNotice({ type: 'success', text: 'Creator application approved.' });
        setApplications((prev) =>
          prev.map((a) => (a.id === appId ? { ...a, status: 'approved' } : a))
        );
      }
    } catch (err: unknown) {
      setActionNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Action failed.',
      });
    }
  };

  const handleRejectApplication = async (appId: string) => {
    setActionNotice(null);
    try {
      const res = await adminService.rejectApplication(appId);
      if (res?.error) {
        setActionNotice({ type: 'error', text: res.error });
      } else {
        setActionNotice({ type: 'success', text: 'Creator application rejected.' });
        setApplications((prev) =>
          prev.map((a) => (a.id === appId ? { ...a, status: 'rejected' } : a))
        );
      }
    } catch (err: unknown) {
      setActionNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Action failed.',
      });
    }
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
        {actionNotice && (
          <div
            className={`auth-msg-banner ${actionNotice.type}`}
            style={{ margin: '0.75rem 1.5rem 0' }}
          >
            {actionNotice.text}
          </div>
        )}

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
              {authState.profile && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Admin: <strong>@{authState.profile.username}</strong>
                </div>
              )}
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
              {recipesLoading ? (
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
                                onClick={() => handleUpdateRecipeStatus(recipe.id, 'rejected')}
                              >
                                Take Down
                              </button>
                            )}
                            <button
                              type="button"
                              className="row-action-btn red"
                              onClick={() => handleDeleteRecipe(recipe.id)}
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
              {usersLoading ? (
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
                    {filteredUsers.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{u.displayName}</div>
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
                          {u.isArchived ? (
                            <span style={{ color: 'var(--text-faint)', fontSize: '0.8rem' }}>
                              Archived
                            </span>
                          ) : u.scheduledDeleteAt ? (
                            <span style={{ color: 'var(--color-red)', fontSize: '0.8rem' }}>
                              Pending Delete
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-green)', fontSize: '0.8rem' }}>
                              Active
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="table-actions">
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
                              className="row-action-btn"
                              onClick={() => handleToggleArchive(u.id, u.isArchived)}
                            >
                              <Archive size={13} /> {u.isArchived ? 'Unarchive' : 'Archive'}
                            </button>
                            {!u.scheduledDeleteAt && (
                              <button
                                type="button"
                                className="row-action-btn red"
                                onClick={() => handleScheduleUserDeletion(u.id)}
                              >
                                <Trash2 size={13} /> Schedule delete
                              </button>
                            )}
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

        {/* Tab 3: Creator Applications */}
        {activeTab === 'applications' && (
          <>
            <div className="admin-header">
              <div>
                <h1 className="admin-title">Creator Applications</h1>
                <p className="admin-subtitle">
                  Review markdown pitches with toggleable Preview and Raw Source view.
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
              {appsLoading ? (
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
                                onClick={() => handleApproveApplication(app.id)}
                              >
                                <Check size={13} /> Approve
                              </button>
                              <button
                                type="button"
                                className="row-action-btn red"
                                onClick={() => handleRejectApplication(app.id)}
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
                            __html: sanitizeMarkdownHtml(marked.parse(app.applicationMd || '') as string),
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
    </div>
  );
}
