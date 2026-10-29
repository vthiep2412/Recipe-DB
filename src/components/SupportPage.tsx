import { useState, useEffect } from 'preact/hooks';
import { LifeBuoy, Send } from 'lucide-preact';
import { toast } from 'sonner';
import { authStore } from '../services/authStore';
import { Dropdown } from './ui/Dropdown';

interface Props {
  onNavigate: (path: string) => void;
}

const CATEGORY_OPTIONS = [
  { value: 'Account Suspension Appeal', label: 'Account Suspension Appeal' },
  { value: 'Account Deletion Restoration', label: 'Account Deletion Restoration' },
  { value: 'Technical Support', label: 'Technical Support' },
  { value: 'General Inquiry', label: 'General Inquiry' },
];

export function SupportPage({ onNavigate }: Props) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [category, setCategory] = useState('Account Deletion Restoration');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const authState = authStore.getState();
    if (authState.user?.email) {
      setEmail(authState.user.email);
    }
    if (authState.profile?.username) {
      setUsername(authState.profile.username);
    }
    if (authState.profile?.isArchived) {
      setCategory('Account Suspension Appeal');
    }
  }, []);

  const handleSubmit = (e: Event) => {
    e.preventDefault();

    if (!email.trim() || !username.trim() || !message.trim()) {
      toast.error('Please complete all required fields.');
      return;
    }

    if (message.trim().length < 10) {
      toast.error('Message must be at least 10 characters long.');
      return;
    }

    setIsSubmitting(true);

    // Simulate ticket submission
    setTimeout(() => {
      setIsSubmitting(false);
      toast.success('Support ticket submitted successfully! Our team will respond shortly.');
      setMessage('');
    }, 400);
  };

  return (
    <div className="support-page-container">
      <div className="support-card">
        <div className="support-header">
          <div className="support-icon-wrap" aria-hidden="true">
            <LifeBuoy size={28} />
          </div>
          <h1 className="support-title">RecipeDB Support</h1>
          <p className="support-desc">
            Submit a recovery request or inquiry. Our support team will review your
            account details and contact you via email.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="support-form" novalidate>
          <div className="support-field">
            <label htmlFor="support-email" className="support-label">
              Email Address <span className="field-required">*</span>
            </label>
            <input
              id="support-email"
              type="email"
              className="support-input"
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="support-field">
            <label htmlFor="support-username" className="support-label">
              Username <span className="field-required">*</span>
            </label>
            <input
              id="support-username"
              type="text"
              className="support-input"
              value={username}
              onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
              placeholder="chef_user"
              required
            />
          </div>

          <div className="support-field">
            <label id="support-category-label" className="support-label">
              Issue Category <span className="field-required">*</span>
            </label>
            <Dropdown
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={(val) => setCategory(val)}
              ariaLabel="Issue Category"
              className="support-dropdown"
            />
          </div>

          <div className="support-field">
            <label htmlFor="support-message" className="support-label">
              Message <span className="field-required">*</span>
            </label>
            <textarea
              id="support-message"
              className="support-textarea"
              rows={5}
              value={message}
              onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
              placeholder="Describe your issue or provide details about your account..."
              required
            />
          </div>

          <div className="support-actions-row">
            <button
              type="submit"
              className="support-submit-btn"
              disabled={isSubmitting}
            >
              <Send size={16} />
              <span>{isSubmitting ? 'Submitting...' : 'Submit Support Request'}</span>
            </button>

            <button
              type="button"
              className="support-back-btn"
              onClick={() => onNavigate('/')}
            >
              Return to Catalog
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
