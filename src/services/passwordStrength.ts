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
  suggestions?: string[];
}

const WARNING_MESSAGES: Record<string, string> = {
  straightRow: 'Straight rows of keys are easy to guess.',
  keyPattern: 'Short keyboard patterns are easy to guess.',
  simpleRepeat: 'Repeated characters like "aaa" are easy to guess.',
  extendedRepeat: 'Repeated character patterns like "abcabc" are easy to guess.',
  sequences: 'Common character sequences like "abc" or "123" are easy to guess.',
  recentYears: 'Recent calendar years are easy to guess.',
  dates: 'Dates and birth years are easy to guess.',
  topTen: 'This is one of the top 10 most common passwords.',
  topHundred: 'This is one of the top 100 most common passwords.',
  common: 'This is a very commonly used password.',
  similarToCommon: 'This is very similar to a commonly used password.',
  wordByItself: 'Single words on their own are easy to guess.',
  namesByThemselves: 'Names and surnames by themselves are easy to guess.',
  commonNames: 'Common names and surnames are easy to guess.',
  userInputs: 'Password contains your username or email address.',
  pwned: 'This password has appeared in known public data breaches.'
};

const SUGGESTION_MESSAGES: Record<string, string> = {
  l33t: 'Avoid predictable character substitutions like "@" for "a".',
  reverseWords: 'Avoid reversed spellings of common words.',
  allUppercase: 'Capitalize some letters rather than the whole password.',
  capitalization: 'Capitalize more than just the first letter.',
  dates: 'Avoid dates and years associated with you.',
  recentYears: 'Avoid using recent calendar years.',
  associatedYears: 'Avoid years associated with personal details.',
  sequences: 'Avoid predictable character sequences like abc or 123.',
  repeated: 'Avoid repeating words or character patterns.',
  longerKeyboardPattern: 'Use longer patterns and change typing directions.',
  anotherWord: 'Add more uncommon words to form a strong passphrase.',
  useWords: 'Combine multiple unrelated words into a passphrase.',
  noNeed: 'You can create a strong password using several words without complex symbols.',
  pwned: 'Choose a different password that has not been compromised.'
};

function formatFeedback(rawWarning?: string, rawSuggestions: string[] = [], score: number = 0): string | undefined {
  const warningText = rawWarning && WARNING_MESSAGES[rawWarning]
    ? WARNING_MESSAGES[rawWarning]
    : undefined;

  let suggestionText: string | undefined;
  for (const s of rawSuggestions) {
    if (SUGGESTION_MESSAGES[s]) {
      suggestionText = SUGGESTION_MESSAGES[s];
      break;
    }
  }

  if (warningText && suggestionText) {
    return `${warningText} ${suggestionText}`;
  }

  if (warningText) {
    return `${warningText} Combine multiple words or symbols to reach at least Fair strength.`;
  }

  if (suggestionText) {
    return suggestionText;
  }

  if (score < 2) {
    return 'Password is too weak. Combine multiple words, numbers, or symbols to reach at least Fair strength.';
  }

  return undefined;
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

  const rawWarning = result.feedback?.warning || undefined;
  const rawSuggestions = Array.isArray(result.feedback?.suggestions) ? result.feedback.suggestions : [];
  const friendlyFeedback = formatFeedback(rawWarning, rawSuggestions, result.score);

  return {
    score: result.score,
    label: labels[result.score] || 'Weak',
    color: colors[result.score] || 'var(--color-red, #ef4444)',
    warning: friendlyFeedback,
    suggestions: rawSuggestions.map(s => SUGGESTION_MESSAGES[s] || s)
  };
}
