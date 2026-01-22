import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Building2,
    Mail,
    Phone,
    Calendar,
    Clock,
    CheckCircle2,
    AlertCircle,
    Briefcase,
    Plane,
    X
} from 'lucide-react';
import { format, parseISO, isAfter } from 'date-fns';

interface StaffDetailsDialogProps {
    staffId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const StaffDetailsDialog: React.FC<StaffDetailsDialogProps> = ({
    staffId,
    open,
    onOpenChange,
}) => {
    // 1. Fetch Basic Profile & Role Info
    const { data: profile, isLoading: isProfileLoading } = useQuery({
        queryKey: ['staff-details-profile', staffId],
        queryFn: async () => {
            if (!staffId) return null;

            // 1. Get Profile
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', staffId)
                .single();

            if (profileError) throw profileError;

            // 2. Get Role & Department ID
            const { data: roleData, error: roleError } = await supabase
                .from('user_roles')
                .select('role, department_id')
                .eq('user_id', staffId)
                .maybeSingle();

            if (roleError) console.error('Error fetching role:', roleError);

            let departmentName = 'Unassigned';

            // 3. Get Department Name if exists
            if (roleData?.department_id) {
                const { data: deptData } = await supabase
                    .from('departments')
                    .select('name')
                    .eq('id', roleData.department_id)
                    .single();

                if (deptData) {
                    departmentName = deptData.name;
                }
            }

            return {
                ...profileData,
                role: roleData?.role || 'staff',
                department_name: departmentName,
            };
        },
        enabled: !!staffId && open,
    });

    // 2. Fetch Active/Overdue Tasks
    const { data: taskStats, isLoading: isTasksLoading } = useQuery({
        queryKey: ['staff-details-tasks', staffId],
        queryFn: async () => {
            if (!staffId) return { active: 0, overdue: 0 };

            // Tasks are assigned via task_assignments table
            // 1. Get assignments
            const { data: assignments, error: assignmentError } = await supabase
                .from('task_assignments')
                .select('task_id, status')
                .eq('assigned_to', staffId)
                .neq('status', 'completed');

            if (assignmentError) throw assignmentError;

            if (!assignments || assignments.length === 0) {
                return { active: 0, overdue: 0 };
            }

            // 2. Get task details for due dates
            const taskIds = assignments.map((a: any) => a.task_id);
            const { data: tasks, error: tasksError } = await supabase
                .from('tasks')
                .select('id, due_date')
                .in('id', taskIds);

            if (tasksError) throw tasksError;

            const now = new Date();
            let active = 0;
            let overdue = 0;

            const tasksMap = new Map((tasks || []).map((t: any) => [t.id, t]));

            assignments.forEach((assignment: any) => {
                active++;
                const task = tasksMap.get(assignment.task_id);
                if (task?.due_date && new Date(task.due_date) < now) {
                    overdue++;
                }
            });

            return { active, overdue };
        },
        enabled: !!staffId && open,
    });

    // 3. Fetch Upcoming Schedule (Next 3 Shifts)
    const { data: upcomingShifts, isLoading: isScheduleLoading } = useQuery({
        queryKey: ['staff-details-schedule', staffId],
        queryFn: async () => {
            if (!staffId) return [];

            const today = new Date().toISOString().split('T')[0];

            const { data, error } = await supabase
                .from('shift_assignments')
                .select(`
          id,
          assignment_date,
          shifts:shift_id (
            name,
            start_time,
            end_time,
            color
          )
        `)
                .eq('staff_id', staffId)
                .gte('assignment_date', today)
                .order('assignment_date', { ascending: true })
                .limit(3);

            if (error) throw error;
            return data;
        },
        enabled: !!staffId && open,
    });

    // 4. Fetch Vacation Status (Current & Upcoming)
    const { data: vacationStatus, isLoading: isVacationLoading } = useQuery({
        queryKey: ['staff-details-vacation', staffId],
        queryFn: async () => {
            if (!staffId) return { isOnVacation: false, upcoming: null };

            const today = new Date().toISOString().split('T')[0];

            // 1. Get user's approved plans
            const { data: plans } = await supabase
                .from('vacation_plans')
                .select('id')
                .eq('staff_id', staffId)
                .eq('status', 'approved');

            if (!plans || plans.length === 0) {
                return { isOnVacation: false, upcoming: null };
            }

            const planIds = plans.map(p => p.id);

            // 2. Get splits for those plans
            const { data: splits, error } = await supabase
                .from('vacation_splits')
                .select('start_date, end_date')
                .in('vacation_plan_id', planIds)
                .gte('end_date', today)
                .order('start_date', { ascending: true });

            if (error) throw error;

            const currentVacation = splits?.find((s) => s.start_date <= today && s.end_date >= today);
            const nextVacation = splits?.find((s) => s.start_date > today);

            return {
                isOnVacation: !!currentVacation,
                upcoming: nextVacation ? { start: nextVacation.start_date, end: nextVacation.end_date } : null
            };
        },
        enabled: !!staffId && open,
    });

    const isLoading = isProfileLoading || isTasksLoading || isScheduleLoading || isVacationLoading;

    if (!open) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex justify-between items-start">
                        <DialogTitle>Staff Details</DialogTitle>
                    </div>
                </DialogHeader>

                {isLoading ? (
                    <div className="space-y-4 py-4">
                        <div className="flex items-center gap-4">
                            <Skeleton className="h-16 w-16 rounded-full" />
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                        </div>
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                ) : profile ? (
                    <div className="space-y-6">
                        {/* Header Profile Section */}
                        <div className="flex items-start gap-4">
                            <Avatar className="h-16 w-16 border-2 border-background shadow-sm">
                                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${profile.full_name}`} />
                                <AvatarFallback>{profile.full_name.substring(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="space-y-1">
                                <h3 className="text-xl font-semibold leading-none">{profile.full_name}</h3>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className="capitalize">{profile.role.replace('_', ' ')}</Badge>
                                    <Badge variant={profile.is_active ? "default" : "secondary"}>
                                        {profile.is_active ? "Active" : "Inactive"}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                    <Mail className="h-3 w-3" />
                                    {profile.email}
                                </div>
                            </div>
                        </div>

                        {/* Status Alert */}
                        {vacationStatus?.isOnVacation && (
                            <div className="bg-amber-50 border-amber-200 border rounded-md p-3 flex items-start gap-3">
                                <Plane className="h-5 w-5 text-amber-600 mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-amber-900">Currently on Vacation</p>
                                    <p className="text-xs text-amber-700">This staff member is currently away on approved leave.</p>
                                </div>
                            </div>
                        )}

                        <Tabs defaultValue="overview" className="w-full">
                            <TabsList className="w-full grid grid-cols-3">
                                <TabsTrigger value="overview">Overview</TabsTrigger>
                                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                                <TabsTrigger value="workload">Workload</TabsTrigger>
                            </TabsList>

                            {/* Overview Tab */}
                            <TabsContent value="overview" className="mt-4 space-y-4">
                                <Card>
                                    <CardContent className="pt-6 grid gap-4">
                                        <div className="grid grid-cols-[24px_1fr] gap-2 items-start">
                                            <Building2 className="h-5 w-5 text-muted-foreground" />
                                            <div>
                                                <p className="text-sm font-medium">Department</p>
                                                <p className="text-sm text-muted-foreground">{profile.department_name}</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[24px_1fr] gap-2 items-start">
                                            <Phone className="h-5 w-5 text-muted-foreground" />
                                            <div>
                                                <p className="text-sm font-medium">Phone</p>
                                                <p className="text-sm text-muted-foreground">{profile.phone || 'Not provided'}</p>
                                            </div>
                                        </div>

                                        {vacationStatus?.upcoming && (
                                            <div className="grid grid-cols-[24px_1fr] gap-2 items-start pt-2 border-t">
                                                <Plane className="h-5 w-5 text-primary" />
                                                <div>
                                                    <p className="text-sm font-medium">Upcoming Vacation</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {format(parseISO(vacationStatus.upcoming.start), 'MMM d')} - {format(parseISO(vacationStatus.upcoming.end), 'MMM d, yyyy')}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {/* Schedule Tab */}
                            <TabsContent value="schedule" className="mt-4 space-y-3">
                                <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                                    <span>Upcoming Shifts</span>
                                </div>
                                {upcomingShifts && upcomingShifts.length > 0 ? (
                                    upcomingShifts.map((shift: any) => (
                                        <div key={shift.id} className="flex items-center gap-3 p-3 border rounded-lg bg-card/60">
                                            <div className="w-1 min-h-[40px] rounded-full" style={{ backgroundColor: shift.shifts?.color }} />
                                            <div className="flex-1">
                                                <p className="font-medium text-sm">{shift.shifts?.name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {format(parseISO(shift.assignment_date), 'EEE, MMM d')}
                                                </p>
                                            </div>
                                            <div className="text-right text-xs">
                                                <p className="font-medium">
                                                    {shift.shifts?.start_time?.slice(0, 5)} - {shift.shifts?.end_time?.slice(0, 5)}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                                        No upcoming shifts scheduled
                                    </div>
                                )}
                            </TabsContent>

                            {/* Workload Tab */}
                            <TabsContent value="workload" className="mt-4 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <Card className="bg-primary/5 border-primary/20">
                                        <CardContent className="pt-6 text-center">
                                            <Briefcase className="h-6 w-6 mx-auto mb-2 text-primary" />
                                            <div className="text-2xl font-bold text-primary">{taskStats?.active}</div>
                                            <p className="text-xs text-muted-foreground">Active Tasks</p>
                                        </CardContent>
                                    </Card>
                                    <Card className={taskStats?.overdue ? "bg-destructive/5 border-destructive/20" : ""}>
                                        <CardContent className="pt-6 text-center">
                                            <AlertCircle className={`h-6 w-6 mx-auto mb-2 ${taskStats?.overdue ? "text-destructive" : "text-muted-foreground"}`} />
                                            <div className={`text-2xl font-bold ${taskStats?.overdue ? "text-destructive" : ""}`}>{taskStats?.overdue}</div>
                                            <p className="text-xs text-muted-foreground">Overdue</p>
                                        </CardContent>
                                    </Card>
                                </div>

                                {taskStats?.active === 0 && (
                                    <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-md text-sm border border-green-200">
                                        <CheckCircle2 className="h-4 w-4" />
                                        <span>All caught up! No active tasks.</span>
                                    </div>
                                )}
                            </TabsContent>
                        </Tabs>
                    </div>
                ) : (
                    <div className="py-8 text-center text-muted-foreground">
                        Staff member not found
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
