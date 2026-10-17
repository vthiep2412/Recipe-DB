import { useState } from 'preact/hooks';
import { ChevronDown, ChevronUp } from 'lucide-preact';
import type { RecipeGraph } from '../../types/orchestration';

interface JsonDrawerProps {
  graph: RecipeGraph;
}

export function JsonDrawer({ graph }: JsonDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(graph, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`studio-json-drawer ${isOpen ? 'is-open' : ''}`}>
      <div className="json-drawer-bar" onClick={() => setIsOpen(!isOpen)}>
        <div className="json-drawer-title">
          <span className="json-drawer-indicator">
            {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </span>
          <span>Live RecipeGraph JSON Preview</span>
          <span className="json-drawer-meta">({graph.components[0]?.steps.length || 0} steps)</span>
        </div>

        <div className="json-drawer-actions" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            className="json-drawer-copy-btn"
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="json-drawer-content">
          <pre className="json-drawer-code">{jsonString}</pre>
        </div>
      )}
    </div>
  );
}
