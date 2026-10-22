import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import './styles/theme.css';
import './styles/recipe.css';
import './styles/timer.css';
import './styles/ui.css';
import './styles/auth.css';
import './styles/admin-panel.css';
import './services/settingsStore';
import { Navbar } from './components/Navbar';
import { SearchPage } from './components/SearchPage';
import { RecipeDetailView } from './components/RecipeDetailView';
import { KitchenStudio } from './components/KitchenStudio/KitchenStudio';
import { AppSettingsModal } from './components/AppSettingsModal';
import { AuthPage } from './components/auth/AuthPage';
import { AuthModal } from './components/auth/AuthModal';
import { AccountSettings } from './components/AccountSettings';
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
  const mainRef = useRef<HTMLElement>(null);

  const recipes = getAllRecipes();

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
  const role = authState.role || authState.profile?.role;

  // Protected route redirects
  useEffect(() => {
    if (authState.isAuthLoading) return;

    if (!isAuthenticated) {
      if (
        currentPath.startsWith('/kitchen-studio') ||
        currentPath === '/account' ||
        currentPath === '/admin'
      ) {
        navigate('/auth');
      }
    } else {
      if (currentPath === '/auth') {
        navigate('/');
      } else if (currentPath === '/admin' && role !== 'admin') {
        navigate('/');
      }
    }
  }, [currentPath, isAuthenticated, role, authState.isAuthLoading]);

  let mainContent;

  if (currentPath === '/auth') {
    mainContent = <AuthPage onNavigate={navigate} />;
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
    </>
  );
}

render(<App />, document.getElementById('app')!);
