import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/utils/cn';

const alertVariants = cva('flex gap-3 rounded-xl border p-3 text-sm sm:p-4', {
  variants: {
    variant: {
      info: 'border-primary/25 bg-accent text-accent-foreground',
      warning: 'border-warning/30 bg-warning-soft text-warning',
      danger: 'border-danger/30 bg-danger-soft text-danger',
      success: 'border-success/30 bg-success-soft text-success',
      neutral: 'bg-muted text-foreground',
    },
  },
  defaultVariants: { variant: 'info' },
});

const ICONS = { info: Info, warning: TriangleAlert, danger: CircleAlert, success: CircleCheck, neutral: Info };

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>, VariantProps<typeof alertVariants> {
  title?: React.ReactNode;
  icon?: React.ReactNode;
}

export function Alert({ className, variant = 'info', title, icon, children, ...props }: AlertProps) {
  const Icon = ICONS[variant ?? 'info'];
  return (
    <div role={variant === 'danger' || variant === 'warning' ? 'alert' : 'status'} className={cn(alertVariants({ variant }), className)} {...props}>
      <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon ?? <Icon aria-hidden />}</span>
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-[13px] leading-relaxed opacity-95 [&_a]:underline">{children}</div>}
      </div>
    </div>
  );
}
