import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { UserPlus, UserMinus, Clock, Users, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, isWithinInterval } from 'date-fns';
import { LoadingState } from '@/components/layout/LoadingState';

interface ShiftAssignmentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    shift: any;
    date: Date | string;
    departmentId: string;
}

export const ShiftAssignmentDialog: React.FC<ShiftAssignmentDialogProps> = ({
    open,
    onOpenChange,
    shift,
    date,
    departmentId,
}) => {
    const { user: currentUser } = useAuth();
    const queryClient = useQueryClient();
    const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
    const displayDate = typeof date === 'string' ? format(parseISO(date), 'EEEE, MMM d, yyyy') : format(date, 'EEEE, MMM d, yyyy');

    // Fetch current assignments for this shift and date
    const { data: assignments, isLoading: assignmentsLoading } = useQuery({
        queryKey: ['shift-assignments', shift?.id, dateStr],
        queryFn: async () => {
            if (!shift?.id) return [];
            const { data, error } = await supabase
                .from('shift_assignments')
                .select('*, profiles:staff_id(id, full_name, email)')
                .eq('shift_id', shift.id)
                .eq('assignment_date', dateStr);
            if (error) throw error;
            return data;
        },
        enabled: !!shift?.id && open,
    });

    // Fetch all department staff
    const { data: staff, isLoading: staffLoading } = useQuery({
        queryKey: ['department-staff-availability', departmentId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('user_roles')
                .select('user_id, role, profiles:user_id(id, full_name, email)')
                .eq('department_id', departmentId)
                .in('role', ['staff', 'department_head']);
            if (error) throw error;
            return data;
        },
        enabled: !!departmentId && open,
    });

    // Fetch vacations for conflict checking
    const { data: vacations } = useQuery({
        queryKey: ['staff-vacations-check', dateStr],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('vacation_splits')
                .select('*, vacation_plans(staff_id, status)')
                .lte('start_date', dateStr)
                .gte('end_date', dateStr);
            if (error) throw error;

            // Only approved or pending-above-staff vacations count as conflicts
            return data?.filter((v: any) =>
                ['approved', 'department_pending', 'facility_pending', 'workspace_pending'].includes(v.vacation_plans.status)
            ) || [];
        },
        enabled: !!dateStr && open,
    });

    // Mutation to add assignment
    const addAssignment = useMutation({
        mutationFn: async (staffId: string) => {
            // Re-fetch current assignments right before adding to be safe
            const { data: currentAssignments, error: fetchError } = await supabase
                .from('shift_assignments')
                .select('id')
                .eq('shift_id', shift.id)
                .eq('assignment_date', dateStr);

            if (fetchError) throw fetchError;

            if (currentAssignments && currentAssignments.length >= shift.required_staff) {
                throw new Error('This shift has already reached its staffing requirement.');
            }

            const { error } = await supabase
                .from('shift_assignments')
                .insert({
                    shift_id: shift.id,
                    staff_id: staffId,
                    assignment_date: dateStr,
                    assigned_by: currentUser?.id,
                });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
            queryClient.invalidateQueries({ queryKey: ['scheduling-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['schedules-calendar'] });
            toast.success('Staff assigned successfully');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to assign staff');
        },
    });

    // Mutation to remove assignment
    const removeAssignment = useMutation({
        mutationFn: async (assignmentId: string) => {
            const { error } = await supabase
                .from('shift_assignments')
                .delete()
                .eq('id', assignmentId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
            queryClient.invalidateQueries({ queryKey: ['scheduling-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['schedules-calendar'] });
            toast.success('Assignment removed');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to remove assignment');
        },
    });

    if (!shift) return null;

    const assignedCount = assignments?.length || 0;
    const requiredCount = shift.required_staff || 0;
    const isUnderstaffed = assignedCount < requiredCount;

    const availableStaff = staff?.filter((s: any) => {
        const profile = s.profiles;
        if (!profile) return false;

        // Check if already assigned to THIS shift
        if (assignments?.some((a: any) => a.staff_id === profile.id)) return false;

        // Check if on vacation
        if (vacations?.some((v: any) => v.vacation_plans.staff_id === profile.id)) return false;

        return true;
    }) || [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: shift.color }} />
                        <DialogTitle>{shift.name}</DialogTitle>
                    </div>
                    <DialogDescription>{displayDate}</DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Shift Details */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span>{shift.start_time?.slice(0, 5)} - {shift.end_time?.slice(0, 5)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <Badge variant={isUnderstaffed ? "destructive" : "secondary"}>
                                {assignedCount} / {requiredCount} Staff
                            </Badge>
                        </div>
                    </div>

                    <Separator />

                    {/* Current Assignments */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                            Assigned Staff
                            {isUnderstaffed && (
                                <span className="text-xs font-normal text-destructive flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    Needs {requiredCount - assignedCount} more
                                </span>
                            )}
                        </h4>
                        {assignmentsLoading ? (
                            <div className="py-4 flex justify-center"><LoadingState /></div>
                        ) : assignedCount > 0 ? (
                            <div className="space-y-2">
                                {assignments.map((assignment: any) => (
                                    <div key={assignment.id} className="flex items-center justify-between p-2 rounded-lg border bg-accent/30">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{assignment.profiles?.full_name}</span>
                                            <span className="text-xs text-muted-foreground">{assignment.profiles?.email}</span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive"
                                            onClick={() => removeAssignment.mutate(assignment.id)}
                                            disabled={removeAssignment.isPending}
                                        >
                                            <UserMinus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-4 italic">No staff assigned yet</p>
                        )}
                    </div>

                    <Separator />

                    {/* Available Staff */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold">Assign Available Staff</h4>
                        {staffLoading ? (
                            <div className="py-4 flex justify-center"><LoadingState /></div>
                        ) : availableStaff.length > 0 ? (
                            <ScrollArea className="h-[200px] border rounded-md p-2">
                                <div className="space-y-2">
                                    {availableStaff.map((s: any) => (
                                        <div key={s.user_id} className="flex items-center justify-between p-2 rounded-lg border hover:bg-accent/50 group">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium">{s.profiles?.full_name}</span>
                                                <span className="text-xs text-muted-foreground">{s.profiles?.email}</span>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-primary opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
                                                onClick={() => addAssignment.mutate(s.user_id)}
                                                disabled={addAssignment.isPending || !isUnderstaffed}
                                            >
                                                <UserPlus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-4 italic">
                                No available staff found for this date
                            </p>
                        )}
                        {!isUnderstaffed && availableStaff.length > 0 && (
                            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 flex items-center gap-2">
                                <AlertCircle className="h-3 w-3" />
                                Staffing requirement already met. Remove an assignment to add another.
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex justify-end pt-2 border-t">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
