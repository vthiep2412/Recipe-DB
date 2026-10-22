import { AuthCard } from './AuthCard';

interface AuthPageProps {
  initialMode?: 'login' | 'signup';
}

export function AuthPage({ initialMode = 'login' }: AuthPageProps) {
  const handleSuccess = () => {
    window.location.href = '/';
  };

  return (
    <div class="auth-page-scene">
      <div class="culinary-backdrop" />
      <div class="culinary-tint" />
      <div class="device-pc-wrapper">
        <AuthCard initialMode={initialMode} onSuccess={handleSuccess} />
      </div>
    </div>
  );
}
