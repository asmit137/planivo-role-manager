import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingState } from '@/components/layout/LoadingState';
import { toast } from 'sonner';
import { Save, UserPlus, RefreshCcw, Pencil, AlertCircle } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function AdminBalanceManager() {
    const { organization: currentOrganization } = useOrganization();

    const queryClient = useQueryClient();
    const currentYear = new Date().getFullYear();
    const [updating, setUpdating] = useState<string | null>(null);
    const [editingCell, setEditingCell] = useState<string | null>(null);
    const [resetCounter, setResetCounter] = useState(0);
    const [pendingUpdate, setPendingUpdate] = useState<{
        staffId: string;
        typeId: string;
        accrued: number;
        staffName: string;
        typeName: string;
    } | null>(null);

    // Fetch all staff and their balances
    const { data: staffWithBalances, isLoading } = useQuery({
        queryKey: ['admin-leave-balances', currentOrganization?.id, currentYear],
        queryFn: async () => {
            // Get all staff roles in this organization
            const { data: staffRoles, error: rolesError } = await (supabase as any)
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

    if (currentOrganization?.id === 'all') {
        return (
            <div className="space-y-6">
                <Card>
                    <CardContent className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center min-h-[200px]">
                        <p className="text-lg font-medium mb-2">Select Organization</p>
                        <p>Please select a specific organization from the sidebar to manage leave balances.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (currentOrganization?.vacation_mode === 'planning') {
        return (
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Staff Leave Allocation</CardTitle>
                        <CardDescription>Set annual, sick, and emergency leave allowances for the year {currentYear}.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center min-h-[200px]">
                        <p className="text-lg font-medium mb-2">Planning Mode Active</p>
                        <p>This organization is currently in planning mode. Leave balances are not managed in this mode.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

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
                                                            key={`${member.user_id}-${type.id}-${balance?.accrued || 0}-${resetCounter}`}
                                                            type="number"
                                                            className="w-20"
                                                            defaultValue={balance?.accrued || 0}
                                                            disabled={editingCell !== `${member.user_id}-${type.id}` && !isLocalUpdating}
                                                            autoFocus={editingCell === `${member.user_id}-${type.id}`}
                                                            onBlur={(e) => {
                                                                setEditingCell(null);
                                                                const val = parseInt(e.target.value);

                                                                if (val < 0) {
                                                                    toast.error("Balance cannot be negative");
                                                                    e.target.value = (balance?.accrued || 0).toString(); // Reset input
                                                                    return;
                                                                }

                                                                if (val !== (balance?.accrued || 0)) {
                                                                    setPendingUpdate({
                                                                        staffId: member.user_id,
                                                                        typeId: type.id,
                                                                        accrued: val,
                                                                        staffName: member.profiles?.full_name || 'Staff member',
                                                                        typeName: type.name
                                                                    });
                                                                }
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.currentTarget.blur();
                                                                }
                                                            }}
                                                        />
                                                        {editingCell !== `${member.user_id}-${type.id}` && !isLocalUpdating && (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                                onClick={() => setEditingCell(`${member.user_id}-${type.id}`)}
                                                            >
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                        )}
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

            <AlertDialog open={!!pendingUpdate} onOpenChange={(open) => !open && setPendingUpdate(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-primary" />
                            Confirm Leave Change
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to change the **{pendingUpdate?.typeName}** allowance for **{pendingUpdate?.staffName}** to **{pendingUpdate?.accrued}** days?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            onClick={() => {
                                setResetCounter(prev => prev + 1);
                                setPendingUpdate(null);
                            }}
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (pendingUpdate) {
                                    setUpdating(`${pendingUpdate.staffId}-${pendingUpdate.typeId}`);
                                    updateBalanceMutation.mutate({
                                        staffId: pendingUpdate.staffId,
                                        typeId: pendingUpdate.typeId,
                                        accrued: pendingUpdate.accrued
                                    });
                                    setPendingUpdate(null);
                                }
                            }}
                        >
                            Confirm Change
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
