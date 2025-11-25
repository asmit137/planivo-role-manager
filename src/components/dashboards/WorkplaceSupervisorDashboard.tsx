import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { PageHeader, LoadingState } from '@/components/layout';
import TaskManager from '@/components/tasks/TaskManager';
import VacationApprovalWorkflow from '@/components/vacation/VacationApprovalWorkflow';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardList, CheckSquare, AlertCircle } from 'lucide-react';
import VacationConflictDashboard from '@/components/vacation/VacationConflictDashboard';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';

const WorkplaceSupervisorDashboard = () => {
  const { user } = useAuth();
  const { hasAccess } = useModuleContext();

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
    <>
      <PageHeader 
        title="Final Approvals" 
        description="Manage workspace tasks and final vacation approvals"
      />
      
      <Tabs defaultValue={hasAccess('task_management') ? 'tasks' : hasAccess('vacation_planning') ? 'approvals' : undefined} className="space-y-4">
        <TabsList>
          {hasAccess('task_management') && (
            <TabsTrigger value="tasks">
              <ClipboardList className="h-4 w-4 mr-2" />
              Workspace Tasks
            </TabsTrigger>
          )}
          {hasAccess('vacation_planning') && (
            <TabsTrigger value="approvals">
              <CheckSquare className="h-4 w-4 mr-2" />
              Final Approvals
            </TabsTrigger>
          )}
          {hasAccess('vacation_planning') && (
            <TabsTrigger value="conflicts">
              <AlertCircle className="h-4 w-4 mr-2" />
              Vacation Conflicts
            </TabsTrigger>
          )}
        </TabsList>

        {hasAccess('task_management') && (
          <TabsContent value="tasks">
            <ModuleGuard moduleKey="task_management">
              <TaskManager scopeType="workspace" scopeId={userRole.workspace_id} />
            </ModuleGuard>
          </TabsContent>
        )}

        {hasAccess('vacation_planning') && (
          <TabsContent value="approvals">
            <ModuleGuard moduleKey="vacation_planning">
              <VacationApprovalWorkflow 
                approvalLevel={3} 
                scopeType="workspace" 
                scopeId={userRole.workspace_id} 
              />
            </ModuleGuard>
          </TabsContent>
        )}

        {hasAccess('vacation_planning') && (
          <TabsContent value="conflicts">
            <ModuleGuard moduleKey="vacation_planning">
              <VacationConflictDashboard scopeType="workspace" scopeId={userRole.workspace_id} />
            </ModuleGuard>
          </TabsContent>
        )}
      </Tabs>
    </>
  );
};

export default WorkplaceSupervisorDashboard;
