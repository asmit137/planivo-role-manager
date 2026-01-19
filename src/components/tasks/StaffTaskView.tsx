import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { CheckCircle2, Clock, PlayCircle, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { LoadingState } from '@/components/layout/LoadingState';

const StaffTaskView = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [notes, setNotes] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-secondary';
      case 'in_progress':
        return 'bg-primary';
      case 'completed':
        return 'bg-success';
      default:
        return 'bg-muted';
    }
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

  const { data: assignments, isLoading } = useQuery({
    queryKey: ['my-task-assignments', user?.id],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user?.id)
        .eq('role', 'super_admin')
        .maybeSingle();

      const isSuperAdmin = !!roles;

      let query = supabase
        .from('task_assignments')
        .select('*, tasks(*)')
        .order('created_at', { ascending: false });

      if (!isSuperAdmin) {
        query = query.eq('assigned_to', user?.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch profiles separately
      const tasksWithExtraInfo = await Promise.all(
        (data || []).map(async (assignment) => {
          const [creatorProfile, assignedProfile] = await Promise.all([
            supabase
              .from('profiles')
              .select('full_name')
              .eq('id', assignment.tasks.created_by)
              .single(),
            supabase
              .from('profiles')
              .select('full_name')
              .eq('id', assignment.assigned_to)
              .single()
          ]);

          return {
            ...assignment,
            tasks: {
              ...assignment.tasks,
              creator_name: creatorProfile.data?.full_name || 'Unknown',
            },
            assigned_to_profile: assignedProfile.data,
          };
        })
      );

      return tasksWithExtraInfo;
    },
    enabled: !!user,
  });

  const getKanbanColumns = () => {
    // ... existing code ...
    const cols = {
      pending: { title: 'To Do', items: [] as any[] },
      in_progress: { title: 'In Progress', items: [] as any[] },
      completed: { title: 'Completed', items: [] as any[] },
    };

    assignments?.forEach(assignment => {
      const colKey = assignment.status as keyof typeof cols;
      if (cols[colKey]) {
        cols[colKey].items.push(assignment);
      }
    });

    return cols;
  };

  const kanbanColumns = getKanbanColumns();

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: any) => {
      const updateData: any = { status };
      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }
      if (notes) {
        updateData.notes = notes;
      }

      const { error } = await supabase
        .from('task_assignments')
        .update(updateData)
        .eq('id', id);
      if (error) throw error;

      // Also update theparent task status if completed
      if (status === 'completed' && selectedAssignment?.task_id) {
        await supabase
          .from('tasks')
          .update({ status: 'completed' })
          .eq('id', selectedAssignment.task_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-task-assignments'] });
      toast.success('Task status updated');
      setIsModalOpen(false);
      setSelectedAssignment(null);
      setNotes('');
    },
    onError: () => toast.error('Failed to update task status'),
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'in_progress':
        return <PlayCircle className="h-4 w-4" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4" />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading tasks..." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(Object.keys(kanbanColumns) as Array<keyof typeof kanbanColumns>).map((colKey) => (
          <div key={colKey} className="flex flex-col gap-3">
            <div className="flex items-center justify-between font-semibold p-2 bg-muted rounded-t-lg">
              <span>{kanbanColumns[colKey].title}</span>
            </div>
            <div className="flex flex-col gap-3 min-h-[200px] bg-muted/30 p-2 rounded-b-lg">
              {kanbanColumns[colKey].items.map((item) => (
                <div key={item.id} className="bg-card p-3 rounded-md border shadow-sm space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <p className="font-medium text-sm leading-tight">{item.tasks.title}</p>
                    <span className={cn('text-[10px] font-bold uppercase shrink-0', getPriorityColor(item.tasks.priority))}>
                      {item.tasks.priority}
                    </span>
                  </div>
                  {item.assigned_to_profile && (
                    <p className="text-xs font-semibold text-primary/80">
                      {item.assigned_to_profile.full_name}
                    </p>
                  )}
                  {item.tasks.due_date && (
                    <p className="text-[10px] text-muted-foreground">
                      Due: {format(new Date(item.tasks.due_date), 'MMM dd')}
                    </p>
                  )}
                  <div className="flex justify-end pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] gap-1"
                      onClick={() => {
                        setSelectedAssignment(item);
                        setNotes(item.notes || '');
                        setIsModalOpen(true);
                      }}
                    >
                      <Eye className="h-3 w-3" />
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
              {kanbanColumns[colKey].items.length === 0 && (
                <div className="text-center py-8 text-xs text-muted-foreground italic">
                  No items
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {assignments?.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            No tasks found
          </CardContent>
        </Card>
      )}

      {/* Task Detail Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <div className="flex justify-between items-start pr-8">
              <div>
                <DialogTitle className="text-xl">{selectedAssignment?.tasks.title}</DialogTitle>
                <DialogDescription className="mt-1">
                  Created by: {selectedAssignment?.tasks.creator_name}
                </DialogDescription>
              </div>
              <Badge className={cn(getStatusColor(selectedAssignment?.status || ''))}>
                {selectedAssignment && getStatusIcon(selectedAssignment.status)}
                <span className="ml-1 uppercase text-[10px]">{selectedAssignment?.status}</span>
              </Badge>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedAssignment?.tasks.description && (
              <div className="space-y-1">
                <p className="text-sm font-semibold">Description</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {selectedAssignment.tasks.description}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Due Date</p>
                <p className="text-sm text-muted-foreground">
                  {selectedAssignment?.tasks.due_date
                    ? format(new Date(selectedAssignment.tasks.due_date), 'PPP')
                    : 'No due date'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold">Priority</p>
                <Badge variant="outline" className={cn(getPriorityColor(selectedAssignment?.tasks.priority || ''))}>
                  {selectedAssignment?.tasks.priority}
                </Badge>
              </div>
            </div>

            {selectedAssignment?.assigned_to_profile && (
              <div className="space-y-1">
                <p className="text-sm font-semibold">Assigned To</p>
                <p className="text-sm text-primary">
                  {selectedAssignment.assigned_to_profile.full_name}
                </p>
              </div>
            )}

            {selectedAssignment?.completed_at && (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-success">Completed At</p>
                <p className="text-sm text-success">
                  {format(new Date(selectedAssignment.completed_at), 'PPP p')}
                </p>
              </div>
            )}

            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-semibold">Notes</p>
              {selectedAssignment?.assigned_to === user?.id && selectedAssignment?.status !== 'completed' ? (
                <Textarea
                  placeholder="Add status update notes here..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[100px] resize-none"
                />
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  {selectedAssignment?.notes || 'No notes added yet.'}
                </p>
              )}
            </div>

            {/* Action Buttons - Only for Assigned User */}
            {selectedAssignment?.assigned_to === user?.id && selectedAssignment?.status !== 'completed' && (
              <div className="flex gap-2 justify-end pt-4">
                {selectedAssignment.status === 'pending' && (
                  <Button
                    onClick={() => updateStatusMutation.mutate({
                      id: selectedAssignment.id,
                      status: 'in_progress',
                      notes
                    })}
                    className="gap-2"
                  >
                    <PlayCircle className="h-4 w-4" />
                    Start Working
                  </Button>
                )}
                {selectedAssignment.status === 'in_progress' && (
                  <Button
                    onClick={() => updateStatusMutation.mutate({
                      id: selectedAssignment.id,
                      status: 'completed',
                      notes
                    })}
                    className="gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark as Completed
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StaffTaskView;
