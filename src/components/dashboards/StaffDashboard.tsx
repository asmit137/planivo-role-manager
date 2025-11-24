import DashboardLayout from '@/components/DashboardLayout';
import StaffTaskView from '@/components/tasks/StaffTaskView';
import VacationPlansList from '@/components/vacation/VacationPlansList';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardList, Calendar } from 'lucide-react';

const StaffDashboard = () => {
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

        <TabsContent value="vacation">
          <VacationPlansList staffView={true} />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default StaffDashboard;
