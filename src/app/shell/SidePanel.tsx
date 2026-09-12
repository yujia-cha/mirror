/**
 * A collapsible side panel: beside the stage on a desktop, a full-height drawer over it on a
 * phone. Both carry a tab bar at the top; the drawer also closes on Escape, on the backdrop and
 * from its own close button.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { t, type Lang } from '../i18n.ts';
import { useDismiss } from '../lib/useDismiss.ts';

export interface PanelTab<Id extends string> {
  id: Id;
  label: string;
}

export function TabBar<Id extends string>({ tabs, tab, onTab, label }: { tabs: PanelTab<Id>[]; tab: Id; onTab: (id: Id) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-line bg-surface px-2 pt-2">
      {tabs.map((entry) => {
        const on = entry.id === tab;
        return (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onTab(entry.id)}
            className={`-mb-px border-b-2 px-2.5 pb-2 pt-1 text-sm ${on ? 'border-ink font-semibold text-fg' : 'border-transparent text-fg-2 hover:text-fg'}`}
          >
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}

export function SidePanel<Id extends string>({
  id,
  side,
  label,
  desktop,
  open,
  onClose,
  tabs,
  tab,
  onTab,
  lang,
  children,
}: {
  id: string;
  side: 'left' | 'right';
  label: string;
  /** Desktop: an aside beside the stage; otherwise a drawer over it. */
  desktop: boolean;
  open: boolean;
  onClose: () => void;
  tabs: PanelTab<Id>[];
  tab: Id;
  onTab: (id: Id) => void;
  lang: Lang;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose, open && !desktop);
  useEffect(() => {
    if (open && !desktop) ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [open, desktop]);
  if (!open) return null;
  const bar = <TabBar tabs={tabs} tab={tab} onTab={onTab} label={label} />;
  if (desktop) {
    return (
      <aside
        id={id}
        aria-label={label}
        data-testid={`panel-${side}`}
        className={`sticky top-14 flex h-[calc(100dvh-56px)] w-[336px] flex-none flex-col overflow-hidden bg-surface ${side === 'left' ? 'border-r' : 'border-l'} border-line`}
      >
        {bar}
        <div className="@container min-h-0 flex-1 overflow-y-auto px-3 py-3">{children}</div>
      </aside>
    );
  }
  return (
    <div className="fixed inset-0 z-40" data-testid={`drawer-${side}`}>
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <div
        ref={ref}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`absolute inset-y-0 flex w-[min(92vw,380px)] flex-col bg-surface shadow-pop ${side === 'left' ? 'left-0' : 'right-0'}`}
      >
        <div className="flex h-11 items-center justify-between border-b border-line px-3">
          <span className="text-sm font-semibold">{label}</span>
          <button type="button" onClick={onClose} aria-label={t('panelClose', lang)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2">
            <X size={15} aria-hidden />
          </button>
        </div>
        {bar}
        <div className="@container min-h-0 flex-1 overflow-y-auto px-3 py-3">{children}</div>
      </div>
    </div>
  );
}
