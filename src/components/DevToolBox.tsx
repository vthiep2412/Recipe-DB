import { useState, useEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';

export function DevToolBox() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [animSpeed, setAnimSpeed] = useState<number>(() => {
    if (typeof window === 'undefined') return 1;
    try {
      const saved = localStorage.getItem('timer_anim_speed');
      return saved ? parseFloat(saved) || 1 : 1;
    } catch {
      return 1;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncState = () => {
      try {
        setIsEnabled(localStorage.getItem('recipedevtool') === 'true');
        const saved = localStorage.getItem('timer_anim_speed');
        if (saved) setAnimSpeed(parseFloat(saved) || 1);
      } catch {
        // Ignore storage error
      }
    };

    const handleOpen = () => {
      try {
        localStorage.setItem('recipedevtool', 'true');
      } catch {
        // Ignore storage error
      }
      setIsEnabled(true);
      setIsOpen(true);
    };

    syncState();
    window.addEventListener('recipedevtool-change', syncState);
    window.addEventListener('recipedevtool-open', handleOpen);

    return () => {
      window.removeEventListener('recipedevtool-change', syncState);
      window.removeEventListener('recipedevtool-open', handleOpen);
    };
  }, []);

  const handleSpeedChange = (spd: number) => {
    setAnimSpeed(spd);
    try {
      localStorage.setItem('timer_anim_speed', String(spd));
    } catch {
      // Ignore storage error
    }
    window.dispatchEvent(new Event('recipedevtool-change'));
  };

  if (!isEnabled || typeof document === 'undefined') return null;

  return createPortal(
    <div style={{ position: 'fixed', bottom: '2rem', left: '2rem', zIndex: 9999999 }}>
      <button
        type="button"
        style={{
          padding: '0.85rem 1.5rem',
          borderRadius: '0.85rem',
          backgroundColor: '#f59e0b',
          color: '#111827',
          fontWeight: 800,
          fontSize: '1rem',
          border: '2px solid #ffffff',
          boxShadow: '0 0.75rem 2rem rgba(0, 0, 0, 0.6), 0 0 1rem rgba(245, 158, 11, 0.5)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          letterSpacing: '0.02rem'
        }}
        onClick={() => setIsOpen(prev => !prev)}
      >
        🛠 Dev Tool ({animSpeed}x)
      </button>

      {isOpen && (
        <div
          style={{
            marginBottom: '0.75rem',
            position: 'absolute',
            bottom: '100%',
            left: 0,
            padding: '1.25rem',
            backgroundColor: '#1c1c1f',
            color: '#f3f4f6',
            borderRadius: '1rem',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            boxShadow: '0 1.5rem 3rem rgba(0, 0, 0, 0.75)',
            width: '19rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>Animation Speed</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.9rem', color: '#f59e0b', fontWeight: 700 }}>{animSpeed}x</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  padding: 0,
                  lineHeight: 1
                }}
                aria-label="Close panel"
              >
                ✕
              </button>
            </div>
          </div>

          <input
            type="range"
            min="0.05"
            max="1"
            step="0.05"
            value={animSpeed}
            onChange={(e: any) => {
              const val = parseFloat(e.target.value) || 1;
              handleSpeedChange(val);
            }}
            style={{ width: '100%', accentColor: '#f59e0b', height: '1.5rem', cursor: 'pointer' }}
          />

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {[1, 0.5, 0.25, 0.1, 0.05].map(spd => (
              <button
                key={spd}
                type="button"
                onClick={() => handleSpeedChange(spd)}
                style={{
                  flex: '1 1 auto',
                  padding: '0.35rem 0.5rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  borderRadius: '0.45rem',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: animSpeed === spd ? '#f59e0b' : 'rgba(255, 255, 255, 0.1)',
                  color: animSpeed === spd ? '#111827' : '#f3f4f6',
                  cursor: 'pointer'
                }}
              >
                {spd}x
              </button>
            ))}
          </div>

          <div style={{ fontSize: '0.78rem', color: '#9ca3af', lineHeight: 1.5, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem' }}>
            Theme Circle: <strong style={{ color: '#f59e0b' }}>{Math.round(650 / animSpeed)}ms</strong><br />
            Timer Flight: {Math.round(800 / animSpeed)}ms
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
