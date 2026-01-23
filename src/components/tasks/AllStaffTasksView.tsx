import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, CheckCircle2, Clock, AlertCircle, PlayCircle, XCircle, CheckSquare, Eye, MessageSquare, ArrowLeft, Trash2 } from 'lucide-react';
import { format, isToday, isThisWeek, addDays, addMonths, subMonths, startOfMonth, endOfMonth, parseISO, isWithinInterval, startOfToday, endOfDay } from 'date-fns';
import { LoadingState } from '@/components/layout/LoadingState';
import { safeProfileName, cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useAuth } from '@/lib/auth';

interface AllStaffTasksViewProps {
    scopeType: 'organization' | 'workspace' | 'facility' | 'department';
    scopeId: string;
    assigneeId?: string | null;
    onBack?: () => void;
}

const AllStaffTasksView = ({ scopeType, scopeId, assigneeId, onBack }: AllStaffTasksViewProps) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [dateFilter, setDateFilter] = useState<string>('all');
    const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    const { data: userRoles } = useQuery({
        queryKey: ['user-roles-all-staff', user?.id],
        queryFn: async () => {
            const { data } = await supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', user?.id);
            return data || [];
        },
        enabled: !!user,
    });

    const isSuperAdmin = userRoles?.some(r => r.role === 'super_admin');



    const deleteTaskMutation = useMutation({
        mutationFn: async (taskId: string) => {
            const { error } = await supabase.from('tasks').delete().eq('id', taskId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['all-staff-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['my-task-assignments'] });
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            toast.success('Task deleted successfully');
            setIsDetailsOpen(false);
        },
        onError: (error: any) => toast.error(`Failed to delete task: ${error.message}`),
    });



    const { data: assignments, isLoading } = useQuery({
        queryKey: ['all-staff-tasks', scopeType, scopeId, assigneeId],
        queryFn: async () => {
            // 1. Build query for TASKS based on scope
            const query = (supabase
                .from('tasks')
                .select('id, title, description, priority, due_date, status, created_by') as any)
                .eq(
                    scopeType === 'organization' ? 'organization_id' :
                        scopeType === 'workspace' ? 'workspace_id' :
                            scopeType === 'facility' ? 'facility_id' : 'department_id',
                    scopeId
                );

            const { data: tasks, error: taskError } = await query;
            if (taskError) throw taskError;

            if (!tasks || tasks.length === 0) return [];

            const taskIds = tasks.map((t: any) => t.id) as string[];
            const creatorIds = [...new Set(tasks.map((t: any) => t.created_by))].filter(Boolean) as string[];

            // 2. Fetch Assignments
            let assignQuery = supabase
                .from('task_assignments')
                .select(`
          id,
          task_id,
          assigned_to,
          status,
          completed_at,
          notes,
          profiles:assigned_to (id, full_name, email)
        `)
                .in('task_id', taskIds);

            if (assigneeId) {
                assignQuery = assignQuery.eq('assigned_to', assigneeId);
            }

            const { data: taskAssignments, error: assignError } = await assignQuery;

            if (assignError) throw assignError;

            // 3. Fetch Creator Profiles & Assignee Roles
            const [creatorProfiles, assigneeRoles] = await Promise.all([
                supabase
                    .from('profiles')
                    .select('id, full_name')
                    .in('id', creatorIds),
                supabase
                    .from('user_roles')
                    .select('user_id, role')
                    .in('user_id', taskAssignments.map(a => a.assigned_to))
            ]);

            const creators = creatorProfiles.data || [];
            const rolesMap = new Map();
            (assigneeRoles.data || []).forEach(r => {
                if (!rolesMap.has(r.user_id)) rolesMap.set(r.user_id, []);
                rolesMap.get(r.user_id).push(r.role);
            });

            // 4. Merge Data
            return (taskAssignments || []).map(assignment => {
                const task = tasks.find(t => t.id === assignment.task_id);
                const creator = creators?.find(c => c.id === task?.created_by);
                const roles = rolesMap.get(assignment.assigned_to) || [];
                const isDeptHead = roles.includes('department_head');

                return {
                    ...assignment,
                    task_title: task?.title,
                    task_description: task?.description,
                    task_priority: task?.priority,
                    task_due_date: task?.due_date,
                    assignee: assignment.profiles,
                    creator_name: safeProfileName(creator),
                    is_dept_head: isDeptHead
                };
            });
        },
        enabled: !!scopeId
    });

    if (isLoading) return <LoadingState message="Loading staff tasks..." />;

    // Filtering
    const today = startOfToday();

    const filteredAssignments = (assignments || []).filter((item: any) => {
        const matchesSearch =
            item.task_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.assignee?.full_name?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesPriority = priorityFilter === 'all' || item.task_priority === priorityFilter;

        let matchesDate = true;
        if (dateFilter !== 'all') {
            if (!item.task_due_date) {
                matchesDate = false;
            } else {
                const dueDate = parseISO(item.task_due_date);
                switch (dateFilter) {
                    case 'today':
                        matchesDate = isToday(dueDate);
                        break;
                    case 'week':
                        matchesDate = isThisWeek(dueDate, { weekStartsOn: 1 });
                        break;
                    case '15days':
                        matchesDate = isWithinInterval(dueDate, {
                            start: today,
                            end: endOfDay(addDays(today, 15))
                        });
                        break;
                    case 'month':
                        matchesDate = isWithinInterval(dueDate, {
                            start: today,
                            end: endOfDay(addMonths(today, 1))
                        });
                        break;
                    case 'last_month':
                        matchesDate = isWithinInterval(dueDate, {
                            start: startOfMonth(subMonths(today, 1)),
                            end: endOfMonth(subMonths(today, 1))
                        });
                        break;
                }
            }
        }

        return matchesSearch && matchesPriority && matchesDate;
    });

    // Group into Kanban columns
    const kanbanColumns = {
        pending: { label: 'To Do', items: [] as any[] },
        in_progress: { label: 'In Progress', items: [] as any[] },
        completed: { label: 'Completed', items: [] as any[] },
    };

    filteredAssignments.forEach((item: any) => {
        const status = item.status as keyof typeof kanbanColumns;
        if (kanbanColumns[status]) {
            kanbanColumns[status].items.push(item);
        }
    });

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'high': return 'text-red-500 uppercase font-bold text-[10px]';
            case 'medium': return 'text-amber-500 uppercase font-bold text-[10px]';
            case 'low': return 'text-muted-foreground uppercase font-bold text-[10px]';
            default: return 'text-muted-foreground text-[10px]';
        }
    };

    const handleMessageUser = (e: React.MouseEvent, userId: string, taskTitle: string) => {
        e.stopPropagation();
        // Navigate to messaging tab.
        // Ideally we'd pass a context, but for now just open messaging.
        // We could copy task context to clipboard?
        navigate(`/dashboard?tab=messaging`);
        // In a real implementation: find conversation with this user or create one.
    };

    return (
        <div className="h-[calc(100vh-220px)] flex flex-col p-2">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    {onBack && (
                        <Button variant="ghost" size="icon" onClick={onBack} className="mr-1">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    )}
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            {assigneeId ? `Tasks for ${assignments?.[0]?.assignee?.full_name || 'Staff'}` : 'Global Staff Tasks'}
                        </h2>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2">
                    <div className="relative w-[150px] md:w-[250px]">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search..."
                            className="pl-8 h-9 bg-card border-border/50"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                        <SelectTrigger className="w-[120px] h-9 bg-card border-border/50">
                            <SelectValue placeholder="Priority" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Priority: All</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={dateFilter} onValueChange={setDateFilter}>
                        <SelectTrigger className="w-[150px] h-9 bg-card border-border/50">
                            <SelectValue placeholder="Due Date" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Date: All</SelectItem>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="week">This Week</SelectItem>
                            <SelectItem value="15days">Next 15 Days</SelectItem>
                            <SelectItem value="month">Next 1 Month</SelectItem>
                            <SelectItem value="last_month">Last Month</SelectItem>
                        </SelectContent>
                    </Select>
                    {(searchQuery || priorityFilter !== 'all' || dateFilter !== 'all') && (
                        <Button variant="ghost" size="sm" onClick={() => {
                            setSearchQuery('');
                            setPriorityFilter('all');
                            setDateFilter('all');
                        }} className="h-9 px-2">
                            <XCircle className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Kanban Board */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full overflow-hidden">
                {(Object.entries(kanbanColumns) as [keyof typeof kanbanColumns, typeof kanbanColumns['pending']][]).map(([key, col]) => (
                    <div key={key} className="flex flex-col h-full overflow-hidden">
                        {/* Column Header */}
                        <div className="flex items-center justify-between mb-3 px-1">
                            <h3 className="font-semibold text-base">{col.label}</h3>
                        </div>

                        {/* Tasks List */}
                        <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-muted">
                            {col.items.length === 0 ? (
                                <div className="h-24 flex items-center justify-center border border-dashed rounded-lg text-muted-foreground text-sm">
                                    No tasks
                                </div>
                            ) : (
                                col.items.map((item: any) => (
                                    <Card
                                        key={item.id}
                                        className={cn(
                                            "border-border/50 hover:border-border transition-colors shadow-sm",
                                            item.assigned_to === user?.id ? "bg-brand-purple/[0.04] border-brand-purple/20" : "bg-card/60"
                                        )}
                                    >
                                        <CardContent className="p-4 space-y-3">
                                            {/* Header: Title + Priority */}
                                            <div className="flex justify-between items-start gap-3">
                                                <div className="flex flex-col gap-1 flex-1">
                                                    {item.assigned_to === user?.id && (
                                                        <span className="text-[9px] w-fit bg-brand-purple/10 text-brand-purple px-1.5 rounded font-bold uppercase tracking-wider">Self Assigned</span>
                                                    )}
                                                    <h4 className="font-semibold text-sm line-clamp-2 leading-tight">
                                                        {item.task_title}
                                                    </h4>
                                                </div>
                                                <span className={getPriorityColor(item.task_priority)}>
                                                    {item.task_priority}
                                                </span>
                                            </div>

                                            {/* Body: Assigned + Creator */}
                                            <div className="flex flex-col gap-0.5 text-xs">
                                                {item.assigned_to === user?.id ? (
                                                    <div className="flex items-center gap-1 text-muted-foreground">
                                                        <span className="text-muted-foreground">From:</span>
                                                        <span className="text-blue-500 font-medium">{item.creator_name}</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1 text-muted-foreground">
                                                        <span className="text-muted-foreground">To:</span>
                                                        <span className="text-blue-500 font-medium">{safeProfileName(item.assignee)}</span>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-1 text-muted-foreground">
                                                    <span>Created by: {item.creator_name}</span>
                                                </div>
                                            </div>

                                            {/* Footer: Due Date + Actions */}
                                            <div className="flex justify-between items-end pt-2 border-t border-border/30 mt-1">
                                                <div className="text-xs text-muted-foreground flex flex-col justify-end h-full">
                                                    <span className="text-[10px] opacity-70">Due Date</span>
                                                    <span>{item.task_due_date ? format(new Date(item.task_due_date), 'MMM d') : '-'}</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    {(item.created_by === user?.id || isSuperAdmin) && (
                                                        <>
                                                            <AlertDialog>
                                                                <AlertDialogTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                                        title="Delete Task"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            This will permanently delete the task "{item.task_title}" and all its assignments.
                                                                        </AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                        <AlertDialogAction
                                                                            onClick={() => deleteTaskMutation.mutate(item.task_id)}
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
                                                        size="icon"
                                                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                                                        title="Message Staff"
                                                        onClick={(e) => handleMessageUser(e, item.assignee?.id, item.task_title)}
                                                    >
                                                        <MessageSquare className="w-3.5 h-3.5" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-4 bg-brand-purple hover:bg-brand-purple/90 text-white font-bold text-xs rounded-full transition-all duration-200 shadow-sm"
                                                        onClick={() => {
                                                            setSelectedAssignment(item);
                                                            setIsDetailsOpen(true);
                                                        }}
                                                    >
                                                        Details
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                    </div>
                ))}
            </div>
            {/* Task Details Dialog */}
            <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <div className="flex justify-between items-start pr-8">
                            <div>
                                <DialogTitle className="text-xl font-bold">{selectedAssignment?.task_title}</DialogTitle>
                                <DialogDescription className="mt-1">
                                    Created by: {selectedAssignment?.creator_name}
                                </DialogDescription>
                            </div>
                            <Badge className={cn(
                                selectedAssignment?.status === 'completed' ? 'bg-green-500' :
                                    selectedAssignment?.status === 'in_progress' ? 'bg-blue-500' : 'bg-secondary'
                            )}>
                                <span className="uppercase text-[10px]">{selectedAssignment?.status}</span>
                            </Badge>
                        </div>
                    </DialogHeader>

                    <Separator className="my-2" />

                    <div className="space-y-6 py-4">
                        {selectedAssignment?.task_description && (
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</p>
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                    {selectedAssignment.task_description}
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created At</p>
                                <div className="flex items-center gap-2 text-sm">
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    <span>{selectedAssignment?.created_at ? format(new Date(selectedAssignment.created_at), 'PPP') : 'Unknown'}</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due Date</p>
                                <div className="flex items-center gap-2 text-sm">
                                    <Clock className="h-4 w-4 text-primary" />
                                    <span>{selectedAssignment?.task_due_date ? format(new Date(selectedAssignment.task_due_date), 'PPP') : 'No due date'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priority</p>
                                <Badge variant="outline" className={cn(getPriorityColor(selectedAssignment?.task_priority || ''))}>
                                    {selectedAssignment?.task_priority}
                                </Badge>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    {selectedAssignment?.assigned_to === user?.id ? "Assigned By" : "Assigned To"}
                                </p>
                                <div className="flex items-center gap-2">
                                    <Avatar className="h-6 w-6">
                                        <AvatarFallback className="text-[10px]">
                                            {selectedAssignment?.assigned_to === user?.id
                                                ? selectedAssignment?.creator_name?.charAt(0)
                                                : selectedAssignment?.assignee?.full_name?.charAt(0)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <p className="text-sm font-medium text-blue-500">
                                        {selectedAssignment?.assigned_to === user?.id
                                            ? selectedAssignment?.creator_name
                                            : selectedAssignment?.assignee?.full_name}
                                    </p>
                                </div>
                            </div>
                            {selectedAssignment?.completed_at && (
                                <div className="space-y-1">
                                    <p className="text-xs font-semibold text-green-500 uppercase tracking-wider">Completed At</p>
                                    <p className="text-sm text-green-600 font-medium">
                                        {format(new Date(selectedAssignment.completed_at), 'MMM d, h:mm a')}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2 border-t pt-4">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status Notes</p>
                            <div className="bg-muted/50 p-3 rounded-lg border border-border/50 text-sm italic whitespace-pre-wrap leading-relaxed shadow-inner">
                                {selectedAssignment?.notes || 'No notes added yet.'}
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="flex justify-between items-center sm:justify-between w-full">
                        <div className="flex gap-2">
                            {(selectedAssignment?.created_by === user?.id || isSuperAdmin) && (
                                <>
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
                                                    This will permanently delete the task "{selectedAssignment?.task_title}" and all its assignments.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => deleteTaskMutation.mutate(selectedAssignment?.task_id)}
                                                    className="bg-destructive hover:bg-destructive/90"
                                                >
                                                    Delete
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>


                                </>
                            )}
                        </div>
                        <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AllStaffTasksView;
