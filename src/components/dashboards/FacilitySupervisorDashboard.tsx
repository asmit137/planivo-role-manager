import DashboardLayout from '@/components/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Construction } from 'lucide-react';

const FacilitySupervisorDashboard = () => {
  return (
    <DashboardLayout title="Facility Overview" roleLabel="Facility Supervisor" roleColor="text-warning">
      <Card className="p-12 text-center border-2">
        <Construction className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-xl font-semibold mb-2">Coming Soon</h3>
        <p className="text-muted-foreground">
          Facility management interface will be available soon
        </p>
      </Card>
    </DashboardLayout>
  );
};

export default FacilitySupervisorDashboard;
