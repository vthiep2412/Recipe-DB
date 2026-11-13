import type { RefObject } from 'preact';
import { ChevronDown, ChevronUp } from 'lucide-preact';
import type { RecipeJSON } from '../../types/recipe';

export interface RecipeHeroGalleryProps {
  recipe: RecipeJSON;
  heroImages: string[];
  hasVideo: boolean;
  isMultiMedia: boolean;
  isMediaExpanded: boolean;
  youtubeEmbedUrl: string | null;
  videoRef?: RefObject<HTMLVideoElement | null>;
  onOpenLightbox: (index: number) => void;
  onToggleExpand: (expanded: boolean) => void;
}

export function RecipeHeroGallery({
  recipe,
  heroImages,
  hasVideo,
  isMultiMedia,
  isMediaExpanded,
  youtubeEmbedUrl,
  videoRef,
  onOpenLightbox,
  onToggleExpand
}: RecipeHeroGalleryProps) {
  if (heroImages.length === 0 && !hasVideo) {
    return null;
  }

  return (
    <div
      className={`cook-media-header ${isMultiMedia ? 'is-multi' : isMediaExpanded ? 'expanded' : 'collapsed'} ${hasVideo ? 'has-video' : ''}`}
    >
      <div className={`cook-media-content ${isMultiMedia ? 'split' : 'single'}`}>
        {hasVideo ? (
          <>
            {heroImages.length > 0 && (
              <div className="cook-media-item" style={{ aspectRatio: '16 / 9', position: 'relative' }}>
                <img
                  src={heroImages[0]}
                  alt={recipe.title}
                  fetchPriority="high"
                  tabIndex={0}
                  role="button"
                  aria-label="View full size image"
                  onClick={() => onOpenLightbox(0)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenLightbox(0);
                    }
                  }}
                />
                {heroImages.length > 1 && (
                  <div
                    className="cook-media-overlay-badge"
                    onClick={() => onOpenLightbox(0)}
                    role="button"
                    tabIndex={0}
                    aria-label={`View all ${heroImages.length} images`}
                  >
                    <span>+{heroImages.length - 1}</span>
                  </div>
                )}
              </div>
            )}

            <div className="cook-media-item video-player-wrap" style={{ aspectRatio: '16 / 9' }}>
              {youtubeEmbedUrl ? (
                <iframe
                  src={youtubeEmbedUrl}
                  title="Recipe Video"
                  className="cook-media-video-player cook-media-youtube-iframe"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video
                  ref={videoRef}
                  src={recipe.video}
                  poster={heroImages[0]}
                  controls
                  playsInline
                  className="cook-media-video-player"
                />
              )}
            </div>
          </>
        ) : heroImages.length >= 3 ? (
          <>
            <div className="cook-media-item" style={{ aspectRatio: '16 / 9' }}>
              <img
                src={heroImages[0]}
                alt={`${recipe.title} 1`}
                fetchPriority="high"
                tabIndex={0}
                role="button"
                aria-label="View full size image"
                onClick={() => onOpenLightbox(0)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenLightbox(0);
                  }
                }}
              />
            </div>

            <div className="cook-media-item" style={{ aspectRatio: '16 / 9', position: 'relative' }}>
              <img
                src={heroImages[1]}
                alt={`${recipe.title} 2`}
                loading="lazy"
                decoding="async"
                tabIndex={0}
                role="button"
                aria-label={`View all ${heroImages.length} images`}
                onClick={() => onOpenLightbox(1)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenLightbox(1);
                  }
                }}
              />
              <div
                className="cook-media-overlay-badge"
                onClick={() => onOpenLightbox(1)}
                role="button"
                tabIndex={0}
                aria-label={`View all ${heroImages.length} images`}
              >
                <span>+{heroImages.length - 1}</span>
              </div>
            </div>
          </>
        ) : heroImages.length === 2 ? (
          <>
            <div className="cook-media-item" style={{ aspectRatio: '16 / 9' }}>
              <img
                src={heroImages[0]}
                alt={`${recipe.title} 1`}
                fetchPriority="high"
                tabIndex={0}
                role="button"
                aria-label="View full size image"
                onClick={() => onOpenLightbox(0)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenLightbox(0);
                  }
                }}
              />
            </div>
            <div className="cook-media-item" style={{ aspectRatio: '16 / 9' }}>
              <img
                src={heroImages[1]}
                alt={`${recipe.title} 2`}
                loading="lazy"
                decoding="async"
                tabIndex={0}
                role="button"
                aria-label="View full size image"
                onClick={() => onOpenLightbox(1)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenLightbox(1);
                  }
                }}
              />
            </div>
          </>
        ) : (
          <div className="cook-media-item" style={{ aspectRatio: '16 / 9' }}>
            <img
              src={heroImages[0]}
              alt={recipe.title}
              fetchPriority="high"
              tabIndex={0}
              role="button"
              aria-label="View full size image"
              onClick={() => onOpenLightbox(0)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenLightbox(0);
                }
              }}
            />
          </div>
        )}
      </div>

      {!isMultiMedia && (
        !isMediaExpanded ? (
          <div className="cook-media-fade-overlay" onClick={() => onToggleExpand(true)}>
            <div className="cook-media-expand-btn">
              <ChevronDown size={24} />
            </div>
          </div>
        ) : (
          <div className="cook-media-close-bar" onClick={() => onToggleExpand(false)}>
            <ChevronUp size={16} />
            <span>Collapse</span>
          </div>
        )
      )}
    </div>
  );
}
