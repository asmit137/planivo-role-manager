import { DiscordLayout } from './discord/DiscordLayout';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';

const MessagingHub = () => {
  return (
    <ErrorBoundary
      fallback={
        <ErrorState
          title="Messaging Error"
          message="Failed to load messaging system"
          onRetry={() => window.location.reload()}
        />
      }
    >
      <div className="w-full h-full">
        <DiscordLayout />
      </div>
    </ErrorBoundary>
  );
};

export default MessagingHub;
