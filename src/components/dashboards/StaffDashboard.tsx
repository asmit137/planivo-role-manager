import DashboardLayout from '@/components/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Construction } from 'lucide-react';

const StaffDashboard = () => {
  return (
    <DashboardLayout title="My Dashboard" roleLabel="Staff" roleColor="text-muted-foreground">
      <Card className="p-12 text-center border-2">
        <Construction className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-xl font-semibold mb-2">Coming Soon</h3>
        <p className="text-muted-foreground">
          Your vacation schedule and tasks will be available soon
        </p>
      </Card>
    </DashboardLayout>
  );
};

export default StaffDashboard;
