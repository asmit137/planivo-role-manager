import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState = ({ 
  title = 'Error', 
  message, 
  onRetry, 
  className 
}: ErrorStateProps) => {
  return (
    <div className={cn('py-8', className)}>
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="mt-2">
          {message}
          {onRetry && (
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-4"
              onClick={onRetry}
            >
              Try Again
            </Button>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
};
