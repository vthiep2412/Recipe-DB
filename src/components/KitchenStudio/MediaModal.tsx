import { useState, useEffect, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Image, Video, RefreshCw, Trash2, X } from 'lucide-preact';
import { localMediaStore } from '../../services/localMediaStore';
import { getYouTubeEmbedUrl } from '../../utils/media';
import { getOptimizedImageUrl } from '../../services/cloudinaryUpload';

export interface MediaModalProps {
  isOpen: boolean;
  mediaType?: 'picture' | 'video';
  mode?: 'single' | 'gallery';
  title?: string;
  currentUrl?: string;
  currentUrls?: string[];
  onClose: () => void;
  onSave?: (url: string) => void;
  onSaveGallery?: (urls: string[]) => void;
}

export function MediaModal({
  isOpen,
  mediaType = 'picture',
  mode,
  title,
  currentUrl = '',
  currentUrls,
  onClose,
  onSave,
  onSaveGallery,
}: MediaModalProps) {
  const effectiveMode: 'single' | 'gallery' =
    mode || (currentUrls !== undefined || onSaveGallery !== undefined ? 'gallery' : 'single');

  const [urlInput, setUrlInput] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [actualRef, setActualRef] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [galleryList, setGalleryList] = useState<string[]>([]);
  const [galleryPreviewMap, setGalleryPreviewMap] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createdUrlsRef = useRef<Set<string>>(new Set());

  // Resolve IDB blobs to preview URLs
  const resolveRefToPreview = async (ref: string): Promise<string> => {
    if (!ref) return '';
    if (ref.startsWith('idb:')) {
      try {
        const blob = await localMediaStore.loadBlob(ref);
        if (blob) {
          const objectUrl = URL.createObjectURL(blob);
          createdUrlsRef.current.add(objectUrl);
          return objectUrl;
        }
      } catch {
        // IDB fallback
      }
    }
    return ref;
  };

  useEffect(() => {
    return () => {
      createdUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Cleanup fallback
        }
      });
      createdUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setUrlInput(currentUrl);
      setActualRef(currentUrl);

      resolveRefToPreview(currentUrl).then((resolved) => {
        setPreviewUrl(resolved);
      });

      const list = currentUrls ? [...currentUrls] : currentUrl ? [currentUrl] : [];
      setGalleryList(list);

      // Resolve gallery previews
      const map: Record<string, string> = {};
      Promise.all(
        list.map(async (ref) => {
          map[ref] = await resolveRefToPreview(ref);
        })
      ).then(() => {
        setGalleryPreviewMap({ ...map });
      });
    }
  }, [isOpen, currentUrl, currentUrls]);

  if (!isOpen) return null;

  const processFile = async (file: File) => {
    if (!file) return;

    // 1. Instant object URL for zero-latency local preview
    const objectUrl = URL.createObjectURL(file);
    createdUrlsRef.current.add(objectUrl);
    const assetId = `idb:asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 2. Persist blob into IndexedDB
    try {
      await localMediaStore.saveBlob(assetId, file);
    } catch {
      // Storage quota fallback
    }

    if (effectiveMode === 'single') {
      setPreviewUrl(objectUrl);
      setActualRef(assetId);
      setUrlInput('');
    } else {
      setGalleryList((prev) => [...prev, assetId]);
      setGalleryPreviewMap((prev) => ({ ...prev, [assetId]: objectUrl }));
      setUrlInput('');
    }
  };

  const handleFileInputChange = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      processFile(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer?.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleApplyUrl = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    const isSafe = /^https?:\/\/|^blob:|^idb:/i.test(trimmed);
    if (!isSafe) {
      setUrlError('Only secure HTTP, HTTPS, or uploaded media references are allowed.');
      return;
    }
    setUrlError(null);

    if (effectiveMode === 'single') {
      const resolved = await resolveRefToPreview(trimmed);
      setPreviewUrl(resolved);
      setActualRef(trimmed);
      setUrlInput('');
    } else {
      const resolved = await resolveRefToPreview(trimmed);
      setGalleryList((prev) => [...prev, trimmed]);
      setGalleryPreviewMap((prev) => ({ ...prev, [trimmed]: resolved }));
      setUrlInput('');
    }
  };

  const handleClearSingleMedia = () => {
    setUrlInput('');
    setPreviewUrl('');
    setActualRef('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveGalleryItem = (index: number) => {
    setGalleryList((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = () => {
    if (effectiveMode === 'single') {
      onSave?.(actualRef || previewUrl.trim());
    } else {
      onSaveGallery?.(galleryList);
      if (onSave) {
        onSave(galleryList[0] || '');
      }
    }
    onClose();
  };

  const modalTitle =
    title ||
    (effectiveMode === 'gallery'
      ? 'Recipe Image Gallery'
      : mediaType === 'video'
      ? 'Recipe Video Manager'
      : 'Recipe Image Manager');

  const modalElement = (
    <div className="studio-modal-overlay" onClick={onClose}>
      <div
        className="studio-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-modal-title"
      >
        <div className="studio-modal-header">
          <h2 id="media-modal-title">{modalTitle}</h2>
          <button
            type="button"
            className="studio-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="studio-modal-body">
          <input
            ref={fileInputRef}
            type="file"
            accept={mediaType === 'picture' ? 'image/*' : 'video/*'}
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
          />

          {effectiveMode === 'single' ? (
            <div className="studio-single-media-section">
              {previewUrl ? (
                <div className="studio-media-preview-container">
                  <div className="studio-media-preview-box">
                    {mediaType === 'picture' ? (
                      <img src={previewUrl} alt="Preview" className="studio-preview-img" />
                    ) : getYouTubeEmbedUrl(previewUrl) ? (
                      <iframe
                        src={getYouTubeEmbedUrl(previewUrl)!}
                        title="YouTube preview"
                        className="studio-preview-video"
                        style={{ border: 'none', width: '100%', height: '100%', minHeight: '220px' }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <video src={previewUrl} controls className="studio-preview-video" />
                    )}
                  </div>
                  <div className="studio-preview-actions-bar">
                    <button
                      type="button"
                      className="studio-btn studio-btn-secondary studio-btn-with-icon"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <RefreshCw size={14} />
                      <span>Change Image</span>
                    </button>
                    <button
                      type="button"
                      className="studio-btn studio-btn-danger studio-btn-with-icon"
                      onClick={handleClearSingleMedia}
                    >
                      <Trash2 size={14} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="studio-unified-dropzone-wrapper">
                  <div
                    className={`studio-custom-dropzone ${isDragging ? 'is-dragging' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="dropzone-icon">
                      {mediaType === 'picture' ? (
                        <Image size={40} className="dropzone-lucide-icon" />
                      ) : (
                        <Video size={40} className="dropzone-lucide-icon" />
                      )}
                    </div>
                    <div className="dropzone-primary-text">
                      Drag and drop your {mediaType === 'picture' ? 'picture' : 'video'} here
                    </div>
                    <div className="dropzone-sub-text">
                      or click to browse from computer
                    </div>
                    <span className="dropzone-format-pill">
                      {mediaType === 'picture' ? 'PNG, JPG, WEBP, GIF' : 'MP4, WEBM, MOV'}
                    </span>
                  </div>

                  <div className="studio-integrated-url-row">
                    <input
                      type="url"
                      className="studio-input"
                      placeholder={
                        mediaType === 'picture'
                          ? 'Or enter image URL...'
                          : 'Or enter video URL...'
                      }
                      value={urlInput}
                      onInput={(e) => {
                        setUrlInput((e.target as HTMLInputElement).value);
                        if (urlError) setUrlError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleApplyUrl();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="studio-btn studio-btn-secondary"
                      onClick={handleApplyUrl}
                      disabled={!urlInput.trim()}
                    >
                      Load
                    </button>
                  </div>
                  {urlError && (
                    <div style={{ color: 'var(--color-red, #ef4444)', fontSize: '0.8rem', marginTop: '0.4rem', textAlign: 'left' }}>
                      {urlError}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="studio-gallery-media-section">
              <div className="studio-unified-dropzone-wrapper">
                <div
                  className={`studio-custom-dropzone ${isDragging ? 'is-dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="dropzone-icon">
                    <Image size={36} className="dropzone-lucide-icon" />
                  </div>
                  <div className="dropzone-primary-text">
                    Drag and drop images to add
                  </div>
                  <div className="dropzone-sub-text">
                    or click to browse from computer
                  </div>
                  <span className="dropzone-format-pill">
                    PNG, JPG, WEBP, GIF
                  </span>
                </div>

                <div className="studio-integrated-url-row">
                  <input
                    type="url"
                    className="studio-input"
                    placeholder="Or enter image URL to add..."
                    value={urlInput}
                    onInput={(e) => {
                      setUrlInput((e.target as HTMLInputElement).value);
                      if (urlError) setUrlError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyUrl();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="studio-btn studio-btn-secondary"
                    onClick={handleApplyUrl}
                    disabled={!urlInput.trim()}
                  >
                    Add
                  </button>
                </div>
                {urlError && (
                  <div style={{ color: 'var(--color-red, #ef4444)', fontSize: '0.8rem', marginTop: '0.4rem', textAlign: 'left' }}>
                    {urlError}
                  </div>
                )}
              </div>

              {galleryList.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Recipe Images ({galleryList.length})
                  </div>
                  <div className="studio-gallery-grid-2x2">
                    {galleryList.map((ref, idx) => (
                      <div key={idx} className="studio-gallery-item-card">
                        <img
                          src={getOptimizedImageUrl(galleryPreviewMap[ref] || ref)}
                          alt={`Gallery item ${idx + 1}`}
                          className="studio-gallery-thumb"
                        />
                        <button
                          type="button"
                          className="studio-gallery-item-delete-btn"
                          onClick={() => handleRemoveGalleryItem(idx)}
                          title="Remove image"
                          aria-label="Remove image"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="studio-modal-footer">
          <button
            type="button"
            className="studio-btn studio-btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="studio-btn studio-btn-primary"
            onClick={handleSave}
          >
            Save Media
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalElement, document.body)
    : modalElement;
}
