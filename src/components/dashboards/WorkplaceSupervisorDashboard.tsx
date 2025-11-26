import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { PageHeader, LoadingState } from '@/components/layout';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';
import TaskManager from '@/components/tasks/TaskManager';
import VacationApprovalWorkflow from '@/components/vacation/VacationApprovalWorkflow';
import VacationCalendarView from '@/components/vacation/VacationCalendarView';
import { VacationHub } from '@/modules/vacation';
import { ClipboardList, CheckSquare, AlertCircle } from 'lucide-react';
import VacationConflictDashboard from '@/components/vacation/VacationConflictDashboard';
import { UnifiedUserHub } from '@/components/users';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';
import { useLocation } from 'react-router-dom';
import { NotificationHub } from '@/modules/notifications';
import { MessagingHub } from '@/modules/messaging';

const WorkplaceSupervisorDashboard = () => {
  const { user } = useAuth();
  const { hasAccess } = useModuleContext();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab');

  const { data: userRole } = useQuery({
    queryKey: ['workplace-supervisor-role', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user?.id)
        .eq('role', 'workplace_supervisor')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (!userRole?.workspace_id) {
    return <LoadingState message="Loading workspace information..." />;
  }

  return (
    <ErrorBoundary
      fallback={
        <ErrorState
          title="Dashboard Error"
          message="Failed to load workplace supervisor dashboard"
          onRetry={() => window.location.reload()}
        />
      }
    >
      <>
      {!activeTab && (
        <PageHeader 
          title="Workspace Overview" 
          description="Manage tasks and vacation planning for the workspace"
        />
      )}
      {activeTab === 'tasks' && (
        <PageHeader 
          title="Workspace Tasks" 
          description="Manage and assign tasks across the workspace"
        />
      )}
      {activeTab === 'approvals' && (
        <PageHeader 
          title="Final Vacation Approvals" 
          description="Review and approve vacation plans at the workspace level"
        />
      )}
      {activeTab === 'conflicts' && (
        <PageHeader 
          title="Vacation Conflicts" 
          description="View and resolve vacation scheduling conflicts"
        />
      )}
      {activeTab === 'calendar' && (
        <PageHeader 
          title="Vacation Calendar" 
          description="View vacation schedules in calendar format"
        />
      )}
      {activeTab === 'vacation' && (
        <PageHeader 
          title="Vacation Planning" 
          description="Manage vacation planning for the workspace"
        />
      )}
      {activeTab === 'staff' && (
        <PageHeader 
          title="Staff Management" 
          description="Manage staff members across the workspace"
        />
      )}
      {activeTab === 'messaging' && (
        <PageHeader 
          title="Messaging" 
          description="Communicate with staff across this workspace"
        />
      )}
      {activeTab === 'notifications' && (
        <PageHeader 
          title="Notifications" 
          description="View important updates for this workspace"
        />
      )}
      
      <div className="space-y-4">
        {!activeTab && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Active Tasks</p>
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold mt-2">-</p>
              <p className="text-xs text-muted-foreground mt-2">View from Tasks tab</p>
            </div>
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Pending Approvals</p>
                <CheckSquare className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold mt-2">-</p>
              <p className="text-xs text-muted-foreground mt-2">View from Approvals tab</p>
            </div>
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Conflicts</p>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold mt-2">-</p>
              <p className="text-xs text-muted-foreground mt-2">View from Conflicts tab</p>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && hasAccess('task_management') && (
          <ModuleGuard moduleKey="task_management">
            <TaskManager scopeType="workspace" scopeId={userRole.workspace_id} />
          </ModuleGuard>
        )}

        {activeTab === 'approvals' && hasAccess('vacation_planning') && (
          <ModuleGuard moduleKey="vacation_planning">
            <VacationApprovalWorkflow 
              approvalLevel={3} 
              scopeType="workspace" 
              scopeId={userRole.workspace_id} 
            />
          </ModuleGuard>
        )}

        {activeTab === 'conflicts' && hasAccess('vacation_planning') && (
          <ModuleGuard moduleKey="vacation_planning">
            <VacationConflictDashboard scopeType="workspace" scopeId={userRole.workspace_id} />
          </ModuleGuard>
        )}

        {activeTab === 'calendar' && hasAccess('vacation_planning') && (
          <ModuleGuard moduleKey="vacation_planning">
            <VacationCalendarView />
          </ModuleGuard>
        )}

        {activeTab === 'vacation' && hasAccess('vacation_planning') && (
          <ModuleGuard moduleKey="vacation_planning">
            <VacationHub />
          </ModuleGuard>
        )}

        {activeTab === 'staff' && hasAccess('staff_management') && (
          <ModuleGuard moduleKey="staff_management">
            <UnifiedUserHub scope="workspace" scopeId={userRole.workspace_id} />
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
      </div>
    </>
    </ErrorBoundary>
  );
};

export default WorkplaceSupervisorDashboard;
