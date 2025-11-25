import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListTodo, CheckCircle2 } from 'lucide-react';
import TaskManager from './TaskManager';
import StaffTaskView from './StaffTaskView';
import { useUserRole } from '@/hooks/useUserRole';

const TaskHub = () => {
  const { data: roles } = useUserRole();
  
  // Determine user's scope for task management
  const managerRole = roles?.find(r => 
    ['workplace_supervisor', 'facility_supervisor', 'department_head'].includes(r.role)
  );

  const canManageTasks = !!managerRole;
  
  const getScopeInfo = () => {
    if (!managerRole) return null;
    
    if (managerRole.role === 'workplace_supervisor') {
      return { scopeType: 'workspace' as const, scopeId: managerRole.workspace_id! };
    } else if (managerRole.role === 'facility_supervisor') {
      return { scopeType: 'facility' as const, scopeId: managerRole.facility_id! };
    } else if (managerRole.role === 'department_head') {
      return { scopeType: 'department' as const, scopeId: managerRole.department_id! };
    }
    return null;
  };

  const scopeInfo = getScopeInfo();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Task Management</h2>
        <p className="text-muted-foreground">
          Create, assign, and track tasks across your organization
        </p>
      </div>

      <Tabs defaultValue={canManageTasks ? "manage" : "my-tasks"} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          {canManageTasks && (
            <TabsTrigger value="manage">
              <ListTodo className="h-4 w-4 mr-2" />
              Manage Tasks
            </TabsTrigger>
          )}
          <TabsTrigger value="my-tasks">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            My Tasks
          </TabsTrigger>
        </TabsList>

        {canManageTasks && scopeInfo && (
          <TabsContent value="manage">
            <TaskManager scopeType={scopeInfo.scopeType} scopeId={scopeInfo.scopeId} />
          </TabsContent>
        )}

        <TabsContent value="my-tasks">
          <StaffTaskView />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TaskHub;
