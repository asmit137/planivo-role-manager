import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { PageHeader, LoadingState } from '@/components/layout';
import TaskManager from '@/components/tasks/TaskManager';
import VacationApprovalWorkflow from '@/components/vacation/VacationApprovalWorkflow';
import { ClipboardList, CheckSquare, AlertCircle } from 'lucide-react';
import VacationConflictDashboard from '@/components/vacation/VacationConflictDashboard';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';
import { useLocation } from 'react-router-dom';
import { NotificationHub } from '@/modules/notifications';
import { MessagingHub } from '@/modules/messaging';

const FacilitySupervisorDashboard = () => {
  const { user } = useAuth();
  const { hasAccess } = useModuleContext();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab') || (hasAccess('task_management') ? 'tasks' : hasAccess('vacation_planning') ? 'approvals' : 'tasks');

  const { data: userRole } = useQuery({
    queryKey: ['facility-supervisor-role', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user?.id)
        .eq('role', 'facility_supervisor')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (!userRole?.facility_id) {
    return <LoadingState message="Loading facility information..." />;
  }

  return (
    <>
      {activeTab === 'tasks' && (
        <PageHeader 
          title="Facility Tasks" 
          description="Manage and assign tasks within the facility"
        />
      )}
      {activeTab === 'approvals' && (
        <PageHeader 
          title="Vacation Approvals" 
          description="Review and approve vacation plans for the facility"
        />
      )}
      {activeTab === 'conflicts' && (
        <PageHeader 
          title="Vacation Conflicts" 
          description="View and resolve vacation scheduling conflicts"
        />
      )}
      {activeTab === 'messaging' && (
        <PageHeader 
          title="Messaging" 
          description="Communicate with staff in this facility"
        />
      )}
      {activeTab === 'notifications' && (
        <PageHeader 
          title="Notifications" 
          description="View important updates for this facility"
        />
      )}
      
      <div className="space-y-4">
        {activeTab === 'tasks' && hasAccess('task_management') && (
          <ModuleGuard moduleKey="task_management">
            <TaskManager scopeType="facility" scopeId={userRole.facility_id} />
          </ModuleGuard>
        )}

        {activeTab === 'approvals' && hasAccess('vacation_planning') && (
          <ModuleGuard moduleKey="vacation_planning">
            <VacationApprovalWorkflow 
              approvalLevel={2} 
              scopeType="facility" 
              scopeId={userRole.facility_id} 
            />
          </ModuleGuard>
        )}

        {activeTab === 'conflicts' && hasAccess('vacation_planning') && (
          <ModuleGuard moduleKey="vacation_planning">
            <VacationConflictDashboard scopeType="facility" scopeId={userRole.facility_id} />
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

export default FacilitySupervisorDashboard;
