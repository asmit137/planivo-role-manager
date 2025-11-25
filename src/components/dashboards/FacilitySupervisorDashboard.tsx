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

const FacilitySupervisorDashboard = () => {
  const { user } = useAuth();
  const { hasAccess } = useModuleContext();

  const { data: userRole } = useQuery({
    queryKey: ['facility-supervisor-role', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user?.id)
        .eq('role', 'facility_supervisor')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (!userRole?.facility_id) {
    return <LoadingState message="Loading facility information..." />;
  }

  return (
    <>
      <PageHeader 
        title="Facility Overview" 
        description="Manage facility tasks and vacation approvals"
      />
      
      <Tabs defaultValue={hasAccess('task_management') ? 'tasks' : hasAccess('vacation_planning') ? 'approvals' : undefined} className="space-y-4">
        <TabsList>
          {hasAccess('task_management') && (
            <TabsTrigger value="tasks">
              <ClipboardList className="h-4 w-4 mr-2" />
              Facility Tasks
            </TabsTrigger>
          )}
          {hasAccess('vacation_planning') && (
            <TabsTrigger value="approvals">
              <CheckSquare className="h-4 w-4 mr-2" />
              Vacation Approvals
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
              <TaskManager scopeType="facility" scopeId={userRole.facility_id} />
            </ModuleGuard>
          </TabsContent>
        )}

        {hasAccess('vacation_planning') && (
          <TabsContent value="approvals">
            <ModuleGuard moduleKey="vacation_planning">
              <VacationApprovalWorkflow 
                approvalLevel={2} 
                scopeType="facility" 
                scopeId={userRole.facility_id} 
              />
            </ModuleGuard>
          </TabsContent>
        )}

        {hasAccess('vacation_planning') && (
          <TabsContent value="conflicts">
            <ModuleGuard moduleKey="vacation_planning">
              <VacationConflictDashboard scopeType="facility" scopeId={userRole.facility_id} />
            </ModuleGuard>
          </TabsContent>
        )}
      </Tabs>
    </>
  );
};

export default FacilitySupervisorDashboard;
