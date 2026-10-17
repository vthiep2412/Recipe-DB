export interface ActiveTimer {
  id: string;
  label: string;
  stepTitle?: string;
  creatorCue?: string;
  totalSeconds: number;
  remainingSeconds: number;
  isPaused: boolean;
  isFinished: boolean;
  endsAt?: number;
  originRect?: { left: number; top: number; width: number; height: number };
}
