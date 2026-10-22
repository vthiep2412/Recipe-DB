import { useState, useEffect, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Image, Video, RefreshCw, Trash2, Plus, X } from 'lucide-preact';
import { saveBlob } from '../../services/localMediaStore';
import { preflightProcessImage } from '../../services/cloudinaryUpload';

export interface MediaModalProps {
  isOpen: boolean;
  mediaType?: 'picture' | 'video';
  mode?: 'single' | 'gallery';
  title?: string;
  currentUrl?: string;
  currentUrls?: string[];
  workspaceId?: string;
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
  workspaceId = 'temp',
  onClose,
  onSave,
  onSaveGallery
}: MediaModalProps) {
  const effectiveMode: 'single' | 'gallery' = mode || (currentUrls !== undefined || onSaveGallery !== undefined ? 'gallery' : 'single');

  const [urlInput, setUrlInput] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [galleryList, setGalleryList] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setUrlInput(currentUrl);
      setPreviewUrl(currentUrl);
      setGalleryList(currentUrls ? [...currentUrls] : (currentUrl ? [currentUrl] : []));
    }
  }, [isOpen, currentUrl, currentUrls]);

  if (!isOpen) return null;

  const processFile = async (file: File) => {
    if (!file) return;

    try {
      // 1. Client-side canvas preflight
      const processedBlob = await preflightProcessImage(file);

      // 2. Save Blob in IndexedDB
      const assetUuid = crypto.randomUUID();
      const idbKey = `idb:${workspaceId}:${assetUuid}`;
      await saveBlob(idbKey, processedBlob);

      // 3. Local preview URL
      const objectUrl = URL.createObjectURL(processedBlob);

      if (effectiveMode === 'single') {
        setPreviewUrl(idbKey); // Stored ref key
        setUrlInput(objectUrl);
      } else {
        setGalleryList(prev => [...prev, idbKey]);
        setUrlInput('');
      }
    } catch (err) {
      console.error('Error processing file preflight:', err);
      // Fallback
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        if (effectiveMode === 'single') {
          setPreviewUrl(result);
          setUrlInput(result);
        } else {
          setGalleryList(prev => [...prev, result]);
          setUrlInput('');
        }
      };
      reader.readAsDataURL(file);
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

  const handleApplyUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (effectiveMode === 'single') {
      setPreviewUrl(trimmed);
    } else {
      setGalleryList(prev => [...prev, trimmed]);
      setUrlInput('');
    }
  };

  const handleClearSingleMedia = () => {
    setUrlInput('');
    setPreviewUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveGalleryItem = (index: number) => {
    setGalleryList(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = () => {
    if (effectiveMode === 'single') {
      onSave?.(previewUrl.trim());
    } else {
      onSaveGallery?.(galleryList);
      if (onSave) {
        onSave(galleryList[0] || '');
      }
    }
    onClose();
  };

  const modalTitle = title || (
    effectiveMode === 'gallery'
      ? 'Recipe Image Gallery'
      : (mediaType === 'video' ? 'Recipe Video Manager' : 'Recipe Image Manager')
  );

  const modalElement = (
    <div className="studio-modal-overlay" onClick={onClose}>
      <div
        className="studio-modal-card"
        onClick={e => e.stopPropagation()}
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
                      <img src={urlInput || previewUrl} alt="Preview" className="studio-preview-img" />
                    ) : (
                      <video src={urlInput || previewUrl} controls className="studio-preview-video" />
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
                      onInput={e => setUrlInput((e.target as HTMLInputElement).value)}
                      onKeyDown={e => {
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
                </div>
              )}
            </div>
          ) : (
            <div className="studio-gallery-media-section">
              {galleryList.length > 0 && (
                <div className="studio-gallery-grid">
                  {galleryList.map((url, idx) => (
                    <div key={idx} className="studio-gallery-item-card">
                      <img src={url} alt={`Gallery item ${idx + 1}`} className="studio-gallery-thumb" />
                      <button
                        type="button"
                        className="studio-gallery-item-delete-btn"
                        onClick={() => handleRemoveGalleryItem(idx)}
                        title="Remove image"
                        aria-label="Remove image"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <div
                    className="studio-gallery-add-card"
                    onClick={() => fileInputRef.current?.click()}
                    title="Add image"
                  >
                    <Plus size={24} />
                    <span>Add Image</span>
                  </div>
                </div>
              )}

              <div className="studio-unified-dropzone-wrapper" style={{ marginTop: galleryList.length > 0 ? '1rem' : '0' }}>
                <div
                  className={`studio-custom-dropzone ${isDragging ? 'is-dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="dropzone-icon">
                    <Image size={40} className="dropzone-lucide-icon" />
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
                    onInput={e => setUrlInput((e.target as HTMLInputElement).value)}
                    onKeyDown={e => {
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
              </div>
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
