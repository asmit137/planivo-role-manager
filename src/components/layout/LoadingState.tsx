import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingStateProps {
  message?: string;
  className?: string;
  fullScreen?: boolean;
}

export const LoadingState = ({ message = 'Loading...', className, fullScreen = false }: LoadingStateProps) => {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center gap-4',
      fullScreen ? 'min-h-screen' : 'py-12',
      className
    )}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      {message && (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  );
};
