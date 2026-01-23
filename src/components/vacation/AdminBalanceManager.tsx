import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/layout/LoadingState';
import { toast } from 'sonner';
import { RefreshCcw, AlertCircle, Settings2, Users, XCircle, Pencil } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { RoleDefaultCard } from './RoleDefaultCard';
import { StaffOverrideCard } from './StaffOverrideCard';

export function AdminBalanceManager() {
    const { organization: currentOrganization } = useOrganization();

    const queryClient = useQueryClient();
    const currentYear = new Date().getFullYear();
    const [updating, setUpdating] = useState<string | null>(null);
    const [editingCell, setEditingCell] = useState<string | null>(null);
    const [resetCounter, setResetCounter] = useState(0);
    const [editingRoleDefault, setEditingRoleDefault] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');

    const [pendingUpdate, setPendingUpdate] = useState<{
        staffId: string;
        typeId: string;
        accrued: number;
        staffName: string;
        typeName: string;
    } | null>(null);

    const [pendingDefaultUpdate, setPendingDefaultUpdate] = useState<{
        role: string;
        typeId: string;
        default_days: number;
        typeName: string;
    } | null>(null);

    // Fetch all staff and their balances
    const { data: staffWithBalances, isLoading } = useQuery({
        queryKey: ['admin-leave-balances', currentOrganization?.id, currentYear],
        queryFn: async () => {
            // Get all staff roles in this organization
            const { data: staffRoles, error: rolesError } = await (supabase as any)
                .from('user_roles')
                .select(`user_id, role, profiles:user_id (id, full_name, email)`)
                .eq('organization_id', currentOrganization?.id);

            if (rolesError) throw rolesError;

            // Get all vacation types
            const { data: vTypes, error: typesError } = await supabase
                .from('vacation_types')
                .select('*')
                .eq('is_active', true);

            if (typesError) throw typesError;

            // Get existing individual balances
            const { data: balances, error: balancesError } = await supabase
                .from('leave_balances')
                .select('*')
                .eq('organization_id', currentOrganization?.id)
                .eq('year', currentYear);

            if (balancesError) throw balancesError;

            // Get role-based defaults
            const { data: defaults, error: defaultsError } = await (supabase
                .from('role_vacation_defaults' as any)
                .select('*')
                .eq('organization_id', currentOrganization?.id)
                .eq('year', currentYear) as any);

            if (defaultsError) throw defaultsError;

            return { staff: staffRoles, types: vTypes, balances, defaults };
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

    const updateDefaultMutation = useMutation({
        mutationFn: async ({ role, typeId, default_days }: { role: string, typeId: string, default_days: number }) => {
            const existing = staffWithBalances?.defaults.find(
                (d: any) => d.role === role && d.vacation_type_id === typeId
            ) as any;

            if (existing) {
                const { error } = await (supabase
                    .from('role_vacation_defaults' as any)
                    .update({ default_days })
                    .eq('id', existing.id) as any);
                if (error) throw error;
            } else {
                const { error } = await (supabase
                    .from('role_vacation_defaults' as any)
                    .insert({
                        role: role as any,
                        vacation_type_id: typeId,
                        organization_id: currentOrganization?.id,
                        default_days,
                        year: currentYear
                    }) as any);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-leave-balances'] });
            toast.success('Role default updated successfully');
            setEditingRoleDefault(null);
        },
        onError: (error) => {
            toast.error('Failed to update role default: ' + error.message);
            setEditingRoleDefault(null);
        }
    });

    const filteredStaff = useMemo(() => {
        if (!staffWithBalances?.staff) return [];
        return staffWithBalances.staff.filter((member: any) => {
            const matchesSearch =
                member.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                member.profiles?.email?.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesRole = selectedRoleFilter === 'all' || member.role === selectedRoleFilter;

            return matchesSearch && matchesRole;
        });
    }, [staffWithBalances?.staff, searchTerm, selectedRoleFilter]);

    const appRoles = [
        "staff", "intern", "department_head", "facility_supervisor",
        "workspace_supervisor", "general_admin", "organization_admin"
    ];

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
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Leave Management</h2>
                <p className="text-sm text-muted-foreground max-w-2xl">
                    Manage role-based defaults and individual staff leave allocations.
                </p>
            </div>

            <Tabs defaultValue="staff" className="space-y-6">
                <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
                    <TabsTrigger value="staff" className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Staff Overrides
                    </TabsTrigger>
                    <TabsTrigger value="roles" className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4" />
                        Role Defaults
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="roles" className="space-y-4">
                    <Card>
                        <CardHeader className="p-5 sm:p-6 pb-2 sm:pb-4">
                            <CardTitle className="text-lg sm:text-xl">Role-Based Default Allowances</CardTitle>
                            <CardDescription className="text-sm">
                                Set standard leave days for each role. These will apply to all staff in that role unless an individual override is set.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {appRoles.map((role: string) => (
                                    <RoleDefaultCard
                                        key={role}
                                        role={role}
                                        leaveTypes={staffWithBalances?.types || []}
                                        defaults={staffWithBalances?.defaults || []}
                                        editingId={editingRoleDefault}
                                        setEditingId={setEditingRoleDefault}
                                        onUpdate={(data) => setPendingDefaultUpdate(data)}
                                    />
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="staff" className="space-y-4">
                    <Card>
                        <CardHeader className="p-5 sm:p-6">
                            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                                <div className="space-y-1">
                                    <CardTitle className="text-lg sm:text-xl">Staff Leave Overrides</CardTitle>
                                    <CardDescription className="text-sm">
                                        View all staff and adjust individual allowances where special cases apply.
                                    </CardDescription>
                                </div>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                    <div className="relative flex-1 sm:min-w-[240px]">
                                        <Input
                                            placeholder="Search staff..."
                                            className="h-10 pl-3 pr-10"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                        {searchTerm && (
                                            <button
                                                onClick={() => setSearchTerm('')}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                            >
                                                <XCircle className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                    <Select value={selectedRoleFilter} onValueChange={setSelectedRoleFilter}>
                                        <SelectTrigger className="w-full sm:w-[180px] h-10">
                                            <SelectValue placeholder="All Roles" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Roles</SelectItem>
                                            {appRoles.map(r => (
                                                <SelectItem key={r} value={r} className="capitalize">{r.replace('_', ' ')}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {selectedRoleFilter !== 'all' && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setSelectedRoleFilter('all')}
                                            className="h-10 px-3 text-muted-foreground hover:bg-secondary hidden sm:flex"
                                        >
                                            Clear Role
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredStaff.map((member: any) => (
                                    <StaffOverrideCard
                                        key={`${member.user_id}-${member.role}`}
                                        member={member}
                                        leaveTypes={staffWithBalances?.types || []}
                                        balances={staffWithBalances?.balances || []}
                                        defaults={staffWithBalances?.defaults || []}
                                        editingId={editingCell}
                                        setEditingId={setEditingCell}
                                        updatingId={updating}
                                        onUpdate={(data) => setPendingUpdate(data)}
                                    />
                                ))}
                            </div>

                            {filteredStaff.length === 0 && (
                                <div className="text-center p-12 bg-muted/10 rounded-2xl border-2 border-dashed border-border/50">
                                    <div className="mx-auto w-12 h-12 rounded-full bg-muted/20 flex items-center justify-center mb-4 text-muted-foreground">
                                        <Users className="h-6 w-6" />
                                    </div>
                                    <h3 className="font-semibold text-lg">No staff found</h3>
                                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                                        Try adjusting your search terms or filters to find the staff members you're looking for.
                                    </p>
                                    <Button
                                        variant="outline"
                                        className="mt-6"
                                        onClick={() => { setSearchTerm(''); setSelectedRoleFilter('all'); }}
                                    >
                                        Clear all filters
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Existing Individual confirmation dialog */}
            <AlertDialog open={!!pendingUpdate} onOpenChange={(open) => !open && setPendingUpdate(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-primary" />
                            Confirm Custom Allowance
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Confirming will set a **custom override** for **{pendingUpdate?.staffName}**. They will no longer use the role-based default for **{pendingUpdate?.typeName}**.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => { setResetCounter(c => c + 1); setPendingUpdate(null); }}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (pendingUpdate) {
                                    setUpdating(`${pendingUpdate.staffId}-${pendingUpdate.typeId}`);
                                    updateBalanceMutation.mutate(pendingUpdate);
                                    setPendingUpdate(null);
                                }
                            }}
                        >
                            Confirm Override
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* New Default confirmation dialog */}
            <AlertDialog open={!!pendingDefaultUpdate} onOpenChange={(open) => !open && setPendingDefaultUpdate(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Update Role Default</AlertDialogTitle>
                        <AlertDialogDescription>
                            Changing the default **{pendingDefaultUpdate?.typeName}** for the **{pendingDefaultUpdate?.role.replace('_', ' ')}** role will update all staff who do not have a custom override set.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => { setResetCounter(c => c + 1); setPendingDefaultUpdate(null); }}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (pendingDefaultUpdate) {
                                    updateDefaultMutation.mutate(pendingDefaultUpdate);
                                    setPendingDefaultUpdate(null);
                                }
                            }}
                        >
                            Update All
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
