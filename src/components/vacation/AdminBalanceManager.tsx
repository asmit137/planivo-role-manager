import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingState } from '@/components/layout/LoadingState';
import { toast } from 'sonner';
import { Save, UserPlus, RefreshCcw, Pencil, AlertCircle, Settings2, Users, XCircle } from 'lucide-react';
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
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Leave Management</h2>
                    <p className="text-muted-foreground">Manage role-based defaults and individual staff leave allocations.</p>
                </div>
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
                        <CardHeader>
                            <CardTitle>Role-Based Default Allowances</CardTitle>
                            <CardDescription>
                                Set standard leave days for each role. These will apply to all staff in that role unless an individual override is set.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>System Role</TableHead>
                                            {staffWithBalances?.types.map(type => (
                                                <TableHead key={type.id} className="min-w-[150px]">{type.name}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {appRoles.map((role: string) => (
                                            <TableRow key={role}>
                                                <TableCell className="font-semibold capitalize">
                                                    {role.replace('_', ' ')}
                                                </TableCell>
                                                {staffWithBalances?.types.map(type => {
                                                    const roleDefault = staffWithBalances.defaults.find(
                                                        (d: any) => d.role === role && d.vacation_type_id === type.id
                                                    ) as any;
                                                    const isEditing = editingRoleDefault === `${role}-${type.id}`;

                                                    return (
                                                        <TableCell key={type.id}>
                                                            <div className="flex items-center gap-2">
                                                                <Input
                                                                    type="number"
                                                                    className="w-20"
                                                                    defaultValue={roleDefault?.default_days || 0}
                                                                    disabled={!isEditing}
                                                                    autoFocus={isEditing}
                                                                    onBlur={(e) => {
                                                                        setEditingRoleDefault(null);
                                                                        const val = parseInt(e.target.value);
                                                                        if (val < 0) {
                                                                            toast.error("Default cannot be negative");
                                                                            return;
                                                                        }
                                                                        if (val !== (roleDefault?.default_days || 0)) {
                                                                            setPendingDefaultUpdate({
                                                                                role,
                                                                                typeId: type.id,
                                                                                default_days: val,
                                                                                typeName: type.name
                                                                            });
                                                                        }
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') e.currentTarget.blur();
                                                                        if (e.key === 'Escape') setEditingRoleDefault(null);
                                                                    }}
                                                                />
                                                                {!isEditing && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8"
                                                                        onClick={() => setEditingRoleDefault(`${role}-${type.id}`)}
                                                                    >
                                                                        <Pencil className="h-4 w-4" />
                                                                    </Button>
                                                                )}
                                                            </div>
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
                </TabsContent>

                <TabsContent value="staff" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <CardTitle>Staff Leave Overrides</CardTitle>
                                    <CardDescription>View all staff and adjust individual allowances where special cases apply.</CardDescription>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Input
                                        placeholder="Search staff..."
                                        className="w-[200px] lg:w-[300px]"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                    <Select value={selectedRoleFilter} onValueChange={setSelectedRoleFilter}>
                                        <SelectTrigger className="w-[180px]">
                                            <SelectValue placeholder="All Roles" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Roles</SelectItem>
                                            {appRoles.map(r => (
                                                <SelectItem key={r} value={r} className="capitalize">{r.replace('_', ' ')}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {(searchTerm || selectedRoleFilter !== 'all') && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setSearchTerm('');
                                                setSelectedRoleFilter('all');
                                            }}
                                            className="h-10 text-muted-foreground hover:bg-secondary transition-colors gap-2"
                                        >
                                            <XCircle className="h-4 w-4" />
                                            <span className="text-xs font-semibold uppercase tracking-wider">Clear Filters</span>
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Staff Member</TableHead>
                                            {staffWithBalances?.types.map(type => (
                                                <TableHead key={type.id} className="min-w-[160px]">{type.name}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredStaff.map((member: any) => (
                                            <TableRow key={member.user_id}>
                                                <TableCell className="font-medium">
                                                    <div>
                                                        <p className="flex items-center gap-2">
                                                            {member.profiles?.full_name}
                                                            <Badge variant="outline" className="text-[10px] capitalize">
                                                                {member.role?.replace('_', ' ')}
                                                            </Badge>
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">{member.profiles?.email}</p>
                                                    </div>
                                                </TableCell>
                                                {staffWithBalances?.types.map(type => {
                                                    const individualBalance = staffWithBalances.balances.find(
                                                        b => b.staff_id === member.user_id && b.vacation_type_id === type.id
                                                    );

                                                    const roleDefault = staffWithBalances.defaults.find(
                                                        (d: any) => d.role === member.role && d.vacation_type_id === type.id
                                                    ) as any;

                                                    const isLocalUpdating = updating === `${member.user_id}-${type.id}`;
                                                    const isCustom = !!individualBalance;
                                                    const displayValue = individualBalance ? individualBalance.accrued : (roleDefault?.default_days || 0);

                                                    return (
                                                        <TableCell key={type.id}>
                                                            <div className="flex items-center gap-2">
                                                                <div className="relative">
                                                                    <Input
                                                                        key={`${member.user_id}-${type.id}-${displayValue}-${resetCounter}`}
                                                                        type="number"
                                                                        className={cn(
                                                                            "w-20",
                                                                            !isCustom && "text-muted-foreground italic border-dashed"
                                                                        )}
                                                                        defaultValue={displayValue}
                                                                        disabled={editingCell !== `${member.user_id}-${type.id}` && !isLocalUpdating}
                                                                        onBlur={(e) => {
                                                                            setEditingCell(null);
                                                                            const val = parseInt(e.target.value);
                                                                            if (val < 0) {
                                                                                toast.error("Balance cannot be negative");
                                                                                e.target.value = displayValue.toString();
                                                                                return;
                                                                            }
                                                                            if (val !== displayValue) {
                                                                                setPendingUpdate({
                                                                                    staffId: member.user_id,
                                                                                    typeId: type.id,
                                                                                    accrued: val,
                                                                                    staffName: member.profiles?.full_name || 'Staff member',
                                                                                    typeName: type.name
                                                                                });
                                                                            }
                                                                        }}
                                                                    />
                                                                    {!isCustom && (
                                                                        <span className="absolute -top-4 left-0 text-[10px] text-blue-500 font-medium">Auto</span>
                                                                    )}
                                                                </div>
                                                                {editingCell !== `${member.user_id}-${type.id}` && !isLocalUpdating && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8"
                                                                        onClick={() => setEditingCell(`${member.user_id}-${type.id}`)}
                                                                    >
                                                                        <Pencil className="h-4 w-4" />
                                                                    </Button>
                                                                )}
                                                                {isLocalUpdating && <RefreshCcw className="h-4 w-4 animate-spin text-muted-foreground" />}
                                                            </div>
                                                            {individualBalance && (
                                                                <p className="text-[10px] text-muted-foreground mt-1">
                                                                    Rem: {individualBalance.balance} / Used: {individualBalance.used}
                                                                </p>
                                                            )}
                                                        </TableCell>
                                                    );
                                                })}
                                            </TableRow>
                                        ))}
                                        {filteredStaff.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={staffWithBalances?.types.length + 1} className="h-24 text-center">
                                                    No staff found matching search criteria.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
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
