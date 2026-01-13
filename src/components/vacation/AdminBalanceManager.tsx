import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingState } from '@/components/layout/LoadingState';
import { toast } from 'sonner';
import { Save, UserPlus, RefreshCcw } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';

export function AdminBalanceManager() {
    const { organization: currentOrganization } = useOrganization();

    const queryClient = useQueryClient();
    const currentYear = new Date().getFullYear();
    const [updating, setUpdating] = useState<string | null>(null);

    // Fetch all staff and their balances
    const { data: staffWithBalances, isLoading } = useQuery({
        queryKey: ['admin-leave-balances', currentOrganization?.id, currentYear],
        queryFn: async () => {
            // Get all staff roles in this organization
            const { data: staffRoles, error: rolesError } = await supabase
                .from('user_roles')
                .select(`user_id, profiles:user_id (id, full_name, email)`)
                .eq('organization_id', currentOrganization?.id);

            if (rolesError) throw rolesError;

            // Get all vacation types
            const { data: vTypes, error: typesError } = await supabase
                .from('vacation_types')
                .select('*')
                .eq('is_active', true);

            if (typesError) throw typesError;

            // Get existing balances
            const { data: balances, error: balancesError } = await supabase
                .from('leave_balances')
                .select('*')
                .eq('organization_id', currentOrganization?.id)
                .eq('year', currentYear);

            if (balancesError) throw balancesError;

            return { staff: staffRoles, types: vTypes, balances };
        },
        enabled: !!currentOrganization?.id,
    });

    const updateBalanceMutation = useMutation({
        mutationFn: async ({ staffId, typeId, accrued }: { staffId: string, typeId: string, accrued: number }) => {
            const existing = staffWithBalances?.balances.find(
                b => b.staff_id === staffId && b.vacation_type_id === typeId
            );

            if (existing) {
                const { error } = await supabase
                    .from('leave_balances')
                    .update({
                        accrued,
                        balance: accrued - existing.used,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('leave_balances')
                    .insert({
                        staff_id: staffId,
                        vacation_type_id: typeId,
                        organization_id: currentOrganization?.id,
                        accrued,
                        balance: accrued,
                        used: 0,
                        year: currentYear
                    });
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-leave-balances'] });
            toast.success('Balance updated successfully');
            setUpdating(null);
        },
        onError: (error) => {
            toast.error('Failed to update balance: ' + error.message);
            setUpdating(null);
        }
    });

    if (isLoading) return <LoadingState />;

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Staff Leave Allocation</CardTitle>
                    <CardDescription>Set annual, sick, and emergency leave allowances for the year {currentYear}.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Staff Member</TableHead>
                                    {staffWithBalances?.types.map(type => (
                                        <TableHead key={type.id} className="min-w-[150px]">{type.name}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {staffWithBalances?.staff.map((member: any) => (
                                    <TableRow key={member.user_id}>
                                        <TableCell className="font-medium">
                                            <div>
                                                <p>{member.profiles?.full_name}</p>
                                                <p className="text-xs text-muted-foreground">{member.profiles?.email}</p>
                                            </div>
                                        </TableCell>
                                        {staffWithBalances?.types.map(type => {
                                            const balance = staffWithBalances.balances.find(
                                                b => b.staff_id === member.user_id && b.vacation_type_id === type.id
                                            );
                                            const isLocalUpdating = updating === `${member.user_id}-${type.id}`;

                                            return (
                                                <TableCell key={type.id}>
                                                    <div className="flex items-center gap-2">
                                                        <Input
                                                            type="number"
                                                            className="w-20"
                                                            defaultValue={balance?.accrued || 0}
                                                            onBlur={(e) => {
                                                                const val = parseInt(e.target.value);
                                                                if (val !== (balance?.accrued || 0)) {
                                                                    setUpdating(`${member.user_id}-${type.id}`);
                                                                    updateBalanceMutation.mutate({
                                                                        staffId: member.user_id,
                                                                        typeId: type.id,
                                                                        accrued: val
                                                                    });
                                                                }
                                                            }}
                                                            disabled={isLocalUpdating}
                                                        />
                                                        {isLocalUpdating && <RefreshCcw className="h-4 w-4 animate-spin text-muted-foreground" />}
                                                    </div>
                                                    {balance && (
                                                        <p className="text-[10px] text-muted-foreground mt-1">
                                                            Remaining: {balance.balance} / Used: {balance.used}
                                                        </p>
                                                    )}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
