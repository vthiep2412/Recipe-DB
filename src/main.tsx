import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import './styles/theme.css';
import './styles/recipe.css';
import './styles/timer.css';
import { Navbar } from './components/Navbar';
import { SearchPage } from './components/SearchPage';
import { RecipeDetailView } from './components/RecipeDetailView';
import { KitchenStudio } from './components/KitchenStudio/KitchenStudio';
import { AppSettingsModal } from './components/AppSettingsModal';
import { getAllRecipes, getRecipeById } from './recipes';

export function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const recipes = getAllRecipes();

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

  if (currentPath.startsWith('/kitchen-studio')) {
    mainContent = (
      <KitchenStudio
        currentPath={currentPath}
        onNavigate={navigate}
      />
    );
  } else if (currentPath.startsWith('/recipes/')) {
    const recipeId = currentPath.replace('/recipes/', '');
    const recipe = getRecipeById(recipeId);

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
    // Default to search view on '/' and '/search'
    mainContent = (
      <SearchPage
        recipes={recipes}
        onSelectRecipe={id => navigate(`/recipes/${id}`)}
      />
    );
  }

  return (
    <>
      <Navbar
        onNavigate={navigate}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <main ref={mainRef} className="app-main">{mainContent}</main>

      <AppSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}

render(<App />, document.getElementById('app')!);
