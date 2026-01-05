import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingState } from '@/components/layout/LoadingState';
import { Search, Users, Building, UserPlus, X, Phone, Mail, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUserIds: string[];
  onSelectionChange: (userIds: string[]) => void;
  organizationId?: string;
  title?: string;
}

interface SelectableUser {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  department_name?: string;
  facility_name?: string;
}

interface UserGroup {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
}

const UserSelectionDialog = ({
  open,
  onOpenChange,
  selectedUserIds,
  onSelectionChange,
  organizationId,
  title = 'Select Users',
}: UserSelectionDialogProps) => {
  const { user } = useAuth();
  const { data: roles } = useUserRole();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'groups' | 'departments' | 'users'>('users');

  // Determine user's scope
  const userScope = useMemo(() => {
    if (!roles?.length) return null;

    const isSuperAdmin = roles.some(r => r.role === 'super_admin');
    const generalAdmin = roles.find(r => r.role === 'general_admin');
    const workplaceSupervisor = roles.find(r => r.role === 'workplace_supervisor');
    const facilitySupervisor = roles.find(r => r.role === 'facility_supervisor');
    const departmentHead = roles.find(r => r.role === 'department_head');

    if (isSuperAdmin) return { type: 'all' as const };
    if (generalAdmin) return { type: 'workspace' as const, workspaceId: generalAdmin.workspace_id };
    if (workplaceSupervisor) return { type: 'workspace' as const, workspaceId: workplaceSupervisor.workspace_id };
    if (facilitySupervisor) return { type: 'facility' as const, facilityId: facilitySupervisor.facility_id };
    if (departmentHead) return { type: 'department' as const, departmentId: departmentHead.department_id, facilityId: departmentHead.facility_id, workspaceId: departmentHead.workspace_id };
    return null;
  }, [roles]);

  // Fetch users based on scope
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['selectable-users', userScope, organizationId],
    queryFn: async () => {
      if (!userScope) return [];

      let userIds: string[] = [];

      if (userScope.type === 'all' && organizationId) {
        // Get all users in the organization
        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('id')
          .eq('organization_id', organizationId);

        if (workspaces?.length) {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('user_id, workspace_id, facility_id, department_id, departments(name), facilities:facility_id(name)')
            .in('workspace_id', workspaces.map(w => w.id));

          userIds = [...new Set(roleData?.map(r => r.user_id) || [])];
        }
      } else if (userScope.type === 'workspace' && userScope.workspaceId) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('workspace_id', userScope.workspaceId);
        userIds = [...new Set(roleData?.map(r => r.user_id) || [])];
      } else if (userScope.type === 'facility' && userScope.facilityId) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('facility_id', userScope.facilityId);
        userIds = [...new Set(roleData?.map(r => r.user_id) || [])];
      } else if (userScope.type === 'department' && (userScope as any).departmentId) {
        const fid = (userScope as any).facilityId;
        if (fid) {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('facility_id', fid);
          userIds = [...new Set(roleData?.map(r => r.user_id) || [])];
        } else {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('department_id', (userScope as any).departmentId);
          userIds = [...new Set(roleData?.map(r => r.user_id) || [])];
        }
      }

      if (!userIds.length) return [];

      // Get profiles with department info
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone')
        .in('id', userIds)
        .eq('is_active', true);

      // Get department/facility info for each user
      const { data: roleData } = await supabase
        .from('user_roles')
        .select(`
          user_id,
          departments (name),
          facilities:facility_id (name)
        `)
        .in('user_id', userIds);

      return profiles?.map(p => {
        const userRole = roleData?.find(r => r.user_id === p.id);
        return {
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          department_name: (userRole?.departments as any)?.name || 'No Department',
          facility_name: (userRole?.facilities as any)?.name || 'No Facility',
        };
      }) as SelectableUser[];
    },
    enabled: open && !!userScope,
  });

  // Fetch user groups
  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ['user-groups', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_groups')
        .select(`
          id,
          name,
          description,
          user_group_members (id)
        `)
        .order('name');

      if (error) throw error;

      return data?.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        member_count: g.user_group_members?.length || 0,
      })) as UserGroup[];
    },
    enabled: open,
  });

  // Fetch departments for quick selection
  const { data: departments } = useQuery({
    queryKey: ['departments-for-selection', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data: workspaces } = await supabase
        .from('workspaces')
        .select('id')
        .eq('organization_id', organizationId);

      if (!workspaces?.length) return [];

      const { data: facilities } = await supabase
        .from('facilities')
        .select('id, name')
        .in('workspace_id', workspaces.map(w => w.id));

      if (!facilities?.length) return [];

      const { data: depts } = await supabase
        .from('departments')
        .select('id, name, facility_id')
        .in('facility_id', facilities.map(f => f.id))
        .eq('is_template', false);

      const facilityMap = Object.fromEntries(facilities.map(f => [f.id, f.name]));

      return depts?.map(d => ({
        id: d.id,
        name: d.name,
        facility_name: facilityMap[d.facility_id] || 'Unknown',
      })) || [];
    },
    enabled: open && !!organizationId,
  });

  // Filter users based on search
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    if (!searchTerm) return users;

    const term = searchTerm.toLowerCase();
    return users.filter(u =>
      u.full_name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (u.phone && u.phone.includes(term))
    );
  }, [users, searchTerm]);

  const toggleUser = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      onSelectionChange(selectedUserIds.filter(id => id !== userId));
    } else {
      onSelectionChange([...selectedUserIds, userId]);
    }
  };

  const addGroupMembers = async (groupId: string) => {
    const { data: members } = await supabase
      .from('user_group_members')
      .select('user_id')
      .eq('group_id', groupId);

    if (members?.length) {
      const newIds = members.map(m => m.user_id).filter(id => !selectedUserIds.includes(id));
      onSelectionChange([...selectedUserIds, ...newIds]);
    }
  };

  const addDepartmentMembers = async (departmentId: string) => {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('department_id', departmentId);

    if (roles?.length) {
      const newIds = roles.map(r => r.user_id).filter(id => !selectedUserIds.includes(id));
      onSelectionChange([...selectedUserIds, ...newIds]);
    }
  };

  const selectAll = () => {
    if (users) {
      onSelectionChange([...new Set([...selectedUserIds, ...users.map(u => u.id)])]);
    }
  };

  const clearSelection = () => {
    onSelectionChange([]);
  };

  const selectedUsers = users?.filter(u => selectedUserIds.includes(u.id)) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* Selected users preview */}
        {selectedUserIds.length > 0 && (
          <div className="flex flex-wrap gap-1 p-2 bg-muted/50 rounded-lg max-h-20 overflow-y-auto">
            {selectedUsers.slice(0, 10).map(user => (
              <Badge key={user.id} variant="secondary" className="gap-1">
                {user.full_name}
                <button
                  onClick={() => toggleUser(user.id)}
                  className="hover:bg-destructive/20 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {selectedUserIds.length > 10 && (
              <Badge variant="outline">+{selectedUserIds.length - 10} more</Badge>
            )}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              All Users
            </TabsTrigger>
            <TabsTrigger value="groups" className="gap-2">
              <UsersRound className="h-4 w-4" />
              Groups
              {groups && groups.length > 0 && (
                <Badge variant="secondary" className="ml-1">{groups.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="departments" className="gap-2">
              <Building className="h-4 w-4" />
              Departments
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="flex-1 mt-4">
            {usersLoading ? (
              <LoadingState message="Loading users..." />
            ) : (
              <ScrollArea className="h-[300px] border rounded-md">
                <div className="p-2 space-y-1">
                  {filteredUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No users found
                    </p>
                  ) : (
                    filteredUsers.map(user => (
                      <label
                        key={user.id}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                          selectedUserIds.includes(user.id) ? "bg-primary/10" : "hover:bg-muted"
                        )}
                      >
                        <Checkbox
                          checked={selectedUserIds.includes(user.id)}
                          onCheckedChange={() => toggleUser(user.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{user.full_name}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1 truncate">
                              <Mail className="h-3 w-3" />
                              {user.email}
                            </span>
                            {user.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {user.phone}
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {user.department_name}
                        </Badge>
                      </label>
                    ))
                  )}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="groups" className="flex-1 mt-4">
            {groupsLoading ? (
              <LoadingState message="Loading groups..." />
            ) : (
              <ScrollArea className="h-[300px] border rounded-md">
                <div className="p-2 space-y-1">
                  {!groups?.length ? (
                    <div className="text-center py-8">
                      <UsersRound className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No groups created yet</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Save selections as groups for quick reuse
                      </p>
                    </div>
                  ) : (
                    groups.map(group => (
                      <div
                        key={group.id}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-muted"
                      >
                        <div>
                          <p className="font-medium">{group.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addGroupMembers(group.id)}
                        >
                          <UserPlus className="h-4 w-4 mr-1" />
                          Add All
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="departments" className="flex-1 mt-4">
            <ScrollArea className="h-[300px] border rounded-md">
              <div className="p-2 space-y-1">
                {!departments?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No departments found
                  </p>
                ) : (
                  departments.map(dept => (
                    <div
                      key={dept.id}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted"
                    >
                      <div>
                        <p className="font-medium">{dept.name}</p>
                        <p className="text-xs text-muted-foreground">{dept.facility_name}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addDepartmentMembers(dept.id)}
                      >
                        <UserPlus className="h-4 w-4 mr-1" />
                        Add All
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary" className="py-1.5">
              {selectedUserIds.length} selected
            </Badge>
            <Button onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UserSelectionDialog;
