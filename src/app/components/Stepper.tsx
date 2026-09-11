import { Check, ChevronRight } from 'lucide-react';
import { t, type Lang } from '../i18n.ts';
import type { Step } from '../store.ts';

const STEP_KEYS = ['step1', 'step2', 'step3'] as const;

export function Stepper({
  step,
  counts,
  disabled,
  onStep,
  lang,
  variant,
}: {
  step: Step;
  counts: Partial<Record<Step, string>>;
  disabled: Step[];
  onStep: (step: Step) => void;
  lang: Lang;
  variant: 'desktop' | 'mobile';
}) {
  const cells = ([1, 2, 3] as Step[]).map((n) => {
    const state = n === step ? 'current' : n < step ? 'done' : 'todo';
    const isDisabled = disabled.includes(n);
    const label = t(STEP_KEYS[n - 1]!, lang);
    const count = counts[n];
    const number = (
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs font-medium ${
          state === 'current'
            ? variant === 'mobile'
              ? 'border-ink bg-ink text-ink-fg'
              : 'border-ink-fg bg-ink-fg text-ink'
            : isDisabled
              ? 'border-line text-fg-3'
              : 'border-line-strong text-fg-2'
        }`}
      >
        {state === 'done' ? <Check size={11} aria-hidden /> : n}
      </span>
    );
    if (variant === 'mobile') {
      return (
        <button
          key={n}
          type="button"
          role="tab"
          aria-selected={state === 'current'}
          aria-current={state === 'current' ? 'step' : undefined}
          disabled={isDisabled}
          onClick={() => onStep(n)}
          className={`flex h-14 flex-1 flex-col items-center justify-center gap-0.5 border-t-2 text-xs font-medium ${
            state === 'current' ? 'border-fg text-fg' : 'border-transparent'
          } ${isDisabled ? 'text-fg-3' : 'text-fg-2'}`}
        >
          {number}
          <span>
            {label}
            {count ? ` · ${count}` : ''}
          </span>
        </button>
      );
    }
    return (
      <button
        key={n}
        type="button"
        role="tab"
        aria-selected={state === 'current'}
        aria-current={state === 'current' ? 'step' : undefined}
        disabled={isDisabled}
        onClick={() => onStep(n)}
        className={`flex h-[34px] items-center gap-2 rounded-full border py-0 pl-2 pr-3 text-sm font-medium ${
          state === 'current' ? 'border-ink bg-ink text-ink-fg' : 'border-transparent hover:bg-surface-2'
        } ${isDisabled ? 'text-fg-3' : state === 'current' ? '' : 'text-fg-2'}`}
      >
        {number}
        <span>{label}</span>
        {count ? <span className="text-xs opacity-80">{count}</span> : null}
      </button>
    );
  });

  if (variant === 'mobile') {
    return (
      <nav role="tablist" aria-label={t('stepsLabel', lang)} className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface lg:hidden">
        {cells}
      </nav>
    );
  }
  return (
    <nav role="tablist" aria-label={t('stepsLabel', lang)} className="hidden items-center gap-1.5 lg:flex">
      {cells.flatMap((cell, i) =>
        i === 0 ? [cell] : [<ChevronRight key={`sep${i}`} size={14} className="text-line-strong" aria-hidden />, cell],
      )}
    </nav>
  );
}
