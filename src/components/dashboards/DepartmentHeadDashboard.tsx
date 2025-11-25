import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/layout';
import { StaffManagementHub } from '@/modules/staff-management';
import { VacationHub } from '@/modules/vacation';
import { TaskHub } from '@/modules/tasks';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, ClipboardList, UserPlus } from 'lucide-react';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';

const DepartmentHeadDashboard = () => {
  const { user } = useAuth();
  const { hasAccess } = useModuleContext();

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
      <PageHeader 
        title="Team Management" 
        description="Manage your department's staff, vacations, and tasks"
      />
      <Tabs defaultValue={hasAccess('staff_management') ? 'staff' : hasAccess('vacation_planning') ? 'vacation' : 'tasks'} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          {hasAccess('staff_management') && (
            <TabsTrigger value="staff">
              <UserPlus className="h-4 w-4 mr-2" />
              Staff Management
            </TabsTrigger>
          )}
          {hasAccess('vacation_planning') && (
            <TabsTrigger value="vacation">
              <Calendar className="h-4 w-4 mr-2" />
              Vacation Planning
            </TabsTrigger>
          )}
          {hasAccess('task_management') && (
            <TabsTrigger value="tasks">
              <ClipboardList className="h-4 w-4 mr-2" />
              Department Tasks
            </TabsTrigger>
          )}
        </TabsList>

        {hasAccess('staff_management') && (
          <TabsContent value="staff">
            <ModuleGuard moduleKey="staff_management">
              <StaffManagementHub />
            </ModuleGuard>
          </TabsContent>
        )}

        {hasAccess('vacation_planning') && (
          <TabsContent value="vacation">
            <ModuleGuard moduleKey="vacation_planning">
              <VacationHub />
            </ModuleGuard>
          </TabsContent>
        )}

        {hasAccess('task_management') && (
          <TabsContent value="tasks">
            <ModuleGuard moduleKey="task_management">
              <TaskHub />
            </ModuleGuard>
          </TabsContent>
        )}
      </Tabs>
    </>
  );
};

export default DepartmentHeadDashboard;
