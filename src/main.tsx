import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import './styles/theme.css';
import './styles/recipe.css';
import './styles/timer.css';
import './styles/ui.css';
import './styles/auth.css';
import './services/settingsStore';
import { initAuth, authProfile, userRole } from './services/authStore';
import { supabase } from './services/supabaseClient';
import { Navbar } from './components/Navbar';
import { SearchPage } from './components/SearchPage';
import { RecipeDetailView } from './components/RecipeDetailView';
import { KitchenStudio } from './components/KitchenStudio/KitchenStudio';
import { AppSettingsModal } from './components/AppSettingsModal';
import { AuthPage } from './components/Auth/AuthPage';
import { AuthModal } from './components/Auth/AuthModal';
import { AccountSettings } from './components/AccountSettings';
import { AdminPanel } from './components/AdminPanel';
import { getAllRecipes, getRecipeById } from './recipes';
import type { RecipeJSON } from './types/recipe';

export function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [cloudRecipes, setCloudRecipes] = useState<RecipeJSON[]>([]);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    initAuth();
    fetchCloudRecipes();
  }, []);

  const fetchCloudRecipes = async () => {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('*, recipe_details(*)')
        .eq('status', 'approved');

      if (!error && data && data.length > 0) {
        const mapped: RecipeJSON[] = data.map((r: any) => ({
          id: r.slug || r.id,
          title: r.title,
          description: r.description || '',
          difficulty: r.difficulty || 'medium',
          image: r.image_url,
          tags: r.tags || [],
          times: {
            total: `${(r.prep_time || 0) + (r.cook_time || 0)} min`,
            prep: `${r.prep_time || 0} min`,
            cook: `${r.cook_time || 0} min`
          },
          author: {
            name: r.profiles?.display_name || 'Chef'
          },
          servings: {
            base: r.servings || 2,
            unitName: 'servings'
          },
          metadata: {},
          ingredients: r.recipe_details?.ingredients || [],
          sections: [
            {
              name: 'Main',
              steps: r.recipe_details?.instructions || []
            }
          ],
          rawCooklang: ''
        }));
        setCloudRecipes(mapped);
      } else {
        setCloudRecipes(getAllRecipes());
      }
    } catch {
      setCloudRecipes(getAllRecipes());
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  let mainContent;

  if (currentPath === '/auth') {
    mainContent = <AuthPage />;
  } else if (currentPath === '/account') {
    mainContent = <AccountSettings />;
  } else if (currentPath === '/admin') {
    if (userRole.value !== 'admin') {
      mainContent = (
        <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Access Denied</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Admin role required to view this panel.</p>
          <button className="tag-chip" onClick={() => navigate('/')}>Return Home</button>
        </div>
      );
    } else {
      mainContent = <AdminPanel />;
    }
  } else if (currentPath.startsWith('/kitchen-studio')) {
    if (!authProfile.value) {
      window.history.pushState({}, '', '/auth');
      mainContent = <AuthPage />;
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
    const foundCloud = cloudRecipes.find(r => r.id === recipeId || slugify(r.title) === recipeId);
    const recipe = foundCloud || getRecipeById(recipeId);

    if (recipe) {
      mainContent = <RecipeDetailView recipe={recipe} />;
    } else {
      mainContent = (
        <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Recipe Not Found</h2>
          <button
            className="tag-chip"
            style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}
            onClick={() => navigate('/')}
          >
            Return to Search
          </button>
        </div>
      );
    }
  } else {
    mainContent = (
      <SearchPage
        recipes={cloudRecipes}
        onSelectRecipe={id => navigate(`/recipes/${id}`)}
      />
    );
  }

  function slugify(text: string): string {
    return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-');
  }

  return (
    <>
      <Navbar
        onNavigate={navigate}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <main ref={mainRef} className="app-main">{mainContent}</main>

      <AuthModal />

      <AppSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}

render(<App />, document.getElementById('app')!);
