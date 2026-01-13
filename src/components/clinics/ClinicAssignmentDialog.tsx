import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface ClinicAssignmentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clinic: any;
    organizationId: string;
    departmentId?: string;
}

export function ClinicAssignmentDialog({ open, onOpenChange, clinic, organizationId, departmentId }: ClinicAssignmentDialogProps) {

    const queryClient = useQueryClient();
    const [selectedStaff, setSelectedStaff] = useState('');
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('13:00');

    // Fetch all potential staff for assignments
    const { data: staff } = useQuery({
        queryKey: ['staff-for-clinics', organizationId, departmentId],
        queryFn: async () => {
            let query = (supabase as any)
                .from('user_roles')
                .select(`user_id, profiles:user_id (id, full_name, email)`)
                .eq('organization_id', organizationId);

            if (departmentId) {
                query = query.eq('department_id', departmentId);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data;
        },
        enabled: !!organizationId,
    });

    // Availability check
    const { data: availability, isFetching: checkingAvailability } = useQuery({
        queryKey: ['staff-availability', selectedStaff, date, startTime, endTime],
        queryFn: async () => {
            if (!selectedStaff || !date || !startTime || !endTime) return null;

            const startDateTime = `${date}T${startTime}:00Z`;
            const endDateTime = `${date}T${endTime}:00Z`;

            const { data, error } = await (supabase as any).rpc('check_staff_clinic_availability', {
                p_staff_id: selectedStaff,
                p_start_time: startDateTime,
                p_end_time: endDateTime
            });

            if (error) throw error;
            return data[0];
        },
        enabled: !!selectedStaff && !!date && !!startTime && !!endTime,
    });

    const assignMutation = useMutation({
        mutationFn: async () => {
            if (!availability?.is_available) {
                throw new Error(availability?.conflict_description || 'Staff member is not available.');
            }

            const { error } = await (supabase as any)
                .from('clinic_assignments')
                .insert({
                    clinic_id: clinic.id,
                    staff_id: selectedStaff,
                    start_time: `${date}T${startTime}:00Z`,
                    end_time: `${date}T${endTime}:00Z`,
                    status: 'scheduled'
                });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clinic-assignments'] });
            toast.success('Staff assigned successfully');
            onOpenChange(false);
            setSelectedStaff('');
        },
        onError: (error) => {
            toast.error(error.message);
        }
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Assign Staff: {clinic?.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Staff Member</Label>
                        <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select staff member" />
                            </SelectTrigger>
                            <SelectContent>
                                {staff?.map((s: any) => (
                                    <SelectItem key={s.user_id} value={s.user_id}>
                                        {s.profiles?.full_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Date</Label>
                        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Start Time</Label>
                            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>End Time</Label>
                            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                        </div>
                    </div>

                    {selectedStaff && date && (
                        <div className="mt-4 p-3 rounded-lg border bg-muted/50">
                            {checkingAvailability ? (
                                <p className="text-sm text-muted-foreground animate-pulse">Checking availability...</p>
                            ) : availability ? (
                                <div className="flex items-start gap-2">
                                    {availability.is_available ? (
                                        <>
                                            <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5" />
                                            <div>
                                                <p className="text-sm font-medium text-emerald-700">Staff is available</p>
                                                <p className="text-xs text-emerald-600">No conflicts with vacations or other clinics.</p>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                                            <div>
                                                <p className="text-sm font-medium text-destructive">Availability Conflict</p>
                                                <p className="text-xs text-red-600 font-semibold">{availability.conflict_description}</p>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        onClick={() => assignMutation.mutate()}
                        disabled={!availability?.is_available || assignMutation.isPending}
                    >
                        {assignMutation.isPending ? 'Assigning...' : 'Confirm Assignment'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
