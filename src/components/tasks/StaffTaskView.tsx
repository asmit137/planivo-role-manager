import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { CheckCircle2, Clock, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const StaffTaskView = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const { data: assignments } = useQuery({
    queryKey: ['my-task-assignments', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_assignments')
        .select('*, tasks(*)')
        .eq('assigned_to', user?.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      
      // Fetch creator profiles separately
      const tasksWithCreators = await Promise.all(
        (data || []).map(async (assignment) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', assignment.tasks.created_by)
            .single();
          return {
            ...assignment,
            tasks: {
              ...assignment.tasks,
              creator_name: profile?.full_name || 'Unknown',
            },
          };
        })
      );
      
      return tasksWithCreators;
    },
    enabled: !!user,
  });

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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-task-assignments'] });
      toast.success('Task status updated');
      setSelectedTask(null);
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

  return (
    <div className="space-y-4">
      {assignments?.map((assignment) => (
        <Card key={assignment.id}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-lg">{assignment.tasks.title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Created by: {assignment.tasks.creator_name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={cn(getStatusColor(assignment.status))}>
                  {getStatusIcon(assignment.status)}
                  <span className="ml-1">{assignment.status}</span>
                </Badge>
                <Badge variant="outline" className={getPriorityColor(assignment.tasks.priority)}>
                  {assignment.tasks.priority}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {assignment.tasks.description && (
              <p className="text-sm">{assignment.tasks.description}</p>
            )}

            {assignment.tasks.due_date && (
              <p className="text-sm">
                <span className="font-medium">Due:</span>{' '}
                {format(new Date(assignment.tasks.due_date), 'PPP')}
              </p>
            )}

            {assignment.notes && (
              <div className="bg-accent p-3 rounded-lg">
                <p className="text-sm font-medium mb-1">Notes:</p>
                <p className="text-sm text-muted-foreground">{assignment.notes}</p>
              </div>
            )}

            {assignment.completed_at && (
              <p className="text-sm text-success">
                Completed: {format(new Date(assignment.completed_at), 'PPP')}
              </p>
            )}

            {assignment.status !== 'completed' && (
              <div className="space-y-2">
                {selectedTask === assignment.id && (
                  <Textarea
                    placeholder="Add notes (optional)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                )}

                <div className="flex gap-2">
                  {assignment.status === 'pending' && (
                    <Button
                      size="sm"
                      onClick={() => {
                        if (selectedTask === assignment.id) {
                          updateStatusMutation.mutate({
                            id: assignment.id,
                            status: 'in_progress',
                            notes,
                          });
                        } else {
                          setSelectedTask(assignment.id);
                        }
                      }}
                    >
                      <PlayCircle className="h-4 w-4 mr-1" />
                      Start Task
                    </Button>
                  )}

                  {assignment.status === 'in_progress' && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => {
                        if (selectedTask === assignment.id) {
                          updateStatusMutation.mutate({
                            id: assignment.id,
                            status: 'completed',
                            notes,
                          });
                        } else {
                          setSelectedTask(assignment.id);
                        }
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Complete
                    </Button>
                  )}

                  {selectedTask === assignment.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedTask(null);
                        setNotes('');
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {assignments?.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">No tasks assigned yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StaffTaskView;