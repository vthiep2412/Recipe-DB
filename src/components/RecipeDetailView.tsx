import { useState } from 'preact/hooks';
import { ChefHat, Link as LinkIcon, Minus, Plus, ChevronDown, ChevronUp, X, Check } from 'lucide-preact';
import type { RecipeJSON, StepToken } from '../types/recipe';
import { formatFraction } from '../parser/cooklangParser';

interface Props {
  recipe: RecipeJSON;
}

export function RecipeDetailView({ recipe }: Props) {
  const [servings, setServings] = useState(recipe.servings.base || 1);
  const [isShoppingMode, setIsShoppingMode] = useState(false);
  const [animateMode, setAnimateMode] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [isMediaExpanded, setIsMediaExpanded] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const baseServings = recipe.servings.base || 1;
  const scaleRatio = servings / baseServings;

  const toggleShoppingMode = () => {
    setIsShoppingMode(!isShoppingMode);
    setAnimateMode(true);
    setTimeout(() => setAnimateMode(false), 300);
  };

  const toggleIngredient = (id: string) => {
    setCheckedIngredients(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleStep = (index: number) => {
    setCurrentStep(prev => (prev === index ? -1 : index));
  };

  const scaleQuantity = (baseVal: number | null, unit: string | null) => {
    if (baseVal === null) return '';
    let val = baseVal * scaleRatio;
    let u = unit || '';

    if (u === 'g' && val >= 1000) {
      val = Math.round((val / 1000) * 100) / 100;
      u = 'kg';
    } else if (u === 'ml' && val >= 1000) {
      val = Math.round((val / 1000) * 100) / 100;
      u = 'l';
    } else if (u === 'oz' && val >= 16) {
      val = Math.round((val / 16) * 100) / 100;
      u = 'lb';
    }

    const formatted = formatFraction(val);
    return u ? `${formatted} ${u}` : formatted;
  };

  const listableIngredients = recipe.ingredients.filter(ing => !ing.isHidden);

  const cookwareNames = new Set<string>();
  recipe.sections.forEach(sec => {
    sec.steps.forEach(step => {
      step.tokens.forEach(tok => {
        if (tok.type === 'cookware') cookwareNames.add(tok.name);
      });
    });
  });

  const breakdownTimes = [
    { label: 'Prep Time', value: recipe.times.prep },
    { label: 'Bake Time', value: recipe.times.bake },
    { label: 'Cook Time', value: recipe.times.cook },
    { label: 'Rest Time', value: recipe.times.rest },
  ].filter(t => Boolean(t.value));

  const totalTime = recipe.times.total || recipe.times.cook || '20 min';
  const difficulty = recipe.difficulty || 'Medium';
  const diffLower = difficulty.toLowerCase();
  const diffClass = diffLower.includes('easy')
    ? 'diff-easy'
    : diffLower.includes('hard')
    ? 'diff-hard'
    : 'diff-medium';

  return (
    <div className="cook-preview-view cook-rich">
      {/* 1. MEDIA HEADER (grid-area: media) */}
      {recipe.image && (
        <div className={`cook-media-header ${isMediaExpanded ? 'expanded' : 'collapsed'}`}>
          <div className="cook-media-content single">
            <div className="cook-media-item">
              <img
                src={recipe.image}
                alt={recipe.title}
                onClick={() => setIsLightboxOpen(true)}
              />
            </div>
          </div>

          {!isMediaExpanded ? (
            <div className="cook-media-fade-overlay" onClick={() => setIsMediaExpanded(true)}>
              <div className="cook-media-expand-btn">
                <ChevronDown size={24} />
              </div>
            </div>
          ) : (
            <div className="cook-media-close-bar" onClick={() => setIsMediaExpanded(false)}>
              <ChevronUp size={16} />
              <span>Collapse</span>
            </div>
          )}
        </div>
      )}

      {/* 2. HERO ROW (grid-area: hero) */}
      <div className="cook-hero">
        <div className="cook-hero-body">
          <div className="cook-title-row">
            <h1 className="cook-hero-title">{recipe.title}</h1>
            {recipe.source?.url && (
              <a
                href={recipe.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="cook-title-link"
                aria-label="Source recipe"
              >
                <LinkIcon size={18} />
              </a>
            )}
          </div>

          {recipe.author?.name && (
            <div className="cook-author-sub">
              <span className="cook-author-icon">
                <ChefHat size={16} />
              </span>
              <span>by {recipe.author.name}</span>
            </div>
          )}

          {recipe.tags && recipe.tags.length > 0 && (
            <div className="cook-tags-row cook-tags-overflow">
              {recipe.tags.map(tag => (
                <span key={tag} className="cook-pill cook-pill-tag">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Description Card */}
          {recipe.description && (
            <div className={`cook-desc-container ${isDescExpanded ? 'expanded' : 'collapsed'}`}>
              <div
                className="cook-desc-text"
                style={!isDescExpanded ? { WebkitLineClamp: 3 } : {}}
              >
                {recipe.description}
              </div>

              {!isDescExpanded ? (
                <div className="cook-desc-fade" onClick={() => setIsDescExpanded(true)}>
                  <div className="cook-desc-fade-arrow">
                    <ChevronDown size={16} />
                  </div>
                </div>
              ) : (
                <div className="cook-desc-close-bar" onClick={() => setIsDescExpanded(false)}>
                  <div className="cook-desc-close-arrow">
                    <ChevronUp size={16} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stats Card */}
          <div className="cook-stats-card">
            <div className="cook-stats-group cook-stats-main">
              <div className="cook-stat-col">
                <span className="cook-stat-label">Difficulty</span>
                <span className={`cook-stat-value ${diffClass}`}>{difficulty}</span>
              </div>
              <div className="cook-stat-col">
                <span className="cook-stat-label">Total Time</span>
                <span className="cook-stat-value">{totalTime}</span>
              </div>
            </div>

            {breakdownTimes.length > 0 && (
              <>
                <div className="cook-stats-divider" />
                <div className="cook-stats-group cook-stats-breakdown">
                  {breakdownTimes.map(t => (
                    <div key={t.label} className="cook-stat-col">
                      <span className="cook-stat-label">{t.label}</span>
                      <span className="cook-stat-value">{t.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 3. ASIDE / INGREDIENTS SIDEBAR (grid-area: aside) */}
      <aside className="cook-aside">
        <div className="cook-ingredients" id="cook-ingredients">
          <div className="cook-ingredients-header-row">
            <h2 className="cook-section-title">Ingredients</h2>
            <div className="cook-mode-toggle" onClick={toggleShoppingMode}>
              <span
                className={`cook-mode-text ${isShoppingMode ? 'shopping' : ''} ${
                  animateMode ? 'animate-drop' : ''
                }`}
              >
                {isShoppingMode ? 'Shopping' : 'Cooking'}
              </span>
            </div>
          </div>

          <div className="cook-stepper">
            <button
              className="cook-stepper-btn"
              onClick={() => setServings(Math.max(1, servings - 1))}
              aria-label="Decrease servings"
            >
              <Minus size={14} />
            </button>
            <span className="cook-stepper-val">
              <b>{servings}</b> {recipe.servings.unitName}
            </span>
            <button
              className="cook-stepper-btn"
              onClick={() => setServings(servings + 1)}
              aria-label="Increase servings"
            >
              <Plus size={14} />
            </button>
          </div>

          {isShoppingMode ? (
            <ul className="cook-ing-list">
              {listableIngredients.map(ing => {
                const isDone = checkedIngredients.has(ing.id);
                const displayQty =
                  ing.quantityValue !== null
                    ? scaleQuantity(ing.quantityValue, ing.unit)
                    : ing.quantityText || '';

                return (
                  <li
                    key={ing.id}
                    className={`cook-ing ${isDone ? 'done' : ''}`}
                    onClick={() => toggleIngredient(ing.id)}
                  >
                    <div className="cook-ing-box">
                      {isDone && <Check size={11} strokeWidth={3.5} />}
                    </div>
                    <span className="cook-ing-name">
                      {ing.name}
                      {ing.note && (
                        <span style={{ color: 'var(--text-muted)' }}> ({ing.note})</span>
                      )}
                    </span>
                    {displayQty && <span className="cook-ing-qty">{displayQty}</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="cook-cooking-mode-groups">
              {recipe.sections.map(section =>
                section.steps.map(step => {
                  const stepIngs = step.tokens.filter(
                    (t): t is Extract<StepToken, { type: 'ingredient' }> =>
                      t.type === 'ingredient' && !t.isHidden
                  );
                  if (stepIngs.length === 0) return null;

                  const groupTitle =
                    section.name && section.name !== 'Instructions'
                      ? `${section.name} · Step ${step.index}`
                      : `Step ${step.index}`;

                  return (
                    <div key={`step-ing-group-${step.index}`}>
                      <div className="cook-ing-group-title">{groupTitle}</div>
                      <ul className="cook-ing-list">
                        {stepIngs.map((tok, idx) => {
                          const checkKey = `step-${step.index}-${tok.name.toLowerCase()}`;
                          const isDone = checkedIngredients.has(checkKey);
                          const matchedIng = recipe.ingredients.find(
                            i => i.name.toLowerCase() === tok.name.toLowerCase()
                          );
                          const displayQty =
                            matchedIng && matchedIng.quantityValue !== null
                              ? scaleQuantity(matchedIng.quantityValue, matchedIng.unit)
                              : tok.quantityText || '';

                          return (
                            <li
                              key={`${step.index}-${idx}-${tok.name}`}
                              className={`cook-ing ${isDone ? 'done' : ''}`}
                              onClick={() => toggleIngredient(checkKey)}
                            >
                              <div className="cook-ing-box">
                                {isDone && <Check size={11} strokeWidth={3.5} />}
                              </div>
                              <span className="cook-ing-name">
                                {tok.name}
                                {tok.note && (
                                  <span style={{ color: 'var(--text-muted)' }}> ({tok.note})</span>
                                )}
                              </span>
                              {displayQty && <span className="cook-ing-qty">{displayQty}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {cookwareNames.size > 0 && (
          <div className="cook-cookware">
            <h3 className="cook-subhead">Cookware</h3>
            <div className="cook-cookware-items">
              {Array.from(cookwareNames).map(name => (
                <span key={name}>• {name}</span>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* 4. METHOD MAIN (grid-area: main) */}
      <main className="cook-main">
        <div className="cook-steps" id="cook-steps">
          <h2 className="cook-section-title">Method</h2>

          {recipe.sections.map(section => (
            <div key={section.name}>
              {section.name !== 'Instructions' && (
                <div className="cook-section-band">{section.name}</div>
              )}

              {section.steps.map(step => {
                const isCur = currentStep === step.index;
                const isDone = currentStep !== -1 && currentStep > step.index;

                return (
                  <div
                    key={step.index}
                    className={`cook-step ${isCur ? 'cur' : ''} ${isDone ? 'done' : ''}`}
                    onClick={() => toggleStep(step.index)}
                  >
                    <span className="cook-step-n">{step.index}.</span>

                    <div className="cook-step-bodywrap">
                      <div className="cook-step-text">
                        {step.tokens.map((token, idx) => {
                          if (token.type === 'text') {
                            return <span key={idx}>{token.value}</span>;
                          }
                          if (token.type === 'ingredient') {
                            return (
                              <span key={idx} className="cook-ig">
                                <span className="cook-ig-name">{token.name}</span>
                                {token.quantityText && (
                                  <span className="cook-amt">{token.quantityText}</span>
                                )}
                                {token.note && (
                                  <span className="cook-ig-note">{token.note}</span>
                                )}
                              </span>
                            );
                          }
                          if (token.type === 'cookware') {
                            return (
                              <span key={idx} className="cook-cw">
                                {token.name}
                              </span>
                            );
                          }
                          if (token.type === 'timer') {
                            return (
                              <span key={idx} className="cook-timer">
                                <button
                                  className="cook-timer-btn"
                                  onClick={e => e.stopPropagation()}
                                >
                                  ⏱ {token.durationText}
                                </button>
                              </span>
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </main>

      {/* Lightbox Modal */}
      {isLightboxOpen && recipe.image && (
        <div className="cook-lightbox-overlay" onClick={() => setIsLightboxOpen(false)}>
          <button
            className="cook-lightbox-close"
            onClick={() => setIsLightboxOpen(false)}
            aria-label="Close image"
          >
            <X size={20} />
          </button>
          <div className="cook-lightbox-img-wrap" onClick={e => e.stopPropagation()}>
            <img src={recipe.image} alt={recipe.title} className="cook-lightbox-img" />
          </div>
        </div>
      )}
    </div>
  );
}
