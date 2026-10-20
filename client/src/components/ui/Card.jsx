import { cn } from '../../lib/utils';
import { Ody } from '../../features/marketing/components';

export function Card({ className, children, as: Tag = 'div', ...props }) {
  return (
    <Tag className={cn('rounded-[20px] border border-[#dce1e8] bg-white p-5 sm:p-6', className)} {...props}>
      {children}
    </Tag>
  );
}

export function StatCard({ icon: Icon, label, value, tone = 'brand' }) {
  return (
    <Card className="flex items-center gap-4 !p-4 sm:!p-5">
      {Icon && (
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ece7de] text-[#152839]">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm text-[#45546a]">{label}</p>
        <p className="font-display text-2xl font-bold tabular-nums text-[#152839]">{value}</p>
      </div>
    </Card>
  );
}

export function EmptyState({ icon: Icon, title, children, action, ody = false, mood = 'happy' }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {ody ? (
        <div className="mb-4 flex justify-center">
          <Ody mood={mood} alt="Ody mascot" className="w-28" />
        </div>
      ) : Icon ? (
        <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#ece7de] text-[#152839]">
          <Icon className="h-8 w-8" aria-hidden="true" />
        </span>
      ) : null}
      <h3 className="font-display text-lg font-semibold text-[#152839]">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm text-[#45546a]">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
