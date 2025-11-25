import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Filter, Pencil, Mail, FileSpreadsheet } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UnifiedUserCreation from './UnifiedUserCreation';
import BulkUserUpload from './BulkUserUpload';
import UserEditDialog from './UserEditDialog';

const UserManagement = () => {
  const [unifiedCreateOpen, setUnifiedCreateOpen] = useState(false);
  const [filterWorkspace, setFilterWorkspace] = useState<string>('all');
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  const { data: workspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users', filterWorkspace],
    queryFn: async () => {
      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch all user roles with related data
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      // Combine profiles with their roles and workspaces
      const usersWithRoles = profiles?.map((profile) => {
        const roles = userRoles?.filter((ur) => ur.user_id === profile.id) || [];
        return {
          ...profile,
          roles,
        };
      });

      // Filter by workspace if selected
      if (filterWorkspace && filterWorkspace !== 'all') {
        return usersWithRoles?.filter((user) =>
          user.roles.some((r: any) => r.workspace_id === filterWorkspace)
        );
      }

      return usersWithRoles;
    },
  });

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setEditOpen(true);
  };

  const handleUserUpdate = (updatedUser: any) => {
    setEditingUser(updatedUser);
  };

  return (
    <>
      <UnifiedUserCreation open={unifiedCreateOpen} onOpenChange={setUnifiedCreateOpen} />
      <UserEditDialog 
        open={editOpen} 
        onOpenChange={setEditOpen} 
        user={editingUser}
        onUserUpdate={handleUserUpdate}
      />
      
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>User Management</CardTitle>
              <CardDescription>Create and manage user accounts</CardDescription>
            </div>
            <Button onClick={() => setUnifiedCreateOpen(true)} className="bg-gradient-primary">
              <UserPlus className="mr-2 h-4 w-4" />
              Create User
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="list" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="list">
                <Filter className="h-4 w-4 mr-2" />
                User List
              </TabsTrigger>
              <TabsTrigger value="bulk">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Bulk Upload
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="list" className="space-y-4">
              {/* Workspace Filter */}
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm">Filter by Workspace:</Label>
                <Select value={filterWorkspace} onValueChange={setFilterWorkspace}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Workspaces</SelectItem>
                    {workspaces?.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Users Table */}
              {usersLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading users...
                </div>
              ) : users && users.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Roles</TableHead>
                        <TableHead>Workspaces</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user: any) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.full_name}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <Badge variant={user.is_active ? "default" : "secondary"}>
                              {user.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {user.roles.map((roleData: any, idx: number) => (
                                <Badge key={idx} variant="outline">
                                  {roleData.role.replace(/_/g, ' ')}
                                </Badge>
                              ))}
                              {user.roles.length === 0 && (
                                <span className="text-xs text-muted-foreground">No roles</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {user.roles
                                .filter((roleData: any) => roleData.workspace_id)
                                .map((roleData: any, idx: number) => {
                                  const workspace = workspaces?.find((w: any) => w.id === roleData.workspace_id);
                                  if (!workspace) return null;
                                  return (
                                    <Badge key={idx} className="bg-primary/10">
                                      {workspace.name}
                                    </Badge>
                                  );
                                })
                                .filter(Boolean)}
                              {user.roles.every((r: any) => !r.workspace_id) && (
                                <span className="text-xs text-muted-foreground">System-wide</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(user)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No users found</p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="bulk">
              <BulkUserUpload />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
};

export default UserManagement;
