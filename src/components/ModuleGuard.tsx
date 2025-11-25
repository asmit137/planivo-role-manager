import React, { Suspense, lazy } from 'react';
import { useModule } from '@/hooks/useModule';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';

interface ModuleGuardProps {
  moduleKey: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loadingFallback?: React.ReactNode;
}

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
  moduleKey: string;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, resetErrorBoundary, moduleKey }) => (
  <Alert variant="destructive" className="m-4">
    <ShieldAlert className="h-4 w-4" />
    <AlertTitle>Module Error: {moduleKey}</AlertTitle>
    <AlertDescription>
      <p className="mb-2">{error.message}</p>
      <button
        onClick={resetErrorBoundary}
        className="px-4 py-2 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90"
      >
        Try Again
      </button>
    </AlertDescription>
  </Alert>
);

const DefaultLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center p-8 space-x-2">
    <Loader2 className="h-6 w-6 animate-spin" />
    <span>Loading module...</span>
  </div>
);

const DefaultNoAccessFallback: React.FC<{ moduleKey: string }> = ({ moduleKey }) => (
  <Alert variant="destructive" className="m-4">
    <ShieldAlert className="h-4 w-4" />
    <AlertTitle>Access Denied</AlertTitle>
    <AlertDescription>
      You do not have permission to access the "{moduleKey}" module. Please contact your administrator
      if you believe this is an error.
    </AlertDescription>
  </Alert>
);

export const ModuleGuard: React.FC<ModuleGuardProps> = ({
  moduleKey,
  children,
  fallback,
  loadingFallback,
}) => {
  const { hasAccess, isLoading } = useModule(moduleKey);

  if (isLoading) {
    return <>{loadingFallback || <DefaultLoadingFallback />}</>;
  }

  if (!hasAccess) {
    return <>{fallback || <DefaultNoAccessFallback moduleKey={moduleKey} />}</>;
  }

  return (
    <ReactErrorBoundary
      FallbackComponent={(props) => <ErrorFallback {...props} moduleKey={moduleKey} />}
      onReset={() => window.location.reload()}
    >
      <Suspense fallback={loadingFallback || <DefaultLoadingFallback />}>
        {children}
      </Suspense>
    </ReactErrorBoundary>
  );
};

// Lazy loading wrapper for module components
export const withModuleGuard = <P extends object>(
  moduleKey: string,
  Component: React.ComponentType<P>
) => {
  const WrappedComponent: React.FC<P> = (props) => (
    <ModuleGuard moduleKey={moduleKey}>
      <Component {...props} />
    </ModuleGuard>
  );

  WrappedComponent.displayName = `ModuleGuard(${moduleKey})`;
  return WrappedComponent;
};

// Helper to create lazy-loaded modules with guards
export const createLazyModule = <P extends Record<string, any> = Record<string, never>>(
  moduleKey: string,
  factory: () => Promise<{ default: React.ComponentType<P> }>
) => {
  const LazyComponent = lazy(factory);
  
  const GuardedComponent: React.FC<P> = (props) => (
    <ModuleGuard moduleKey={moduleKey}>
      <LazyComponent {...(props as any)} />
    </ModuleGuard>
  );

  GuardedComponent.displayName = `LazyModule(${moduleKey})`;
  return GuardedComponent;
};
