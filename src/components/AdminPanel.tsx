import { useState, useEffect } from 'preact/hooks';
import { ChefHat, Users, FileText, Check, X, Trash2, UserX } from 'lucide-preact';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { supabase } from '../services/supabaseClient';
import '../styles/admin-panel.css';

interface RecipeRow {
  id: string;
  slug: string | null;
  title: string;
  category: string | null;
  tags: string[];
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  profiles?: {
    username: string;
    display_name: string;
  };
}

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: 'user' | 'recipe_creator' | 'admin';
  is_archived: boolean;
  scheduled_delete_at: string | null;
  created_at: string;
}

interface ApplicationRow {
  id: string;
  user_id: string;
  application_text: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  profiles?: {
    username: string;
    display_name: string;
  };
}

export function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'recipes' | 'users' | 'applications'>('recipes');

  // Recipes Tab State
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [recipeFilter, setRecipeFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [recipeQuery, setRecipeQuery] = useState('');
  const [loadingRecipes, setLoadingRecipes] = useState(false);

  // Users Tab State
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Creator Applications Tab State
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [appSourceViews, setAppSourceViews] = useState<Record<string, 'rendered' | 'raw'>>({});
  const [loadingApps, setLoadingApps] = useState(false);

  useEffect(() => {
    if (activeTab === 'recipes') fetchRecipes();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'applications') fetchApplications();
  }, [activeTab]);

  // Fetch Recipes
  const fetchRecipes = async () => {
    setLoadingRecipes(true);
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, slug, title, category, tags, status, created_at, profiles:author_id(username, display_name)')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setRecipes(data as any[]);
      }
    } catch (err) {
      console.error('Error fetching recipes:', err);
    } finally {
      setLoadingRecipes(false);
    }
  };

  // Fetch Users
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setUsers(data as UserRow[]);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Fetch Applications
  const fetchApplications = async () => {
    setLoadingApps(true);
    try {
      const { data, error } = await supabase
        .from('creator_applications')
        .select('id, user_id, application_text, status, created_at, profiles:user_id(username, display_name)')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setApplications(data as any[]);
      }
    } catch (err) {
      console.error('Error fetching applications:', err);
    } finally {
      setLoadingApps(false);
    }
  };

  // Recipe Actions
  const handleApproveRecipe = async (recipe: RecipeRow) => {
    const slug = recipe.slug || recipe.title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-');
    await supabase.from('recipes').update({ status: 'approved', slug }).eq('id', recipe.id);
    fetchRecipes();
  };

  const handleUnapproveRecipe = async (id: string) => {
    await supabase.from('recipes').update({ status: 'pending' }).eq('id', id);
    fetchRecipes();
  };

  const handleDeleteRecipe = async (id: string) => {
    if (confirm('Are you sure you want to delete this recipe?')) {
      await supabase.from('recipes').delete().eq('id', id);
      fetchRecipes();
    }
  };

  // User Actions
  const handleUpdateRole = async (userId: string, newRole: 'user' | 'recipe_creator' | 'admin') => {
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    fetchUsers();
  };

  const handleToggleArchive = async (user: UserRow) => {
    await supabase.from('profiles').update({ is_archived: !user.is_archived }).eq('id', user.id);
    fetchUsers();
  };

  const handleImmediateDeleteUser = async (userId: string) => {
    if (confirm('Permanently delete this user and all associated data?')) {
      await supabase.rpc('admin_delete_user', { target_user_id: userId });
      fetchUsers();
    }
  };

  // Creator Application Actions
  const handleApproveApplication = async (appId: string) => {
    await supabase.rpc('approve_creator_application', { app_id: appId });
    fetchApplications();
  };

  const handleRejectApplication = async (appId: string) => {
    await supabase.from('creator_applications').update({ status: 'rejected' }).eq('id', appId);
    fetchApplications();
  };

  // Filter recipes
  const filteredRecipes = recipes.filter(r => {
    if (recipeFilter !== 'all' && r.status !== recipeFilter) return false;
    if (recipeQuery.trim()) {
      const q = recipeQuery.toLowerCase();
      const matchTitle = r.title.toLowerCase().includes(q);
      const matchAuthor = (r.profiles?.display_name || '').toLowerCase().includes(q) || (r.profiles?.username || '').toLowerCase().includes(q);
      if (!matchTitle && !matchAuthor) return false;
    }
    return true;
  });

  // Filter users
  const filteredUsers = users.filter(u => {
    if (userQuery.trim()) {
      const q = userQuery.toLowerCase();
      return u.username.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div class="admin-shell">
      {/* Sidebar */}
      <aside class="admin-sidebar">
        <div class="sidebar-category">Overview</div>
        <button
          class={`sidebar-tab-btn ${activeTab === 'recipes' ? 'active' : ''}`}
          onClick={() => setActiveTab('recipes')}
        >
          <ChefHat size={16} />
          <span>Recipe Moderation</span>
          <span class="sidebar-count">{recipes.filter(r => r.status === 'pending').length}</span>
        </button>

        <button
          class={`sidebar-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={16} />
          <span>User Management</span>
          <span class="sidebar-count">{users.length}</span>
        </button>

        <button
          class={`sidebar-tab-btn ${activeTab === 'applications' ? 'active' : ''}`}
          onClick={() => setActiveTab('applications')}
        >
          <FileText size={16} />
          <span>Creator Applications</span>
          <span class="sidebar-count">{applications.filter(a => a.status === 'pending').length}</span>
        </button>
      </aside>

      {/* Main Content Area */}
      <div class="admin-content">
        {/* Tab 1: Recipe Moderation */}
        {activeTab === 'recipes' && (
          <div class="admin-panel-tab visible">
            <div class="admin-header">
              <div>
                <div class="admin-title">Recipe Moderation</div>
                <div class="admin-subtitle">Review incoming submissions, approve for public catalog, or reject</div>
              </div>
            </div>

            <div class="admin-toolbar">
              <input
                type="text"
                class="search-box"
                placeholder="Search recipe title or author..."
                value={recipeQuery}
                onInput={e => setRecipeQuery((e.target as HTMLInputElement).value)}
              />

              <div style={{ display: 'flex', gap: '0.375rem' }}>
                <button
                  class={`filter-pill ${recipeFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setRecipeFilter('all')}
                >
                  All
                </button>
                <button
                  class={`filter-pill ${recipeFilter === 'pending' ? 'active' : ''}`}
                  onClick={() => setRecipeFilter('pending')}
                >
                  Pending
                </button>
                <button
                  class={`filter-pill ${recipeFilter === 'approved' ? 'active' : ''}`}
                  onClick={() => setRecipeFilter('approved')}
                >
                  Approved
                </button>
                <button
                  class={`filter-pill ${recipeFilter === 'rejected' ? 'active' : ''}`}
                  onClick={() => setRecipeFilter('rejected')}
                >
                  Rejected
                </button>
              </div>
            </div>

            <div class="admin-body">
              {loadingRecipes ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Loading recipes...</div>
              ) : filteredRecipes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No recipes found</div>
              ) : (
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Author</th>
                      <th>Status</th>
                      <th>Submitted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecipes.map(recipe => (
                      <tr key={recipe.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{recipe.title}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {recipe.category || 'General'}
                          </div>
                        </td>
                        <td>{recipe.profiles?.display_name || 'Unknown'} (@{recipe.profiles?.username})</td>
                        <td>
                          <span class={`badge badge-${recipe.status}`}>{recipe.status}</span>
                        </td>
                        <td>{new Date(recipe.created_at).toLocaleDateString()}</td>
                        <td>
                          <div class="table-actions">
                            {recipe.status === 'pending' && (
                              <button
                                class="row-action-btn green"
                                onClick={() => handleApproveRecipe(recipe)}
                                title="Approve recipe"
                              >
                                <Check size={14} /> Approve
                              </button>
                            )}
                            {recipe.status === 'approved' && (
                              <button
                                class="row-action-btn red"
                                onClick={() => handleUnapproveRecipe(recipe.id)}
                                title="Unapprove recipe"
                              >
                                <X size={14} /> Unapprove
                              </button>
                            )}
                            <button
                              class="row-action-btn red"
                              onClick={() => handleDeleteRecipe(recipe.id)}
                              title="Delete recipe"
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: User Management */}
        {activeTab === 'users' && (
          <div class="admin-panel-tab visible">
            <div class="admin-header">
              <div>
                <div class="admin-title">User Management</div>
                <div class="admin-subtitle">Promote creators, adjust roles, archive accounts, or process deletion</div>
              </div>
            </div>

            <div class="admin-toolbar">
              <input
                type="text"
                class="search-box"
                placeholder="Search username or display name..."
                value={userQuery}
                onInput={e => setUserQuery((e.target as HTMLInputElement).value)}
              />
            </div>

            <div class="admin-body">
              {loadingUsers ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Loading users...</div>
              ) : filteredUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No users found</div>
              ) : (
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Joined</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr key={u.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{u.display_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@{u.username}</div>
                        </td>
                        <td>
                          <span class={`badge badge-${u.role === 'recipe_creator' ? 'creator' : 'user'}`}>{u.role}</span>
                        </td>
                        <td>
                          {u.is_archived ? (
                            <span class="badge badge-rejected">Archived</span>
                          ) : (
                            <span class="badge badge-approved">Active</span>
                          )}
                        </td>
                        <td>{new Date(u.created_at).toLocaleDateString()}</td>
                        <td>
                          <div class="table-actions">
                            {u.role === 'user' && (
                              <button
                                class="row-action-btn green"
                                onClick={() => handleUpdateRole(u.id, 'recipe_creator')}
                              >
                                Promote Creator
                              </button>
                            )}
                            {u.role === 'recipe_creator' && (
                              <button
                                class="row-action-btn red"
                                onClick={() => handleUpdateRole(u.id, 'user')}
                              >
                                Demote User
                              </button>
                            )}
                            <button
                              class="row-action-btn"
                              onClick={() => handleToggleArchive(u)}
                            >
                              {u.is_archived ? 'Unarchive' : 'Archive'}
                            </button>
                            <button
                              class="row-action-btn red"
                              onClick={() => handleImmediateDeleteUser(u.id)}
                            >
                              <UserX size={14} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Creator Application Review */}
        {activeTab === 'applications' && (
          <div class="admin-panel-tab visible">
            <div class="admin-header">
              <div>
                <div class="admin-title">Creator Application Review</div>
                <div class="admin-subtitle">Review pitches submitted by users requesting Creator role</div>
              </div>
            </div>

            <div class="admin-body">
              {loadingApps ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Loading applications...</div>
              ) : applications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No creator applications</div>
              ) : (
                applications.map(app => {
                  const view = appSourceViews[app.id] || 'rendered';
                  const parsedHtml = DOMPurify.sanitize(marked.parse(app.application_text) as string);

                  return (
                    <div key={app.id} class="creator-pitch-card">
                      <div class="pitch-header">
                        <div class="pitch-user-row">
                          <div class="pitch-avatar">{app.profiles?.display_name?.[0] || 'U'}</div>
                          <div>
                            <div style={{ fontWeight: 600 }}>{app.profiles?.display_name || 'Applicant'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              @{app.profiles?.username} • Submitted {new Date(app.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span class={`badge badge-${app.status}`}>{app.status}</span>

                          <div class="source-switch">
                            <button
                              class={`source-switch-btn ${view === 'rendered' ? 'active' : ''}`}
                              onClick={() => setAppSourceViews({ ...appSourceViews, [app.id]: 'rendered' })}
                            >
                              Rendered
                            </button>
                            <button
                              class={`source-switch-btn ${view === 'raw' ? 'active' : ''}`}
                              onClick={() => setAppSourceViews({ ...appSourceViews, [app.id]: 'raw' })}
                            >
                              Raw Source
                            </button>
                          </div>

                          {app.status === 'pending' && (
                            <div class="table-actions">
                              <button
                                class="row-action-btn green"
                                onClick={() => handleApproveApplication(app.id)}
                              >
                                <Check size={14} /> Approve & Promote
                              </button>
                              <button
                                class="row-action-btn red"
                                onClick={() => handleRejectApplication(app.id)}
                              >
                                <X size={14} /> Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {view === 'rendered' ? (
                        <div
                          class="pitch-rendered"
                          dangerouslySetInnerHTML={{ __html: parsedHtml }}
                        />
                      ) : (
                        <div class="pitch-raw visible">
                          {app.application_text}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
