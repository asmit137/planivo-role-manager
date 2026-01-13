import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, Users, UsersRound } from 'lucide-react';
import UserSelectionDialog from './UserSelectionDialog';

interface UserGroup {
  id: string;
  name: string;
  description: string | null;
  scope_type: string;
  created_at: string;
  member_count: number;
  members?: { user_id: string; profiles: { full_name: string; email: string } }[];
}

const GroupManagement = () => {
  const { user } = useAuth();
  const { data: roles } = useUserRole();
  const { selectedOrganizationId } = useOrganization();
  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');
  const queryClient = useQueryClient();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMemberDialog, setShowMemberDialog] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<UserGroup | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  // Determine user's organization id (fallback for non-super-admins)
  const { data: userOrgId } = useQuery({
    queryKey: ['user-org-id', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('user_roles')
        .select('workspaces(organization_id)')
        .eq('user_id', user.id)
        .not('workspace_id', 'is', null)
        .limit(1)
        .maybeSingle();
      return (data?.workspaces as any)?.organization_id || null;
    },
    enabled: !isSuperAdmin && !!user,
  });

  // Use context org for super admin, fallback for others
  const organizationId = isSuperAdmin ? selectedOrganizationId : userOrgId;

  // Fetch all organizations for super admin
  const { data: organizations } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: isSuperAdmin,
  });

  // Fetch groups
  const { data: groups, isLoading } = useQuery({
    queryKey: ['user-groups-management', user?.id, organizationId],
    queryFn: async () => {
      let query = supabase
        .from('user_groups')
        .select(`
          id,
          name,
          description,
          scope_type,
          created_at,
          user_group_members (
            user_id,
            profiles:user_id (full_name, email)
          )
        `);

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      } else if (!isSuperAdmin && roles?.length) {
        const wsIds = roles.map(r => r.workspace_id).filter(Boolean);
        if (wsIds.length > 0) {
          query = query.in('workspace_id', wsIds);
        }
      }

      const { data, error } = await query.order('name');

      if (error) throw error;

      return data?.map(g => ({
        ...g,
        member_count: g.user_group_members?.length || 0,
        members: g.user_group_members,
      })) as UserGroup[];
    },
  });

  // Get scope info based on user role
  const getScopeInfo = () => {
    if (!roles?.length) return { type: 'workspace', id: null };

    const generalAdmin = roles.find(r => r.role === 'general_admin');
    const workplaceSupervisor = roles.find(r => r.role === 'workplace_supervisor');
    const facilitySupervisor = roles.find(r => r.role === 'facility_supervisor');

    if (isSuperAdmin || generalAdmin) {
      return {
        type: 'organization' as const,
        organizationId: null,
        workspaceId: generalAdmin?.workspace_id || null
      };
    }
    if (workplaceSupervisor) {
      return { type: 'workspace' as const, workspaceId: workplaceSupervisor.workspace_id };
    }
    if (facilitySupervisor) {
      return { type: 'facility' as const, facilityId: facilitySupervisor.facility_id };
    }
    return { type: 'workspace' as const, id: null };
  };

  // Create group mutation
  const createGroupMutation = useMutation({
    mutationFn: async () => {
      const scope = getScopeInfo();

      const { data: group, error: groupError } = await supabase
        .from('user_groups')
        .insert({
          name: groupName,
          description: groupDescription || null,
          created_by: user?.id,
          scope_type: scope.type,
          organization_id: organizationId,
          workspace_id: scope.type === 'workspace' ? (scope as any).workspaceId : null,
          facility_id: scope.type === 'facility' ? (scope as any).facilityId : null,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add members if any selected
      if (selectedMemberIds.length > 0) {
        const { error: membersError } = await supabase
          .from('user_group_members')
          .insert(
            selectedMemberIds.map(userId => ({
              group_id: group.id,
              user_id: userId,
            }))
          );
        if (membersError) throw membersError;
      }

      return group;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-groups-management'] });
      queryClient.invalidateQueries({ queryKey: ['user-groups'] });
      toast.success('Group created successfully');
      resetForm();
      setShowCreateDialog(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create group');
    },
  });

  // Update group mutation
  const updateGroupMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroup) return;

      const { error: groupError } = await supabase
        .from('user_groups')
        .update({
          name: groupName,
          description: groupDescription || null,
        })
        .eq('id', selectedGroup.id);

      if (groupError) throw groupError;

      // Update members - delete all and re-add
      await supabase
        .from('user_group_members')
        .delete()
        .eq('group_id', selectedGroup.id);

      if (selectedMemberIds.length > 0) {
        const { error: membersError } = await supabase
          .from('user_group_members')
          .insert(
            selectedMemberIds.map(userId => ({
              group_id: selectedGroup.id,
              user_id: userId,
            }))
          );
        if (membersError) throw membersError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-groups-management'] });
      queryClient.invalidateQueries({ queryKey: ['user-groups'] });
      toast.success('Group updated successfully');
      resetForm();
      setShowEditDialog(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update group');
    },
  });

  // Delete group mutation
  const deleteGroupMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroup) return;

      const { error } = await supabase
        .from('user_groups')
        .delete()
        .eq('id', selectedGroup.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-groups-management'] });
      queryClient.invalidateQueries({ queryKey: ['user-groups'] });
      toast.success('Group deleted');
      setShowDeleteDialog(false);
      setSelectedGroup(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete group');
    },
  });

  const resetForm = () => {
    setGroupName('');
    setGroupDescription('');
    setSelectedMemberIds([]);
    setSelectedGroup(null);
  };

  const handleEdit = (group: UserGroup) => {
    setSelectedGroup(group);
    setGroupName(group.name);
    setGroupDescription(group.description || '');
    setSelectedMemberIds(group.members?.map(m => m.user_id) || []);
    setShowEditDialog(true);
  };

  const handleDelete = (group: UserGroup) => {
    setSelectedGroup(group);
    setShowDeleteDialog(true);
  };

  if (isLoading) {
    return <LoadingState message="Loading groups..." />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="h-5 w-5" />
              User Groups
            </CardTitle>
            <CardDescription>
              Create reusable groups for quick user selection
            </CardDescription>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Button onClick={() => setShowCreateDialog(true)} disabled={isSuperAdmin && !organizationId}>
              <Plus className="h-4 w-4 mr-2" />
              New Group
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!groups?.length ? (
          <EmptyState
            icon={UsersRound}
            title="No Groups"
            description="Create groups to quickly select multiple users for events"
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {groups.map(group => (
              <Card key={group.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{group.name}</h4>
                      {group.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {group.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary">
                          <Users className="h-3 w-3 mr-1" />
                          {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {group.scope_type}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(group)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(group)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create Group Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Group</DialogTitle>
            <DialogDescription>
              Enter a name and description for your new user group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Group Name</Label>
              <Input
                id="name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g., Morning Shift Team"
              />
            </div>
            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                placeholder="Brief description of this group"
                rows={2}
              />
            </div>
            <div>
              <Label>Members</Label>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowMemberDialog(true)}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Select Members ({selectedMemberIds.length})
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setShowCreateDialog(false); }}>
              Cancel
            </Button>
            <Button
              onClick={() => createGroupMutation.mutate()}
              disabled={!groupName.trim() || createGroupMutation.isPending}
            >
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Group Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
            <DialogDescription>
              Update the details and members of this group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Group Name</Label>
              <Input
                id="edit-name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div>
              <Label>Members</Label>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowMemberDialog(true)}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Edit Members ({selectedMemberIds.length})
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setShowEditDialog(false); }}>
              Cancel
            </Button>
            <Button
              onClick={() => updateGroupMutation.mutate()}
              disabled={!groupName.trim() || updateGroupMutation.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedGroup?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteGroupMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Member Selection Dialog */}
      <UserSelectionDialog
        open={showMemberDialog}
        onOpenChange={setShowMemberDialog}
        selectedUserIds={selectedMemberIds}
        onSelectionChange={setSelectedMemberIds}
        organizationId={organizationId || undefined}
        title="Select Group Members"
      />
    </Card>
  );
};

export default GroupManagement;
