import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/DashboardLayout';
import VacationPlanner from '@/components/vacation/VacationPlanner';
import TaskManager from '@/components/tasks/TaskManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, ClipboardList } from 'lucide-react';

const DepartmentHeadDashboard = () => {
  const { user } = useAuth();

  const { data: userRole } = useQuery({
    queryKey: ['department-head-role', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user?.id)
        .eq('role', 'department_head')
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (!userRole?.department_id) {
    return (
      <DashboardLayout title="Team Management" roleLabel="Department Head" roleColor="text-primary">
        <div className="text-center p-12">
          <p className="text-muted-foreground">Loading department information...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Team Management" roleLabel="Department Head" roleColor="text-primary">
      <Tabs defaultValue="vacation" className="space-y-4">
        <TabsList>
          <TabsTrigger value="vacation">
            <Calendar className="h-4 w-4 mr-2" />
            Vacation Planning
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <ClipboardList className="h-4 w-4 mr-2" />
            Department Tasks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vacation">
          <VacationPlanner departmentId={userRole.department_id} />
        </TabsContent>

        <TabsContent value="tasks">
          <TaskManager scopeType="department" scopeId={userRole.department_id} />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default DepartmentHeadDashboard;
