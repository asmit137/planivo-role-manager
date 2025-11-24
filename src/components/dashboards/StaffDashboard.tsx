import DashboardLayout from '@/components/DashboardLayout';
import StaffTaskView from '@/components/tasks/StaffTaskView';
import VacationPlansList from '@/components/vacation/VacationPlansList';
import VacationPlanner from '@/components/vacation/VacationPlanner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardList, Calendar, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const StaffDashboard = () => {
  const { user } = useAuth();
  const [plannerOpen, setPlannerOpen] = useState(false);

  const { data: workspaceSettings } = useQuery({
    queryKey: ['staff-workspace-settings', user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      // Get staff's workspace through their role
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('workspace_id, workspaces(max_vacation_splits)')
        .eq('user_id', user.id)
        .eq('role', 'staff')
        .maybeSingle();
      
      return userRole?.workspaces;
    },
    enabled: !!user,
  });

  return (
    <DashboardLayout title="My Dashboard" roleLabel="Staff" roleColor="text-muted-foreground">
      <Tabs defaultValue="tasks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tasks">
            <ClipboardList className="h-4 w-4 mr-2" />
            My Tasks
          </TabsTrigger>
          <TabsTrigger value="vacation">
            <Calendar className="h-4 w-4 mr-2" />
            My Vacation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <StaffTaskView />
        </TabsContent>

        <TabsContent value="vacation" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={plannerOpen} onOpenChange={setPlannerOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Request Vacation
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Request Vacation</DialogTitle>
                </DialogHeader>
                <VacationPlanner 
                  staffOnly={true} 
                  maxSplits={workspaceSettings?.max_vacation_splits || 6}
                />
              </DialogContent>
            </Dialog>
          </div>
          <VacationPlansList staffView={true} />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default StaffDashboard;
