import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/DashboardLayout';
import TaskManager from '@/components/tasks/TaskManager';
import VacationApprovalWorkflow from '@/components/vacation/VacationApprovalWorkflow';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardList, CheckSquare } from 'lucide-react';

const WorkplaceSupervisorDashboard = () => {
  const { user } = useAuth();

  const { data: userRole } = useQuery({
    queryKey: ['workplace-supervisor-role', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user?.id)
        .eq('role', 'workplace_supervisor')
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (!userRole?.workspace_id) {
    return (
      <DashboardLayout title="Final Approvals" roleLabel="Workplace Supervisor" roleColor="text-success">
        <div className="text-center p-12">
          <p className="text-muted-foreground">Loading workspace information...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Final Approvals" roleLabel="Workplace Supervisor" roleColor="text-success">
      <Tabs defaultValue="tasks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tasks">
            <ClipboardList className="h-4 w-4 mr-2" />
            Workspace Tasks
          </TabsTrigger>
          <TabsTrigger value="approvals">
            <CheckSquare className="h-4 w-4 mr-2" />
            Final Approvals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <TaskManager scopeType="workspace" scopeId={userRole.workspace_id} />
        </TabsContent>

        <TabsContent value="approvals">
          <VacationApprovalWorkflow 
            approvalLevel={3} 
            scopeType="workspace" 
            scopeId={userRole.workspace_id} 
          />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default WorkplaceSupervisorDashboard;
