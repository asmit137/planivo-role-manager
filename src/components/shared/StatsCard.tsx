import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    label: string;
  };
  isLoading?: boolean;
  className?: string;
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  isLoading,
  className,
}: StatsCardProps) {
  return (
    <Card className={cn('hover:shadow-medium transition-shadow min-w-0', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate">{title}</CardTitle>
        {Icon && <Icon className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0 ml-1" aria-hidden="true" />}
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-20" />
            {description && <Skeleton className="h-4 w-32" />}
          </div>
        ) : (
          <>
            <div className="text-lg sm:text-2xl font-bold truncate">{value}</div>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
            {trend && (
              <div className="flex items-center mt-2">
                <span
                  className={cn(
                    'text-xs font-medium',
                    trend.value > 0 ? 'text-success' : 'text-destructive'
                  )}
                >
                  {trend.value > 0 ? '+' : ''}
                  {trend.value}%
                </span>
                <span className="text-xs text-muted-foreground ml-2">{trend.label}</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
