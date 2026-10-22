import { useState } from 'preact/hooks';
import { Mail, Lock, User, AtSign, ArrowRight, Loader } from 'lucide-preact';
import { supabase } from '../../services/supabaseClient';

interface AuthCardProps {
  initialMode?: 'login' | 'signup';
  onSuccess?: () => void;
}

export function AuthCard({ initialMode = 'login', onSuccess }: AuthCardProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setErrorMsg(error.message);
        } else {
          if (onSuccess) onSuccess();
        }
      } else {
        // Validation
        if (!username || !displayName) {
          setErrorMsg('Please fill in all required fields');
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username,
              display_name: displayName,
            },
          },
        });

        if (error) {
          setErrorMsg(error.message);
        } else if (data.user && !data.session) {
          setInfoMsg('Check your email for the confirmation link!');
        } else {
          if (onSuccess) onSuccess();
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class={`pc-auth-container ${mode === 'signup' ? 'is-signup' : ''}`}>
      {/* Left Static Half: Revealed when in Sign Up mode */}
      <div class="pc-base-half">
        <div class="card-recipedb-brand">RecipeDB</div>
        <h3>Already have an account?</h3>
        <p>Log back in to manage your sent recipes, edit drafts, and access your cooking profile.</p>
        <button
          type="button"
          class="pc-toggle-action-btn"
          onClick={() => {
            setErrorMsg(null);
            setInfoMsg(null);
            setMode('login');
          }}
        >
          Log In
        </button>
      </div>

      {/* Right Static Half: Revealed when in Log In mode */}
      <div class="pc-base-half">
        <div class="card-recipedb-brand">RecipeDB</div>
        <h3>New to RecipeDB?</h3>
        <p>Create an account to submit your culinary creations, track submissions, and customize your chef profile.</p>
        <button
          type="button"
          class="pc-toggle-action-btn"
          onClick={() => {
            setErrorMsg(null);
            setInfoMsg(null);
            setMode('signup');
          }}
        >
          Sign Up
        </button>
      </div>

      {/* Center Sliding Form Container */}
      <div class="pc-sliding-panel">
        <form onSubmit={handleSubmit} class="auth-form-view">
          <h2 class="auth-form-title">
            {mode === 'login' ? 'Welcome Back' : 'Join RecipeDB'}
          </h2>
          <p class="auth-form-subtitle">
            {mode === 'login'
              ? 'Enter your credentials to access your account'
              : 'Create your account to start sharing recipes'}
          </p>

          {errorMsg && <div class="auth-error-msg">{errorMsg}</div>}
          {infoMsg && (
            <div class="auth-error-msg" style={{ background: 'rgba(51, 160, 88, 0.15)', borderColor: '#33a058', color: '#6ee7b7' }}>
              {infoMsg}
            </div>
          )}

          {mode === 'signup' && (
            <>
              <div class="auth-input-group">
                <label>Username</label>
                <div class="auth-input-wrapper">
                  <AtSign class="auth-input-icon" size={16} />
                  <input
                    type="text"
                    class="auth-input"
                    placeholder="chef_mario"
                    value={username}
                    onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
                    required
                  />
                </div>
              </div>

              <div class="auth-input-group">
                <label>Display Name</label>
                <div class="auth-input-wrapper">
                  <User class="auth-input-icon" size={16} />
                  <input
                    type="text"
                    class="auth-input"
                    placeholder="Mario Rossi"
                    value={displayName}
                    onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                    required
                  />
                </div>
              </div>
            </>
          )}

          <div class="auth-input-group">
            <label>Email Address</label>
            <div class="auth-input-wrapper">
              <Mail class="auth-input-icon" size={16} />
              <input
                type="email"
                class="auth-input"
                placeholder="chef@example.com"
                value={email}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                required
              />
            </div>
          </div>

          <div class="auth-input-group">
            <label>Password</label>
            <div class="auth-input-wrapper">
              <Lock class="auth-input-icon" size={16} />
              <input
                type="password"
                class="auth-input"
                placeholder="••••••••"
                value={password}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                required
              />
            </div>
          </div>

          <button type="submit" class="auth-submit-btn" disabled={loading}>
            {loading ? (
              <Loader size={18} class="animate-spin" />
            ) : (
              <>
                <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
