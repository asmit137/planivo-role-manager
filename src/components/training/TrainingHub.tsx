import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Plus, List, Users } from 'lucide-react';
import TrainingEventList from './TrainingEventList';
import TrainingEventForm from './TrainingEventForm';
import TrainingRegistrations from './TrainingRegistrations';
import { useUserRole } from '@/hooks/useUserRole';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingState } from '@/components/layout/LoadingState';
import { useState } from 'react';

const TrainingHub = () => {
  const { data: roles, isLoading } = useUserRole();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  
  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');
  const isAdmin = roles?.some(r => 
    ['super_admin', 'general_admin', 'workplace_supervisor', 'facility_supervisor'].includes(r.role)
  );

  if (isLoading) {
    return <LoadingState message="Loading training module..." />;
  }

  return (
    <ErrorBoundary
      fallback={
        <ErrorState
          title="Training Module Error"
          message="Failed to load training module"
          onRetry={() => window.location.reload()}
        />
      }
    >
      <div className="space-y-6">
        <Tabs defaultValue="events" className="space-y-4">
          <TabsList className="flex flex-wrap gap-1 h-auto">
            <TabsTrigger value="events">
              <Calendar className="h-4 w-4 mr-2" />
              Upcoming Events
            </TabsTrigger>
            <TabsTrigger value="my-registrations">
              <List className="h-4 w-4 mr-2" />
              My Registrations
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="create">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Event
                </TabsTrigger>
                <TabsTrigger value="manage">
                  <Users className="h-4 w-4 mr-2" />
                  Manage Events
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="events">
            <TrainingEventList 
              showOnlyPublished={true} 
              onSelectEvent={setSelectedEventId}
            />
          </TabsContent>

          <TabsContent value="my-registrations">
            <TrainingEventList 
              showOnlyRegistered={true}
              onSelectEvent={setSelectedEventId}
            />
          </TabsContent>

          {isAdmin && (
            <>
              <TabsContent value="create">
                <TrainingEventForm />
              </TabsContent>

              <TabsContent value="manage">
                <TrainingEventList 
                  showAll={true}
                  isAdminView={true}
                  onSelectEvent={setSelectedEventId}
                />
                {selectedEventId && (
                  <div className="mt-6">
                    <TrainingRegistrations eventId={selectedEventId} />
                  </div>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </ErrorBoundary>
  );
};

export default TrainingHub;
