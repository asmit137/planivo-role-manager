import { PageHeader } from '@/components/layout';
import StaffTaskView from '@/components/tasks/StaffTaskView';
import { VacationHub } from '@/modules/vacation';
import { NotificationHub } from '@/modules/notifications';
import { MessagingHub } from '@/modules/messaging';
import { SchedulingHub } from '@/components/scheduling';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';
import { useLocation } from 'react-router-dom';
import { ClipboardList, Calendar, MessageSquare, Bell, CalendarClock } from 'lucide-react';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

const StaffDashboard = () => {
  const { hasAccess } = useModuleContext();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab');

  // Real-time subscriptions for live updates
  useRealtimeSubscription({ table: 'task_assignments', invalidateQueries: ['my-tasks'] });
  useRealtimeSubscription({ table: 'vacation_plans', invalidateQueries: ['my-vacation'] });
  useRealtimeSubscription({ table: 'shift_assignments', invalidateQueries: ['my-schedule'] });
  useRealtimeSubscription({ table: 'notifications', invalidateQueries: ['notifications'] });

  return (
    <ErrorBoundary
      fallback={
        <ErrorState
          title="Dashboard Error"
          message="Failed to load staff dashboard"
          onRetry={() => window.location.reload()}
        />
      }
    >
      <>
      {!activeTab && (
        <PageHeader 
          title="My Dashboard" 
          description="View your tasks and manage your vacation"
        />
      )}
      {activeTab === 'tasks' && (
        <PageHeader 
          title="My Tasks" 
          description="View and complete your assigned tasks"
        />
      )}
      {activeTab === 'vacation' && (
        <PageHeader 
          title="My Vacation" 
          description="Plan and manage your vacation requests"
        />
      )}
      {activeTab === 'messaging' && (
        <PageHeader 
          title="Messaging" 
          description="Chat with your colleagues"
        />
      )}
      {activeTab === 'notifications' && (
        <PageHeader 
          title="Notifications" 
          description="View your personal notifications"
        />
      )}
      {activeTab === 'scheduling' && (
        <PageHeader 
          title="My Schedule" 
          description="View your assigned shifts and work schedule"
        />
      )}
      
      <div className="space-y-4">
        {!activeTab && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">My Tasks</p>
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold mt-2">-</p>
              <p className="text-xs text-muted-foreground mt-2">View from Tasks tab</p>
            </div>
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">My Vacation</p>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold mt-2">-</p>
              <p className="text-xs text-muted-foreground mt-2">View from Vacation tab</p>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && hasAccess('task_management') && (
          <ModuleGuard moduleKey="task_management">
            <StaffTaskView />
          </ModuleGuard>
        )}

        {activeTab === 'vacation' && hasAccess('vacation_planning') && (
          <ModuleGuard moduleKey="vacation_planning">
            <VacationHub />
          </ModuleGuard>
        )}

        {activeTab === 'messaging' && hasAccess('messaging') && (
          <ModuleGuard moduleKey="messaging">
            <MessagingHub />
          </ModuleGuard>
        )}

        {activeTab === 'notifications' && hasAccess('notifications') && (
          <ModuleGuard moduleKey="notifications">
            <NotificationHub />
          </ModuleGuard>
        )}

        {activeTab === 'scheduling' && hasAccess('scheduling') && (
          <ModuleGuard moduleKey="scheduling">
            <SchedulingHub />
          </ModuleGuard>
        )}
      </div>
    </>
    </ErrorBoundary>
  );
};

export default StaffDashboard;
