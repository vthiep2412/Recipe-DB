import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import './styles/theme.css';
import './styles/recipe.css';
import './styles/timer.css';
import './styles/ui.css';
import './styles/auth.css';
import './styles/admin-panel.css';
import { useSettings } from './services/settingsStore';
import { Toaster } from 'sonner';
import { Navbar } from './components/Navbar';
import { SearchPage } from './components/SearchPage';
import { RecipeDetailView } from './components/RecipeDetailView';
import { KitchenStudio } from './components/KitchenStudio/KitchenStudio';
import { AppSettingsModal } from './components/AppSettingsModal';
import { AuthPage } from './components/auth/AuthPage';
import { AuthModal } from './components/auth/AuthModal';
import { AccountSettings } from './components/AccountSettings';
import { ScheduledDeletionPage } from './components/ScheduledDeletionPage';
import { AdminDeletionModal } from './components/auth/AdminDeletionModal';
import { AccountSuspendedModal } from './components/auth/AccountSuspendedModal';
import { SupportPage } from './components/SupportPage';
import { CreatorApplicationPage } from './components/CreatorApplicationPage';
import { AdminPanel } from './components/AdminPanel';
import { DevToolBox } from './components/DevToolBox';
import { ErrorBoundary } from './components/ErrorBoundary';
import { authStore } from './services/authStore';
import { getAllRecipes, getRecipeById } from './recipes';
import type { RecipeJSON } from './types/recipe';


function RecipeViewRoute({
  recipeId,
  onNavigate,
}: {
  recipeId: string;
  onNavigate: (path: string) => void;
}) {
  const [recipe, setRecipe] = useState<RecipeJSON | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    getRecipeById(recipeId)
      .then((data) => {
        if (!isMounted) return;
        setRecipe(data);
        setLoading(false);
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [recipeId]);

  if (loading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading recipe...</p>
      </div>
    );
  }

  if (recipe) {
    return <RecipeDetailView recipe={recipe} />;
  }

  return (
    <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Recipe Not Found</h2>
      <button
        type="button"
        className="tag-chip"
        style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}
        onClick={() => onNavigate('/')}
      >
        Return to Search
      </button>
    </div>
  );
}

export function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [authState, setAuthState] = useState(authStore.getState());
  const [settings] = useSettings();
  const mainRef = useRef<HTMLElement>(null);

  const [recipes, setRecipes] = useState<RecipeJSON[]>([]);
  const [isRecipesLoading, setIsRecipesLoading] = useState(false);

  const isSearchRoute = currentPath === '/' || currentPath === '';

  // Route-scoped catalog fetch: only query catalog when search page is active
  useEffect(() => {
    if (!isSearchRoute) return;
    if (recipes.length > 0) return;

    let isMounted = true;
    setIsRecipesLoading(true);
    getAllRecipes()
      .then((data) => {
        if (!isMounted) return;
        setRecipes(data);
        setIsRecipesLoading(false);
      })
      .catch(() => {
        if (isMounted) setIsRecipesLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isSearchRoute, recipes.length]);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);

    const handleGlobalClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const anchor = (e.target as HTMLElement | null)?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (href && href.startsWith('/recipes/')) {
        e.preventDefault();
        navigate(href);
      }
    };
    window.addEventListener('click', handleGlobalClick);

    const unsub = authStore.subscribe((state) => {
      setAuthState(state);
    });

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('click', handleGlobalClick);
      unsub();
    };
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isAuthenticated = !!authState.user;
  const isArchived = isAuthenticated && !!authState.profile?.isArchived;
  const isScheduledForDeletion = isAuthenticated && !!authState.profile?.scheduledDeleteAt;
  const isAdminDeleted = isScheduledForDeletion && !!authState.profile?.isAdminDeleted;
  const role = authState.role || authState.profile?.role;
  const isProtectedPath = currentPath.startsWith('/kitchen-studio') || currentPath === '/account' || currentPath === '/admin';
  const isAdminPath = currentPath === '/admin';

  // Synchronize history URL after synchronous render guards
  useEffect(() => {
    if (authState.isAuthLoading) return;

    if (!isAuthenticated) {
      if (isProtectedPath && currentPath !== '/auth' && currentPath !== '/support') {
        window.history.replaceState({}, '', '/auth');
        setCurrentPath('/auth');
      }
    } else if (isArchived || isScheduledForDeletion) {
      // Handled by AccountSuspendedModal, AdminDeletionModal or ScheduledDeletionPage
    } else {
      if (currentPath === '/auth') {
        window.history.replaceState({}, '', '/');
        setCurrentPath('/');
      } else if (isAdminPath && role !== 'admin') {
        window.history.replaceState({}, '', '/');
        setCurrentPath('/');
      }
    }
  }, [currentPath, isAuthenticated, isArchived, isScheduledForDeletion, role, authState.isAuthLoading, isProtectedPath, isAdminPath]);

  let mainContent;

  if (currentPath === '/support') {
    mainContent = <SupportPage onNavigate={navigate} />;
  } else if (currentPath === '/apply-creator') {
    mainContent = <CreatorApplicationPage onNavigate={navigate} />;
  } else if (isArchived) {
    mainContent = <AccountSuspendedModal onNavigate={navigate} />;
  } else if (isAdminDeleted) {
    mainContent = <AdminDeletionModal onNavigate={navigate} />;
  } else if (isScheduledForDeletion) {
    mainContent = <ScheduledDeletionPage onNavigate={navigate} />;
  } else if (currentPath === '/auth') {
    if (isAuthenticated) {
      mainContent = (
        <SearchPage
          recipes={recipes}
          isLoading={isRecipesLoading}
          onSelectRecipe={(id) => navigate(`/recipes/${id}`)}
        />
      );
    } else {
      mainContent = <AuthPage onNavigate={navigate} />;
    }
  } else if (isProtectedPath && authState.isAuthLoading) {
    // Synchronous auth guard: while loading auth state, NEVER mount protected view
    mainContent = (
      <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <p style={{ color: 'var(--text-muted)' }}>Checking authorization...</p>
      </div>
    );
  } else if (isProtectedPath && !isAuthenticated) {
    // Synchronous auth guard: unauthenticated users immediately receive AuthPage without mounting protected view
    mainContent = <AuthPage onNavigate={navigate} />;
  } else if (isAdminPath && role !== 'admin') {
    // Synchronous auth guard: non-admin users immediately denied without mounting AdminPanel
    mainContent = (
      <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--color-red)' }}>Access Denied</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          You do not have administrative privileges to access this area.
        </p>
        <button
          type="button"
          className="tag-chip"
          style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}
          onClick={() => navigate('/')}
        >
          Return to Home
        </button>
      </div>
    );
  } else if (currentPath === '/account') {
    mainContent = <AccountSettings onNavigate={navigate} />;
  } else if (currentPath === '/admin') {
    mainContent = <AdminPanel onNavigate={navigate} />;
  } else if (currentPath.startsWith('/kitchen-studio')) {
    if (role !== 'recipe_creator' && role !== 'admin') {
      mainContent = (
        <div
          className="page-container"
          style={{ textAlign: 'center', paddingTop: '4rem', maxWidth: '36rem', margin: '0 auto' }}
          role="region"
          aria-labelledby="access-denied-heading"
        >
          <h2
            id="access-denied-heading"
            style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--color-primary, #ff5722)' }}
          >
            Creator Access Required
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.75rem', lineHeight: '1.6' }}>
            Kitchen Studio is reserved for Recipe Creators and Administrators.
            Apply for creator privileges to compose and submit recipes.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: 'var(--radius-md)',
                fontWeight: 500,
                cursor: 'pointer'
              }}
              onClick={() => navigate('/apply-creator')}
            >
              Apply for Creator Privileges
            </button>
            <button
              type="button"
              className="tag-chip"
              style={{ fontSize: '0.95rem', padding: '0.6rem 1.25rem', cursor: 'pointer' }}
              onClick={() => navigate('/')}
            >
              Return to Catalog
            </button>
          </div>
        </div>
      );
    } else {
      mainContent = (
        <KitchenStudio
          currentPath={currentPath}
          onNavigate={navigate}
        />
      );
    }
  } else if (currentPath.startsWith('/recipes/')) {
    const recipeId = currentPath.replace('/recipes/', '');
    mainContent = <RecipeViewRoute recipeId={recipeId} onNavigate={navigate} />;
  } else {
    // Default to search view on '/' and '/search'
    mainContent = (
      <SearchPage
        recipes={recipes}
        isLoading={isRecipesLoading}
        onSelectRecipe={(id) => navigate(`/recipes/${id}`)}
      />
    );
  }

  return (
    <>
      <Navbar
        currentPath={currentPath}
        onNavigate={navigate}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <main ref={mainRef} className="app-main">
        <ErrorBoundary key={currentPath}>
          {mainContent}
        </ErrorBoundary>
      </main>

      <AppSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Auth Modal Overlay rendered at root */}
      <AuthModal onNavigate={navigate} />

      {/* Floating Notifications (Top Right, positioned below navbar) */}
      <Toaster position="top-right" offset="4.25rem" duration={4000} richColors theme={settings.theme as any} />

      {/* Global Dev Tool Box in development mode only */}
      {import.meta.env.DEV && <DevToolBox />}
    </>
  );
}

render(<App />, document.getElementById('app')!);

// Expose DevTools console helpers in development environment only
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).openDevTools = () => {
    try {
      localStorage.setItem('recipedevtool', 'true');
      window.dispatchEvent(new Event('recipedevtool-change'));
      window.dispatchEvent(new Event('recipedevtool-open'));
      return 'Dev tool box opened.';
    } catch {
      return 'Unable to access localStorage.';
    }
  };

  (window as any).closeDevTools = () => {
    try {
      localStorage.removeItem('recipedevtool');
      window.dispatchEvent(new Event('recipedevtool-change'));
      return 'Dev tool box closed.';
    } catch {
      return 'Unable to access localStorage.';
    }
  };
}
