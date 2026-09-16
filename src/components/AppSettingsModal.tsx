import { useState } from 'preact/hooks';
import { X } from 'lucide-preact';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function AppSettingsModal({ isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'tab1' | 'tab2'>('tab1');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">App Settings</h2>
          <button className="nav-btn" onClick={onClose} aria-label="Close settings">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-sidebar">
            <button
              className={`modal-tab-btn ${activeTab === 'tab1' ? 'active' : ''}`}
              onClick={() => setActiveTab('tab1')}
            >
              Dummy Tab 1
            </button>
            <button
              className={`modal-tab-btn ${activeTab === 'tab2' ? 'active' : ''}`}
              onClick={() => setActiveTab('tab2')}
            >
              Dummy Tab 2
            </button>
          </div>

          <div className="modal-content-panel">
            {activeTab === 'tab1' ? (
              <div>
                <h3 style={{ marginBottom: '0.75rem', fontSize: '1.125rem' }}>Dummy Tab 1 Content</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem', lineHeight: '1.6' }}>
                  This is placeholder configuration content for dummy tab 1. You can configure general recipe database preferences and custom unit conversions here in the future.
                </p>
              </div>
            ) : (
              <div>
                <h3 style={{ marginBottom: '0.75rem', fontSize: '1.125rem' }}>Dummy Tab 2 Content</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem', lineHeight: '1.6' }}>
                  This is placeholder configuration content for dummy tab 2. Advanced sync settings and database integrations can be hooked up here later.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
