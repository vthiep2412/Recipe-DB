import { useState, useEffect } from 'preact/hooks';
import { X } from 'lucide-preact';
import type {
  StepMentionToken,
  CanvasStepNode,
  VesselSize,
  StudioWorkspace
} from '../../types/orchestration';
import {
  STANDARD_INGREDIENTS,
  STANDARD_COOKWARE,
  ALL_MEASUREMENT_UNITS,
  VESSEL_SIZES,
  parseTimeStringToSeconds,
  formatSecondsToDisplay
} from '../../constants/standardKitchenData';
import { UniversalDropdown, DropdownItem } from './UniversalDropdown';
import { CompactDropdown } from './CompactDropdown';
import { parseFraction } from '../../parser/cooklangParser';

interface NodeInspectorProps {
  activeStep: CanvasStepNode;
  activeMention: StepMentionToken | null;
  isYieldMode: boolean;
  workspace: StudioWorkspace;
  onClose: () => void;
  onUpdateMention: (mentionId: string, updatedData: Partial<StepMentionToken>) => void;
  onUpdateYield: (stepId: string, yieldData: { name: string; vesselId: string } | undefined) => void;
  onOpenCustomItemModal: (type: 'ingredient' | 'cookware') => void;
}

export function NodeInspector({
  activeStep,
  activeMention,
  isYieldMode,
  workspace,
  onClose,
  onUpdateMention,
  onUpdateYield,
  onOpenCustomItemModal
}: NodeInspectorProps) {
  // Yield state
  const [yieldName, setYieldName] = useState(activeStep.producesYield?.name || '');
  const [yieldVessel, setYieldVessel] = useState(activeStep.producesYield?.vesselId || 'bowl-a');

  // Amount input local string state to allow free backspacing and clearing
  const [amountInput, setAmountInput] = useState<string>(() =>
    activeMention?.data?.amount !== undefined ? String(activeMention.data.amount) : '1'
  );

  useEffect(() => {
    if (activeMention?.data?.amount !== undefined) {
      setAmountInput(String(activeMention.data.amount));
    }
  }, [activeMention?.id]);

  useEffect(() => {
    if (activeStep.producesYield) {
      setYieldName(activeStep.producesYield.name);
      setYieldVessel(activeStep.producesYield.vesselId);
    }
  }, [activeStep.producesYield]);

  // Collect previous yields created in steps before this one
  const previousYields: { stepId: string; stepTitle: string; name: string; vesselId: string }[] = [];
  // Collect declared ingredients from steps strictly before this one for backward re-mention
  const previousIngredientsMap = new Map<string, { name: string; sourceStepTitle: string; originalId: string }>();

  const currentStepIdx = workspace.canvasNodes.findIndex(n => n.id === activeStep.id);
  for (let i = 0; i < currentStepIdx; i++) {
    const prev = workspace.canvasNodes[i];
    if (prev.producesYield) {
      previousYields.push({
        stepId: prev.id,
        stepTitle: prev.title || `Step ${i + 1}`,
        name: prev.producesYield.name,
        vesselId: prev.producesYield.vesselId
      });
    }

    for (const m of prev.mentions) {
      if (m.type === 'ingredient' && !m.data?.isRemention && !m.data?.yieldId && !m.data?.ingredientId?.startsWith('yield-')) {
        const ingId = m.data?.ingredientId || m.displayText.toLowerCase();
        if (!previousIngredientsMap.has(ingId)) {
          previousIngredientsMap.set(ingId, {
            name: m.displayText,
            sourceStepTitle: prev.title || `Step ${i + 1}`,
            originalId: ingId
          });
        }
      }
    }
  }

  // Also collect ingredients declared in the current step BEFORE this active mention
  if (activeMention) {
    const currentStepMentions = activeStep.mentions || [];
    const activeMentionIdx = currentStepMentions.findIndex(m => m.id === activeMention.id);
    const mentionsBeforeCurrent = activeMentionIdx !== -1
      ? currentStepMentions.slice(0, activeMentionIdx)
      : currentStepMentions;

    for (const m of mentionsBeforeCurrent) {
      if (
        m.id !== activeMention.id &&
        m.type === 'ingredient' &&
        !m.data?.isRemention &&
        !m.data?.yieldId &&
        !m.data?.ingredientId?.startsWith('yield-')
      ) {
        const ingId = m.data?.ingredientId || m.displayText.toLowerCase();
        if (!previousIngredientsMap.has(ingId)) {
          previousIngredientsMap.set(ingId, {
            name: m.displayText,
            sourceStepTitle: 'Earlier in this step',
            originalId: ingId
          });
        }
      }
    }
  }

  // 1. Render Yield Mode
  if (isYieldMode) {
    const vesselOptions: DropdownItem[] = STANDARD_COOKWARE.map(c => ({
      id: c.id,
      label: c.name,
      group: 'Standard Vessels'
    }));

    const handleSaveYield = () => {
      const trimmed = yieldName.trim();
      if (!trimmed) {
        onUpdateYield(activeStep.id, undefined);
      } else {
        onUpdateYield(activeStep.id, { name: trimmed, vesselId: yieldVessel });
      }
      onClose();
    };

    return (
      <aside className="studio-inspector-card" aria-label="Step Yield Inspector">
        <div className="inspector-header">
          <span className="inspector-title">Intermediate Yield</span>
          <button type="button" className="inspector-close-btn" onClick={onClose} aria-label="Close inspector">
            <X size={16} />
          </button>
        </div>

        <div className="inspector-body">
          <div className="inspector-field">
            <label className="inspector-label">Yield Name (Result)</label>
            <input
              type="text"
              className="inspector-input"
              placeholder="e.g. Mascarpone Cream or Coffee Dip"
              value={yieldName}
              onInput={e => setYieldName((e.target as HTMLInputElement).value)}
            />
          </div>

          <div className="inspector-field">
            <label className="inspector-label">Holding Vessel</label>
            <UniversalDropdown
              items={vesselOptions}
              selectedId={yieldVessel}
              onSelect={id => setYieldVessel(id)}
              onAddNew={() => onOpenCustomItemModal('cookware')}
              addNewLabel="+ Add New Vessel"
            />
          </div>

          <button
            type="button"
            className="inspector-save-btn"
            onClick={handleSaveYield}
          >
            Save Yield
          </button>
        </div>
      </aside>
    );
  }

  if (!activeMention) return null;

  // 2. Render Ingredient Mention Mode
  if (activeMention.type === 'ingredient') {
    const dropdownItems: DropdownItem[] = [];

    // 0. Backward Re-mentions strictly from earlier steps and earlier in current step
    if (previousIngredientsMap.size > 0) {
      for (const [key, item] of previousIngredientsMap.entries()) {
        dropdownItems.push({
          id: `remention-${key}`,
          label: item.name,
          group: 'Re-mention (From earlier in recipe)',
          subtitle: `Declared in ${item.sourceStepTitle}`
        });
      }
    }

    // 1. Ingredients created in earlier steps (placed at top for immediate access)
    for (const y of previousYields) {
      dropdownItems.push({
        id: `yield-${y.stepId}`,
        label: y.name,
        group: 'Yields from earlier steps',
        subtitle: `From ${y.stepTitle} • In ${y.vesselId}`
      });
    }

    // 2. Workspace custom ingredients
    for (const custom of workspace.customIngredients) {
      dropdownItems.push({
        id: custom.id,
        label: custom.name,
        group: 'Custom Workspace Items'
      });
    }

    // 3. Standard ingredients
    for (const ing of STANDARD_INGREDIENTS) {
      dropdownItems.push({
        id: ing.id,
        label: ing.name,
        group: 'Standard Ingredients'
      });
    }

    const currentIngId = activeMention.data?.isRemention
      ? `remention-${activeMention.data?.ingredientId || activeMention.displayText.toLowerCase()}`
      : (activeMention.data?.ingredientId || activeMention.displayText.toLowerCase());
    const standardMatch = STANDARD_INGREDIENTS.find(i => i.id === currentIngId || i.name.toLowerCase() === currentIngId.toLowerCase())
    const availableUnits = standardMatch ? standardMatch.allowedUnits : ALL_MEASUREMENT_UNITS;

    return (
      <aside className="studio-inspector-card" aria-label="Ingredient Inspector">
        <div className="inspector-header">
          <span className="inspector-title">Ingredient Details</span>
          <button type="button" className="inspector-close-btn" onClick={onClose} aria-label="Close inspector">
            <X size={16} />
          </button>
        </div>

        <div className="inspector-body">
          <div className="inspector-field">
            <label className="inspector-label">Ingredient</label>
            <UniversalDropdown
              items={dropdownItems}
              selectedId={currentIngId}
              placeholder="Pick ingredient..."
              onSelect={id => {
                const picked = dropdownItems.find(item => item.id === id);
                if (picked) {
                  const isRemention = id.startsWith('remention-');
                  const yieldMatch = previousYields.find(y => `yield-${y.stepId}` === id);
                  const cleanName = yieldMatch ? yieldMatch.name : picked.label;
                  const isYieldItem = Boolean(yieldMatch);

                  const actualIngId = isRemention ? id.replace(/^remention-/, '') : id;

                  onUpdateMention(activeMention.id, {
                    displayText: cleanName,
                    data: {
                      ...activeMention.data,
                      ingredientId: actualIngId,
                      isRemention: isRemention ? true : undefined,
                      originalMentionId: isRemention ? actualIngId : undefined,
                      yieldId: yieldMatch ? yieldMatch.stepId : undefined,
                      yieldName: yieldMatch ? yieldMatch.name : undefined,
                      yieldStepTitle: yieldMatch ? yieldMatch.stepTitle : undefined,
                      amount: isRemention
                        ? undefined
                        : isYieldItem
                        ? (activeMention.data?.amount && activeMention.data.amount !== 1 ? activeMention.data.amount : 'all')
                        : (activeMention.data?.amount ?? 1),
                      unit: (isYieldItem || isRemention) ? undefined : (activeMention.data?.unit || 'g')
                    }
                  });
                }
              }}
                  onAddNew={() => onOpenCustomItemModal('ingredient')}
                  addNewLabel="+ Add Custom Ingredient"
                />
              </div>

              {!activeMention.data?.isRemention ? (
                <div className="inspector-field">
                  <label className="inspector-label">How much to use?</label>
                  {(() => {
                    const isYield = Boolean(
                      activeMention.data?.yieldId ||
                      (currentIngId && currentIngId.startsWith('yield-'))
                    );

                    const PORTION_PRESETS = [
                      { id: 'all', label: 'All' },
                      { id: 'half', label: 'Half' },
                      { id: '1/3', label: '1/3' },
                      { id: '1/4', label: '1/4' },
                      { id: 'custom', label: 'Custom' }
                    ];

                    let activePortion = 'custom';
                    const currentAmountStr = activeMention.data?.amount !== undefined ? String(activeMention.data.amount).toLowerCase().trim() : '';
                    if (currentAmountStr === 'all') {
                      activePortion = 'all';
                    } else if (currentAmountStr === 'half' || currentAmountStr === '1/2') {
                      activePortion = 'half';
                    } else if (currentAmountStr === '1/3') {
                      activePortion = '1/3';
                    } else if (currentAmountStr === '1/4') {
                      activePortion = '1/4';
                    } else {
                      activePortion = 'custom';
                    }

                    const isMetricUnit = activeMention.data?.unit === 'g' || activeMention.data?.unit === 'ml';

                    const handleAmountChange = (raw: string) => {
                      if (isMetricUnit) {
                        if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                          setAmountInput(raw);
                          const val = parseFloat(raw);
                          if (!isNaN(val) && val > 0) {
                            onUpdateMention(activeMention.id, {
                              data: { ...activeMention.data, amount: val }
                            });
                          }
                        }
                      } else {
                        if (raw === '' || /^[\d\s\.\/]*$/.test(raw)) {
                          setAmountInput(raw);
                          const parsed = parseFraction(raw);
                          if (parsed !== null && parsed > 0) {
                            onUpdateMention(activeMention.id, {
                              data: { ...activeMention.data, amount: raw }
                            });
                          }
                        }
                      }
                    };

                    const handleAmountBlur = () => {
                      const trimmed = amountInput.trim();
                      const parsed = parseFraction(trimmed);
                      if (parsed === null || parsed <= 0) {
                        setAmountInput('1');
                        onUpdateMention(activeMention.id, {
                          data: { ...activeMention.data, amount: 1 }
                        });
                      } else {
                        if (isMetricUnit) {
                          const num = parseFloat(trimmed);
                          const safeNum = isNaN(num) || num <= 0 ? 1 : num;
                          setAmountInput(String(safeNum));
                          onUpdateMention(activeMention.id, {
                            data: { ...activeMention.data, amount: safeNum }
                          });
                        } else {
                          setAmountInput(trimmed);
                          onUpdateMention(activeMention.id, {
                            data: { ...activeMention.data, amount: trimmed }
                          });
                        }
                      }
                    };

                    return (
                      <>
                        {isYield && (
                          <div className="inspector-portion-group">
                            {PORTION_PRESETS.map(preset => (
                              <button
                                key={preset.id}
                                type="button"
                                className={`inspector-portion-btn ${activePortion === preset.id ? 'is-active' : ''}`}
                                onClick={() => {
                                  if (preset.id === 'custom') {
                                    const parsedNum = parseFloat(String(activeMention.data?.amount));
                                    const safeAmt = !isNaN(parsedNum) && parsedNum > 0 ? parsedNum : 1;
                                    setAmountInput(String(safeAmt));
                                    onUpdateMention(activeMention.id, {
                                      data: {
                                        ...activeMention.data,
                                        amount: safeAmt,
                                        unit: activeMention.data?.unit || 'g'
                                      }
                                    });
                                  } else {
                                    onUpdateMention(activeMention.id, {
                                      data: {
                                        ...activeMention.data,
                                        amount: preset.id,
                                        unit: undefined
                                      }
                                    });
                                  }
                                }}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        )}

                        {(!isYield || activePortion === 'custom') && (
                          <div className="inspector-amount-row">
                            <input
                              type="text"
                              inputMode={isMetricUnit ? 'decimal' : 'text'}
                              className="inspector-amount-input"
                              placeholder={isMetricUnit ? 'Amount' : 'e.g. 2/3'}
                              value={amountInput}
                              onInput={e => handleAmountChange((e.target as HTMLInputElement).value)}
                              onBlur={handleAmountBlur}
                            />

                            <CompactDropdown
                              className="inspector-unit-compact-select"
                              value={activeMention.data?.unit || availableUnits[0]}
                              options={availableUnits}
                              onChange={newUnit => {
                                const targetIsMetric = newUnit === 'g' || newUnit === 'ml';
                                let updatedAmount = activeMention.data?.amount;
                                if (targetIsMetric && typeof updatedAmount === 'string' && updatedAmount.includes('/')) {
                                  const parsed = parseFraction(updatedAmount);
                                  if (parsed !== null && parsed > 0) {
                                    updatedAmount = Math.round(parsed * 100) / 100;
                                    setAmountInput(String(updatedAmount));
                                  }
                                }
                                onUpdateMention(activeMention.id, {
                                  data: { ...activeMention.data, unit: newUnit, amount: updatedAmount }
                                });
                              }}
                            />
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="inspector-field" style={{ opacity: 0.85, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>Re-mention of previously declared ingredient. Quantity is aggregated in shopping list.</span>
                </div>
              )}

          <div className="inspector-field">
            <div className="inspector-field-header">
              <label className="inspector-label">Note (optional)</label>
              <span className="inspector-char-count">
                {(activeMention.data?.creatorNote || '').length}/30
              </span>
            </div>
            <input
              type="text"
              maxLength={30}
              className="inspector-input"
              placeholder="e.g. room temperature, packed"
              value={activeMention.data?.creatorNote || ''}
              onInput={e => {
                const note = (e.target as HTMLInputElement).value.slice(0, 30);
                onUpdateMention(activeMention.id, {
                  data: {
                    ...activeMention.data,
                    creatorNote: note || undefined
                  }
                });
              }}
            />
          </div>
        </div>
      </aside>
    );
  }

  // 3. Render Cookware Mention Mode
  if (activeMention.type === 'cookware') {
    const dropdownItems: DropdownItem[] = [];
    for (const cw of STANDARD_COOKWARE) {
      dropdownItems.push({
        id: cw.id,
        label: cw.name,
        group: 'Standard Cookware'
      });
    }
    for (const custom of workspace.customCookware) {
      dropdownItems.push({
        id: custom.id,
        label: custom.name,
        group: 'Custom Workspace Cookware'
      });
    }

    const currentVesselId = activeMention.data?.vesselId || activeMention.displayText.toLowerCase();

    return (
      <aside className="studio-inspector-card" aria-label="Cookware Inspector">
        <div className="inspector-header">
          <span className="inspector-title">Cookware Details</span>
          <button type="button" className="inspector-close-btn" onClick={onClose} aria-label="Close inspector">
            <X size={16} />
          </button>
        </div>

        <div className="inspector-body">
          <div className="inspector-field">
            <label className="inspector-label">Cookware / Vessel</label>
            <UniversalDropdown
              items={dropdownItems}
              selectedId={currentVesselId}
              placeholder="Pick cookware..."
              onSelect={id => {
                const picked = dropdownItems.find(item => item.id === id);
                if (picked) {
                  onUpdateMention(activeMention.id, {
                    displayText: picked.label,
                    data: {
                      ...activeMention.data,
                      vesselId: id
                    }
                  });
                }
              }}
              onAddNew={() => onOpenCustomItemModal('cookware')}
              addNewLabel="+ Add Custom Cookware"
            />
          </div>

          <div className="inspector-field">
            <label className="inspector-label">How large?</label>
            <div className="inspector-size-grid">
              {VESSEL_SIZES.map(size => (
                <button
                  key={size}
                  type="button"
                  className={`inspector-size-chip ${
                    (activeMention.data?.vesselSize || 'Normal') === size ? 'is-active' : ''
                  }`}
                  onClick={() => {
                    onUpdateMention(activeMention.id, {
                      data: { ...activeMention.data, vesselSize: size as VesselSize }
                    });
                  }}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>
    );
  }

  // 4. Render Timer Mention Mode
  if (activeMention.type === 'timer') {
    const currentSeconds = activeMention.data?.timerSec || 60;

    return (
      <aside className="studio-inspector-card" aria-label="Timer Inspector">
        <div className="inspector-header">
          <span className="inspector-title">Timer Settings</span>
          <button type="button" className="inspector-close-btn" onClick={onClose} aria-label="Close inspector">
            <X size={16} />
          </button>
        </div>

        <div className="inspector-body">
          <div className="inspector-field">
            <label className="inspector-label">
              Duration: <strong>{formatSecondsToDisplay(currentSeconds)}</strong>
            </label>
            <input
              type="text"
              className="inspector-input"
              placeholder="e.g. 20m or 22m30s"
              defaultValue={activeMention.displayText}
              onBlur={e => {
                const raw = (e.target as HTMLInputElement).value.trim();
                if (raw) {
                  const sec = parseTimeStringToSeconds(raw);
                  if (sec > 0) {
                    onUpdateMention(activeMention.id, {
                      displayText: formatSecondsToDisplay(sec),
                      data: { ...activeMention.data, timerSec: sec }
                    });
                  }
                }
              }}
            />
          </div>

          <div className="inspector-field">
            <label className="inspector-label">Maker Note / Sensory Cue</label>
            <textarea
              className="inspector-textarea"
              placeholder="e.g. Watch closely after 18m, edges should be deep golden..."
              value={activeMention.data?.creatorNote || ''}
              onInput={e => {
                const val = (e.target as HTMLTextAreaElement).value;
                onUpdateMention(activeMention.id, {
                  data: {
                    ...activeMention.data,
                    creatorNote: val,
                    donenessDescription: val
                  }
                });
              }}
              rows={3}
            />
          </div>
        </div>
      </aside>
    );
  }

  return null;
}
