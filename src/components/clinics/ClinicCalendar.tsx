import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { format, isSameDay, parseISO } from 'date-fns';
import { LoadingState } from '@/components/layout/LoadingState';
import { MapPin, Clock, User } from 'lucide-react';

export function ClinicCalendar({ organizationId, departmentId }: { organizationId: string, departmentId?: string }) {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

    const { data: assignments, isLoading } = useQuery({
        queryKey: ['clinic-assignments-calendar', organizationId, departmentId],
        queryFn: async () => {
            let query = (supabase as any)
                .from('clinic_assignments')

                .select(`*, clinic:clinics(*), staff:profiles(*)`);

            if (departmentId) {
                query = query.filter('clinic.department_id', 'eq', departmentId);
            } else {
                query = query.filter('clinic.organization_id', 'eq', organizationId);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data;
        },
    });

    const selectedDateAssignments = useMemo(() => {
        if (!selectedDate || !assignments) return [];
        return assignments.filter(a => isSameDay(parseISO(a.start_time), selectedDate));
    }, [selectedDate, assignments]);

    if (isLoading) return <LoadingState />;

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <Card className="md:col-span-5 lg:col-span-4 h-fit">
                <CardContent className="p-4">
                    <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        className="rounded-md border flex justify-center"
                    />
                </CardContent>
            </Card>

            <Card className="md:col-span-7 lg:col-span-8">
                <CardHeader>
                    <CardTitle className="text-lg">
                        Assignments for {selectedDate ? format(selectedDate, 'PPP') : 'Select a date'}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {selectedDateAssignments.length === 0 ? (
                        <div className="h-40 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                            <p>No clinics scheduled for this date.</p>
                        </div>
                    ) : (
                        selectedDateAssignments.map((assignment: any) => (
                            <div key={assignment.id} className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:shadow-md transition-shadow">
                                <div className="w-1.5 h-12 rounded-full" style={{ backgroundColor: assignment.clinic?.color }} />
                                <div className="flex-1 space-y-1">
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-semibold text-base">{assignment.clinic?.name}</h4>
                                        <Badge variant="outline" className="text-[10px] uppercase">
                                            {assignment.status}
                                        </Badge>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground mt-2">
                                        <div className="flex items-center gap-1.5">
                                            <Clock className="h-3.5 w-3.5" />
                                            {format(parseISO(assignment.start_time), 'HH:mm')} - {format(parseISO(assignment.end_time), 'HH:mm')}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <MapPin className="h-3.5 w-3.5" />
                                            {assignment.clinic?.location || 'Unset'}
                                        </div>
                                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                                            <User className="h-3.5 w-3.5" />
                                            {assignment.staff?.full_name}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
