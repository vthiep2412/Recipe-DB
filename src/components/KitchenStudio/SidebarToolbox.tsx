import { Plus, Trash2, Minus, RotateCcw, FolderTree } from 'lucide-preact';
import type { CanvasStepNode, CanvasSection } from '../../types/orchestration';

interface SidebarToolboxProps {
  selectedNodeId: string;
  selectedStep: CanvasStepNode | null;
  selectedSection: CanvasSection | null;
  zoom: number;
  onAddSectionNode: () => void;
  onAddSubsectionNode: () => void;
  onChangeParentSection?: () => void;
  onAddStepNode: () => void;
  onDeleteSelectedNode: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export function SidebarToolbox({
  selectedNodeId: _selectedNodeId,
  selectedStep,
  selectedSection,
  zoom,
  onAddSectionNode,
  onAddSubsectionNode,
  onChangeParentSection,
  onAddStepNode,
  onDeleteSelectedNode,
  onZoomIn,
  onZoomOut,
  onResetZoom
}: SidebarToolboxProps) {
  return (
    <aside className="studio-sidebar-toolbox" aria-label="Canvas Properties and Actions">
      <div className="toolbox-section">
        <div className="toolbox-title">Selection</div>
        <div className="toolbox-item-info">
          {selectedSection ? (
            <div className="toolbox-badge toolbox-badge-root">
              {selectedSection.parentSectionId ? 'Subsection: ' : 'Section: '}
              {selectedSection.name || 'Untitled'}
            </div>
          ) : selectedStep ? (
            <div className="toolbox-badge toolbox-badge-step">
              {selectedStep.title || 'Step Node'}
            </div>
          ) : (
            <div className="toolbox-empty-hint">No node selected</div>
          )}
        </div>
      </div>

      <div className="toolbox-section">
        <div className="toolbox-title">Node Actions</div>
        <button
          type="button"
          className="toolbox-action-btn toolbox-btn-primary"
          style={{ backgroundColor: '#ff5500', color: '#ffffff', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
          onClick={onAddSectionNode}
          title="Add a new section column"
        >
          <Plus size={14} />
          <span>Add Section Node</span>
        </button>

        {selectedSection && (
          <button
            type="button"
            className={`toolbox-action-btn toolbox-btn-secondary ${selectedSection.parentSectionId ? 'is-disabled' : ''}`}
            disabled={Boolean(selectedSection.parentSectionId)}
            onClick={selectedSection.parentSectionId ? undefined : onAddSubsectionNode}
            title={
              selectedSection.parentSectionId
                ? 'Subsections cannot add child subsections (strict depth 1)'
                : 'Add a subsection under active section'
            }
          >
            <Plus size={14} />
            <span>Add Subsection</span>
          </button>
        )}

        {selectedSection && onChangeParentSection && (
          <button
            type="button"
            className="toolbox-action-btn toolbox-btn-secondary"
            onClick={onChangeParentSection}
            title={
              selectedSection.parentSectionId
                ? 'Change parent section or promote to root section'
                : 'Nest this root section under another section'
            }
          >
            <FolderTree size={14} />
            <span>Change Parent Section</span>
          </button>
        )}

        <button
          type="button"
          className="toolbox-action-btn toolbox-btn-primary"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
          onClick={onAddStepNode}
          title="Add a new step node connected under current selection"
        >
          <Plus size={14} />
          <span>Add Step Node</span>
        </button>

        {(selectedStep || selectedSection) && (
          <button
            type="button"
            className="toolbox-action-btn toolbox-btn-danger"
            style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
            onClick={onDeleteSelectedNode}
            title="Delete this selected node"
          >
            <Trash2 size={14} />
            <span>Delete {selectedSection ? 'Section' : 'Step'}</span>
          </button>
        )}
      </div>

      <div className="toolbox-section">
        <div className="toolbox-title">Canvas Navigation</div>
        <div className="toolbox-zoom-row">
          <button
            type="button"
            className="toolbox-zoom-btn"
            onClick={onZoomOut}
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <Minus size={14} />
          </button>
          <span className="toolbox-zoom-text">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="toolbox-zoom-btn"
            onClick={onZoomIn}
            title="Zoom In"
            aria-label="Zoom In"
          >
            <Plus size={14} />
          </button>
        </div>
        <button
          type="button"
          className="toolbox-action-btn toolbox-btn-subtle"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
          onClick={onResetZoom}
        >
          <RotateCcw size={14} />
          <span>Reset View</span>
        </button>
      </div>
    </aside>
  );
}
