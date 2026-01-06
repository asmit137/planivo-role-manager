import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
    Plus,
    Trash2,
    Shield,
    Loader2,
    AlertCircle,
    Eye,
    Edit,
    ShieldCheck,
    Save,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CustomRole {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
}

interface Module {
    id: string;
    name: string;
    key: string;
}

interface CustomRoleModuleAccess {
    id: string;
    role_id: string;
    module_id: string;
    can_view: boolean;
    can_edit: boolean;
    can_delete: boolean;
    can_admin: boolean;
}

const CustomRoleManagement = () => {
    const [newRoleName, setNewRoleName] = useState('');
    const [newRoleDescription, setNewRoleDescription] = useState('');
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [pendingPermissions, setPendingPermissions] = useState<Record<string, Partial<Omit<CustomRoleModuleAccess, 'id' | 'role_id' | 'module_id'>>>>({});
    const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
    const queryClient = useQueryClient();

    // Fetch all custom roles
    const { data: customRoles, isLoading: rolesLoading } = useQuery({
        queryKey: ['custom-roles'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('custom_roles')
                .select('*')
                .order('name');
            if (error) throw error;
            return data as CustomRole[];
        },
    });

    // Fetch all modules
    const { data: modules, isLoading: modulesLoading } = useQuery({
        queryKey: ['modules-list'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('module_definitions')
                .select('id, name, key')
                .eq('is_active', true)
                .order('name');
            if (error) throw error;
            return data as Module[];
        },
    });

    // Fetch permissions for selected role
    const { data: rolePermissions, isLoading: permissionsLoading } = useQuery({
        queryKey: ['custom-role-permissions', selectedRoleId],
        queryFn: async () => {
            if (!selectedRoleId) return [];
            const { data, error } = await supabase
                .from('custom_role_module_access')
                .select('*')
                .eq('role_id', selectedRoleId);
            if (error) throw error;
            return data as CustomRoleModuleAccess[];
        },
        enabled: !!selectedRoleId,
    });

    // Create new role mutation (Atomic)
    const createRoleMutation = useMutation({
        mutationFn: async () => {
            if (!newRoleName.trim()) throw new Error('Role name is required');

            // 1. Create the role
            const { data: roleData, error: roleError } = await supabase
                .from('custom_roles')
                .insert({ name: newRoleName, description: newRoleDescription })
                .select()
                .single();

            if (roleError) throw roleError;

            // 2. Create permissions for each module
            const permissionInserts = Object.entries(pendingPermissions).map(([moduleId, perms]) => ({
                role_id: roleData.id,
                module_id: moduleId,
                can_view: perms.can_view || false,
                can_edit: perms.can_edit || false,
                can_delete: perms.can_delete || false,
                can_admin: perms.can_admin || false,
            }));

            if (permissionInserts.length > 0) {
                const { error: permError } = await supabase
                    .from('custom_role_module_access')
                    .insert(permissionInserts);
                if (permError) throw permError;
            }

            return roleData;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['custom-roles'] });
            setNewRoleName('');
            setNewRoleDescription('');
            setPendingPermissions({});
            setIsCreateDialogOpen(false);
            setSelectedRoleId(data.id);
            toast.success('Custom role created successfully with permissions');
        },
        onError: (error: any) => {
            toast.error(`Failed to create role: ${error.message}`);
        },
    });

    // Delete role mutation
    const deleteRoleMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('custom_roles')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['custom-roles'] });
            if (selectedRoleId) setSelectedRoleId(null);
            toast.success('Custom role deleted');
        },
        onError: (error: any) => {
            toast.error(`Failed to delete role: ${error.message}`);
        },
    });

    // Update permission mutation
    const updatePermissionMutation = useMutation({
        mutationFn: async ({
            moduleId,
            field,
            value
        }: {
            moduleId: string;
            field: keyof Omit<CustomRoleModuleAccess, 'id' | 'role_id' | 'module_id'>;
            value: boolean;
        }) => {
            if (!selectedRoleId) return;

            const existing = rolePermissions?.find(p => p.module_id === moduleId);

            if (existing) {
                const { error } = await supabase
                    .from('custom_role_module_access')
                    .update({ [field]: value })
                    .eq('id', existing.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('custom_role_module_access')
                    .insert({
                        role_id: selectedRoleId,
                        module_id: moduleId,
                        [field]: value
                    });
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['custom-role-permissions', selectedRoleId] });
        },
        onError: (error: any) => {
            toast.error(`Failed to update permission: ${error.message}`);
        },
    });

    const handlePermissionChange = (moduleId: string, field: keyof Omit<CustomRoleModuleAccess, 'id' | 'role_id' | 'module_id'>, value: boolean) => {
        if (isCreateDialogOpen) {
            setPendingPermissions(prev => ({
                ...prev,
                [moduleId]: {
                    ...(prev[moduleId] || {}),
                    [field]: value
                }
            }));
        } else {
            updatePermissionMutation.mutate({ moduleId, field, value });
        }
    };

    const getModuleDescription = (key: string) => {
        const descriptions: Record<string, string> = {
            'core': 'Authentication, Profile, and Session Management',
            'user_management': 'Create and manage user accounts and roles',
            'organization': 'Manage workspaces, facilities, and departments',
            'staff_management': 'Staff assignment and specialty management',
            'vacation_planning': 'Create, approve, and manage vacation plans with conflict detection',
            'task_management': 'Create, assign, and track tasks across the organization',
            'scheduling': 'Staff scheduling and shift management',
            'training': 'Manage training sessions and events for the organization',
            'messaging': 'Internal messaging and communication system',
            'notifications': 'System notifications and alerts',
            'analytics': 'View and analyze system reports and metrics',
            'inventory': 'Manage organization assets and supplies',
            'payroll': 'Process and manage staff compensation',
            'feedback': 'Collect and review internal feedback',
            'security': 'Monitor system logs and security events'
        };
        return descriptions[key] || 'Configure module access and permissions';
    };

    const selectedRole = customRoles?.find(r => r.id === selectedRoleId);

    if (rolesLoading || modulesLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold tracking-tight">Custom Roles</h2>
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="h-4 w-4 mr-2" />
                            Create New Role
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
                        <DialogHeader className="p-6 pb-2">
                            <DialogTitle>Create Custom Role</DialogTitle>
                            <DialogDescription>
                                Set the role name and configure module permissions before saving.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="p-6 pt-0 space-y-6 overflow-hidden flex flex-col">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="roleName">Role Name</Label>
                                    <Input
                                        id="roleName"
                                        placeholder="e.g. Intern"
                                        value={newRoleName}
                                        onChange={(e) => setNewRoleName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="roleDesc">Description (Optional)</Label>
                                    <Input
                                        id="roleDesc"
                                        placeholder="Briefly describe this role"
                                        value={newRoleDescription}
                                        onChange={(e) => setNewRoleDescription(e.target.value)}
                                    />
                                </div>
                            </div>

                            <Separator />

                            <div className="flex-1 overflow-hidden">
                                <Label className="mb-4 block text-base font-semibold">Module Permissions</Label>
                                <ScrollArea className="h-[400px] pr-4">
                                    <div className="space-y-4 pb-4">
                                        {modules?.map((module) => (
                                            <Card key={module.id} className="bg-muted/30 border-muted-foreground/20">
                                                <CardContent className="p-4 space-y-4">
                                                    <div>
                                                        <h4 className="font-semibold text-sm">{module.name}</h4>
                                                        <p className="text-xs text-muted-foreground">{getModuleDescription(module.key)}</p>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                                        <div className="flex items-center justify-between sm:justify-start space-x-3">
                                                            <Switch
                                                                id={`new-view-${module.id}`}
                                                                checked={pendingPermissions[module.id]?.can_view || false}
                                                                onCheckedChange={(checked) => handlePermissionChange(module.id, 'can_view', checked)}
                                                            />
                                                            <Label htmlFor={`new-view-${module.id}`} className="text-sm font-medium cursor-pointer flex items-center gap-2">
                                                                <Eye className="h-4 w-4 text-primary" /> View
                                                            </Label>
                                                        </div>
                                                        <div className="flex items-center justify-between sm:justify-start space-x-3">
                                                            <Switch
                                                                id={`new-edit-${module.id}`}
                                                                checked={pendingPermissions[module.id]?.can_edit || false}
                                                                onCheckedChange={(checked) => handlePermissionChange(module.id, 'can_edit', checked)}
                                                            />
                                                            <Label htmlFor={`new-edit-${module.id}`} className="text-sm font-medium cursor-pointer flex items-center gap-2">
                                                                <Edit className="h-4 w-4 text-primary" /> Edit
                                                            </Label>
                                                        </div>
                                                        <div className="flex items-center justify-between sm:justify-start space-x-3">
                                                            <Switch
                                                                id={`new-delete-${module.id}`}
                                                                checked={pendingPermissions[module.id]?.can_delete || false}
                                                                onCheckedChange={(checked) => handlePermissionChange(module.id, 'can_delete', checked)}
                                                            />
                                                            <Label htmlFor={`new-delete-${module.id}`} className="text-sm font-medium cursor-pointer flex items-center gap-2">
                                                                <Trash2 className="h-4 w-4 text-primary" /> Delete
                                                            </Label>
                                                        </div>
                                                        <div className="flex items-center justify-between sm:justify-start space-x-3">
                                                            <Switch
                                                                id={`new-admin-${module.id}`}
                                                                checked={pendingPermissions[module.id]?.can_admin || false}
                                                                onCheckedChange={(checked) => handlePermissionChange(module.id, 'can_admin', checked)}
                                                            />
                                                            <Label htmlFor={`new-admin-${module.id}`} className="text-sm font-medium cursor-pointer flex items-center gap-2">
                                                                <ShieldCheck className="h-4 w-4 text-primary" /> Admin
                                                            </Label>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>

                        <DialogFooter className="p-6 bg-muted/50 border-t">
                            <Button
                                variant="outline"
                                onClick={() => setIsCreateDialogOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={() => createRoleMutation.mutate()}
                                disabled={createRoleMutation.isPending || !newRoleName.trim()}
                            >
                                {createRoleMutation.isPending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Create Role
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left Column: Role List */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Available Roles</CardTitle>
                            <CardDescription>Select a role to manage its permissions</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y">
                                {customRoles?.length === 0 ? (
                                    <div className="p-4 text-center text-sm text-muted-foreground">
                                        No custom roles created yet.
                                    </div>
                                ) : (
                                    customRoles?.map((role) => (
                                        <div
                                            key={role.id}
                                            className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${selectedRoleId === role.id ? 'bg-primary/5 border-l-4 border-primary' : 'hover:bg-muted'
                                                }`}
                                            onClick={() => setSelectedRoleId(role.id)}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium truncate">{role.name}</p>
                                                {role.description && (
                                                    <p className="text-xs text-muted-foreground truncate">{role.description}</p>
                                                )}
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm('Are you sure you want to delete this role?')) {
                                                        deleteRoleMutation.mutate(role.id);
                                                    }
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Permission Matrix for selected role */}
                <div className="md:col-span-2">
                    {selectedRoleId ? (
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                                <div>
                                    <CardTitle>Permissions: {selectedRole?.name}</CardTitle>
                                    <CardDescription>Update module access for this role</CardDescription>
                                </div>
                                <ShieldCheck className="h-6 w-6 text-primary" />
                            </CardHeader>
                            <CardContent>
                                {permissionsLoading ? (
                                    <div className="flex items-center justify-center p-8">
                                        <Loader2 className="h-6 w-6 animate-spin" />
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {modules?.map((module) => {
                                            const perm = rolePermissions?.find(p => p.module_id === module.id);
                                            return (
                                                <Card key={module.id} className="bg-muted/30 border-muted-foreground/20">
                                                    <CardContent className="p-4 space-y-4">
                                                        <div>
                                                            <h4 className="font-semibold text-sm">{module.name}</h4>
                                                            <p className="text-xs text-muted-foreground">{getModuleDescription(module.key)}</p>
                                                        </div>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                                            <div className="flex items-center justify-between sm:justify-start space-x-3">
                                                                <Switch
                                                                    id={`view-${module.id}`}
                                                                    checked={perm?.can_view || false}
                                                                    onCheckedChange={(checked) => handlePermissionChange(module.id, 'can_view', checked)}
                                                                />
                                                                <Label htmlFor={`view-${module.id}`} className="text-sm font-medium cursor-pointer flex items-center gap-2">
                                                                    <Eye className="h-4 w-4 text-primary" /> View
                                                                </Label>
                                                            </div>
                                                            <div className="flex items-center justify-between sm:justify-start space-x-3">
                                                                <Switch
                                                                    id={`edit-${module.id}`}
                                                                    checked={perm?.can_edit || false}
                                                                    onCheckedChange={(checked) => handlePermissionChange(module.id, 'can_edit', checked)}
                                                                />
                                                                <Label htmlFor={`edit-${module.id}`} className="text-sm font-medium cursor-pointer flex items-center gap-2">
                                                                    <Edit className="h-4 w-4 text-primary" /> Edit
                                                                </Label>
                                                            </div>
                                                            <div className="flex items-center justify-between sm:justify-start space-x-3">
                                                                <Switch
                                                                    id={`delete-${module.id}`}
                                                                    checked={perm?.can_delete || false}
                                                                    onCheckedChange={(checked) => handlePermissionChange(module.id, 'can_delete', checked)}
                                                                />
                                                                <Label htmlFor={`delete-${module.id}`} className="text-sm font-medium cursor-pointer flex items-center gap-2">
                                                                    <Trash2 className="h-4 w-4 text-primary" /> Delete
                                                                </Label>
                                                            </div>
                                                            <div className="flex items-center justify-between sm:justify-start space-x-3">
                                                                <Switch
                                                                    id={`admin-${module.id}`}
                                                                    checked={perm?.can_admin || false}
                                                                    onCheckedChange={(checked) => handlePermissionChange(module.id, 'can_admin', checked)}
                                                                />
                                                                <Label htmlFor={`admin-${module.id}`} className="text-sm font-medium cursor-pointer flex items-center gap-2">
                                                                    <ShieldCheck className="h-4 w-4 text-primary" /> Admin
                                                                </Label>
                                                            </div>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                    </div>
                                )}

                                <Alert className="mt-6">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription>
                                        Changes are saved automatically. Users assigned to this role will receive updated permissions instantly.
                                    </AlertDescription>
                                </Alert>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="h-full flex items-center justify-center border-dashed">
                            <div className="text-center p-12">
                                <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                                <h3 className="text-lg font-medium text-muted-foreground">Select a role to view/edit permissions</h3>
                                <p className="text-sm text-muted-foreground">Available and newly created roles are listed on the left.</p>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );

};

export default CustomRoleManagement;
