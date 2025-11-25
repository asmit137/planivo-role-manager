import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/layout';
import { StaffManagementHub } from '@/modules/staff-management';
import { VacationHub } from '@/modules/vacation';
import { TaskHub } from '@/modules/tasks';
import { NotificationHub } from '@/modules/notifications';
import { MessagingHub } from '@/modules/messaging';
import { Calendar, ClipboardList, UserPlus, Bell, MessageSquare } from 'lucide-react';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';
import { useLocation } from 'react-router-dom';

const DepartmentHeadDashboard = () => {
  const { user } = useAuth();
  const { hasAccess } = useModuleContext();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab') || (hasAccess('staff_management') ? 'staff' : hasAccess('vacation_planning') ? 'vacation' : 'tasks');

  const { data: userRole, isLoading: roleLoading, error: roleError } = useQuery({
    queryKey: ['department-head-role', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not found');
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id)
        .eq('role', 'department_head')
        .maybeSingle();
      
      if (error) {
        console.error('Department head role query error:', error);
        throw error;
      }
      
      return data;
    },
    enabled: !!user,
  });

  if (roleLoading) {
    return <LoadingState message="Loading department information..." />;
  }

  if (roleError) {
    return (
      <ErrorState 
        title="Error Loading Department"
        message="Error loading department information. Please try refreshing the page." 
      />
    );
  }

  if (!userRole?.department_id) {
    return (
      <EmptyState 
        title="No Department Assigned"
        description="No department assigned to your account. Please contact an administrator."
      />
    );
  }

  return (
    <>
      {activeTab === 'staff' && (
        <PageHeader 
          title="Staff Management" 
          description="Manage your department's staff members"
        />
      )}
      {activeTab === 'vacation' && (
        <PageHeader 
          title="Vacation Planning" 
          description="Plan and manage staff vacation schedules"
        />
      )}
      {activeTab === 'tasks' && (
        <PageHeader 
          title="Department Tasks" 
          description="Assign and track department tasks"
        />
      )}
      {activeTab === 'messaging' && (
        <PageHeader 
          title="Messaging" 
          description="Chat with staff in your department"
        />
      )}
      {activeTab === 'notifications' && (
        <PageHeader 
          title="Notifications" 
          description="View important updates for your department"
        />
      )}
      {!['staff','vacation','tasks','messaging','notifications'].includes(activeTab) && (
        <PageHeader 
          title="Team Management" 
          description="Manage your department"
        />
      )}
      
      <div className="space-y-4">
        {activeTab === 'staff' && hasAccess('staff_management') && (
          <ModuleGuard moduleKey="staff_management">
            <StaffManagementHub />
          </ModuleGuard>
        )}

        {activeTab === 'vacation' && hasAccess('vacation_planning') && (
          <ModuleGuard moduleKey="vacation_planning">
            <VacationHub />
          </ModuleGuard>
        )}

        {activeTab === 'tasks' && hasAccess('task_management') && (
          <ModuleGuard moduleKey="task_management">
            <TaskHub />
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

        {/* Show message if no valid tab content */}
        {!hasAccess('staff_management') && !hasAccess('vacation_planning') && !hasAccess('task_management') && !hasAccess('messaging') && !hasAccess('notifications') && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No modules available. Contact your administrator.</p>
          </div>
        )}
      </div>
    </>
  );
};

export default DepartmentHeadDashboard;
