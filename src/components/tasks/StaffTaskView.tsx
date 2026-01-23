import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { format, isToday, isThisWeek, addDays, addMonths, subMonths, startOfMonth, endOfMonth, parseISO, isWithinInterval, startOfToday, endOfDay } from 'date-fns';
import { CheckCircle2, Clock, PlayCircle, Eye, MessageSquare, Trash2, XCircle, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { LoadingState } from '@/components/layout/LoadingState';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface StaffTaskViewProps {
  scopeType?: 'organization' | 'workspace' | 'facility' | 'department';
  scopeId?: string;
}

const StaffTaskView = ({ scopeType, scopeId }: StaffTaskViewProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [notes, setNotes] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMessaging, setIsMessaging] = useState(false);
  const [dateFilter, setDateFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: userRoles } = useQuery({
    queryKey: ['user-roles-global', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role, department_id')
        .eq('user_id', user?.id);
      return data || [];
    },
    enabled: !!user,
  });

  const isSuperAdmin = userRoles?.some(r => r.role === 'super_admin');
  const departmentHeadRole = userRoles?.find(r => r.role === 'department_head');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-secondary hover:bg-secondary/80';
      case 'in_progress':
        return 'bg-primary hover:bg-primary/80';
      case 'completed':
        return 'bg-success hover:bg-success/80';
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
    queryKey: ['my-task-assignments', user?.id, scopeType, scopeId],
    queryFn: async () => {
      // Re-fetch roles if not yet available to avoid race condition
      let currentIsSuperAdmin = isSuperAdmin;
      let currentDeptHeadRole = departmentHeadRole;
      if (user && userRoles === undefined) {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role, department_id')
          .eq('user_id', user.id);
        currentIsSuperAdmin = roles?.some(r => r.role === 'super_admin') || false;
        currentDeptHeadRole = roles?.find(r => r.role === 'department_head');
      }

      let query = supabase
        .from('task_assignments')
        .select('*, tasks!inner(*), assigned_to_profile:assigned_to(full_name)')
        .order('created_at', { ascending: false });

      if (!currentIsSuperAdmin) {
        if (currentDeptHeadRole && scopeType === 'department' && scopeId) {
          // Fetch department staff IDs
          const { data: staff } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('department_id', scopeId);

          const staffIds = staff?.map(s => s.user_id) || [];
          const allTargetIds = [...new Set([...staffIds, user?.id])].filter(Boolean);

          query = query.in('assigned_to', allTargetIds);
        } else {
          query = query.eq('assigned_to', user?.id);
        }
      } else if (scopeType === 'organization' && scopeId) {
        query = query.eq('tasks.organization_id', scopeId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const assigneeIds = [...new Set((data || []).map(a => a.assigned_to))];
      const creatorIds = [...new Set((data || []).map(a => a.tasks.created_by))];
      const allProfileIds = [...new Set([...assigneeIds, ...creatorIds])];

      const [profiles, rolesData] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', allProfileIds),
        supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', assigneeIds)
      ]);

      const profileMap = new Map((profiles.data || []).map(p => [p.id, p]));
      const rolesMap = new Map();
      (rolesData.data || []).forEach(r => {
        if (!rolesMap.has(r.user_id)) rolesMap.set(r.user_id, []);
        rolesMap.get(r.user_id).push(r.role);
      });

      return (data || []).map(assignment => {
        const creatorProfile = profileMap.get(assignment.tasks.created_by);
        const assignedProfile = profileMap.get(assignment.assigned_to);
        const asigneeRoles = rolesMap.get(assignment.assigned_to) || [];
        const isDeptHead = asigneeRoles.includes('department_head');

        return {
          ...assignment,
          tasks: {
            ...assignment.tasks,
            creator_name: creatorProfile?.full_name || 'Unknown',
          },
          assigned_to_profile: assignedProfile,
          is_dept_head: isDeptHead,
        };
      });
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

    const today = startOfToday();

    assignments?.forEach(assignment => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = assignment.tasks.title.toLowerCase().includes(query);
        const matchesAssignee = assignment.assigned_to_profile?.full_name?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesAssignee) return;
      }

      if (!assignment.tasks.due_date && dateFilter !== 'all') return;

      if (dateFilter !== 'all' && assignment.tasks.due_date) {
        const dueDate = parseISO(assignment.tasks.due_date);
        let matches = false;

        switch (dateFilter) {
          case 'today':
            matches = isToday(dueDate);
            break;
          case 'week':
            matches = isThisWeek(dueDate, { weekStartsOn: 1 });
            break;
          case '15days':
            matches = isWithinInterval(dueDate, {
              start: today,
              end: endOfDay(addDays(today, 15))
            });
            break;
          case 'month':
            matches = isWithinInterval(dueDate, {
              start: today,
              end: endOfDay(addMonths(today, 1))
            });
            break;
          case 'last_month':
            matches = isWithinInterval(dueDate, {
              start: startOfMonth(subMonths(today, 1)),
              end: endOfMonth(subMonths(today, 1))
            });
            break;
        }

        if (!matches) return;
      }

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

      // Also update the parent task status if completed, but only if ALL assignments are completed
      if (status === 'completed' && selectedAssignment?.task_id) {
        const { data: otherAssignments } = await supabase
          .from('task_assignments')
          .select('id, status')
          .eq('task_id', selectedAssignment.task_id)
          .neq('id', id); // exclude current one being updated

        const allDone = !otherAssignments || otherAssignments.every(a => a.status === 'completed');

        if (allDone) {
          await supabase
            .from('tasks')
            .update({ status: 'completed' })
            .eq('id', selectedAssignment.task_id);
        }
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

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-task-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['all-staff-tasks'] });
      toast.success('Task deleted successfully');
      setIsModalOpen(false);
    },
    onError: (error: any) => toast.error(`Failed to delete task: ${error.message}`),
  });



  const { data: availableStaff } = useQuery({
    queryKey: ['available-staff-global'],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select(`
          user_id,
          role,
          profiles:user_id (id, full_name, email)
        `);

      if (rolesError) throw rolesError;

      // Unique by user_id
      const unique = Array.from(new Map(roles.map((r: any) => [r.user_id, r])).values());
      return unique;
    },
  });

  const handleMessageUser = async (targetUserId: string) => {
    if (!user || !targetUserId) return;
    if (user.id === targetUserId) {
      toast.info("You're messaging yourself (Note to Self)");
    }

    setIsMessaging(true);
    try {
      // Search for existing DM
      const { data: existingParticipant, error: searchError } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id);

      if (searchError) throw searchError;

      let existingConvoId = null;

      if (existingParticipant && existingParticipant.length > 0) {
        const convoIds = existingParticipant.map(p => p.conversation_id);

        // Check which of these are DMs with the target user
        const { data: otherParticipants, error: otherError } = await (supabase.from('conversation_participants') as any)
          .select('conversation_id')
          .in('conversation_id', convoIds)
          .eq('user_id', targetUserId);

        if (otherError) throw otherError;

        if (otherParticipants && otherParticipants.length > 0) {
          // Now check if it's a DM (not a group)
          const targetConvoIds = otherParticipants.map(p => p.conversation_id);
          const { data: dms, error: dmsError } = await (supabase.from('conversations') as any)
            .select('id')
            .in('id', targetConvoIds)
            .eq('is_group', false)
            .neq('type', 'channel');

          if (dmsError) throw dmsError;

          if (dms && dms.length > 0) {
            existingConvoId = dms[0].id;
          }
        }
      }

      if (existingConvoId) {
        navigate(`/dashboard?tab=messaging&convo=${existingConvoId}`);
        setIsModalOpen(false);
      } else {
        // Create new DM
        const { data: conversation, error: convError } = await supabase
          .from('conversations')
          .insert({
            title: null,
            is_group: false,
            type: 'dm',
            created_by: user.id,
          } as any)
          .select()
          .single();

        if (convError) throw convError;

        const participants = [
          { conversation_id: conversation.id, user_id: user.id },
          { conversation_id: conversation.id, user_id: targetUserId }
        ];

        const { error: partError } = await supabase
          .from('conversation_participants')
          .insert(participants);

        if (partError) throw partError;

        queryClient.invalidateQueries({ queryKey: ['discord-dms'] });
        navigate(`/dashboard?tab=messaging&convo=${conversation.id}`);
        setIsModalOpen(false);
        toast.success('Starting new conversation');
      }
    } catch (error: any) {
      console.error('Error in handleMessageUser:', error);
      toast.error('Failed to initiate messaging');
    } finally {
      setIsMessaging(false);
    }
  };

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks or staff..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground italic whitespace-nowrap">Filter tasks by due date:</span>
          <SearchableSelect
            value={dateFilter}
            onValueChange={setDateFilter}
            className="w-[180px] h-9"
            placeholder="Filter by date"
            options={[
              { value: 'all', label: 'All Tasks' },
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'This Week' },
              { value: '15days', label: 'Next 15 Days' },
              { value: 'month', label: 'Next 1 Month' },
              { value: 'last_month', label: 'Last Month' }
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(Object.keys(kanbanColumns) as Array<keyof typeof kanbanColumns>).map((colKey) => (
          <div key={colKey} className="flex flex-col gap-3">
            <div className="flex items-center justify-between font-semibold p-2 bg-muted rounded-t-lg">
              <span>{kanbanColumns[colKey].title}</span>
            </div>
            <div className="flex flex-col gap-3 h-[calc(100vh-280px)] bg-muted/30 p-2 rounded-b-lg overflow-y-auto scrollbar-thin scrollbar-thumb-muted">
              {kanbanColumns[colKey].items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "p-3 rounded-md border shadow-sm space-y-2 transition-all",
                    item.assigned_to === user?.id ? "bg-brand-purple/[0.04] border-brand-purple/25" : "bg-card border-border"
                  )}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-col gap-1 flex-1">
                      {item.assigned_to === user?.id && (
                        <span className="text-[9px] w-fit bg-brand-purple/10 text-brand-purple px-1 rounded font-bold uppercase tracking-wider">Self Task</span>
                      )}
                      <p className="font-medium text-sm leading-tight">{item.tasks.title}</p>
                    </div>
                    <span className={cn('text-[10px] font-bold uppercase shrink-0', getPriorityColor(item.tasks.priority))}>
                      {item.tasks.priority}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {item.assigned_to === user?.id ? (
                      <p className="text-xs font-semibold text-primary/80">
                        Assigned by: {item.tasks.creator_name}
                      </p>
                    ) : (
                      item.assigned_to_profile && (
                        <p className="text-xs font-semibold text-primary/80">
                          To: {item.assigned_to_profile.full_name}
                        </p>
                      )
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Created by: {item.tasks.creator_name}
                    </p>
                  </div>
                  {item.tasks.due_date && (
                    <p className="text-[10px] text-muted-foreground">
                      Due Date: {format(new Date(item.tasks.due_date), 'MMM dd')}
                    </p>
                  )}
                  <div className="flex justify-end pt-1 gap-1">
                    {(item.tasks.created_by === user?.id || isSuperAdmin) && (
                      <>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              title="Delete Task"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the task "{item.tasks.title}" and all its assignments.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteTaskMutation.mutate(item.tasks.id)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>


                      </>
                    )}
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
                <div className="flex items-center gap-2 mt-1">
                  <DialogDescription>
                    Created by: {selectedAssignment?.tasks.creator_name}
                  </DialogDescription>
                  {selectedAssignment?.tasks.created_by && selectedAssignment.tasks.created_by !== user?.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-2 text-primary hover:text-primary hover:bg-primary/10 border-primary/20"
                      onClick={() => handleMessageUser(selectedAssignment.tasks.created_by)}
                      disabled={isMessaging}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Message</span>
                    </Button>
                  )}
                </div>
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
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Created At</p>
                <p className="text-sm">
                  {selectedAssignment?.tasks.created_at
                    ? format(new Date(selectedAssignment.tasks.created_at), 'PPP')
                    : 'Unknown'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Due Date</p>
                <p className="text-sm">
                  {selectedAssignment?.tasks.due_date
                    ? format(new Date(selectedAssignment.tasks.due_date), 'PPP')
                    : 'No due date'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Priority</p>
                <Badge variant="outline" className={cn(getPriorityColor(selectedAssignment?.tasks.priority || ''))}>
                  {selectedAssignment?.tasks.priority}
                </Badge>
              </div>
            </div>

            {selectedAssignment?.assigned_to_profile && (
              <div className="space-y-1">
                <p className="text-sm font-semibold">
                  {selectedAssignment.assigned_to === user?.id ? "Assigned By" : "Assigned To"}
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-primary">
                    {selectedAssignment.assigned_to === user?.id
                      ? selectedAssignment.tasks.creator_name
                      : selectedAssignment.assigned_to_profile.full_name}
                  </p>
                  <div className="flex items-center gap-1">


                    {selectedAssignment.assigned_to !== user?.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-2 text-primary hover:text-primary hover:bg-primary/10 border-primary/20"
                        onClick={() => handleMessageUser(selectedAssignment.assigned_to)}
                        disabled={isMessaging}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Message</span>
                      </Button>
                    )}
                  </div>
                </div>
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

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end pt-4">
              {/* Only for Assigned User */}
              {selectedAssignment?.assigned_to === user?.id && selectedAssignment?.status !== 'completed' && (
                <>
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
                </>
              )}

              {/* Creator or Super Admin can Delete */}
              {(selectedAssignment?.tasks.created_by === user?.id || isSuperAdmin) && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="gap-2">
                      <Trash2 className="h-4 w-4" />
                      Delete Task
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the task "{selectedAssignment?.tasks.title}" and all its assignments.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteTaskMutation.mutate(selectedAssignment?.tasks.id)}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StaffTaskView;
