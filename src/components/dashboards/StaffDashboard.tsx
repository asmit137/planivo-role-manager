import { PageHeader } from '@/components/layout';
import { ActionButton } from '@/components/shared';
import StaffTaskView from '@/components/tasks/StaffTaskView';
import VacationPlansList from '@/components/vacation/VacationPlansList';
import VacationPlanner from '@/components/vacation/VacationPlanner';
import { NotificationHub } from '@/modules/notifications';
import { MessagingHub } from '@/modules/messaging';
import { ClipboardList, Calendar, Plus, Bell, MessageSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';
import { useLocation } from 'react-router-dom';

const StaffDashboard = () => {
  const { user } = useAuth();
  const { hasAccess } = useModuleContext();
  const [plannerOpen, setPlannerOpen] = useState(false);
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab') || (hasAccess('task_management') ? 'tasks' : 'vacation');

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
    <>
      {activeTab === 'tasks' && (
        <PageHeader 
          title="My Tasks" 
          description="View and complete your assigned tasks"
        />
      )}
      {activeTab === 'vacation' && (
        <PageHeader 
          title="My Vacation" 
          description="Plan and manage your vacation requests"
        />
      )}
      {activeTab === 'messaging' && (
        <PageHeader 
          title="Messaging" 
          description="Chat with your colleagues"
        />
      )}
      {activeTab === 'notifications' && (
        <PageHeader 
          title="Notifications" 
          description="View your personal notifications"
        />
      )}
      
      <div className="space-y-4">
        {activeTab === 'tasks' && hasAccess('task_management') && (
          <ModuleGuard moduleKey="task_management">
            <StaffTaskView />
          </ModuleGuard>
        )}

        {activeTab === 'vacation' && hasAccess('vacation_planning') && (
          <ModuleGuard moduleKey="vacation_planning">
            <div className="flex justify-end mb-4">
              <Dialog open={plannerOpen} onOpenChange={setPlannerOpen}>
                <DialogTrigger asChild>
                  <ActionButton 
                    moduleKey="vacation_planning"
                    permission="edit"
                    icon={Plus}
                  >
                    Plan Vacation
                  </ActionButton>
                </DialogTrigger>
                <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Plan Vacation</DialogTitle>
                  </DialogHeader>
                  <VacationPlanner 
                    staffOnly={true} 
                    maxSplits={workspaceSettings?.max_vacation_splits || 6}
                  />
                </DialogContent>
              </Dialog>
            </div>
            <VacationPlansList staffView={true} />
          </ModuleGuard>
        )}

        {activeTab === 'messaging' && hasAccess('messaging') && (
          <ModuleGuard moduleKey="messaging">
            <MessagingHub />
          </ModuleGuard>
        )}

        {activeTab === 'notifications' && hasAccess('notifications') && (
          <ModuleGuard moduleKey="notifications">
            <NotificationHub />
          </ModuleGuard>
        )}
      </div>
    </>
  );
};

export default StaffDashboard;
