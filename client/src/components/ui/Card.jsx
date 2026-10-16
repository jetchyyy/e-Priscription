import { cn } from '../../lib/utils';

export function Card({ className, children, as: Tag = 'div', ...props }) {
  return (
    <Tag className={cn('rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink-100 sm:p-6', className)} {...props}>
      {children}
    </Tag>
  );
}

export function StatCard({ icon: Icon, label, value, tone = 'brand' }) {
  const tones = {
    brand: 'from-brand-400 to-brand-600',
    gold: 'from-gold-400 to-gold-500',
    ink: 'from-ink-600 to-ink-900',
    rose: 'from-rose-400 to-rose-600',
  };
  return (
    <Card className="flex items-center gap-4 !p-4 sm:!p-5">
      <span className={cn('inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md', tones[tone])}>
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm text-ink-500">{label}</p>
        <p className="font-display text-2xl font-semibold text-ink-900">{value}</p>
      </div>
    </Card>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icon && (
        <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <Icon className="h-8 w-8" aria-hidden="true" />
        </span>
      )}
      <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-500">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
