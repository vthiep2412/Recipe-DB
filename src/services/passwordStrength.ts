import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import { dictionary, adjacencyGraphs } from '@zxcvbn-ts/language-common';

const zxcvbn = new ZxcvbnFactory({
  dictionary,
  graphs: adjacencyGraphs
});

export interface PasswordStrengthResult {
  score: number;
  label: 'Very weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  color: string;
  warning?: string;
}

export function evaluatePassword(password: string, userInputs: string[] = []): PasswordStrengthResult {
  if (!password) {
    return { score: 0, label: 'Very weak', color: 'var(--text-muted)' };
  }

  const result = zxcvbn.check(password, userInputs);
  const labels: Array<PasswordStrengthResult['label']> = [
    'Very weak',
    'Weak',
    'Fair',
    'Good',
    'Strong'
  ];
  const colors = [
    'var(--color-red, #ef4444)',
    'var(--color-red, #ef4444)',
    'var(--color-yellow, #eab308)',
    'var(--color-green, #22c55e)',
    'var(--color-green, #10b981)'
  ];

  return {
    score: result.score,
    label: labels[result.score] || 'Weak',
    color: colors[result.score] || 'var(--color-red, #ef4444)',
    warning: result.feedback?.warning || undefined
  };
}
