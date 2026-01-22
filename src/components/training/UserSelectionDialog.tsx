import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Search, Users, Building, UserPlus, X, Phone, Mail, UsersRound, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUserIds: string[];
  onSelectionChange: (userIds: string[]) => void;
  selectedDepartmentIds?: string[];
  onDepartmentSelectionChange?: (departmentIds: string[]) => void;
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
  selectedDepartmentIds = [],
  onDepartmentSelectionChange,
  organizationId,
  title = 'Select Users',
}: UserSelectionDialogProps) => {
  const { user } = useAuth();
  const { data: roles } = useUserRole();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'groups' | 'departments' | 'users'>('users');

  // Force re-render check
  // console.log('Rendering UserSelectionDialog with updated UI fixes');

  // Determine user's scope
  const userScope = useMemo(() => {
    if (!roles?.length) return null;

    const isSuperAdmin = roles.some(r => r.role === 'super_admin');
    const organizationAdmin = roles.find(r => r.role === 'organization_admin');
    const generalAdmin = roles.find(r => r.role === 'general_admin');
    const workplaceSupervisor = roles.find(r => r.role === 'workplace_supervisor');
    const facilitySupervisor = roles.find(r => r.role === 'facility_supervisor');
    const departmentHead = roles.find(r => r.role === 'department_head');

    if (isSuperAdmin) return { type: 'all' as const };
    if (organizationAdmin) return { type: 'organization' as const, organizationId: organizationAdmin.organization_id };
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

      try {
        if ((userScope.type === 'all' || userScope.type === 'organization') && (organizationId || (userScope as any).organizationId)) {
          const targetOrgId = organizationId || (userScope as any).organizationId;

          // Split into two simple queries to avoid deep instantiation
          const query1 = supabase.from('user_roles' as any).select('user_id, workspaces!inner(organization_id)');
          const { data: workspaceMembers } = await (query1.eq('workspaces.organization_id', targetOrgId) as any);

          const query2 = supabase.from('user_roles' as any).select('user_id');
          const { data: directMembers } = await (query2.eq('organization_id', targetOrgId) as any);

          const ids = new Set<string>();
          (workspaceMembers as any[])?.forEach(m => ids.add(m.user_id));
          (directMembers as any[])?.forEach(m => ids.add(m.user_id));
          userIds = Array.from(ids);
        }
        else if (userScope.type === 'workspace' && userScope.workspaceId) {
          const { data: roleData, error: roleError } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('workspace_id', userScope.workspaceId);

          if (roleError) throw roleError;
          userIds = [...new Set(roleData?.map(r => r.user_id) || [])];
        } else if (userScope.type === 'facility' && userScope.facilityId) {
          const { data: roleData, error: roleError } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('facility_id', userScope.facilityId);

          if (roleError) throw roleError;
          userIds = [...new Set(roleData?.map(r => r.user_id) || [])];
        } else if (userScope.type === 'department' && (userScope as any).departmentId) {
          const { data: roleData, error: roleError } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('department_id', (userScope as any).departmentId);

          if (roleError) throw roleError;
          userIds = [...new Set(roleData?.map(r => r.user_id) || [])];
        }

        if (!userIds.length) return [];

        // Fetch profiles
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone')
          .in('id', userIds)
          .eq('is_active', true);

        if (profileError) throw profileError;

        // Fetch role details for display (department/facility names)
        const { data: displayRoles, error: displayError } = await supabase
          .from('user_roles')
          .select(`
            user_id,
            departments:department_id(name),
            facilities:facility_id(name)
          `)
          .in('user_id', userIds);

        if (displayError) throw displayError;

        return (profiles || []).map(p => {
          const role = displayRoles?.find(r => r.user_id === p.id);
          return {
            id: p.id,
            full_name: p.full_name || 'Unnamed User',
            email: p.email || '',
            phone: p.phone,
            department_name: (role?.departments as any)?.name || 'No Department',
            facility_name: (role?.facilities as any)?.name || 'No Facility',
          };
        }) as SelectableUser[];
      } catch (err) {
        console.error('Error fetching selectable users:', err);
        return [];
      }
    },
    enabled: open && !!userScope,
  });

  // Fetch user groups
  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ['user-groups', organizationId, user?.id],
    queryFn: async () => {
      try {
        let query = supabase
          .from('user_groups')
          .select(`
            id,
            name,
            description,
            user_group_members(user_id)
          `);

        if (organizationId) {
          query = query.eq('organization_id', organizationId);
        } else if (roles?.length) {
          const wsIds = roles.map(r => r.workspace_id).filter(Boolean);
          if (wsIds.length > 0) {
            query = query.in('workspace_id', wsIds);
          }
        }

        const { data, error } = await query.order('name');
        if (error) throw error;

        return (data || []).map(g => ({
          id: g.id,
          name: g.name,
          description: g.description,
          member_count: (g.user_group_members as any)?.length || 0,
          member_ids: (g.user_group_members as any[])?.map(m => m.user_id) || [],
        })) as (UserGroup & { member_ids: string[] })[];
      } catch (err) {
        console.error('Error fetching groups:', err);
        return [];
      }
    },
    enabled: open && (!!organizationId || !!roles?.length),
  });

  // Fetch departments for selection
  const { data: departments } = useQuery({
    queryKey: ['departments-for-selection', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      try {
        const { data: depts, error } = await supabase
          .from('departments')
          .select(`
            id,
            name,
            facilities!inner(
              name,
              workspaces!inner(organization_id)
            )
          `)
          .eq('facilities.workspaces.organization_id', organizationId);

        if (error) throw error;

        return (depts || []).map(d => ({
          id: d.id,
          name: d.name,
          facility_name: (d.facilities as any)?.name || 'Unknown',
        }));
      } catch (err) {
        console.error('Error fetching departments:', err);
        return [];
      }
    },
    enabled: open && !!organizationId,
  });

  // Fetch profiles for users in selected departments for preview
  const { data: usersInSelectedDepartments } = useQuery({
    queryKey: ['users-in-selected-depts', selectedDepartmentIds],
    queryFn: async () => {
      if (!selectedDepartmentIds?.length) return [];
      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          user_id,
          profiles:user_id(id, full_name)
        `)
        .in('department_id', selectedDepartmentIds);
      if (error) throw error;

      const profiles = data
        ?.map((r: any) => r.profiles)
        .filter((p, index, self) => p && self.findIndex(s => s.id === p.id) === index);

      return profiles || [];
    },
    enabled: open && selectedDepartmentIds.length > 0,
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

  const toggleDepartmentSelection = (deptId: string) => {
    if (!onDepartmentSelectionChange) return;

    if (selectedDepartmentIds.includes(deptId)) {
      onDepartmentSelectionChange(selectedDepartmentIds.filter(id => id !== deptId));
    } else {
      onDepartmentSelectionChange([...selectedDepartmentIds, deptId]);
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
      toast.success(`Added ${newIds.length} members from group`);
    } else {
      toast.error('No members found in this group');
    }
  };

  const addDepartmentMembers = async (departmentId: string) => {
    // Get current users for this department
    const deptMemberIds = users?.filter(u =>
      // This is a bit tricky as user profile might not have dept id directly in the SelectableUser interface
      // but we can use the users we already fetched if we had their dept IDs.
      // Actually, we can just query it to be safe or use what we have.
      u.department_name === departments?.find(d => d.id === departmentId)?.name
    ).map(u => u.id) || [];

    if (deptMemberIds.length === 0) {
      // Fallback to query
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('department_id', departmentId);

      if (roles?.length) {
        const ids = roles.map(r => r.user_id);
        const allSelected = ids.every(id => selectedUserIds.includes(id));
        if (allSelected) {
          onSelectionChange(selectedUserIds.filter(id => !ids.includes(id)));
          toast.success(`Removed users from department`);
        } else {
          onSelectionChange([...new Set([...selectedUserIds, ...ids])]);
          toast.success(`Added ${ids.length} users from department`);
        }
      } else {
        toast.error('No users found in this department');
      }
      return;
    }

    const allSelected = deptMemberIds.every(id => selectedUserIds.includes(id));
    if (allSelected) {
      onSelectionChange(selectedUserIds.filter(id => !deptMemberIds.includes(id)));
      toast.success(`Removed users from department`);
    } else {
      onSelectionChange([...new Set([...selectedUserIds, ...deptMemberIds])]);
      toast.success(`Added ${deptMemberIds.filter(id => !selectedUserIds.includes(id)).length} users from department`);
    }
  };

  const toggleGroupMembers = (groupId: string, memberIds: string[]) => {
    if (!memberIds.length) {
      toast.error('No members found in this group');
      return;
    }

    const allSelected = memberIds.every(id => selectedUserIds.includes(id));
    if (allSelected) {
      onSelectionChange(selectedUserIds.filter(id => !memberIds.includes(id)));
      toast.success('Removed members from group');
    } else {
      onSelectionChange([...new Set([...selectedUserIds, ...memberIds])]);
      toast.success(`Added members from group`);
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
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] sm:max-h-[85vh] !flex !flex-col bg-background border shadow-2xl z-50 p-0 gap-0 overflow-hidden outline-none">
        <DialogHeader className="p-4 sm:p-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Search and select users, groups, or departments to invite to this event.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col px-4 sm:px-6 gap-3 sm:gap-4 overflow-hidden min-h-0">

          {/* Selected users preview */}
          {(selectedUserIds.length > 0 || selectedDepartmentIds.length > 0) && (
            <div className="shrink-0 flex flex-wrap gap-1 p-2 bg-muted/50 rounded-lg max-h-[120px] overflow-y-auto border border-border/50">
              <span className="text-[10px] w-full text-muted-foreground mb-1 font-bold uppercase tracking-wider px-1">Selected Directly:</span>
              {selectedUsers.map(user => (
                <Badge key={user.id} variant="secondary" className="gap-1 h-5 text-[10px]">
                  {user.full_name}
                  <button
                    onClick={() => toggleUser(user.id)}
                    className="hover:bg-destructive/20 rounded-full p-0.5"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}

              {selectedDepartmentIds.length > 0 && (
                <>
                  <span className="text-[10px] w-full text-muted-foreground mb-1 mt-2 font-semibold uppercase px-1">Selected Departments:</span>
                  {departments?.filter(d => selectedDepartmentIds.includes(d.id)).map(dept => (
                    <Badge key={dept.id} variant="secondary" className="bg-primary/20 gap-1 h-5 text-[10px]">
                      <Building className="h-2.5 w-2.5" />
                      {dept.name}
                      <button
                        onClick={() => toggleDepartmentSelection(dept.id)}
                        className="hover:bg-destructive/20 rounded-full p-0.5"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}

                  {usersInSelectedDepartments && usersInSelectedDepartments.length > 0 && (
                    <div className="w-full mt-2 border-t border-dashed border-primary/20 pt-1">
                      <span className="text-[9px] text-primary/70 font-medium italic block px-1">
                        + Including {usersInSelectedDepartments.length} users from departments
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Search */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            {searchTerm && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchTerm('')}
                className="h-10 text-muted-foreground hover:bg-secondary transition-colors gap-2"
              >
                <XCircle className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Clear Search</span>
              </Button>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-3 shrink-0">
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
                {selectedDepartmentIds.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{selectedDepartmentIds.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="flex-1 mt-2 sm:mt-4 flex flex-col min-h-0 data-[state=active]:flex">
              {usersLoading ? (
                <LoadingState message="Loading users..." />
              ) : (
                <ScrollArea className="h-[300px] sm:h-[400px] border rounded-md bg-card/50">
                  <div className="p-2 space-y-1">
                    {filteredUsers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                        {!organizationId && userScope?.type === 'all' ? (
                          <>
                            <Building className="h-12 w-12 mb-4 opacity-20" />
                            <h3 className="text-lg font-semibold text-foreground mb-1">Organization Required</h3>
                            <p className="max-w-xs mx-auto">Please select an organization in the main form to view available users.</p>
                          </>
                        ) : (
                          <>
                            <Users className="h-12 w-12 mb-4 opacity-20" />
                            <p className="text-lg font-medium">No users found</p>
                            <p className="text-sm opacity-70">Try adjusting your search criteria</p>
                          </>
                        )}
                      </div>
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

            <TabsContent value="groups" className="flex-1 mt-2 sm:mt-4 flex flex-col min-h-0 data-[state=active]:flex">
              {groupsLoading ? (
                <LoadingState message="Loading groups..." />
              ) : (
                <ScrollArea className="h-[300px] sm:h-[400px] border rounded-md bg-card/50">
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
                            variant={group.member_ids.every(id => selectedUserIds.includes(id)) ? "destructive" : "outline"}
                            onClick={() => toggleGroupMembers(group.id, group.member_ids)}
                          >
                            {group.member_ids.every(id => selectedUserIds.includes(id)) ? (
                              <X className="h-4 w-4 mr-1" />
                            ) : (
                              <UserPlus className="h-4 w-4 mr-1" />
                            )}
                            {group.member_ids.every(id => selectedUserIds.includes(id)) ? "Remove All" : "Add All"}
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>

            <TabsContent value="departments" className="flex-1 mt-2 sm:mt-4 flex flex-col min-h-0 data-[state=active]:flex">
              <ScrollArea className="h-[300px] sm:h-[400px] border rounded-md bg-card/50">
                <div className="p-2 space-y-1">
                  {!departments?.length ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                      {!organizationId ? (
                        <>
                          <Building className="h-12 w-12 mb-4 opacity-20" />
                          <h3 className="text-lg font-semibold text-foreground mb-1">Organization Required</h3>
                          <p className="max-w-xs mx-auto">Please select an organization in the main form to view departments.</p>
                        </>
                      ) : (
                        <>
                          <Building className="h-12 w-12 mb-4 opacity-20" />
                          <p className="text-lg font-medium">No departments found</p>
                          <p className="text-sm opacity-70">There are no departments in this organization.</p>
                        </>
                      )}
                    </div>
                  ) : (
                    departments.map(dept => (
                      <div
                        key={dept.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg hover:bg-muted cursor-pointer",
                          selectedDepartmentIds.includes(dept.id) && "bg-primary/10"
                        )}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0" onClick={() => toggleDepartmentSelection(dept.id)}>
                          <Checkbox
                            checked={selectedDepartmentIds.includes(dept.id)}
                            onCheckedChange={() => toggleDepartmentSelection(dept.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{dept.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{dept.facility_name}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="link"
                          className={cn(
                            "hover:no-underline",
                            users?.some(u => u.department_name === dept.name && selectedUserIds.includes(u.id))
                              ? "text-destructive hover:text-destructive/80"
                              : "text-primary"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            addDepartmentMembers(dept.id);
                          }}
                        >
                          {users?.filter(u => u.department_name === dept.name).every(id => selectedUserIds.includes(id.id)) && users?.some(u => u.department_name === dept.name) ? (
                            <>
                              <X className="h-4 w-4 mr-1" />
                              Remove All Users
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-4 w-4 mr-1" />
                              Add All Users
                            </>
                          )}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>

        </div>

        <DialogFooter className="p-4 flex-col sm:flex-row gap-2 sm:justify-between bg-muted/20 border-t mt-auto">
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
