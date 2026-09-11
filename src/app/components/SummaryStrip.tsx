import { Chip } from './ui.tsx';

export function SummaryStrip({ items }: { items: { label: string; title?: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((item, i) => (
        <Chip key={`${item.label}-${i}`} title={item.title}>
          {item.label}
        </Chip>
      ))}
    </div>
  );
}
