import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserPlus, MapPin, Calendar as CalendarIcon, Trash2, Edit, Users } from 'lucide-react';
import { ClinicAssignmentDialog } from './ClinicAssignmentDialog';
import { ClinicDialog } from './ClinicDialog';
import { LoadingState } from '@/components/layout/LoadingState';
import { toast } from 'sonner';

export function ClinicList({ organizationId, departmentId }: { organizationId: string, departmentId?: string }) {
    const queryClient = useQueryClient();
    const [selectedClinicForAssign, setSelectedClinicForAssign] = useState<any>(null);
    const [selectedClinicForEdit, setSelectedClinicForEdit] = useState<any>(null);

    const { data: clinics, isLoading } = useQuery({
        queryKey: ['clinics', organizationId, departmentId],
        queryFn: async () => {
            let query = (supabase as any)
                .from('clinics')
                .select(`*, departments(name), assignments:clinic_assignments(*)`)
                .eq('organization_id', organizationId);

            if (departmentId) {
                query = query.eq('department_id', departmentId);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data;
        },
    });

    const deleteClinicMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await (supabase as any).from('clinics').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clinics'] });
            toast.success('Clinic deleted');
        }
    });

    if (isLoading) return <LoadingState />;

    if (!clinics || clinics.length === 0) {
        return (
            <Card className="bg-muted/50 border-dashed">
                <CardContent className="h-40 flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <CalendarIcon className="h-8 w-8 opacity-20" />
                    <p>No clinical rotations defined yet.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clinics.map((clinic) => (
                <Card key={clinic.id} className="overflow-hidden border-l-4" style={{ borderLeftColor: clinic.color }}>
                    <CardHeader className="pb-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle className="text-lg">{clinic.name}</CardTitle>
                                <CardDescription className="flex items-center gap-1 mt-1">
                                    <MapPin className="h-3 w-3" />
                                    {clinic.location || 'No location set'}
                                </CardDescription>
                            </div>
                            <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedClinicForEdit(clinic)}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteClinicMutation.mutate(clinic.id)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Department:</span>
                            <Badge variant="outline">{clinic.departments?.name || 'Shared'}</Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Staff Assigned:</span>
                            <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                <span className="font-semibold">{clinic.assignments?.length || 0}</span>
                            </div>
                        </div>
                        <Button className="w-full gap-2" variant="outline" onClick={() => setSelectedClinicForAssign(clinic)}>
                            <UserPlus className="h-4 w-4" />
                            Assign Staff
                        </Button>
                    </CardContent>
                </Card>
            ))}

            {selectedClinicForAssign && (
                <ClinicAssignmentDialog
                    open={!!selectedClinicForAssign}
                    onOpenChange={() => setSelectedClinicForAssign(null)}
                    clinic={selectedClinicForAssign}
                    organizationId={organizationId}
                    departmentId={departmentId}
                />
            )}

            {selectedClinicForEdit && (
                <ClinicDialog
                    open={!!selectedClinicForEdit}
                    onOpenChange={() => setSelectedClinicForEdit(null)}
                    clinic={selectedClinicForEdit}
                    organizationId={organizationId}
                />
            )}
        </div>
    );
}
