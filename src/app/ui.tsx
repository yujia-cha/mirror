/**
 * Small shared presentational pieces. Kept in one file so the feature components stay readable.
 */
import type { ReactNode } from 'react';
import type { Enums, Gift, Keyword } from '../core/schema.ts';
import { pick, type Lang } from './i18n.ts';

const KEYWORD_COLORS: Record<string, string> = {
  Combustion: 'text-[#e06c4f] border-[#e06c4f]/40 bg-[#e06c4f]/10',
  Laceration: 'text-[#d2566e] border-[#d2566e]/40 bg-[#d2566e]/10',
  Vibration: 'text-[#c9952e] border-[#c9952e]/40 bg-[#c9952e]/10',
  Burst: 'text-[#5ba35b] border-[#5ba35b]/40 bg-[#5ba35b]/10',
  Sinking: 'text-[#6b8ed6] border-[#6b8ed6]/40 bg-[#6b8ed6]/10',
  Breath: 'text-[#6fb3c4] border-[#6fb3c4]/40 bg-[#6fb3c4]/10',
  Charge: 'text-[#9a80d6] border-[#9a80d6]/40 bg-[#9a80d6]/10',
  Slash: 'text-stone-500 border-stone-400/40 bg-stone-400/10',
  Penetrate: 'text-stone-500 border-stone-400/40 bg-stone-400/10',
  Hit: 'text-stone-500 border-stone-400/40 bg-stone-400/10',
  None: 'text-stone-500 border-stone-400/30 bg-stone-400/10',
};

export function Chip({
  children,
  tone = 'neutral',
  className = '',
  title,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'accent';
  className?: string;
  title?: string;
}) {
  const tones = {
    neutral:
      'border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300',
    good: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300',
    bad: 'border-rose-400/50 bg-rose-400/10 text-rose-700 dark:text-rose-300',
    warn: 'border-amber-400/50 bg-amber-400/10 text-amber-700 dark:text-amber-300',
    accent: 'border-sky-400/50 bg-sky-400/10 text-sky-700 dark:text-sky-300',
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function KeywordChip({ keyword, enums, lang }: { keyword: Keyword; enums: Enums; lang: Lang }) {
  const name = enums.keywords.find((k) => k.id === keyword)?.name;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${
        KEYWORD_COLORS[keyword] ?? KEYWORD_COLORS.None
      }`}
    >
      {pick(name, lang) || keyword}
    </span>
  );
}

export function TierBadge({ tier }: { tier: Gift['tier'] }) {
  const label =
    tier === null
      ? '?'
      : tier === 'EX'
        ? 'EX'
        : 'I'.repeat(Number(tier)).replace('IIIII', 'V').replace('IIII', 'IV');
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-stone-300 px-1 text-[11px] font-semibold text-stone-600 dark:border-stone-600 dark:text-stone-300">
      {label}
    </span>
  );
}

export function Section({
  title,
  hint,
  actions,
  children,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {hint ? <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{hint}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  type = 'button',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
}) {
  const variants = {
    default:
      'border border-stone-300 bg-stone-50 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700',
    primary: 'border border-amber-500 bg-amber-500 text-stone-950 hover:bg-amber-400',
    ghost: 'border border-transparent hover:bg-stone-100 dark:hover:bg-stone-800',
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

export function Toggle<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs text-stone-500 dark:text-stone-400">{label}</span>
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-stone-200 p-1 dark:border-stone-700">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={option.value === value}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              option.value === value
                ? 'bg-amber-500 text-stone-950'
                : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
