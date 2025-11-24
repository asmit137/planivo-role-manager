import DashboardLayout from '@/components/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Construction } from 'lucide-react';

const DepartmentHeadDashboard = () => {
  return (
    <DashboardLayout title="Team Management" roleLabel="Department Head" roleColor="text-primary">
      <Card className="p-12 text-center border-2">
        <Construction className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-xl font-semibold mb-2">Coming Soon</h3>
        <p className="text-muted-foreground">
          Staff management and vacation planning will be available in Phase 3
        </p>
      </Card>
    </DashboardLayout>
  );
};

export default DepartmentHeadDashboard;
