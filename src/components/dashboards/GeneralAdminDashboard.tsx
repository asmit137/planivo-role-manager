import DashboardLayout from '@/components/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Construction } from 'lucide-react';

const GeneralAdminDashboard = () => {
  return (
    <DashboardLayout title="Workspace Management" roleLabel="General System Admin" roleColor="text-accent">
      <Card className="p-12 text-center border-2">
        <Construction className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-xl font-semibold mb-2">Coming Soon</h3>
        <p className="text-muted-foreground">
          Facility and department management interface will be available in Phase 2
        </p>
      </Card>
    </DashboardLayout>
  );
};

export default GeneralAdminDashboard;
