import { type HTMLAttributes } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant: 'success' | 'error';
}

export function Alert({ variant, className, children, ...props }: AlertProps) {
  const Icon = variant === 'success' ? CheckCircle2 : AlertTriangle;
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
        variant === 'success'
          ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200'
          : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200',
        className,
      )}
      {...props}
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
