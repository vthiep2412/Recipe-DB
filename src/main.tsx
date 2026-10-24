import { render } from 'preact';
import { useState, useEffect, useRef, useMemo } from 'preact/hooks';
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
import { SupportPage } from './components/SupportPage';
import { AdminPanel } from './components/AdminPanel';
import { authStore } from './services/authStore';
import { recipeStorageService } from './services/recipeStorageService';
import { getAllRecipes, getRecipeById } from './recipes';
import type { RecipeJSON } from './types/recipe';
import type { CloudRecipe, CloudRecipeDetails } from './types/cloud';

function mapCloudToRecipeJSON(cloud: {
  recipe: CloudRecipe;
  details: CloudRecipeDetails;
}): RecipeJSON {
  const { recipe, details } = cloud;
  const sectionsAst = details.sectionsAst as any;
  const rawSections = sectionsAst?.sections || [];
  const rawCanvasNodes = sectionsAst?.canvasNodes || [];

  const steps = rawCanvasNodes.map((n: any, idx: number) => ({
    index: idx + 1,
    rawText: n.instructionText || n.title || '',
    tokens: (n.segments || []).map((seg: any) => {
      if (seg.type === 'mention') {
        const m = seg.mention;
        return {
          type:
            m.type === 'ingredient'
              ? 'ingredient'
              : m.type === 'cookware'
              ? 'cookware'
              : m.type === 'timer'
              ? 'timer'
              : 'text',
          name: m.displayText || '',
          value: m.displayText || '',
          durationText: m.data?.durationText || '',
        };
      }
      return { type: 'text', value: seg.text || '' };
    }),
    id: n.id,
    title: n.title,
    sectionId: n.sectionId,
    image: n.media?.pictureUrl,
  }));

  const mappedSections =
    rawSections.length > 0
      ? rawSections.map((sec: any) => ({
          id: sec.id,
          name: sec.name || 'Main',
          steps: steps.filter((s: any) => s.sectionId === sec.id),
        }))
      : [
          {
            id: 'sec-main',
            name: 'Instructions',
            steps,
          },
        ];

  return {
    id: recipe.slug || recipe.id,
    title: recipe.title,
    description: recipe.description || '',
    image: recipe.imageUrl,
    gallery: [],
    importantNotes: details.importantNotes || '',
    servings: { base: 4, unitName: 'servings' },
    times: { total: '30m' },
    tags: recipe.tags || [],
    metadata: {},
    ingredients: (details.ingredientsIndex as any[]) || [],
    sections: mappedSections,
    rawCooklang: details.rawFablang || '',
  };
}

function RecipeViewRoute({
  recipeId,
  onNavigate,
}: {
  recipeId: string;
  onNavigate: (path: string) => void;
}) {
  const [recipe, setRecipe] = useState<RecipeJSON | null>(() => getRecipeById(recipeId) || null);
  const [loading, setLoading] = useState(!recipe);

  useEffect(() => {
    let isMounted = true;
    const disk = getRecipeById(recipeId);
    if (disk) {
      setRecipe(disk);
      setLoading(false);
    }

    recipeStorageService
      .fetchRecipeBySlugOrId(recipeId)
      .then((cloudData) => {
        if (!isMounted) return;
        if (cloudData) {
          const authState = authStore.getState();
          const isOwner = authState.user?.id === cloudData.recipe.ownerId;
          const isAdmin = authState.role === 'admin' || authState.profile?.role === 'admin';
          const isApproved = cloudData.recipe.status === 'approved';

          if (isApproved || isOwner || isAdmin) {
            setRecipe(mapCloudToRecipeJSON(cloudData));
          }
        }
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

  const recipes = useMemo(() => getAllRecipes(), []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);

    const unsub = authStore.subscribe((state) => {
      setAuthState(state);
    });

    return () => {
      window.removeEventListener('popstate', handlePopState);
      unsub();
    };
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isAuthenticated = !!authState.user;
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
    } else if (isScheduledForDeletion) {
      // Handled by AdminDeletionModal or ScheduledDeletionPage
    } else {
      if (currentPath === '/auth') {
        window.history.replaceState({}, '', '/');
        setCurrentPath('/');
      } else if (isAdminPath && role !== 'admin') {
        window.history.replaceState({}, '', '/');
        setCurrentPath('/');
      }
    }
  }, [currentPath, isAuthenticated, isScheduledForDeletion, role, authState.isAuthLoading, isProtectedPath, isAdminPath]);

  let mainContent;

  if (currentPath === '/support') {
    mainContent = <SupportPage onNavigate={navigate} />;
  } else if (isAdminDeleted) {
    mainContent = <AdminDeletionModal onNavigate={navigate} />;
  } else if (isScheduledForDeletion) {
    mainContent = <ScheduledDeletionPage onNavigate={navigate} />;
  } else if (currentPath === '/auth') {
    if (isAuthenticated) {
      mainContent = (
        <SearchPage
          recipes={recipes}
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
    mainContent = (
      <KitchenStudio
        currentPath={currentPath}
        onNavigate={navigate}
      />
    );
  } else if (currentPath.startsWith('/recipes/')) {
    const recipeId = currentPath.replace('/recipes/', '');
    mainContent = <RecipeViewRoute recipeId={recipeId} onNavigate={navigate} />;
  } else {
    // Default to search view on '/' and '/search'
    mainContent = (
      <SearchPage
        recipes={recipes}
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
        {mainContent}
      </main>

      <AppSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Auth Modal Overlay rendered at root */}
      <AuthModal onNavigate={navigate} />

      {/* Floating Notifications (Top Right) */}
      <Toaster position="top-right" duration={3000} richColors theme={settings.theme as any} />
    </>
  );
}

render(<App />, document.getElementById('app')!);
