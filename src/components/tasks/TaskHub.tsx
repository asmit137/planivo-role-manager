import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListTodo, CheckCircle2, CheckSquare } from 'lucide-react';
import TaskManager from './TaskManager';
import StaffTaskView from './StaffTaskView';
import { useUserRole } from '@/hooks/useUserRole';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingState } from '@/components/layout/LoadingState';

const TaskHub = () => {
  const { data: roles, isLoading } = useUserRole();

  // Determine user's scope for task management
  const managerRole = roles?.find(r =>
    ['super_admin', 'organization_admin', 'general_admin', 'workplace_supervisor', 'facility_supervisor', 'department_head'].includes(r.role)
  );

  const canManageTasks = !!managerRole;

  if (isLoading) {
    return <LoadingState message="Loading tasks..." />;
  }

  const getScopeInfo = () => {
    if (!managerRole) return null;

    if (managerRole.role === 'super_admin') {
      return { scopeType: 'organization' as const, scopeId: 'global' };
    }

    if (['organization_admin', 'general_admin', 'workplace_supervisor'].includes(managerRole.role)) {
      return managerRole.workspace_id ? { scopeType: 'workspace' as const, scopeId: managerRole.workspace_id } : null;
    } else if (managerRole.role === 'facility_supervisor') {
      return { scopeType: 'facility' as const, scopeId: managerRole.facility_id! };
    } else if (managerRole.role === 'department_head') {
      return { scopeType: 'department' as const, scopeId: managerRole.department_id! };
    }
    return null;
  };

  const scopeInfo = getScopeInfo();

  return (
    <ErrorBoundary
      fallback={
        <ErrorState
          title="Task Error"
          message="Failed to load task management system"
          onRetry={() => window.location.reload()}
        />
      }
    >
      <div className="space-y-4">
        <Tabs defaultValue={canManageTasks ? "manage" : "my-tasks"} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            {canManageTasks && (
              <TabsTrigger value="manage">
                <ListTodo className="h-4 w-4 mr-2" />
                Manage Tasks
              </TabsTrigger>
            )}
            <TabsTrigger value="my-tasks">
              <CheckSquare className="h-4 w-4 mr-2" />
              {roles?.some(r => r.role === 'super_admin') ? 'Global Task Progress' : 'My Tasks'}
            </TabsTrigger>
          </TabsList>

          {canManageTasks && scopeInfo && (
            <TabsContent value="manage">
              <TaskManager scopeType={scopeInfo.scopeType} scopeId={scopeInfo.scopeId} />
            </TabsContent>
          )}

          <TabsContent value="my-tasks">
            <StaffTaskView />
          </TabsContent>
        </Tabs>
      </div>
    </ErrorBoundary>
  );
};

export default TaskHub;
