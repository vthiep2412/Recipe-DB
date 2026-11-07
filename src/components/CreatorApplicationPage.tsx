import { useState, useEffect, useMemo } from 'preact/hooks';
import { ChefHat, ArrowLeft, Edit3, BookOpen, Send, Clock, Sparkles, CheckCircle2, AlertCircle, Info } from 'lucide-preact';
import { toast } from 'sonner';
import { marked } from 'marked';
import { authStore } from '../services/authStore';
import { creatorApplicationService } from '../services/creatorApplicationService';
import { Tooltip } from './Tooltip';
import { ObsidianSourceEditor, escapeHtmlAttr } from './KitchenStudio/ObsidianSourceEditor';
import type { CreatorApplication } from '../types/cloud';
import '../styles/kitchen-studio.css';
import '../styles/creator-application.css';

import { sanitizeHtml } from '../utils/sanitizer';

interface Props {
  onNavigate: (path: string) => void;
}

export function CreatorApplicationPage({ onNavigate }: Props) {
  const [content, setContent] = useState('');
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [existingApp, setExistingApp] = useState<CreatorApplication | null>(null);

  const [authState, setAuthState] = useState(() => authStore.getState());
  const user = authState.user;
  const role = authState.profile?.role || 'user';

  useEffect(() => {
    return authStore.subscribe(setAuthState);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setIsLoadingStatus(false);
      return;
    }

    creatorApplicationService.getLatestUserApplication(user.id).then(res => {
      if (res.application) {
        setExistingApp(res.application);
      }
      setIsLoadingStatus(false);
    });
  }, [user?.id]);

  const renderedMarkdownHtml = useMemo(() => {
    if (!isReadingMode && !existingApp) return '';
    const textToRender = existingApp ? existingApp.applicationMd : content;
    const raw = textToRender || '*No content written yet.*';
    const escaped = raw.replace(/</g, '&lt;');
    const processed = escaped.replace(/\[\[(.*?)\]\]/g, (_, linkText) => {
      return `<span class="obsidian-reading-link">${escapeHtmlAttr(linkText)}</span>`;
    });

    const renderer = new marked.Renderer();
    renderer.link = ({ href, title, text }) => {
      const isSafe = /^https?:\/\/|^mailto:/i.test(href.trim());
      const safeHref = isSafe ? escapeHtmlAttr(href.trim()) : '#';
      const titleAttr = title ? ` title="${escapeHtmlAttr(title)}"` : '';
      return `<a href="${safeHref}"${titleAttr} rel="noopener noreferrer" target="_blank">${escapeHtmlAttr(text)}</a>`;
    };

    const parsed = marked.parse(processed, { renderer, async: false }) as string;
    return sanitizeHtml(parsed);
  }, [content, isReadingMode, existingApp]);

  const handleSubmit = async () => {
    if (!user?.id) {
      toast.error('Please sign in to submit a creator application.');
      onNavigate('/auth');
      return;
    }

    if (content.trim().length < 30) {
      toast.error('Please provide more details in your application before submitting.');
      return;
    }

    setIsSubmitting(true);
    const result = await creatorApplicationService.submitApplication(user.id, content);
    setIsSubmitting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.application) {
      setExistingApp(result.application);
      toast.success('Creator application submitted successfully. Our team will review it soon.');
    }
  };

  if (authState.isAuthLoading) {
    return (
      <div className="creator-app-page" style={{ textAlign: 'center', paddingTop: '5rem' }}>
        <p style={{ color: 'var(--text-muted)' }}>Checking creator status...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="creator-app-page">
        <header className="creator-app-header">
          <button
            type="button"
            className="creator-app-back-btn"
            onClick={() => onNavigate('/')}
          >
            <ArrowLeft size={16} />
            <span>Return to Catalog</span>
          </button>
          <div className="creator-app-title-row">
            <div className="creator-app-title-icon">
              <ChefHat size={22} />
            </div>
            <div>
              <h1 className="creator-app-title">Apply to be a Recipe Maker</h1>
              <div className="creator-app-subtitle">
                Sign in to submit your recipe maker application.
              </div>
            </div>
          </div>
        </header>

        <div className="creator-guidelines-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <AlertCircle size={36} style={{ color: 'var(--color-primary, #ff5722)', marginBottom: '1rem' }} />
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#ffffff' }}>Authentication Required</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '28rem', margin: '0 auto 1.5rem' }}>
            You need an active account to submit an application and track review updates.
          </p>
          <button
            type="button"
            className="creator-submit-btn"
            onClick={() => onNavigate('/auth')}
          >
            Sign In or Create Account
          </button>
        </div>
      </div>
    );
  }

  if (role === 'recipe_creator' || role === 'admin') {
    return (
      <div className="creator-app-page">
        <header className="creator-app-header">
          <button
            type="button"
            className="creator-app-back-btn"
            onClick={() => onNavigate('/')}
          >
            <ArrowLeft size={16} />
            <span>Return to Catalog</span>
          </button>
          <div className="creator-app-title-row">
            <div className="creator-app-title-icon">
              <CheckCircle2 size={22} style={{ color: '#10b981' }} />
            </div>
            <div>
              <h1 className="creator-app-title">You Are a Recipe Maker</h1>
              <div className="creator-app-subtitle">
                Your account already has creator privileges enabled.
              </div>
            </div>
          </div>
        </header>

        <div className="creator-already-submitted-card">
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
            You have full access to compose, test, and publish interactive recipes in Kitchen Studio.
          </p>
          <button
            type="button"
            className="creator-submit-btn"
            onClick={() => onNavigate('/kitchen-studio')}
          >
            Open Kitchen Studio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="creator-app-page">
      <header className="creator-app-header">
        <button
          type="button"
          className="creator-app-back-btn"
          onClick={() => onNavigate('/')}
        >
          <ArrowLeft size={16} />
          <span>Return to Catalog</span>
        </button>
        <div className="creator-app-title-row">
          <div className="creator-app-title-icon">
            <ChefHat size={22} />
          </div>
          <div>
            <h1 className="creator-app-title">Apply to be a Recipe Maker</h1>
            <div className="creator-app-subtitle">
              Join our community of culinary creators and publish structured recipes.
            </div>
          </div>
        </div>
      </header>

      {/* Existing Pending Application Card */}
      {existingApp && existingApp.status === 'pending' && (
        <section className="creator-already-submitted-card" aria-labelledby="pending-status-heading">
          <div className="creator-already-submitted-header">
            <h2 id="pending-status-heading" className="creator-already-submitted-title">
              <Clock size={20} style={{ color: '#f59e0b' }} />
              Application Submitted
            </h2>
            <span className="creator-status-badge pending">
              Pending Review
            </span>
          </div>
          <div className="creator-already-submitted-meta">
            Submitted on {new Date(existingApp.createdAt).toLocaleDateString()} at {new Date(existingApp.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
            Our team will review your application soon.
          </div>
          <div className="creator-markdown-preview" style={{ height: '16rem' }} dangerouslySetInnerHTML={{ __html: renderedMarkdownHtml }} />
        </section>
      )}

      {/* Unified Application Workspace */}
      {(!existingApp || existingApp.status !== 'pending') && (
        <section className="creator-unified-card">
          {/* Guidelines Header */}
          <div className="creator-guidelines-section">
            <h2 id="guidelines-heading" className="creator-guidelines-title">
              <Sparkles size={18} style={{ color: 'var(--color-primary, #ff5722)' }} />
              What to share in your application
            </h2>
            <ul className="creator-guidelines-list">
              <li>
                <span className="creator-guidelines-bullet">1.</span>
                <div>
                  <strong>Recipe Experience:</strong> Share your background with home cooking or developing recipes.
                </div>
              </li>
              <li>
                <span className="creator-guidelines-bullet">2.</span>
                <div>
                  <strong>Proof of Good Recipes:</strong> Provide convenient links, photos, blogs, social posts, or recipe texts demonstrating your style.
                </div>
              </li>
              <li>
                <span className="creator-guidelines-bullet">3.</span>
                <div>
                  <strong>Other Recipe Platforms:</strong> Tell us if you have published or contributed recipes on other websites or communities.
                </div>
              </li>
              <li>
                <span className="creator-guidelines-bullet">4.</span>
                <div>
                  <strong>Honest Vision:</strong> Tell us honestly what kind of recipes or culinary content you want to share.
                </div>
              </li>
            </ul>
            <div className="creator-guidelines-reassurance">
              <strong>Note:</strong> These points reflect our preferences to get to know you better. It is completely normal for someone with no prior formal experience to apply and become a recipe maker with us.
            </div>
          </div>

          <div className="creator-card-divider" />

          {/* Editor Workspace */}
          <div className="creator-editor-section">
            <div className="creator-editor-header">
              <div>
                <span className="creator-editor-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                  Your Application
                  <Tooltip content="This is a Markdown editor">
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        color: 'var(--text-muted, #9ca3af)',
                        cursor: 'help',
                        lineHeight: 1
                      }}
                      aria-label="Markdown editor info"
                    >
                      <Info size={14} />
                    </span>
                  </Tooltip>
                </span>
                <div className="creator-editor-sublabel">
                  Describe your recipe experience, proof or links of your creations, other platforms, and your goals.
                </div>
              </div>
              <div className="metadata-segmented-toggle">
                <button
                  type="button"
                  className={`metadata-segment-btn ${!isReadingMode ? 'is-active' : ''}`}
                  onClick={() => setIsReadingMode(false)}
                  title="Source Mode (Markdown)"
                >
                  <Edit3 size={13} />
                  <span>Source</span>
                </button>
                <button
                  type="button"
                  className={`metadata-segment-btn ${isReadingMode ? 'is-active' : ''}`}
                  onClick={() => setIsReadingMode(true)}
                  title="Reading View (Rendered Preview)"
                >
                  <BookOpen size={13} />
                  <span>Reading</span>
                </button>
              </div>
            </div>

            <div className="creator-editor-container">
              {!isReadingMode ? (
                <ObsidianSourceEditor
                  value={content}
                  onChange={setContent}
                  placeholder="Describe your recipe experience, proof or links of your creations, other platforms, and your goals..."
                />
              ) : (
                <div
                  className="creator-markdown-preview"
                  dangerouslySetInnerHTML={{ __html: renderedMarkdownHtml }}
                />
              )}
            </div>

            <footer className="creator-editor-footer">
              <div className="creator-editor-hint">
                {content.length} characters
              </div>
              <button
                type="button"
                className="creator-submit-btn"
                onClick={handleSubmit}
                disabled={isSubmitting || isLoadingStatus}
              >
                <Send size={16} />
                <span>{isSubmitting ? 'Submitting...' : 'Submit Application'}</span>
              </button>
            </footer>
          </div>
        </section>
      )}
    </div>
  );
}
