import { useState, useEffect, useRef } from 'preact/hooks';
import { Search as SearchIcon, Clock, ChefHat, Tag, X } from 'lucide-preact';
import type { RecipeJSON } from '../types/recipe';
import { searchPlaceholders } from '../data/searchPlaceholders';

interface Props {
  recipes: RecipeJSON[];
  onSelectRecipe: (id: string) => void;
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let qIdx = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === q[qIdx]) {
      qIdx++;
      if (qIdx === q.length) return true;
    }
  }
  return false;
}

export function SearchPage({ recipes, onSelectRecipe }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMenuClosing, setIsMenuClosing] = useState(false);
  const [isDropright, setIsDropright] = useState(true);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Typewriter animation state
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState(searchPlaceholders[0] || 'Search recipes...');
  const triggerBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Gather unique tags across recipes with clean fallback
  const fallbackTags = ['cookies', 'dessert', 'smores', 'crumbl', 'chocolate', 'baking'];
  const recipeTags = Array.from(
    new Set(recipes.flatMap(r => r.tags || []).map(t => t.toLowerCase()))
  );
  const allTags = Array.from(new Set([...recipeTags, ...fallbackTags])).sort();

  // Typewriter effect
  useEffect(() => {
    if (isInputFocused || searchTerm.trim()) return;

    let phraseIdx = 0;
    let charIdx = 0;
    let isDeleting = false;
    let timeoutId: number;

    const tick = () => {
      const current = searchPlaceholders[phraseIdx] || 'Search recipes...';

      if (isDeleting) {
        charIdx--;
      } else {
        charIdx++;
      }

      setDisplayedPlaceholder(current.substring(0, charIdx));

      let delay = isDeleting ? 40 : 85;

      if (!isDeleting && charIdx === current.length) {
        delay = 2000;
        isDeleting = true;
      } else if (isDeleting && charIdx === 0) {
        isDeleting = false;
        phraseIdx = (phraseIdx + 1) % searchPlaceholders.length;
        delay = 500;
      }

      timeoutId = window.setTimeout(tick, delay);
    };

    timeoutId = window.setTimeout(tick, 500);
    return () => clearTimeout(timeoutId);
  }, [isInputFocused, searchTerm]);

  // Click outside to close tag menu
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerBtnRef.current &&
        !triggerBtnRef.current.contains(target)
      ) {
        closeTagMenu();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isMenuOpen]);

  const toggleTagMenu = () => {
    if (isMenuOpen) {
      closeTagMenu();
      return;
    }

    if (triggerBtnRef.current) {
      const rect = triggerBtnRef.current.getBoundingClientRect();
      const spaceRight = window.innerWidth - rect.right;
      setIsDropright(spaceRight >= 350);
    }

    setIsMenuOpen(true);
    setIsMenuClosing(false);
  };

  const closeTagMenu = () => {
    setIsMenuClosing(true);
    setTimeout(() => {
      setIsMenuOpen(false);
      setIsMenuClosing(false);
    }, 180);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const removeTag = (tag: string) => {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  };

  const clearAllTags = () => {
    setSelectedTags([]);
  };

  // Filter recipes: match title query and ensure all active tags are present
  const filteredRecipes = recipes.filter(r => {
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      if (!r.title.toLowerCase().includes(term)) {
        return false;
      }
    }

    if (selectedTags.length > 0) {
      const rTags = (r.tags || []).map(t => t.toLowerCase());
      const hasAllTags = selectedTags.every(st => rTags.includes(st.toLowerCase()));
      if (!hasAllTags) {
        return false;
      }
    }

    return true;
  });

  const availableFilteredTags = allTags.filter(t => fuzzyMatch(t, tagQuery));

  return (
    <div className="page-container">
      <div className="search-hero-section">
        {/* Active tags pills container above search bar */}
        <div className="active-tag-pills-row">
          {selectedTags.map(tag => (
            <span key={tag} className="tag-pill-active">
              #{tag}
              <button
                type="button"
                className="tag-pill-remove-btn"
                onClick={() => removeTag(tag)}
                aria-label={`Remove #${tag} filter`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>

        {/* Main Search Input Row with Minimal Tag Trigger Button */}
        <div className="search-bar-row">
          <div className="search-input-wrapper">
            <SearchIcon className="search-input-icon" size={20} />
            <input
              type="text"
              className="search-input"
              value={searchTerm}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              onInput={e => setSearchTerm((e.target as HTMLInputElement).value)}
              aria-label="Search recipes by title"
            />
            {/* Animated Typewriter Placeholder */}
            {(!searchTerm.trim() && !isInputFocused) && (
              <div className="typewriter-placeholder-overlay" pointer-events="none">
                <span>{displayedPlaceholder}</span>
                <span className="typewriter-cursor" />
              </div>
            )}
          </div>

          {/* Minimal Tag Button Container */}
          <div className="tag-trigger-wrapper">
            <button
              ref={triggerBtnRef}
              type="button"
              className={`tag-trigger-btn ${isMenuOpen ? 'active' : ''}`}
              onClick={toggleTagMenu}
              aria-label="Filter by tags"
              title="Filter by tags"
            >
              <Tag size={20} />
            </button>

            {/* Smart Anchored Menu: Dropright on Desktop, Dropdown if narrow */}
            {isMenuOpen && (
              <div
                ref={menuRef}
                className={`tag-anchored-menu ${
                  isDropright ? 'menu-dropright' : 'menu-dropdown'
                } ${isMenuClosing ? 'menu-exit' : 'menu-enter'}`}
              >
                <div className="tag-menu-header">
                  <span className="tag-menu-title">Tags</span>
                  <button
                    type="button"
                    className="tag-menu-close-btn"
                    onClick={closeTagMenu}
                    aria-label="Close tag menu"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="tag-menu-search-wrapper">
                  <input
                    type="text"
                    className="tag-menu-search-input"
                    placeholder="Filter tags..."
                    value={tagQuery}
                    onInput={e => setTagQuery((e.target as HTMLInputElement).value)}
                    autoFocus
                  />
                </div>

                <div className="tag-menu-chips-grid">
                  {availableFilteredTags.length === 0 ? (
                    <span className="tag-menu-empty">No matching tags</span>
                  ) : (
                    availableFilteredTags.map(tag => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          className={`tag-chip-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleTag(tag)}
                        >
                          #{tag} {isSelected ? '✕' : '+'}
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="tag-menu-footer">
                  <button
                    type="button"
                    className="tag-menu-clear-btn"
                    onClick={clearAllTags}
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    className="tag-menu-done-btn"
                    onClick={closeTagMenu}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recipe Recommendations Grid */}
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
              <a
                key={recipe.id}
                href={`/recipes/${recipe.id}`}
                className="recipe-card"
                onClick={e => {
                  if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                    e.preventDefault();
                    onSelectRecipe(recipe.id);
                  }
                }}
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
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
