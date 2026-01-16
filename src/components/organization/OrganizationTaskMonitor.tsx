import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, Clock, AlertTriangle, ListTodo } from 'lucide-react';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { StatsCard } from '@/components/shared';
import { format } from 'date-fns';
import { safeProfileName } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import TaskManager from '../tasks/TaskManager';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface OrganizationTaskMonitorProps {
  organizationId: string;
}

const OrganizationTaskMonitor = ({ organizationId }: OrganizationTaskMonitorProps) => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const handleTaskSuccess = () => {
    setIsCreateDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['org-task-stats', workspaceIds] });
    queryClient.invalidateQueries({ queryKey: ['org-recent-tasks', workspaceIds] });
  };

  // Get all workspace IDs for this organization
  const { data: workspaceIds } = useQuery({
    queryKey: ['org-workspace-ids', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('id')
        .eq('organization_id', organizationId);
      if (error) throw error;
      return data?.map(w => w.id) || [];
    },
    enabled: !!organizationId,
  });

  // Get task stats
  const { data: taskStats, isLoading: statsLoading } = useQuery({
    queryKey: ['org-task-stats', workspaceIds],
    queryFn: async () => {
      if (!workspaceIds || workspaceIds.length === 0) return null;

      const { count: active } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .or(`workspace_id.in.(${workspaceIds.join(',')}),scope_type.eq.organization`)
        .eq('status', 'active');

      const { count: completed } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .or(`workspace_id.in.(${workspaceIds.join(',')}),scope_type.eq.organization`)
        .eq('status', 'completed');

      const { count: overdue } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .or(`workspace_id.in.(${workspaceIds.join(',')}),scope_type.eq.organization`)
        .eq('status', 'active')
        .lt('due_date', new Date().toISOString().split('T')[0]);

      const { count: total } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .or(`workspace_id.in.(${workspaceIds.join(',')}),scope_type.eq.organization`);

      return {
        active: active || 0,
        completed: completed || 0,
        overdue: overdue || 0,
        total: total || 0,
      };
    },
    enabled: !!workspaceIds && workspaceIds.length > 0,
  });

  // Get recent tasks
  const { data: recentTasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['org-recent-tasks', workspaceIds],
    queryFn: async () => {
      if (!workspaceIds || workspaceIds.length === 0) return [];

      const { data: tasks, error } = await supabase
        .from('tasks')
        .select(`
          id,
          title,
          status,
          priority,
          due_date,
          created_by,
          scope_type
        `)
        .or(`workspace_id.in.(${workspaceIds.join(',')}),scope_type.eq.organization`)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Get creator profiles
      const creatorIds = tasks?.map(t => t.created_by) || [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', creatorIds);

      return tasks?.map(task => ({
        ...task,
        creatorName: safeProfileName(profiles?.find(p => p.id === task.created_by)),
      })) || [];
    },
    enabled: !!workspaceIds && workspaceIds.length > 0,
  });

  const isLoading = statsLoading || tasksLoading;

  if (isLoading) {
    return <LoadingState message="Loading task data..." />;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-emerald-500 text-white">Completed</Badge>;
      case 'active':
        return <Badge className="bg-blue-500 text-white">Active</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge variant="destructive">High</Badge>;
      case 'medium':
        return <Badge className="bg-amber-500 text-white">Medium</Badge>;
      case 'low':
        return <Badge variant="secondary">Low</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid gap-2 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <StatsCard
          title="Active"
          value={taskStats?.active || 0}
          icon={ListTodo}
          description="In progress"
          className="p-3 sm:p-6"
        />
        <StatsCard
          title="Completed"
          value={taskStats?.completed || 0}
          icon={CheckSquare}
          description="Finished"
          className="p-3 sm:p-6"
        />
        <StatsCard
          title="Overdue"
          value={taskStats?.overdue || 0}
          icon={AlertTriangle}
          description="Past due"
          className="p-3 sm:p-6 text-destructive"
        />
        <StatsCard
          title="Total"
          value={taskStats?.total || 0}
          icon={Clock}
          description="All"
          className="p-3 sm:p-6"
        />
      </div>

      {/* Recent Tasks */}
      <Card>
        <CardHeader className="px-3 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <ListTodo className="h-5 w-5 text-primary" />
            Recent Tasks
          </CardTitle>
          <div className="flex items-center justify-between mt-1">
            <CardDescription className="text-xs sm:text-sm">Latest tasks in your organization</CardDescription>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Create Task
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[95vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle>Create Organization Task</DialogTitle>
                </DialogHeader>
                <div className="py-2 overflow-y-auto max-h-[calc(95vh-120px)]">
                  <TaskManager
                    scopeType="organization"
                    scopeId={organizationId}
                    hideTaskList={true}
                    onSuccess={handleTaskSuccess}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {!recentTasks || recentTasks.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title="No Tasks"
              description="No tasks found in your organization."
            />
          ) : (
            <div className="space-y-3">
              {recentTasks.map((task: any) => (
                <div key={task.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border bg-muted/30 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between sm:justify-start gap-2">
                      <p className="font-medium text-sm sm:text-base line-clamp-1">{task.title}</p>
                      <div className="sm:hidden flex gap-1">
                        {getPriorityBadge(task.priority)}
                        {getStatusBadge(task.status)}
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      By {task.creatorName} · {task.scope_type}
                    </p>
                    {task.due_date && (
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        Due: {format(new Date(task.due_date), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                  <div className="hidden sm:flex gap-2">
                    {getPriorityBadge(task.priority)}
                    {getStatusBadge(task.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OrganizationTaskMonitor;
