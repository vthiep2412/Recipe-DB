import { useState, useEffect, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { X, ChevronLeft, ChevronRight } from 'lucide-preact';
import { getOptimizedImageUrl } from '../../services/cloudinaryUpload';

export interface RecipeLightboxProps {
  isOpen: boolean;
  images: string[];
  initialIndex?: number;
  title?: string;
  onClose: () => void;
}

export function RecipeLightbox({
  isOpen,
  images,
  initialIndex = 0,
  title = 'Recipe Photo',
  onClose
}: RecipeLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isLoading, setIsLoading] = useState(true);
  const touchStartXRef = useRef<number | null>(null);
  const loadedUrlsRef = useRef<Set<string>>(new Set());
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Check if a URL is already loaded/cached in browser memory
  const isUrlLoaded = (url: string): boolean => {
    if (!url) return false;
    if (loadedUrlsRef.current.has(url)) return true;
    if (typeof window !== 'undefined') {
      const probe = new Image();
      probe.src = url;
      if (probe.complete && probe.naturalWidth > 0) {
        loadedUrlsRef.current.add(url);
        return true;
      }
    }
    return false;
  };

  // Determine optimal display URL (reuse hero on standard displays to leverage memory cache)
  const getDisplayUrl = (rawUrl?: string): string => {
    if (!rawUrl) return '';
    const isLargeScreen = typeof window !== 'undefined' && window.innerWidth > 1400;
    return getOptimizedImageUrl(rawUrl, isLargeScreen ? 'lightbox' : 'hero');
  };

  // Generate candidate lower-resolution variants in descending resolution order
  const getCandidateUrls = (rawUrl: string, displayUrl: string): string[] => {
    if (!rawUrl) return [];
    const list: string[] = [displayUrl];
    if (rawUrl.includes('cloudinary.com') && rawUrl.includes('/upload/')) {
      const hero = getOptimizedImageUrl(rawUrl, 'hero');
      const step = getOptimizedImageUrl(rawUrl, 'step');
      const card = getOptimizedImageUrl(rawUrl, 'card');
      if (!list.includes(hero)) list.push(hero);
      if (!list.includes(step)) list.push(step);
      if (!list.includes(rawUrl)) list.push(rawUrl);
      if (!list.includes(card)) list.push(card);
    } else {
      if (!list.includes(rawUrl)) list.push(rawUrl);
    }
    return list;
  };

  // Find the highest resolution candidate that is already loaded
  const getHighestLoadedPlaceholder = (candidates: string[]): string => {
    for (let i = 1; i < candidates.length; i++) {
      if (isUrlLoaded(candidates[i])) {
        return candidates[i];
      }
    }
    return candidates[candidates.length - 1] || '';
  };

  const currentRawUrl = images[currentIndex] || '';
  const currentDisplayUrl = getDisplayUrl(currentRawUrl);
  const candidateUrls = getCandidateUrls(currentRawUrl, currentDisplayUrl);
  const placeholderUrl = getHighestLoadedPlaceholder(candidateUrls);

  // Synchronize index when opened
  useEffect(() => {
    if (isOpen) {
      const safeIdx = Math.max(0, Math.min(initialIndex, images.length - 1));
      const targetUrl = getDisplayUrl(images[safeIdx]);
      setCurrentIndex(safeIdx);
      if (isUrlLoaded(targetUrl)) {
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
    }
  }, [isOpen, initialIndex, images]);

  // Check if current image is already completed in cache
  useEffect(() => {
    if (!isOpen || !currentDisplayUrl) return;
    if (isUrlLoaded(currentDisplayUrl)) {
      setIsLoading(false);
      return;
    }
    if (imgRef.current?.complete && imgRef.current?.naturalWidth > 0) {
      loadedUrlsRef.current.add(currentDisplayUrl);
      setIsLoading(false);
    }
  }, [isOpen, currentDisplayUrl]);

  // Preload adjacent images for smooth instant transitions
  useEffect(() => {
    if (!isOpen || images.length <= 1) return;
    const nextIdx = (currentIndex + 1) % images.length;
    const prevIdx = (currentIndex - 1 + images.length) % images.length;

    const preload = (url: string) => {
      if (!url) return;
      const targetUrl = getDisplayUrl(url);
      if (loadedUrlsRef.current.has(targetUrl)) return;
      const img = new Image();
      img.onload = () => {
        loadedUrlsRef.current.add(targetUrl);
      };
      img.src = targetUrl;
    };

    preload(images[nextIdx]);
    preload(images[prevIdx]);
  }, [isOpen, currentIndex, images]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, images.length, currentIndex]);

  if (!isOpen || images.length === 0) return null;

  const navigateTo = (targetIdx: number) => {
    const targetUrl = getDisplayUrl(images[targetIdx]);
    if (isUrlLoaded(targetUrl)) {
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    setCurrentIndex(targetIdx);
  };

  const handlePrev = () => {
    if (images.length <= 1) return;
    const targetIdx = currentIndex > 0 ? currentIndex - 1 : images.length - 1;
    navigateTo(targetIdx);
  };

  const handleNext = () => {
    if (images.length <= 1) return;
    const targetIdx = currentIndex < images.length - 1 ? currentIndex + 1 : 0;
    navigateTo(targetIdx);
  };

  const handleSelectIndex = (idx: number) => {
    if (idx !== currentIndex) {
      navigateTo(idx);
    }
  };

  const handleTouchStart = (e: TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartXRef.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        handlePrev();
      } else {
        handleNext();
      }
    }
    touchStartXRef.current = null;
  };

  const content = (
    <div
      className="cook-lightbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Full size recipe photo"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button
        type="button"
        className="cook-lightbox-close"
        onClick={onClose}
        aria-label="Close image"
      >
        <X size={20} />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            className="cook-lightbox-ghost-nav cook-lightbox-nav-prev"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            aria-label="Previous image"
          >
            <ChevronLeft size={38} />
          </button>

          <button
            type="button"
            className="cook-lightbox-ghost-nav cook-lightbox-nav-next"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            aria-label="Next image"
          >
            <ChevronRight size={38} />
          </button>
        </>
      )}

      <div className="cook-lightbox-center-container" onClick={(e) => e.stopPropagation()}>
        <div className="cook-lightbox-img-wrap">
          {/* Underlay: Highest loaded lower-resolution image */}
          {isLoading && placeholderUrl && (
            <img
              src={placeholderUrl}
              alt=""
              aria-hidden="true"
              className="cook-lightbox-placeholder-img"
            />
          )}

          {/* Darkened overlay with spinner while main image is loading */}
          {isLoading && (
            <div className="cook-lightbox-loader-overlay" aria-hidden="true">
              <div className="cook-lightbox-spinner" />
            </div>
          )}

          {/* Main high-resolution image */}
          <img
            ref={imgRef}
            src={currentDisplayUrl}
            alt={title}
            className={`cook-lightbox-img ${isLoading ? 'is-loading' : 'is-loaded'}`}
            onLoad={() => {
              loadedUrlsRef.current.add(currentDisplayUrl);
              setIsLoading(false);
            }}
            onError={() => {
              setIsLoading(false);
            }}
          />
        </div>

        {images.length > 1 && (
          <div className="cook-lightbox-controls">
            <div className="cook-lightbox-counter">
              {currentIndex + 1} / {images.length}
            </div>
            <div className="cook-lightbox-thumb-strip">
              {images.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`cook-lightbox-thumb-btn ${idx === currentIndex ? 'is-active' : ''}`}
                  onClick={() => handleSelectIndex(idx)}
                  aria-label={`Jump to image ${idx + 1}`}
                >
                  <img src={url} alt={`Thumbnail ${idx + 1}`} loading="eager" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
