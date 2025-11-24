import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/DashboardLayout';
import TaskManager from '@/components/tasks/TaskManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardList, CheckSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';

const FacilitySupervisorDashboard = () => {
  const { user } = useAuth();

  const { data: userRole } = useQuery({
    queryKey: ['facility-supervisor-role', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user?.id)
        .eq('role', 'facility_supervisor')
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (!userRole?.facility_id) {
    return (
      <DashboardLayout title="Facility Overview" roleLabel="Facility Supervisor" roleColor="text-warning">
        <div className="text-center p-12">
          <p className="text-muted-foreground">Loading facility information...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Facility Overview" roleLabel="Facility Supervisor" roleColor="text-warning">
      <Tabs defaultValue="tasks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tasks">
            <ClipboardList className="h-4 w-4 mr-2" />
            Facility Tasks
          </TabsTrigger>
          <TabsTrigger value="approvals">
            <CheckSquare className="h-4 w-4 mr-2" />
            Vacation Approvals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <TaskManager scopeType="facility" scopeId={userRole.facility_id} />
        </TabsContent>

        <TabsContent value="approvals">
          <Card className="p-12 text-center">
            <CheckSquare className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Vacation Approvals</h3>
            <p className="text-muted-foreground">
              Vacation approval interface coming soon
            </p>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default FacilitySupervisorDashboard;
