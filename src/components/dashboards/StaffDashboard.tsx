import DashboardLayout from '@/components/DashboardLayout';
import StaffTaskView from '@/components/tasks/StaffTaskView';
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
          <div className="text-center p-12 border-2 rounded-lg">
            <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Vacation Schedule</h3>
            <p className="text-muted-foreground">
              Your vacation plans will appear here once submitted by your department head
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default StaffDashboard;
