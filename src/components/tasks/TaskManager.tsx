import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

interface TaskManagerProps {
  scopeType: 'workspace' | 'facility' | 'department' | 'organization';
  scopeId: string;
  hideTaskList?: boolean;
  onSuccess?: () => void;
}

const TaskManager = ({ scopeType, scopeId, hideTaskList, onSuccess }: TaskManagerProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date>();
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);

  // Real-time subscriptions for live updates
  useRealtimeSubscription({
    table: 'tasks',
    invalidateQueries: ['tasks', 'available-staff'],
  });

  useRealtimeSubscription({
    table: 'task_assignments',
    invalidateQueries: ['tasks'],
  });

  const { data: availableStaff } = useQuery({
    queryKey: ['available-staff', scopeType, scopeId],
    queryFn: async () => {
      if (scopeType === 'organization') {
        const { data: userRoles, error: rolesError } = await (supabase
          .from('user_roles' as any)
          .select('user_id')
          .eq('organization_id', scopeId) as any);

        if (rolesError) throw rolesError;

        const userIds = [...new Set((userRoles as any[]).map(r => r.user_id))] as string[];

        if (userIds.length === 0) return [];

        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds)
          .order('full_name');

        if (error) throw error;

        return profiles.map(profile => ({
          user_id: profile.id,
          profiles: profile
        }));
      }

      let query = supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'staff');

      if (scopeType === 'workspace') {
        query = query.eq('workspace_id', scopeId);
      } else if (scopeType === 'facility') {
        query = query.eq('facility_id', scopeId);
      } else if (scopeType === 'department') {
        query = query.eq('department_id', scopeId);
      }

      const { data: roles, error: rolesError } = await query;
      if (rolesError) throw rolesError;

      if (!roles || roles.length === 0) return [];

      const userIds = roles.map(r => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      const profilesArray = profiles || [];

      return roles.map(role => ({
        user_id: role.user_id,
        profiles: profilesArray.find(p => p.id === role.user_id) || {
          id: role.user_id,
          full_name: 'Unknown User',
          email: 'No email'
        }
      }));
    },
  });

  const { data: tasks } = useQuery({
    queryKey: ['tasks', scopeType, scopeId],
    queryFn: async () => {
      let query = supabase
        .from('tasks')
        .select('*')
        .eq('scope_type', scopeType);

      if (scopeType === 'workspace') {
        query = query.eq('workspace_id', scopeId);
      } else if (scopeType === 'facility') {
        query = query.eq('facility_id', scopeId);
      } else if (scopeType === 'department') {
        query = query.eq('department_id', scopeId);
      } else if (scopeType === 'organization') {
        // Organization tasks don't have a specific ID, they are global
      }

      const { data: tasksData, error: tasksError } = await query.order('created_at', { ascending: false });
      if (tasksError) throw tasksError;

      if (!tasksData || tasksData.length === 0) return [];

      // Fetch task assignments separately
      const taskIds = tasksData.map(t => t.id);
      const { data: assignments, error: assignError } = await supabase
        .from('task_assignments')
        .select('id, task_id, assigned_to, status')
        .in('task_id', taskIds);

      if (assignError) throw assignError;

      // Fetch profiles for assigned users
      const assignedUserIds = [...new Set((assignments || []).map(a => a.assigned_to))];
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', assignedUserIds);

      if (profilesError) throw profilesError;

      const profilesArray = profiles || [];

      // Combine data
      return tasksData.map(task => ({
        ...task,
        task_assignments: (assignments || [])
          .filter(a => a.task_id === task.id)
          .map(a => ({
            ...a,
            profiles: profilesArray.find(p => p.id === a.assigned_to) || {
              id: a.assigned_to,
              full_name: 'Unknown User',
              email: 'No email'
            }
          }))
      }));
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (taskData: any) => {
      const scopeField = {
        workspace: 'workspace_id',
        facility: 'facility_id',
        department: 'department_id',
        organization: null,
      }[scopeType];

      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title: taskData.title,
          description: taskData.description,
          scope_type: scopeType,
          ...(scopeField ? { [scopeField]: scopeId } : {}),
          due_date: taskData.due_date,
          priority: taskData.priority,
          created_by: user?.id,
        })
        .select()
        .single();

      if (taskError) throw taskError;

      if (taskData.assignees.length > 0) {
        const { error: assignError } = await supabase
          .from('task_assignments')
          .insert(
            taskData.assignees.map((staffId: string) => ({
              task_id: task.id,
              assigned_to: staffId,
            }))
          );
        if (assignError) throw assignError;
      }

      return task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task created successfully');
      resetForm();
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error: any) => {
      console.error('Task creation error:', error);
      toast.error(`Failed to create task: ${error.message || 'Unknown error'}`);
    },
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDueDate(undefined);
    setPriority('medium');
    setSelectedStaff([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title) {
      toast.error('Please enter a task title');
      return;
    }

    createTaskMutation.mutate({
      title,
      description,
      due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
      priority,
      assignees: selectedStaff,
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-destructive';
      case 'medium':
        return 'text-warning';
      case 'low':
        return 'text-muted-foreground';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Task</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="title">Task Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Due Date</Label>
                <Popover modal={true}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !dueDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate ? format(dueDate, 'PPP') : 'Pick date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto p-0 z-[100]"
                    align="start"
                    side="bottom"
                    sideOffset={4}
                  >
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={setDueDate}
                      disabled={{ before: new Date() }}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(value: any) => setPriority(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Assign To (Optional)</Label>
                {availableStaff && availableStaff.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      if (selectedStaff.length === availableStaff.length) {
                        setSelectedStaff([]);
                      } else {
                        setSelectedStaff(availableStaff.map((s: any) => s.user_id));
                      }
                    }}
                  >
                    {selectedStaff.length === availableStaff.length ? 'Deselect All' : 'Select All'}
                  </Button>
                )}
              </div>
              <div className="border rounded-lg p-2 max-h-40 overflow-y-auto">
                {availableStaff?.map((staff: any) => (
                  <label
                    key={staff.user_id}
                    className="flex items-center space-x-2 p-2 hover:bg-accent rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStaff.includes(staff.user_id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedStaff([...selectedStaff, staff.user_id]);
                        } else {
                          setSelectedStaff(selectedStaff.filter((id) => id !== staff.user_id));
                        }
                      }}
                    />
                    <span className="text-sm">
                      {staff.profiles?.full_name || 'Unknown User'} ({staff.profiles?.email || 'No email'})
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="submit" disabled={createTaskMutation.isPending} className="w-full sm:w-auto min-h-[44px]">
                <Plus className="h-4 w-4 mr-2" />
                Create Task
              </Button>
              <Button type="button" variant="outline" onClick={resetForm} className="w-full sm:w-auto min-h-[44px]">
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {!hideTaskList && (
        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {tasks?.map((task) => (
                <div key={task.id} className="border p-3 sm:p-4 rounded-lg">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
                    <h3 className="font-semibold text-sm sm:text-base">{task.title}</h3>
                    <span className={cn('text-xs sm:text-sm font-medium', getPriorityColor(task.priority))}>
                      {task.priority}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                  )}
                  {task.due_date && (
                    <p className="text-sm">
                      Due: {format(new Date(task.due_date), 'PPP')}
                    </p>
                  )}
                  {task.task_assignments && task.task_assignments.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium">Assigned to:</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {task.task_assignments.map((assignment: any) => (
                          <span
                            key={assignment.id}
                            className="text-xs bg-accent px-2 py-1 rounded"
                          >
                            {assignment.profiles?.full_name || 'Unknown User'} ({assignment.status})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {tasks?.length === 0 && (
                <p className="text-center text-muted-foreground">No tasks yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TaskManager;