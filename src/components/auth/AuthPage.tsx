import { useEffect } from 'preact/hooks';
import { AuthCard } from './AuthCard';
import { authStore } from '../../services/authStore';

export interface AuthPageProps {
  onNavigate: (path: string) => void;
}

export function AuthPage({ onNavigate }: AuthPageProps) {
  const authState = authStore.useAuth();

  useEffect(() => {
    if (authState.user) {
      onNavigate('/');
    }
  }, [authState.user, onNavigate]);

  return (
    <div className="auth-page">
      <div className="auth-backdrop" aria-hidden="true" />
      <div className="auth-backdrop-tint" aria-hidden="true" />
      <div className="auth-page-center">
        <AuthCard
          onSuccess={() => {
            onNavigate('/');
          }}
        />
      </div>
    </div>
  );
}
