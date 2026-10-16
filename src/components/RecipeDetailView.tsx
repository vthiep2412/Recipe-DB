import { useState, useEffect, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import {
  ChefHat,
  Link as LinkIcon,
  Minus,
  Plus,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  CookingPot,
  AlertTriangle,
  Play
} from 'lucide-preact';
import { marked } from 'marked';
import type { RecipeJSON, RecipeStep, StepToken } from '../types/recipe';
import type { ActiveTimer } from '../types/timer';
import { formatFraction, parseFraction } from '../parser/cooklangParser';
import { startAlarmLoop, stopAlarmLoop, isRinging } from '../services/timerAudio';
import { RecipeTimerDrawer } from './Timer/RecipeTimerDrawer';
import { TimerAlarmModal } from './Timer/TimerAlarmModal';
import { WindowsTimePickerModal } from './Timer/WindowsTimePickerModal';

function sanitizeMarkdown(raw?: string): string {
  if (!raw) return '';
  const escaped = raw.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return marked.parse(escaped, { async: false }) as string;
}

export function parseDurationToSeconds(text: string): number {
  if (!text) return 300;
  const clean = text.trim().toLowerCase();

  const rangeMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*([a-z]+)?/);
  if (rangeMatch) {
    const val = parseFloat(rangeMatch[2]);
    const unit = rangeMatch[3] || clean.match(/[a-z]+/)?.[0] || 'min';
    return convertUnitToSeconds(val, unit);
  }

  const fractionMatch = clean.match(/(?:(\d+)\s+)?(\d+)\/(\d+)\s*([a-z]+)/);
  if (fractionMatch) {
    const whole = fractionMatch[1] ? parseFloat(fractionMatch[1]) : 0;
    const num = parseFloat(fractionMatch[2]);
    const den = parseFloat(fractionMatch[3]);
    const val = whole + (num / den);
    const unit = fractionMatch[4];
    return convertUnitToSeconds(val, unit);
  }

  const singleMatch = clean.match(/(\d+(?:\.\d+)?)\s*([a-z]+)?/);
  if (singleMatch) {
    const val = parseFloat(singleMatch[1]);
    const unit = singleMatch[2] || 'min';
    return convertUnitToSeconds(val, unit);
  }

  return 300;
}

function convertUnitToSeconds(val: number, unitStr: string): number {
  const u = unitStr.toLowerCase();
  if (u.startsWith('h')) {
    return Math.round(val * 3600);
  }
  if (u.startsWith('s')) {
    return Math.round(val);
  }
  return Math.round(val * 60);
}

function extractDonenessCue(stepText: string, fallbackLabel: string): string {
  const match = stepText.match(/until\s+([^,.;\n]+(?:,[^,.;\n]+)?)/i);
  if (match && match[1]) {
    return `Until ${match[1].trim()}`;
  }
  return fallbackLabel;
}

function formatClipTime(startSec: number, endSec?: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${pad(secs)}`;
  };
  if (typeof endSec === 'number' && endSec > startSec) {
    return `${fmt(startSec)} - ${fmt(endSec)}`;
  }
  return fmt(startSec);
}

interface Props {
  recipe: RecipeJSON;
  onStartTimer?: (timer: { id?: string; label: string; minSec: number; creatorNote?: string }) => void;
}

interface RecipeViewState {
  activeMode?: 'prepare' | 'cooking';
  prepChecks?: string[];
  cookChecks?: string[];
  sectionFocus?: Record<string, number>;
  activeSectionId?: string;
}

export function RecipeDetailView({ recipe, onStartTimer }: Props) {
  const loadInitialState = (): RecipeViewState => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(`recipe_view_${recipe.id || 'default'}`);
      if (raw) {
        return JSON.parse(raw);
      }
      const legacyPrep = localStorage.getItem(`recipe_prep_${recipe.id || 'default'}`);
      if (legacyPrep) {
        const parsedLegacy = JSON.parse(legacyPrep);
        if (Array.isArray(parsedLegacy)) {
          return {
            prepChecks: parsedLegacy.map(item => {
              if (item.startsWith('ing-')) return `prep:ing:${item.slice(4)}`;
              if (item.startsWith('cw-')) return `prep:cw:${item.slice(3)}`;
              return item;
            })
          };
        }
      }
    } catch {
      // Fallback on storage read error
    }
    return {};
  };

  const isMobileScreen = typeof window !== 'undefined' ? window.innerWidth < 768 : false;
  const [savedState] = useState<RecipeViewState>(loadInitialState);
  const [servings, setServings] = useState(recipe.servings.base || 1);
  const [sidebarMode, setSidebarMode] = useState<'prepare' | 'cooking'>(
    isMobileScreen ? 'prepare' : (savedState.activeMode || 'prepare')
  );
  const [animateMode, setAnimateMode] = useState(false);
  const [checkedPrepItems, setCheckedPrepItems] = useState<Set<string>>(() => new Set(savedState.prepChecks || []));
  const [checkedCookingItems, setCheckedCookingItems] = useState<Set<string>>(() => new Set(savedState.cookChecks || []));
  const [sectionActiveSteps, setSectionActiveSteps] = useState<Record<string, number>>(savedState.sectionFocus || {});
  const [activeSectionId, setActiveSectionId] = useState<string>(savedState.activeSectionId || '');
  const [isMediaExpanded, setIsMediaExpanded] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [highlightedStepIndex, setHighlightedStepIndex] = useState<number | null>(null);
  const [deletedNoticeYieldId, setDeletedNoticeYieldId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string>(recipe.image || '');

  useEffect(() => {
    if (recipe.image) {
      setLightboxImage(recipe.image);
    }
  }, [recipe.image]);

  const handlePlayVideoClip = (startSec: number, _endSec?: number, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    setIsMediaExpanded(true);
    if (videoRef.current) {
      videoRef.current.currentTime = startSec;
      videoRef.current.play().catch(() => {});
      const videoEl = videoRef.current;
      videoEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const toSave: RecipeViewState = {
        activeMode: sidebarMode,
        prepChecks: Array.from(checkedPrepItems),
        cookChecks: Array.from(checkedCookingItems),
        sectionFocus: sectionActiveSteps,
        activeSectionId: activeSectionId
      };
      localStorage.setItem(`recipe_view_${recipe.id || 'default'}`, JSON.stringify(toSave));
    } catch {
      // Fallback on storage write error
    }
  }, [recipe.id, sidebarMode, checkedPrepItems, checkedCookingItems, sectionActiveSteps, activeSectionId]);

  const [timers, setTimers] = useState<ActiveTimer[]>([]);
  const [pendingPills, setPendingPills] = useState<Record<string, string>>({});
  const [animSpeed, setAnimSpeed] = useState<number>(() => {
    if (typeof window === 'undefined') return 1;
    const saved = localStorage.getItem('timer_anim_speed');
    return saved ? parseFloat(saved) || 1 : 1;
  });
  const [isDevToolOpen, setIsDevToolOpen] = useState(false);
  const [isDevToolEnabled, setIsDevToolEnabled] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsDevToolEnabled(localStorage.getItem('recipedevtool') === 'true');
    }
  }, []);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingTimer, setEditingTimer] = useState<ActiveTimer | null>(null);

  const formatTimerDigits = (totalSec: number) => {
    const safe = Math.max(0, Math.floor(totalSec));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (h > 0) {
      return `${h}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  };

  useEffect(() => {
    const hasRunning = timers.some(t => !t.isPaused && !t.isFinished && t.remainingSeconds > 0);
    if (!hasRunning) return;

    const tick = () => {
      const now = Date.now();
      setTimers(prev => {
        let triggerAlarm = false;
        const next = prev.map(t => {
          if (t.isPaused || t.isFinished) return t;
          const endsAt = t.endsAt || (now + t.remainingSeconds * 1000);
          const nextSec = Math.max(0, Math.ceil((endsAt - now) / 1000));
          if (nextSec <= 0) {
            triggerAlarm = true;
            return { ...t, remainingSeconds: 0, isFinished: true, endsAt: undefined };
          }
          return { ...t, remainingSeconds: nextSec, endsAt };
        });

        if (triggerAlarm) {
          startAlarmLoop();
        }
        return next;
      });
    };

    const interval = setInterval(tick, 500);

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        tick();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [timers]);

  const finishedTimers = timers.filter(t => t.isFinished);

  useEffect(() => {
    if (finishedTimers.length === 0 && isRinging()) {
      stopAlarmLoop();
    }
  }, [finishedTimers.length]);

  const handleStartTimer = (config: {
    id?: string;
    label: string;
    seconds: number;
    stepTitle?: string;
    creatorCue?: string;
    originRect?: { left: number; top: number; width: number; height: number };
  }) => {
    if (config.id && timers.some(t => t.id === config.id && !t.isFinished)) {
      return;
    }

    setIsDrawerOpen(true);

    if (onStartTimer) {
      onStartTimer({
        id: config.id,
        label: config.label,
        minSec: config.seconds,
        creatorNote: config.creatorCue
      });
    }

    const now = Date.now();
    const duration = Math.max(1, config.seconds);

    setTimers(prev => {
      if (prev.length >= 9) {
        return prev;
      }

      const newTimer: ActiveTimer = {
        id: config.id || `timer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: config.label,
        stepTitle: config.stepTitle,
        creatorCue: config.creatorCue || config.label,
        totalSeconds: duration,
        remainingSeconds: duration,
        isPaused: false,
        isFinished: false,
        endsAt: now + duration * 1000,
        originRect: config.originRect
      };

      return [...prev, newTimer];
    });
  };

  const handleStopTimer = (timerId: string) => {
    setTimers(prev => prev.filter(t => t.id !== timerId));
    const remainingFinished = finishedTimers.filter(t => t.id !== timerId);
    if (remainingFinished.length === 0) {
      stopAlarmLoop();
    }
  };

  const handleSilenceAll = () => {
    stopAlarmLoop();
    setTimers(prev => prev.filter(t => !t.isFinished));
  };

  const handleDismissAllAlarms = () => {
    stopAlarmLoop();
    setTimers(prev => prev.filter(t => !t.isFinished));
  };

  const handleTogglePause = (timerId: string) => {
    const now = Date.now();
    setTimers(prev =>
      prev.map(t => {
        if (t.id !== timerId || t.isFinished) return t;
        if (t.isPaused) {
          return {
            ...t,
            isPaused: false,
            endsAt: now + t.remainingSeconds * 1000
          };
        } else {
          const remaining = t.endsAt ? Math.max(0, Math.ceil((t.endsAt - now) / 1000)) : t.remainingSeconds;
          return {
            ...t,
            isPaused: true,
            remainingSeconds: remaining,
            endsAt: undefined
          };
        }
      })
    );
  };

  const handleDismissTimer = (timerId: string) => {
    setTimers(prev => prev.filter(t => t.id !== timerId));
  };

  const handleOpenTimePicker = (timer: ActiveTimer) => {
    setEditingTimer(timer);
  };

  const handleSaveTimePicker = (newSeconds: number) => {
    if (!editingTimer) return;
    const targetId = editingTimer.id;
    const now = Date.now();
    setTimers(prev =>
      prev.map(t => {
        if (t.id === targetId) {
          return {
            ...t,
            totalSeconds: newSeconds,
            remainingSeconds: newSeconds,
            isFinished: false,
            isPaused: false,
            endsAt: now + newSeconds * 1000
          };
        }
        return t;
      })
    );
    setEditingTimer(null);
    const otherFinished = finishedTimers.filter(t => t.id !== targetId);
    if (otherFinished.length === 0) {
      stopAlarmLoop();
    }
  };

  // Screen Wake Lock automatically requested on mount
  useEffect(() => {
    let wakeLockSentinel: any = null;
    const requestLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        }
      } catch {
        // Fallback if unsupported or denied
      }
    };
    requestLock();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
      }
    };
  }, []);

  const findYieldOrigin = (yieldId: string) => {
    for (const section of recipe.sections) {
      for (const step of section.steps) {
        if (
          (step.producesYield && step.producesYield.id === yieldId) ||
          (step.id && (step.id === yieldId || `yield-${step.id}` === yieldId))
        ) {
          return { stepIndex: step.index, sectionName: section.name };
        }
      }
      if (section.subsections) {
        for (const sub of section.subsections) {
          for (const step of sub.steps) {
            if (
              (step.producesYield && step.producesYield.id === yieldId) ||
              (step.id && (step.id === yieldId || `yield-${step.id}` === yieldId))
            ) {
              return { stepIndex: step.index, sectionName: sub.name };
            }
          }
        }
      }
    }
    return null;
  };

  const handleYieldBadgeClick = (yieldId: string, e: MouseEvent) => {
    e.stopPropagation();
    const origin = findYieldOrigin(yieldId);
    if (origin) {
      setActiveSectionId(origin.sectionName);
      setSectionActiveSteps(prev => ({ ...prev, [origin.sectionName]: origin.stepIndex }));
      const el = document.getElementById(`step-node-${origin.stepIndex}`);
      if (el) {
        const container = (el.closest('.app-main') as HTMLElement) || (document.querySelector('.app-main') as HTMLElement | null);
        const triggerHighlight = () => {
          setTimeout(() => {
            setHighlightedStepIndex(origin.stepIndex);
            setTimeout(() => setHighlightedStepIndex(null), 2200);
          }, 60);
        };

        if (container) {
          const containerRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const offset = elRect.top - containerRect.top;
          const targetScrollTop = Math.max(0, container.scrollTop + offset - (container.clientHeight / 2) + (elRect.height / 2));
          smoothScrollToTarget(container, targetScrollTop, 550, triggerHighlight);
        } else {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(triggerHighlight, 450);
        }
      }
    } else {
      setDeletedNoticeYieldId(yieldId);
      setTimeout(() => setDeletedNoticeYieldId(null), 3000);
    }
  };

  const smoothScrollToTarget = (container: HTMLElement, targetY: number, duration = 650, onComplete?: () => void) => {
    const startY = container.scrollTop;
    const diff = targetY - startY;
    if (Math.abs(diff) < 2) {
      if (onComplete) onComplete();
      return;
    }
    const startTime = performance.now();

    const stepAnimation = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeInOutCubic easing function for graceful, slower glide
      const ease = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      container.scrollTop = startY + diff * ease;

      if (progress < 1) {
        requestAnimationFrame(stepAnimation);
      } else {
        if (onComplete) onComplete();
      }
    };

    requestAnimationFrame(stepAnimation);
  };

  const handleStepClick = (secName: string, stepIndex: number) => {
    const isCurrentlyActiveInSec = (sectionActiveSteps[secName] ?? -1) === stepIndex;

    if (isCurrentlyActiveInSec) {
      // Unfocusing this section: pause/remove active focus without scrolling
      setActiveSectionId('');
      setSectionActiveSteps(prev => ({ ...prev, [secName]: -1 }));
      return;
    }

    setActiveSectionId(secName || '');
    setSectionActiveSteps(prev => ({ ...prev, [secName]: stepIndex }));

    // On mobile or narrow viewports, do not auto-scroll the sidebar
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return;
    }

    // Only scroll to valid, existing steps in the sidebar; ignore if missing
    const stepEl = document.getElementById(`sidebar-step-${stepIndex}`);
    if (!stepEl) {
      return;
    }

    const container = (stepEl.closest('.cook-aside') as HTMLElement) || document.getElementById('cook-ingredients');
    if (container && container.scrollHeight > container.clientHeight) {
      const containerRect = container.getBoundingClientRect();
      const elRect = stepEl.getBoundingClientRect();

      // Check if step is already in sight and close to middle (between 18% and 78% of container)
      const relativeTop = elRect.top - containerRect.top;
      const relativeBottom = elRect.bottom - containerRect.top;
      const isInMiddleView = relativeTop >= containerRect.height * 0.18 && relativeBottom <= containerRect.height * 0.78;

      if (isInMiddleView) {
        // Step is already comfortably visible in the middle band: do not scroll, let in-place animation play
        return;
      }

      const offset = elRect.top - containerRect.top;
      const targetScrollTop = Math.max(0, container.scrollTop + offset - (container.clientHeight * 0.32));
      smoothScrollToTarget(container, targetScrollTop, 680);
    }
  };


  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLightboxOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen]);

  const baseServings = recipe.servings.base || 1;
  const scaleRatio = servings / baseServings;

  const togglePrepItem = (itemKey: string) => {
    setCheckedPrepItems(prev => {
      const next = new Set(prev);
      if (next.has(itemKey)) next.delete(itemKey);
      else next.add(itemKey);
      return next;
    });
  };

  const clearAllPrepItems = () => {
    setCheckedPrepItems(new Set());
  };

  const toggleCookingItem = (itemKey: string) => {
    setCheckedCookingItems(prev => {
      const next = new Set(prev);
      if (next.has(itemKey)) next.delete(itemKey);
      else next.add(itemKey);
      return next;
    });
  };

  const scaleQuantity = (baseVal: number | null, unit: string | null) => {
    if (baseVal === null) return '';
    let val = baseVal * scaleRatio;
    let u = unit || '';

    if (u === 'g' && val >= 1000) {
      val = Math.round((val / 1000) * 100) / 100;
      u = 'kg';
    } else if (u === 'ml' && val >= 1000) {
      val = Math.round((val / 1000) * 100) / 100;
      u = 'l';
    } else if (u === 'oz' && val >= 16) {
      val = Math.round((val / 16) * 100) / 100;
      u = 'lb';
    }

    const formatted = formatFraction(val);
    return u ? `${formatted} ${u}` : formatted;
  };

  const scaleTokenQty = (qtyText?: string) => {
    if (!qtyText) return '';
    if (scaleRatio === 1) return qtyText;

    const fullNum = parseFraction(qtyText);
    if (fullNum !== null) {
      return formatFraction(fullNum * scaleRatio);
    }

    const match = qtyText.trim().match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(\.\d+)?)\s*(.*)$/);
    if (match) {
      const numPart = match[1];
      const unitPart = match[3];
      const num = parseFraction(numPart);
      if (num !== null) {
        const scaled = num * scaleRatio;
        const formatted = formatFraction(scaled);
        return unitPart ? `${formatted} ${unitPart}` : formatted;
      }
    }

    return qtyText;
  };

  const listableIngredients = recipe.ingredients.filter(ing => !ing.isHidden);

  const cookwareNames = new Set<string>();
  recipe.sections.forEach(sec => {
    sec.steps.forEach(step => {
      step.tokens.forEach(tok => {
        if (tok.type === 'cookware') cookwareNames.add(tok.name);
      });
    });
    sec.subsections?.forEach(sub => {
      sub.steps.forEach(step => {
        step.tokens.forEach(tok => {
          if (tok.type === 'cookware') cookwareNames.add(tok.name);
        });
      });
    });
  });

  const stepNumberMap = new Map<number, number>();
  let currentCountedNumber = 0;
  recipe.sections.forEach(sec => {
    sec.steps.forEach(st => {
      if (st.isCountedStep !== false) {
        currentCountedNumber++;
        stepNumberMap.set(st.index, currentCountedNumber);
      }
    });
    sec.subsections?.forEach(sub => {
      sub.steps.forEach(st => {
        if (st.isCountedStep !== false) {
          currentCountedNumber++;
          stepNumberMap.set(st.index, currentCountedNumber);
        }
      });
    });
  });

  const breakdownTimes = [
    { label: 'Prep Time', value: recipe.times.prep },
    { label: 'Bake Time', value: recipe.times.bake },
    { label: 'Cook Time', value: recipe.times.cook },
    { label: 'Rest Time', value: recipe.times.rest },
  ].filter(t => Boolean(t.value));

  const totalTime = recipe.times.total || recipe.times.cook || '—';
  const difficulty = recipe.difficulty || 'Medium';
  const diffLower = difficulty.toLowerCase();
  const diffClass = diffLower.includes('easy')
    ? 'diff-easy'
    : diffLower.includes('hard')
    ? 'diff-hard'
    : 'diff-medium';

  const renderSidebarStepItem = (step: RecipeStep, secName: string) => {
    const stepCookware = step.tokens.filter(
      (t): t is Extract<StepToken, { type: 'cookware' }> => t.type === 'cookware'
    );
    const stepIngs = step.tokens.filter(
      (t): t is Extract<StepToken, { type: 'ingredient' }> =>
        t.type === 'ingredient' && !t.isHidden
    );
    const stepYields = step.tokens.filter(
      (t): t is Extract<StepToken, { type: 'yield' }> =>
        t.type === 'yield'
    );
    const hasCookware = stepCookware.length > 0;
    const hasIngredientsOrYields = stepIngs.length > 0 || stepYields.length > 0 || Boolean(step.producesYield);
    const isSecActive = activeSectionId === secName;
    const rememberedStepInSec = sectionActiveSteps[secName] ?? -1;
    const isStepActive = isSecActive && rememberedStepInSec === step.index;
    const isStepDimmed = rememberedStepInSec !== -1 && step.index < rememberedStepInSec;
    const isCounted = step.isCountedStep !== false;
    const countedNum = stepNumberMap.get(step.index) || step.index;
    const stepLabel = !isCounted ? (step.title || 'Note') : `Step ${countedNum}${step.title ? `: ${step.title}` : ''}`;

    return (
      <div
        key={`step-ing-subgroup-${step.index}`}
        id={`sidebar-step-${step.index}`}
        className={`cook-step-ing-subgroup ${isStepActive ? 'is-active-step' : ''} ${isStepDimmed ? 'is-dimmed-step' : ''}`}
      >
        <div className={`cook-step-subgroup-title ${isStepActive ? 'is-active' : ''}`}>
          <span className="cook-step-title-base">
            {stepLabel}
          </span>
          <span className="cook-step-title-pill" aria-hidden="true">
            <span className="cook-step-title-text">
              {stepLabel}
            </span>
          </span>
        </div>

        <div className="cook-step-spine-body">
          {hasCookware && (
            <>
              {hasIngredientsOrYields && (
                <div className="cook-step-divider-line">
                  <span>Cookware</span>
                </div>
              )}
              <ul className="cook-ing-list">
                {stepCookware.map((tok, idx) => {
                  const checkKey = `cook:step:${step.index}:cw:${tok.name.toLowerCase()}`;
                  const isDone = checkedCookingItems.has(checkKey);
                  return (
                    <li
                      key={`step-cw-${step.index}-${idx}-${tok.name}`}
                      className={`cook-ing ${isDone ? 'done' : ''}`}
                      onClick={() => toggleCookingItem(checkKey)}
                    >
                      <div className="cook-ing-box">
                        {isDone && <Check size={11} strokeWidth={3.5} />}
                      </div>
                      <span className="cook-ing-name">{tok.name}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {hasCookware && hasIngredientsOrYields && (
            <div className="cook-step-divider-line">
              <span>Ingredients</span>
            </div>
          )}

          {hasIngredientsOrYields && (
            <ul className="cook-ing-list">
              {stepIngs.map((tok, idx) => {
                const checkKey = `cook:step:${step.index}:${tok.name.toLowerCase()}`;
                const isDone = checkedCookingItems.has(checkKey);
                const matchedIng = recipe.ingredients.find(
                  i => i.name.toLowerCase() === tok.name.toLowerCase()
                );
                const displayQty = tok.quantityText
                  ? scaleTokenQty(tok.quantityText)
                  : matchedIng && matchedIng.quantityValue !== null
                  ? scaleQuantity(matchedIng.quantityValue, matchedIng.unit)
                  : '';

                return (
                  <li
                    key={`${step.index}-${idx}-${tok.name}`}
                    className={`cook-ing ${isDone ? 'done' : ''}`}
                    onClick={() => toggleCookingItem(checkKey)}
                  >
                    <div className="cook-ing-box">
                      {isDone && <Check size={11} strokeWidth={3.5} />}
                    </div>
                    <span className="cook-ing-name">
                      {tok.name}
                      {tok.note && (
                        <span style={{ color: 'var(--text-muted)' }}> ({tok.note})</span>
                      )}
                    </span>
                    {displayQty && <span className="cook-ing-qty">{displayQty}</span>}
                  </li>
                );
              })}

              {stepYields.map((yTok, yIdx) => {
                const checkKey = `cook:step:${step.index}:yield:${yTok.yieldId}`;
                const isDone = checkedCookingItems.has(checkKey);
                const yOrigin = findYieldOrigin(yTok.yieldId);

                return (
                  <li
                    key={`step-yield-${step.index}-${yIdx}`}
                    className={`cook-ing ${isDone ? 'done' : ''}`}
                    onClick={() => toggleCookingItem(checkKey)}
                  >
                    <div className="cook-ing-box">
                      {isDone && <Check size={11} strokeWidth={3.5} />}
                    </div>
                    <span className="cook-ing-name">
                      {yTok.displayText}
                      {yTok.partition && (
                        <span className="cook-yield-partition-badge"> ({yTok.partition})</span>
                      )}
                      {yOrigin ? (
                        <button
                          type="button"
                          className="cook-yield-provenance-tag"
                          title={`View origin step ${yOrigin.stepIndex}`}
                          onClick={(e) => handleYieldBadgeClick(yTok.yieldId, e)}
                        >
                          (From step {yOrigin.stepIndex}, <span className="yield-section-chip">{yOrigin.sectionName}</span>)
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="cook-yield-provenance-tag"
                          onClick={(e) => handleYieldBadgeClick(yTok.yieldId, e)}
                        >
                          (Deleted Step)
                        </button>
                      )}
                      {deletedNoticeYieldId === yTok.yieldId && (
                        <span className="cook-deleted-yield-notice">Origin step deleted</span>
                      )}
                    </span>
                  </li>
                );
              })}

              {step.producesYield && (
                <li className="cook-ing cook-yield-produced-item">
                  <div className="cook-yield-produced-badge">
                    <CookingPot size={13} />
                    <span>Yield:</span>
                    <span className="cook-yield-produced-name">{step.producesYield.name}</span>
                  </div>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    );
  };

  const renderStepCard = (step: RecipeStep, secName: string) => {
    const isSecActive = activeSectionId === secName;
    const rememberedStepInSec = sectionActiveSteps[secName] ?? -1;
    const isStepSelected = rememberedStepInSec === step.index;

    let stepStatusClass = '';
    if (rememberedStepInSec !== -1) {
      if (isStepSelected) {
        stepStatusClass = isSecActive ? 'is-section-active' : 'is-remembered-step';
      } else if (step.index < rememberedStepInSec) {
        stepStatusClass = 'is-section-dimmed';
      }
    }

    const isCur = isSecActive && isStepSelected;
    const isHighlighted = highlightedStepIndex === step.index;
    const isCounted = step.isCountedStep !== false;
    const countedNum = stepNumberMap.get(step.index) || step.index;
    const isLinked = Boolean(step.isLinkedToPrevious);

    return (
      <div
        key={step.index}
        id={`step-node-${step.index}`}
        className={`cook-step ${stepStatusClass} ${isCur ? 'cur' : ''} ${isHighlighted ? 'yield-pulse-highlight' : ''} ${!isCounted ? 'cook-step-note-callout' : ''} ${isLinked ? 'is-linked-step' : ''}`}
        onClick={() => handleStepClick(secName, step.index)}
      >
        {isLinked && (
          <div className="cook-step-link-rail" title="Linked to previous step">
            <LinkIcon size={12} />
          </div>
        )}

        <span className={`cook-step-n ${!isCounted ? 'cook-step-note-tag' : ''}`}>
          {!isCounted ? (
            <span className="cook-step-note-badge">
              <AlertTriangle size={12} />
              <span>Note</span>
            </span>
          ) : (
            `${countedNum}.`
          )}
        </span>

        <div className="cook-step-bodywrap">
          {step.title && (
            <div className="cook-step-title">{step.title}</div>
          )}

          <div className="cook-step-text">
            {step.tokens.map((token, idx) => {
              if (token.type === 'text') {
                return <span key={idx}>{token.value}</span>;
              }
              if (token.type === 'ingredient') {
                return (
                  <span key={idx} className="cook-ig">
                    <span className="cook-ig-name">{token.name}</span>
                    {token.quantityText && (
                      <span className="cook-amt">{scaleTokenQty(token.quantityText)}</span>
                    )}
                    {token.note && (
                      <span className="cook-ig-note">{token.note}</span>
                    )}
                  </span>
                );
              }
              if (token.type === 'cookware') {
                return (
                  <span key={idx} className="cook-cw">
                    {token.name}
                  </span>
                );
              }
              if (token.type === 'yield') {
                const origin = findYieldOrigin(token.yieldId);
                return (
                  <span key={idx} className="cook-yield-wrapper">
                    <button
                      type="button"
                      className="cook-yield-badge"
                      title={origin ? `View step ${origin.stepIndex} where this yield was made` : 'Yield origin step'}
                      onClick={(e) => handleYieldBadgeClick(token.yieldId, e)}
                    >
                      <span className="cook-yield-badge-name">
                        <CookingPot size={13} />
                        <span>{token.displayText}</span>
                      </span>
                      {token.partition && (
                        <span className="cook-yield-badge-amt">{token.partition}</span>
                      )}
                      {!origin && (
                        <span style={{ opacity: 0.75, fontStyle: 'italic', paddingRight: '0.35rem' }}>
                          (Deleted Step)
                        </span>
                      )}
                    </button>
                    {deletedNoticeYieldId === token.yieldId && (
                      <span className="cook-deleted-yield-notice">Origin step deleted</span>
                    )}
                  </span>
                );
              }
              if (token.type === 'timer') {
                const timerId = token.timerId || `step-${step.index}-${idx}`;
                const activeTimer = timers.find(t => t.id === timerId && !t.isFinished);
                const isTimerActive = Boolean(activeTimer || pendingPills[timerId]);
                const pillText = activeTimer
                  ? formatTimerDigits(activeTimer.remainingSeconds)
                  : pendingPills[timerId] || token.durationText;

                return (
                  <span key={idx} className="cook-timer">
                    <button
                      type="button"
                      className={`cook-timer-btn ${isTimerActive ? 'active' : ''}`}
                      onClick={e => {
                        e.stopPropagation();
                        if (isTimerActive) return;
                        const btn = e.currentTarget as HTMLElement;
                        const rect = btn.getBoundingClientRect();
                        btn.style.minWidth = `${rect.width}px`;

                        const sec = parseDurationToSeconds(token.durationText);
                        const cue = extractDonenessCue(step.rawText, token.durationText);
                        setPendingPills(prev => ({ ...prev, [timerId]: formatTimerDigits(sec) }));

                        const glowDuration = Math.round(150 / (animSpeed || 1));
                        const flightDuration = Math.round(900 / (animSpeed || 1));

                        btn.style.transition = `box-shadow ${glowDuration}ms ease-out, border-color ${glowDuration}ms ease-out`;
                        btn.style.boxShadow = '0 0 0.8rem 0.15rem rgba(245, 158, 11, 0.7)';
                        btn.style.borderColor = '#f59e0b';

                        setTimeout(() => {
                          btn.style.transition = `box-shadow ${flightDuration}ms ease-out, border-color ${flightDuration}ms ease-out`;
                          btn.style.boxShadow = '0 0 0.2rem rgba(245, 158, 11, 0.2)';
                          btn.style.borderColor = 'rgba(245, 158, 11, 0.45)';

                          handleStartTimer({
                            id: timerId,
                            label: token.durationText,
                            seconds: sec,
                            stepTitle: !isCounted ? (step.title || 'Note') : `Step ${countedNum}`,
                            creatorCue: cue,
                            originRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
                          });

                          setPendingPills(prev => {
                            const next = { ...prev };
                            delete next[timerId];
                            return next;
                          });
                        }, glowDuration);
                      }}
                    >
                      ⏱ {pillText}
                    </button>
                  </span>
                );
              }
              return null;
            })}
          </div>

          {step.showInlineTools && (
            <div className="cook-inline-tools-bar">
              {step.tokens
                .filter((t): t is Extract<StepToken, { type: 'ingredient' | 'cookware' }> =>
                  (t.type === 'ingredient' && !t.isHidden) || t.type === 'cookware'
                )
                .map((toolTok, toolIdx) => (
                  <span
                    key={toolIdx}
                    className={`cook-inline-tool-chip ${toolTok.type === 'ingredient' ? 'chip-ingredient' : 'chip-cookware'}`}
                  >
                    {toolTok.type === 'ingredient' ? (
                      <>
                        <span className="tool-chip-name">{toolTok.name}</span>
                        {toolTok.quantityText && (
                          <span className="tool-chip-amt">{scaleTokenQty(toolTok.quantityText)}</span>
                        )}
                      </>
                    ) : (
                      <span className="tool-chip-name">{toolTok.name}</span>
                    )}
                  </span>
                ))}
            </div>
          )}

          {step.media?.videoClip && typeof step.media.videoClip.startSec === 'number' && (
            <div className="cook-step-clip-wrapper">
              <button
                type="button"
                className="cook-step-clip-btn"
                onClick={(e) => handlePlayVideoClip(step.media!.videoClip!.startSec, step.media!.videoClip!.endSec, e)}
                title="Play step video clip"
              >
                <Play size={11} fill="currentColor" />
                <span>Clip {formatClipTime(step.media.videoClip.startSec, step.media.videoClip.endSec)}</span>
              </button>
            </div>
          )}

          {step.media?.galleryUrls && step.media.galleryUrls.length > 0 && (
            <div className="cook-step-gallery-grid">
              {step.media.galleryUrls.map((url, gIdx) => (
                <button
                  key={gIdx}
                  type="button"
                  className="cook-step-gallery-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxImage(url);
                    setIsLightboxOpen(true);
                  }}
                  aria-label={`View step image ${gIdx + 1}`}
                >
                  <img
                    src={url}
                    alt={`Step media ${gIdx + 1}`}
                    className="cook-step-gallery-thumb"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}

          {step.image && (!step.media?.galleryUrls || step.media.galleryUrls.length === 0) && (
            <button
              type="button"
              className="cook-step-single-img-btn"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxImage(step.image!);
                setIsLightboxOpen(true);
              }}
            >
              <img
                src={step.image}
                alt={step.title || `Step ${step.index}`}
                className="step-media-banner"
                loading="lazy"
              />
            </button>
          )}

          {step.producesYield && (
            <div className="cook-step-yield-banner">
              <span className="cook-yield-tag">
                <CookingPot size={13} />
                <span>Yield</span>
              </span>
              <span className="cook-step-yield-name">{step.producesYield.name}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`cook-preview-view cook-rich ${timers.length > 0 ? 'timer-active' : ''}`}>
      {/* 1. MEDIA HEADER (grid-area: media) */}
      {(recipe.image || recipe.video) && (
        <div className={`cook-media-header ${isMediaExpanded ? 'expanded' : 'collapsed'}`}>
          <div className="cook-media-content single">
            {recipe.video ? (
              <div className="cook-media-item video-player-wrap">
                <video
                  ref={videoRef}
                  src={recipe.video}
                  poster={recipe.image}
                  controls
                  playsInline
                  className="cook-media-video-player"
                />
              </div>
            ) : (
              <div className="cook-media-item">
                <img
                  src={recipe.image}
                  alt={recipe.title}
                  tabIndex={0}
                  role="button"
                  aria-label="View full size image"
                  onClick={() => {
                    setLightboxImage(recipe.image || '');
                    setIsLightboxOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setLightboxImage(recipe.image || '');
                      setIsLightboxOpen(true);
                    }
                  }}
                />
              </div>
            )}
          </div>

          {!isMediaExpanded ? (
            <div className="cook-media-fade-overlay" onClick={() => setIsMediaExpanded(true)}>
              <div className="cook-media-expand-btn">
                <ChevronDown size={24} />
              </div>
            </div>
          ) : (
            <div className="cook-media-close-bar" onClick={() => setIsMediaExpanded(false)}>
              <ChevronUp size={16} />
              <span>Collapse</span>
            </div>
          )}
        </div>
      )}

      {/* 2. HERO ROW (grid-area: hero) */}
      <div className="cook-hero">
        <div className="cook-hero-body">
          <div className="cook-title-row">
            <h1 className="cook-hero-title">{recipe.title}</h1>
            {recipe.source?.url && (
              <a
                href={recipe.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="cook-title-link"
                aria-label="Source recipe"
              >
                <LinkIcon size={18} />
              </a>
            )}
          </div>

          {recipe.author?.name && (
            <div className="cook-author-sub">
              <span className="cook-author-icon">
                <ChefHat size={16} />
              </span>
              <span>by {recipe.author.name}</span>
            </div>
          )}

          {recipe.tags && recipe.tags.length > 0 && (
            <div className="cook-tags-row cook-tags-overflow">
              {recipe.tags.map(tag => (
                <span key={tag} className="cook-pill cook-pill-tag">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Description Card with Markdown */}
          {recipe.description && (
            <div className={`cook-desc-container ${isDescExpanded ? 'expanded' : 'collapsed'}`}>
              <div
                className="cook-desc-text cook-desc-markdown"
                style={!isDescExpanded ? { WebkitLineClamp: 3 } : {}}
                dangerouslySetInnerHTML={{
                  __html: sanitizeMarkdown(recipe.description)
                }}
              />

              {!isDescExpanded ? (
                <div className="cook-desc-fade" onClick={() => setIsDescExpanded(true)}>
                  <div className="cook-desc-fade-arrow">
                    <ChevronDown size={16} />
                  </div>
                </div>
              ) : (
                <div className="cook-desc-close-bar" onClick={() => setIsDescExpanded(false)}>
                  <div className="cook-desc-close-arrow">
                    <ChevronUp size={16} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stats Card */}
          <div className="cook-stats-card">
            <div className="cook-stats-group cook-stats-main">
              <div className="cook-stat-col">
                <span className="cook-stat-label">Difficulty</span>
                <span className={`cook-stat-value ${diffClass}`}>{difficulty}</span>
              </div>
              <div className="cook-stat-col">
                <span className="cook-stat-label">Total Time</span>
                <span className="cook-stat-value">{totalTime}</span>
              </div>
            </div>

            {breakdownTimes.length > 0 && (
              <>
                <div className="cook-stats-divider" />
                <div className="cook-stats-group cook-stats-breakdown">
                  {breakdownTimes.map(t => (
                    <div key={t.label} className="cook-stat-col">
                      <span className="cook-stat-label">{t.label}</span>
                      <span className="cook-stat-value">{t.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 3. ASIDE / INGREDIENTS SIDEBAR (grid-area: aside) */}
      <aside className="cook-aside">
        <div className="cook-ingredients" id="cook-ingredients">
          <div className="cook-ingredients-header-row">
            <h2 className="cook-section-title">
              {sidebarMode === 'prepare' ? 'Preparation' : 'Ingredients'}
            </h2>
            <button
              type="button"
              className="cook-mode-toggle"
              onClick={() => {
                setSidebarMode(prev => (prev === 'prepare' ? 'cooking' : 'prepare'));
                setAnimateMode(true);
                setTimeout(() => setAnimateMode(false), 300);
              }}
              aria-label="Toggle sidebar mode"
              aria-pressed={sidebarMode === 'prepare'}
            >
              <span
                className={`cook-mode-text ${sidebarMode === 'prepare' ? 'shopping' : ''} ${
                  animateMode ? 'animate-drop' : ''
                }`}
              >
                {sidebarMode === 'prepare' ? 'Prepare' : 'Cooking'}
              </span>
            </button>
          </div>

          <div className="cook-stepper">
            <button
              className="cook-stepper-btn"
              onClick={() => setServings(Math.max(1, servings - 1))}
              aria-label="Decrease servings"
            >
              <Minus size={14} />
            </button>
            <span className="cook-stepper-val">
              <b>{servings}</b> {recipe.servings.unitName}
            </span>
            <button
              className="cook-stepper-btn"
              onClick={() => setServings(servings + 1)}
              aria-label="Increase servings"
            >
              <Plus size={14} />
            </button>
          </div>

          {sidebarMode === 'prepare' ? (
            <div className="cook-prepare-mode-content">
              {/* Ingredients Checklist */}
              <div className="cook-prep-checklist-section">
                <div className="cook-prep-checklist-title">
                  <span>Ingredients ({listableIngredients.length})</span>
                  {checkedPrepItems.size > 0 && (
                    <button
                      type="button"
                      className="cook-prep-clear-btn"
                      onClick={clearAllPrepItems}
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <ul className="cook-ing-list">
                  {listableIngredients.map(ing => {
                    const checkKey = `prep:ing:${ing.id || ing.name}`;
                    const isDone = checkedPrepItems.has(checkKey);
                    const displayQty =
                      ing.quantityValue !== null
                        ? scaleQuantity(ing.quantityValue, ing.unit)
                        : ing.quantityText || '';

                    return (
                      <li
                        key={ing.id}
                        className={`cook-ing ${isDone ? 'done' : ''}`}
                        onClick={() => togglePrepItem(checkKey)}
                      >
                        <div className="cook-ing-box">
                          {isDone && <Check size={11} strokeWidth={3.5} />}
                        </div>
                        <span className="cook-ing-name">
                          {ing.name}
                          {ing.note && (
                            <span style={{ color: 'var(--text-muted)' }}> ({ing.note})</span>
                          )}
                        </span>
                        {displayQty && <span className="cook-ing-qty">{displayQty}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Cookware Checklist */}
              {cookwareNames.size > 0 && (
                <div className="cook-prep-checklist-section">
                  <div className="cook-prep-checklist-title">
                    <span>Cookware ({cookwareNames.size})</span>
                  </div>
                  <ul className="cook-ing-list">
                    {Array.from(cookwareNames).map(name => {
                      const checkKey = `prep:cw:${name}`;
                      const isDone = checkedPrepItems.has(checkKey);

                      return (
                        <li
                          key={name}
                          className={`cook-ing ${isDone ? 'done' : ''}`}
                          onClick={() => togglePrepItem(checkKey)}
                        >
                          <div className="cook-ing-box">
                            {isDone && <Check size={11} strokeWidth={3.5} />}
                          </div>
                          <span className="cook-ing-name">{name}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="cook-cooking-mode-groups">
              {recipe.sections.map(section => {
                const filterSteps = (steps: RecipeStep[]) => steps.filter(step =>
                  step.tokens.some(t => (t.type === 'ingredient' && !t.isHidden) || t.type === 'yield' || t.type === 'cookware') || Boolean(step.producesYield)
                );
                const sectionStepsWithItems = filterSteps(section.steps);
                const subHasItems = section.subsections?.some(sub => filterSteps(sub.steps).length > 0);

                if (sectionStepsWithItems.length === 0 && !subHasItems) {
                  return null;
                }

                return (
                  <div
                    key={`section-group-${section.name || section.id}`}
                    id={`sidebar-section-${section.name || section.id}`}
                    className="cook-section-group"
                  >
                    {section.name && section.name !== 'Instructions' && (
                      <div className="cook-ing-group-title">{section.name}</div>
                    )}

                    {sectionStepsWithItems.map(step => renderSidebarStepItem(step, section.name))}

                    {section.subsections?.map(sub => {
                      const subStepsWithItems = filterSteps(sub.steps);
                      if (subStepsWithItems.length === 0) return null;
                      return (
                        <div key={`sidebar-sub-${sub.id || sub.name}`} className="cook-sidebar-subsection">
                          <div className="cook-sidebar-subsection-tag">{sub.name}</div>
                          {subStepsWithItems.map(step => renderSidebarStepItem(step, sub.name))}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* 4. METHOD MAIN (grid-area: main) */}
      <main className="cook-main">
        {recipe.importantNotes && (
          <div className="recipe-important-notes-card">
            <div className="important-notes-header">
              <AlertTriangle size={18} />
              <span>IMPORTANT NOTES</span>
            </div>
            <div
              className="important-notes-body"
              dangerouslySetInnerHTML={{
                __html: sanitizeMarkdown(recipe.importantNotes)
              }}
            />
          </div>
        )}

        <div className="cook-steps" id="cook-steps">
          <h2 className="cook-section-title">Method</h2>

          {recipe.sections.map(section => (
            <div key={section.id || section.name} className="cook-section-block">
              {section.name !== 'Instructions' && (
                <div className="cook-section-band">{section.name}</div>
              )}

              {section.image && (
                <img
                  src={section.image}
                  alt={section.name}
                  className="section-media-banner"
                  loading="lazy"
                />
              )}

              {section.description && (
                <div className="cook-section-desc">
                  {section.description}
                </div>
              )}

              <div className="cook-section-steps">
                {section.steps.map(step => renderStepCard(step, section.name))}
              </div>

              {section.subsections && section.subsections.length > 0 && (
                <div className="cook-subsections-container">
                  {section.subsections.map(sub => (
                    <div key={sub.id || sub.name} className="cook-subsection-block">
                      <div className="cook-subsection-header">
                        <span className="cook-subsection-band">{sub.name}</span>
                      </div>
                      {sub.description && (
                        <div className="cook-subsection-desc">
                          {sub.description}
                        </div>
                      )}
                      <div className="cook-subsection-steps">
                        {sub.steps.map(step => renderStepCard(step, sub.name))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {/* Lightbox Modal */}
      {isLightboxOpen && lightboxImage && (
        typeof document !== 'undefined' ? (
          createPortal(
            <div
              className="cook-lightbox-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Full size recipe photo"
              onClick={() => setIsLightboxOpen(false)}
            >
              <button
                type="button"
                className="cook-lightbox-close"
                onClick={() => setIsLightboxOpen(false)}
                aria-label="Close image"
              >
                <X size={20} />
              </button>
              <div className="cook-lightbox-img-wrap" onClick={e => e.stopPropagation()}>
                <img src={lightboxImage} alt={recipe.title} className="cook-lightbox-img" />
              </div>
            </div>,
            document.body
          )
        ) : (
          <div
            className="cook-lightbox-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Full size recipe photo"
            onClick={() => setIsLightboxOpen(false)}
          >
            <button
              type="button"
              className="cook-lightbox-close"
              onClick={() => setIsLightboxOpen(false)}
              aria-label="Close image"
            >
              <X size={20} />
            </button>
            <div className="cook-lightbox-img-wrap" onClick={e => e.stopPropagation()}>
              <img src={lightboxImage} alt={recipe.title} className="cook-lightbox-img" />
            </div>
          </div>
        )
      )}

      {/* Timer Alarm Modal when countdown reaches 0 */}
      <TimerAlarmModal
        finishedTimers={finishedTimers}
        onStopTimer={handleStopTimer}
        onChangeTime={handleOpenTimePicker}
        onSilenceAll={handleSilenceAll}
        onDismissAll={handleDismissAllAlarms}
      />

      {/* Windows Time Picker Modal */}
      {editingTimer && (
        <WindowsTimePickerModal
          initialSeconds={editingTimer.remainingSeconds > 0 ? editingTimer.remainingSeconds : editingTimer.totalSeconds}
          onSave={handleSaveTimePicker}
          onClose={() => setEditingTimer(null)}
          title={`Adjust ${editingTimer.label}`}
        />
      )}

      {/* Recipe Timer Drawer */}
      <RecipeTimerDrawer
        isOpen={isDrawerOpen}
        timers={timers}
        animSpeed={animSpeed}
        onClose={() => setIsDrawerOpen(false)}
        onTogglePause={handleTogglePause}
        onDismissTimer={handleDismissTimer}
        onEditTimer={handleOpenTimePicker}
      />

      {/* Floating Dev Tool Panel when recipedevtool is true in localStorage */}
      {isDevToolEnabled && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', bottom: '2rem', left: '2rem', zIndex: 999999 }}>
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
            onClick={() => setIsDevToolOpen(prev => !prev)}
          >
            🛠 Dev Tool ({animSpeed}x)
          </button>

          {isDevToolOpen && (
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
                <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>Timer Animation Speed</span>
                <span style={{ fontSize: '0.9rem', color: '#f59e0b', fontWeight: 700 }}>{animSpeed}x</span>
              </div>

              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={animSpeed}
                onChange={(e: any) => {
                  const val = parseFloat(e.target.value) || 1;
                  setAnimSpeed(val);
                  localStorage.setItem('timer_anim_speed', String(val));
                }}
                style={{ width: '100%', accentColor: '#f59e0b', height: '1.5rem', cursor: 'pointer' }}
              />

              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {[1, 0.7, 0.5, 0.25, 0.1].map(spd => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => {
                      setAnimSpeed(spd);
                      localStorage.setItem('timer_anim_speed', String(spd));
                    }}
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

              <div style={{ fontSize: '0.78rem', color: '#9ca3af', lineHeight: 1.4 }}>
                Flight: {Math.round(800 / animSpeed)}ms<br />
                Glow: {Math.round(150 / animSpeed)}ms
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
