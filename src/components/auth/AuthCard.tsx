import { useState, useEffect } from 'preact/hooks';
import { authStore } from '../../services/authStore';

export interface AuthCardProps {
  initialView?: 'login' | 'signup';
  contextCaption?: string | null;
  onSuccess?: () => void;
  onSwitchView?: (view: 'login' | 'signup') => void;
}

export function AuthCard({
  initialView = 'login',
  contextCaption,
  onSuccess,
  onSwitchView,
}: AuthCardProps) {
  const [view, setView] = useState<'login' | 'signup'>(initialView);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Sign up form state
  const [signupDisplayName, setSignupDisplayName] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState<string | null>(null);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const switchMode = (mode: 'login' | 'signup') => {
    setView(mode);
    setLoginError(null);
    setSignupError(null);
    onSwitchView?.(mode);
  };

  const handleLoginSubmit = async (e: Event) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      setLoginError('Please enter both email and password.');
      return;
    }
    setLoginLoading(true);
    setLoginError(null);

    try {
      const res = await authStore.signIn(loginEmail.trim(), loginPassword);
      if (res?.error) {
        setLoginError(res.error);
      } else {
        onSuccess?.();
      }
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'Failed to sign in.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignupSubmit = async (e: Event) => {
    e.preventDefault();
    if (!signupDisplayName.trim()) {
      setSignupError('Display name is required.');
      return;
    }
    const cleanUsername = signupUsername.trim().replace(/^@/, '');
    if (!cleanUsername) {
      setSignupError('Username is required.');
      return;
    }
    if (!signupEmail.trim()) {
      setSignupError('Email address is required.');
      return;
    }
    if (signupPassword.length < 8) {
      setSignupError('Password must be at least 8 characters.');
      return;
    }

    setSignupLoading(true);
    setSignupError(null);

    try {
      const res = await authStore.signUp({
        email: signupEmail.trim(),
        password: signupPassword,
        username: cleanUsername,
        displayName: signupDisplayName.trim(),
      });
      if (res?.error) {
        setSignupError(res.error);
      } else {
        setSignupSuccess('Account created successfully. Check your email to confirm registration.');
        setTimeout(() => {
          onSuccess?.();
        }, 1200);
      }
    } catch (err: unknown) {
      setSignupError(err instanceof Error ? err.message : 'Failed to create account.');
    } finally {
      setSignupLoading(false);
    }
  };

  // Mobile viewport layout
  if (isMobile) {
    return (
      <div className="mobile-auth-viewport">
        <div className={`mobile-auth-track ${view === 'signup' ? 'show-signup' : ''}`}>
          {/* Mobile Login Panel */}
          <div className="mobile-auth-panel">
            <div>
              <div className="card-recipedb-brand">RecipeDB</div>
              <div className="auth-title">
                {contextCaption ? 'Log in required' : 'Welcome back'}
              </div>
              <div className="auth-caption">
                {contextCaption || 'Log in to access your saved recipes and studio.'}
              </div>
            </div>

            {loginError && <div className="auth-msg-banner error">{loginError}</div>}

            <form onSubmit={handleLoginSubmit} className="auth-field" style={{ gap: '0.9rem' }}>
              <div className="auth-field">
                <label htmlFor="mobile-login-email">Email address</label>
                <input
                  id="mobile-login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={loginEmail}
                  onInput={(e) => setLoginEmail((e.target as HTMLInputElement).value)}
                  disabled={loginLoading}
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="mobile-login-password">Password</label>
                <input
                  id="mobile-login-password"
                  type="password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onInput={(e) => setLoginPassword((e.target as HTMLInputElement).value)}
                  disabled={loginLoading}
                  required
                />
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loginLoading}
              >
                {loginLoading ? 'Logging in...' : contextCaption ? 'Log in & Proceed' : 'Log in'}
              </button>
            </form>

            <div className="mobile-switch-action-box">
              <span className="mobile-switch-header">New here?</span>
              <button
                type="button"
                className="mobile-switch-solid-btn"
                onClick={() => switchMode('signup')}
              >
                Sign Up
              </button>
            </div>
          </div>

          {/* Mobile Signup Panel */}
          <div className="mobile-auth-panel">
            <div>
              <div className="card-recipedb-brand">RecipeDB</div>
              <div className="auth-title">Create account</div>
              <div className="auth-caption">
                Join to submit recipes and bookmark creations.
              </div>
            </div>

            {signupError && <div className="auth-msg-banner error">{signupError}</div>}
            {signupSuccess && <div className="auth-msg-banner success">{signupSuccess}</div>}

            <form onSubmit={handleSignupSubmit} className="auth-field" style={{ gap: '0.85rem' }}>
              <div className="auth-field">
                <label htmlFor="mobile-signup-name">Display name</label>
                <input
                  id="mobile-signup-name"
                  type="text"
                  placeholder="Your Name"
                  value={signupDisplayName}
                  onInput={(e) => setSignupDisplayName((e.target as HTMLInputElement).value)}
                  disabled={signupLoading}
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="mobile-signup-username">Username (@handle)</label>
                <input
                  id="mobile-signup-username"
                  type="text"
                  placeholder="handle"
                  value={signupUsername}
                  onInput={(e) => setSignupUsername((e.target as HTMLInputElement).value)}
                  disabled={signupLoading}
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="mobile-signup-email">Email address</label>
                <input
                  id="mobile-signup-email"
                  type="email"
                  placeholder="you@example.com"
                  value={signupEmail}
                  onInput={(e) => setSignupEmail((e.target as HTMLInputElement).value)}
                  disabled={signupLoading}
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="mobile-signup-password">Password</label>
                <input
                  id="mobile-signup-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={signupPassword}
                  onInput={(e) => setSignupPassword((e.target as HTMLInputElement).value)}
                  disabled={signupLoading}
                  required
                />
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={signupLoading}
              >
                {signupLoading ? 'Creating account...' : 'Create account'}
              </button>
            </form>

            <div className="mobile-switch-action-box">
              <span className="mobile-switch-header">Already have an account?</span>
              <button
                type="button"
                className="mobile-switch-solid-btn"
                onClick={() => switchMode('login')}
              >
                Log In
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Desktop 16:9 PC layout
  return (
    <div className={`pc-auth-container ${view === 'signup' ? 'is-signup' : ''}`}>
      {/* Left Static Half: Revealed when user is in Sign Up mode */}
      <div className="pc-base-half">
        <div className="card-recipedb-brand">RecipeDB</div>
        <h3>Already have an account?</h3>
        <p>Log back in to manage your sent recipes, edit drafts, and access your cooking profile.</p>
        <button
          type="button"
          className="pc-toggle-action-btn"
          onClick={() => switchMode('login')}
        >
          Log In
        </button>
      </div>

      {/* Right Static Half: Revealed when user is in Log In mode */}
      <div className="pc-base-half">
        <div className="card-recipedb-brand">RecipeDB</div>
        <h3>New here?</h3>
        <p>Create an account to find recipes, suggest recipes, and share feedback.</p>
        <button
          type="button"
          className="pc-toggle-action-btn"
          onClick={() => switchMode('signup')}
        >
          Sign Up
        </button>
      </div>

      {/* The 16:9 Moving Inner Slider */}
      <div className="pc-sliding-box">
        <div className="pc-slider-track">
          {/* Form 1: Log In */}
          <div className="pc-form-pane">
            <div>
              <div className="auth-title">
                {contextCaption ? 'Log in required' : 'Welcome back'}
              </div>
              <div className="auth-caption">
                {contextCaption || 'Sign in to your creator workspace.'}
              </div>
            </div>

            {loginError && <div className="auth-msg-banner error">{loginError}</div>}

            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div className="auth-field">
                <label htmlFor="pc-login-email">Email address</label>
                <input
                  id="pc-login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={loginEmail}
                  onInput={(e) => setLoginEmail((e.target as HTMLInputElement).value)}
                  disabled={loginLoading}
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="pc-login-password">Password</label>
                <input
                  id="pc-login-password"
                  type="password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onInput={(e) => setLoginPassword((e.target as HTMLInputElement).value)}
                  disabled={loginLoading}
                  required
                />
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loginLoading}
              >
                {loginLoading ? 'Logging in...' : contextCaption ? 'Log In & Proceed' : 'Log In'}
              </button>
            </form>
          </div>

          {/* Form 2: Sign Up */}
          <div className="pc-form-pane">
            <div>
              <div className="auth-title">Create account</div>
              <div className="auth-caption">
                Start your journey as a home cook or recipe creator.
              </div>
            </div>

            {signupError && <div className="auth-msg-banner error">{signupError}</div>}
            {signupSuccess && <div className="auth-msg-banner success">{signupSuccess}</div>}

            <form onSubmit={handleSignupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div className="auth-field">
                <label htmlFor="pc-signup-name">Display name</label>
                <input
                  id="pc-signup-name"
                  type="text"
                  placeholder="Your Name"
                  value={signupDisplayName}
                  onInput={(e) => setSignupDisplayName((e.target as HTMLInputElement).value)}
                  disabled={signupLoading}
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="pc-signup-username">Username (@handle)</label>
                <input
                  id="pc-signup-username"
                  type="text"
                  placeholder="handle"
                  value={signupUsername}
                  onInput={(e) => setSignupUsername((e.target as HTMLInputElement).value)}
                  disabled={signupLoading}
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="pc-signup-email">Email address</label>
                <input
                  id="pc-signup-email"
                  type="email"
                  placeholder="you@example.com"
                  value={signupEmail}
                  onInput={(e) => setSignupEmail((e.target as HTMLInputElement).value)}
                  disabled={signupLoading}
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="pc-signup-password">Password</label>
                <input
                  id="pc-signup-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={signupPassword}
                  onInput={(e) => setSignupPassword((e.target as HTMLInputElement).value)}
                  disabled={signupLoading}
                  required
                />
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={signupLoading}
              >
                {signupLoading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
