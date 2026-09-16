import { useState } from 'preact/hooks';
import { Search as SearchIcon, Clock, ChefHat } from 'lucide-preact';
import type { RecipeJSON } from '../types/recipe';

interface Props {
  recipes: RecipeJSON[];
  onSelectRecipe: (id: string) => void;
}

export function SearchPage({ recipes, onSelectRecipe }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const tags = ['cookies', 'dessert', 'smores', 'crumbl', 'chocolate', 'baking'];

  const filteredRecipes = recipes.filter(r => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.title.toLowerCase().includes(term) ||
      r.tags.some(t => t.toLowerCase().includes(term))
    );
  });

  return (
    <div className="page-container">
      <div className="search-header">
        <div className="search-input-wrapper">
          <SearchIcon className="search-input-icon" size={20} />
          <input
            type="text"
            className="search-input"
            placeholder="Search recipes, ingredients, tags..."
            value={searchTerm}
            onInput={e => setSearchTerm((e.target as HTMLInputElement).value)}
          />
        </div>

        <div className="tag-chips">
          {tags.map(tag => (
            <button
              key={tag}
              className="tag-chip"
              onClick={() => setSearchTerm(tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      <div className="recommendations-section">
        <h2 className="section-label">Recommendation</h2>

        <div className="recipe-cards-grid">
          {filteredRecipes.map(recipe => {
            const totalTime = recipe.times.total || recipe.times.cook || '20 min';
            const diff = recipe.difficulty || 'Medium';
            const diffClass = diff.toLowerCase().includes('easy')
              ? 'badge-diff-easy'
              : diff.toLowerCase().includes('hard')
              ? 'badge-diff-hard'
              : 'badge-diff-medium';

            return (
              <div
                key={recipe.id}
                className="recipe-card"
                onClick={() => onSelectRecipe(recipe.id)}
              >
                {recipe.image && (
                  <img
                    src={recipe.image}
                    alt={recipe.title}
                    className="recipe-card-img"
                    loading="lazy"
                  />
                )}
                <div className="recipe-card-content">
                  <span className={`badge ${diffClass}`} style={{ alignSelf: 'flex-start' }}>
                    {diff}
                  </span>
                  <h3 className="recipe-card-title">{recipe.title}</h3>
                  <div className="recipe-card-meta">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Clock size={14} />
                      {totalTime}
                    </span>
                    {recipe.author?.name && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <ChefHat size={14} />
                        {recipe.author.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
