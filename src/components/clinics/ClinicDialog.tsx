import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface ClinicDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organizationId: string;
    departmentId?: string;
    clinic?: any;
}

export function ClinicDialog({ open, onOpenChange, organizationId, departmentId, clinic }: ClinicDialogProps) {
    const queryClient = useQueryClient();
    const { register, handleSubmit, reset, setValue } = useForm();

    const { data: departments } = useQuery({
        queryKey: ['departments', organizationId],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from('departments')
                .select('id, name')
                .eq('organization_id', organizationId);
            if (error) throw error;
            return data;
        },
        enabled: !!organizationId,
    });

    useEffect(() => {
        if (clinic) {
            reset({
                name: clinic.name,
                description: clinic.description,
                location: clinic.location,
                department_id: clinic.department_id,
                color: clinic.color
            });
        } else {
            reset({
                name: '',
                description: '',
                location: '',
                department_id: '',
                color: '#10b981'
            });
        }
    }, [clinic, reset]);

    const mutation = useMutation({
        mutationFn: async (values: any) => {
            if (clinic) {
                const { error } = await (supabase as any)
                    .from('clinics')
                    .update({ ...values, updated_at: new Date().toISOString() })
                    .eq('id', clinic.id);
                if (error) throw error;
            } else {
                const { error } = await (supabase as any)
                    .from('clinics')
                    .insert({
                        ...values,
                        organization_id: organizationId,
                        department_id: values.department_id || departmentId
                    });
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clinics'] });
            toast.success(clinic ? 'Clinic updated' : 'Clinic created');
            onOpenChange(false);
        },
        onError: (error) => {
            toast.error('Operation failed: ' + error.message);
        }
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{clinic ? 'Edit Clinic' : 'Add New Clinic'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Clinic Name</Label>
                        <Input id="name" {...register('name', { required: true })} placeholder="e.g. Cardiology OPD" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="department">Department</Label>
                        <Select onValueChange={(v) => setValue('department_id', v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select department" />
                            </SelectTrigger>
                            <SelectContent>
                                {departments?.map(d => (
                                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="location">Location</Label>
                        <Input id="location" {...register('location')} placeholder="e.g. Room 204, Wing B" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="description">Description (Optional)</Label>
                        <Textarea id="description" {...register('description')} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="color">Theme Color</Label>
                        <div className="flex gap-2 items-center">
                            <Input type="color" className="w-12 h-10 p-1" {...register('color')} />
                            <span className="text-sm text-muted-foreground">Emerald by default</span>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? 'Saving...' : (clinic ? 'Update' : 'Create')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
