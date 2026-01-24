import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, MessageSquare } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

interface CreateDMModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConversationCreated?: (conversationId: string) => void;
}

export const CreateDMModal = ({ open, onOpenChange, onConversationCreated }: CreateDMModalProps) => {
    const { user } = useAuth();
    const { data: roles } = useUserRole();
    const queryClient = useQueryClient();
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [groupName, setGroupName] = useState('');
    const [userSearchTerm, setUserSearchTerm] = useState('');

    // Fetch workspace users
    const { data: workspaceUsers = [] } = useQuery({
        queryKey: ['workspace-users', user?.id],
        queryFn: async () => {
            if (!user) return [];

            // Check user roles
            const { data: userRoles } = await supabase
                .from('user_roles')
                .select('role, workspace_id, organization_id')
                .eq('user_id', user.id) as { data: any[] | null };

            const isSuperAdmin = userRoles?.some(r => r.role === 'super_admin');
            const isOrgAdmin = userRoles?.some(r => r.role === 'organization_admin');

            if (isSuperAdmin) {
                // Super admin can message anyone
                const { data: allProfiles } = await supabase
                    .from('profiles')
                    .select('id, full_name, email')
                    .neq('id', user.id)
                    .eq('is_active', true);

                return allProfiles || [];
            }

            if (isOrgAdmin) {
                // Organization admin can message users in their organization
                const orgIds = [...new Set(userRoles?.filter(r => r.role === 'organization_admin').map(r => r.organization_id).filter(Boolean))] as string[];

                if (orgIds.length === 0) return [];

                // Get all users with roles in those organizations using or filter
                const orgUserRolesPromises = orgIds.map(orgId =>
                    (supabase
                        .from('user_roles') as any)
                        .select('user_id')
                        .eq('organization_id', orgId)
                );

                const results = await Promise.all(orgUserRolesPromises);
                const allOrgUserRoles = results.flatMap(r => r.data || []);

                if (allOrgUserRoles.length === 0) return [];

                const userIds = [...new Set(allOrgUserRoles.map(r => r.user_id))].filter(id => id !== user.id);

                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, full_name, email')
                    .in('id', userIds)
                    .eq('is_active', true);

                return profiles || [];
            }

            if (!userRoles || userRoles.length === 0) return [];

            const workspaceIds = [...new Set(userRoles.map(r => r.workspace_id).filter(Boolean))];

            // Get all users in those workspaces
            const { data: allRoles } = await supabase
                .from('user_roles')
                .select('user_id')
                .in('workspace_id', workspaceIds);

            if (!allRoles) return [];

            const userIds = [...new Set(allRoles.map(r => r.user_id))].filter(id => id !== user.id);

            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .in('id', userIds)
                .eq('is_active', true);

            // Deduplicate by user ID
            const uniqueProfiles = profiles?.reduce((acc: any[], profile: any) => {
                if (!acc.find(p => p.id === profile.id)) {
                    acc.push(profile);
                }
                return acc;
            }, []) || [];

            return uniqueProfiles;
        },
        enabled: !!user && open,
    });

    const filteredUsers = workspaceUsers.filter((u: any) =>
    (u.full_name?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(userSearchTerm.toLowerCase()))
    );

    const createConversationMutation = useMutation({
        mutationFn: async () => {
            if (!user) throw new Error('Not authenticated');

            const isGroup = selectedUsers.length > 1;

            const { data: conversation, error: convError } = await supabase
                .from('conversations')
                .insert({
                    title: isGroup ? groupName : null,
                    is_group: isGroup,
                    type: isGroup ? 'group' : 'dm',
                    created_by: user.id,
                } as any)
                .select()
                .single();

            if (convError) throw convError;

            const participants = [...selectedUsers, user.id].map(userId => ({
                conversation_id: conversation.id,
                user_id: userId,
            }));

            const { error: partError } = await supabase
                .from('conversation_participants')
                .insert(participants);

            if (partError) throw partError;

            return conversation;
        },
        onSuccess: (conversation) => {
            queryClient.invalidateQueries({ queryKey: ['discord-dms'] });
            onOpenChange(false);
            setSelectedUsers([]);
            setGroupName('');
            setUserSearchTerm('');
            toast.success(selectedUsers.length > 1 ? 'Group created' : 'DM created');
            onConversationCreated?.(conversation.id);
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to create conversation');
        },
    });

    const handleCreate = () => {
        if (selectedUsers.length === 0) {
            toast.error('Please select at least one user');
            return;
        }

        const isGroup = selectedUsers.length > 1;
        if (isGroup && !groupName.trim()) {
            toast.error('Please enter a group name');
            return;
        }

        createConversationMutation.mutate();
    };

    const canCreateGroup = roles?.some(r =>
        ['super_admin', 'general_admin', 'workplace_supervisor', 'facility_supervisor', 'department_head'].includes(r.role)
    );

    const toggleUser = (userId: string) => {
        if (selectedUsers.includes(userId)) {
            setSelectedUsers(selectedUsers.filter(id => id !== userId));
        } else {
            if (!canCreateGroup && selectedUsers.length >= 1) {
                toast.error('Staff members can only start individual conversations');
                return;
            }
            setSelectedUsers([...selectedUsers, userId]);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5" />
                        New Direct Message
                    </DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Select users to start a conversation
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-zinc-400">Search Users</Label>
                        <Input
                            placeholder="Name or email..."
                            value={userSearchTerm}
                            onChange={(e) => setUserSearchTerm(e.target.value)}
                            className="bg-zinc-950 border-zinc-800 focus:ring-offset-0 focus:border-blue-500"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-zinc-400">
                            Select Users ({selectedUsers.length})
                        </Label>
                        <ScrollArea className="h-60 rounded-lg bg-zinc-950 p-3 border border-zinc-800">
                            {filteredUsers.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full space-y-2 py-8 opacity-40">
                                    <Users className="h-10 w-10" />
                                    <p className="text-sm">No users found</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {filteredUsers.map((wsUser: any) => (
                                        <div
                                            key={wsUser.id}
                                            className="flex items-center space-x-3 p-2.5 rounded-md hover:bg-zinc-800 transition-all cursor-pointer group"
                                            onClick={() => toggleUser(wsUser.id)}
                                        >
                                            <Checkbox
                                                id={`user-${wsUser.id}`}
                                                checked={selectedUsers.includes(wsUser.id)}
                                                className="border-zinc-700 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                            />
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback className="bg-zinc-700 text-xs">
                                                    {(wsUser.full_name || wsUser.email || 'U').substring(0, 2).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">
                                                    {wsUser.full_name || wsUser.email || wsUser.id.substring(0, 8)}
                                                </p>
                                                {wsUser.email && (
                                                    <p className="text-xs text-zinc-500 truncate lowercase">{wsUser.email}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>

                    {selectedUsers.length > 1 && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                            <Label className="text-xs font-bold uppercase text-zinc-400">Group Name</Label>
                            <Input
                                placeholder="Engineering Team, Friends..."
                                value={groupName}
                                onChange={(e) => setGroupName(e.target.value)}
                                className="bg-zinc-950 border-zinc-800 focus:ring-offset-0 focus:border-blue-500"
                            />
                        </div>
                    )}
                </div>

                <DialogFooter className="pt-4">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="hover:bg-zinc-800 text-zinc-300"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        disabled={selectedUsers.length === 0 || createConversationMutation.isPending}
                        className="bg-[#5865F2] hover:bg-[#4752C4] text-white"
                    >
                        {createConversationMutation.isPending
                            ? 'Creating...'
                            : selectedUsers.length > 1
                                ? 'Create Group'
                                : 'Create DM'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
