import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  User,
  Search,
  Plus,
  Trash2,
  Eye,
  Edit,
  Shield,
  Loader2,
  UserCog
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface UserModuleAccessEntry {
  id: string;
  user_id: string;
  module_id: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_admin: boolean;
  is_override: boolean;
  profiles?: {
    id: string;
    full_name: string;
    email: string;
  };
  module_definitions?: {
    id: string;
    name: string;
    key: string;
  };
}

interface Module {
  id: string;
  name: string;
  key: string;
  description: string | null;
  is_active: boolean;
}

const UserModuleAccess = () => {
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newPermissions, setNewPermissions] = useState({
    can_view: true,
    can_edit: false,
    can_delete: false,
    can_admin: false,
  });

  const queryClient = useQueryClient();

  const { data: modules, isLoading: modulesLoading } = useQuery({
    queryKey: ['modules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_definitions')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as Module[];
    },
  });

  const { data: userAccess, isLoading: accessLoading } = useQuery({
    queryKey: ['user-module-access-list', selectedModule],
    queryFn: async () => {
      if (!selectedModule) return [];

      const { data, error } = await supabase
        .from('user_module_access')
        .select(`
          *,
          profiles!user_module_access_user_id_fkey(id, full_name, email),
          module_definitions!user_module_access_module_id_fkey(id, name, key)
        `)
        .eq('module_id', selectedModule);

      if (error) throw error;
      return data as UserModuleAccessEntry[];
    },
    enabled: !!selectedModule,
  });

  const { data: users } = useQuery({
    queryKey: ['all-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      return data;
    },
  });

  const addUserAccessMutation = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();

      const { error } = await supabase
        .from('user_module_access')
        .insert({
          user_id: selectedUserId,
          module_id: selectedModule,
          can_view: newPermissions.can_view,
          can_edit: newPermissions.can_edit,
          can_delete: newPermissions.can_delete,
          can_admin: newPermissions.can_admin,
          is_override: true,
          created_by: session?.session?.user?.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-module-access-list'] });
      toast.success('User access added successfully');
      setAddUserDialogOpen(false);
      setSelectedUserId('');
      setNewPermissions({ can_view: true, can_edit: false, can_delete: false, can_admin: false });
    },
    onError: (error: any) => {
      if (error.message?.includes('duplicate key')) {
        toast.error('This user already has custom access for this module');
      } else {
        toast.error(`Failed to add user access: ${error.message}`);
      }
    },
  });

  const updateUserAccessMutation = useMutation({
    mutationFn: async ({
      accessId,
      permissions
    }: {
      accessId: string;
      permissions: Partial<UserModuleAccessEntry>
    }) => {
      const { error } = await supabase
        .from('user_module_access')
        .update({ ...permissions, updated_at: new Date().toISOString() })
        .eq('id', accessId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-module-access-list'] });
      toast.success('Permissions updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update permissions: ${error.message}`);
    },
  });

  const deleteUserAccessMutation = useMutation({
    mutationFn: async (accessId: string) => {
      const { error } = await supabase
        .from('user_module_access')
        .delete()
        .eq('id', accessId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-module-access-list'] });
      toast.success('User access removed successfully');
    },
    onError: (error) => {
      toast.error(`Failed to remove access: ${error.message}`);
    },
  });

  const handlePermissionChange = (
    accessId: string,
    field: 'can_view' | 'can_edit' | 'can_delete' | 'can_admin',
    value: boolean
  ) => {
    updateUserAccessMutation.mutate({
      accessId,
      permissions: { [field]: value },
    });
  };

  const handleDeleteAccess = (accessId: string) => {
    if (confirm('Are you sure you want to remove this user\'s custom access?')) {
      deleteUserAccessMutation.mutate(accessId);
    }
  };

  const filteredAccess = userAccess?.filter(access => {
    if (!searchQuery) return true;
    const lowerSearch = searchQuery.toLowerCase();
    return (
      access.profiles?.full_name?.toLowerCase().includes(lowerSearch) ||
      access.profiles?.email?.toLowerCase().includes(lowerSearch)
    );
  });

  // Filter out users who already have access to the selected module
  const availableUsers = users?.filter(user =>
    !userAccess?.some(access => access.user_id === user.id)
  );

  if (modulesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            User-Specific Module Access
          </CardTitle>
          <CardDescription>
            Grant or restrict module access for individual users, overriding their role-based permissions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              User-specific permissions take priority over role-based permissions.
              Use this to grant additional access or restrict access for specific users.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col gap-4">
            <div className="w-full">
              <Label className="text-xs sm:text-sm mb-1.5 block">Select Module</Label>
              <Select value={selectedModule} onValueChange={setSelectedModule}>
                <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm">
                  <SelectValue placeholder="Choose a module to manage" />
                </SelectTrigger>
                <SelectContent>
                  {modules?.map((module) => (
                    <SelectItem key={module.id} value={module.id} className="text-xs sm:text-sm">
                      {module.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedModule && (
              <div className="flex flex-col xs:flex-row items-stretch xs:items-end gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 sm:h-10 text-xs sm:text-sm w-full"
                  />
                </div>
                <Button onClick={() => setAddUserDialogOpen(true)} className="h-9 sm:h-10 text-xs sm:text-sm shrink-0">
                  <Plus className="h-3.5 w-3.5 mr-2" />
                  Add User
                </Button>
              </div>
            )}
          </div>

          {selectedModule && (
            <div className="mt-4">
              {accessLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : filteredAccess && filteredAccess.length > 0 ? (
                <div className="space-y-4">
                  {/* Desktop Table */}
                  <div className="hidden md:block border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead className="text-center">View</TableHead>
                          <TableHead className="text-center">Edit</TableHead>
                          <TableHead className="text-center">Delete</TableHead>
                          <TableHead className="text-center">Admin</TableHead>
                          <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAccess.map((access) => (
                          <TableRow key={access.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <User className="h-4 w-4 text-primary" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-sm truncate">{access.profiles?.full_name || 'Unknown'}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{access.profiles?.email}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={access.can_view}
                                onCheckedChange={(checked) => handlePermissionChange(access.id, 'can_view', checked as boolean)}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={access.can_edit}
                                onCheckedChange={(checked) => handlePermissionChange(access.id, 'can_edit', checked as boolean)}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={access.can_delete}
                                onCheckedChange={(checked) => handlePermissionChange(access.id, 'can_delete', checked as boolean)}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={access.can_admin}
                                onCheckedChange={(checked) => handlePermissionChange(access.id, 'can_admin', checked as boolean)}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteAccess(access.id)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Card List */}
                  <div className="md:hidden space-y-3">
                    {filteredAccess.map((access) => (
                      <Card key={access.id} className="border border-border/60 bg-muted/20">
                        <CardContent className="p-3 space-y-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <User className="h-4 w-4 text-primary" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-sm truncate">{access.profiles?.full_name || 'Unknown'}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{access.profiles?.email}</p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteAccess(access.id)}
                              className="text-destructive h-7 w-7 p-0 shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label: 'View', icon: Eye, field: 'can_view' },
                              { label: 'Edit', icon: Edit, field: 'can_edit' },
                              { label: 'Delete', icon: Trash2, field: 'can_delete' },
                              { label: 'Admin', icon: Shield, field: 'can_admin' }
                            ].map((perm) => (
                              <div key={perm.label} className="flex items-center justify-between bg-card p-2 rounded border border-border/40">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <perm.icon className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="text-[10px] font-medium">{perm.label}</span>
                                </div>
                                <Checkbox
                                  checked={(access as any)[perm.field]}
                                  onCheckedChange={(checked) => handlePermissionChange(access.id, perm.field as any, checked as boolean)}
                                  className="scale-90"
                                />
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <UserCog className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No user-specific access configured for this module</p>
                  <p className="text-sm mt-1">Click "Add User" to grant custom permissions</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={addUserDialogOpen} onOpenChange={setAddUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User Access</DialogTitle>
            <DialogDescription>
              Grant custom module permissions to a specific user
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a user" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers?.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center gap-2">
                        <span>{user.full_name}</span>
                        <span className="text-muted-foreground">({user.email})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Permissions</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="new-can-view"
                    checked={newPermissions.can_view}
                    onCheckedChange={(checked) =>
                      setNewPermissions({ ...newPermissions, can_view: checked as boolean })
                    }
                  />
                  <Label htmlFor="new-can-view" className="font-normal">Can View</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="new-can-edit"
                    checked={newPermissions.can_edit}
                    onCheckedChange={(checked) =>
                      setNewPermissions({ ...newPermissions, can_edit: checked as boolean })
                    }
                  />
                  <Label htmlFor="new-can-edit" className="font-normal">Can Edit</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="new-can-delete"
                    checked={newPermissions.can_delete}
                    onCheckedChange={(checked) =>
                      setNewPermissions({ ...newPermissions, can_delete: checked as boolean })
                    }
                  />
                  <Label htmlFor="new-can-delete" className="font-normal">Can Delete</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="new-can-admin"
                    checked={newPermissions.can_admin}
                    onCheckedChange={(checked) =>
                      setNewPermissions({ ...newPermissions, can_admin: checked as boolean })
                    }
                  />
                  <Label htmlFor="new-can-admin" className="font-normal">Can Admin</Label>
                </div>
              </div>
            </div>

            <Button
              onClick={() => addUserAccessMutation.mutate()}
              className="w-full"
              disabled={!selectedUserId || addUserAccessMutation.isPending}
            >
              {addUserAccessMutation.isPending ? 'Adding...' : 'Add User Access'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserModuleAccess;