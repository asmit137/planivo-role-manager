import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Hash, Volume2, Plus, MessageSquare, ChevronDown, Monitor, Settings, LogOut } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import { CreateChannelModal } from './CreateChannelModal';
import { CreateDMModal } from './CreateDMModal';

interface SidebarProps {
    selectedChannelId: string | null;
    onSelectChannel: (id: string | null) => void;
}

export const Sidebar = ({ selectedChannelId, onSelectChannel }: SidebarProps) => {
    const { user, signOut } = useAuth();
    const { data: roles } = useUserRole();
    const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
    const [isCreateDMOpen, setIsCreateDMOpen] = useState(false);

    const isAdmin = roles?.some(r =>
        ['super_admin', 'department_head', 'workplace_supervisor', 'facility_supervisor'].includes(r.role)
    );

    // Fetch Channels (Public in Workspace)
    const { data: channels = [] } = useQuery({
        queryKey: ['discord-channels', roles],
        queryFn: async () => {

            const { data, error } = await supabase
                .from('conversations')
                .select('*')
                .eq('type', 'channel')
                .order('title')
                .limit(100) as any;

            if (error) throw error;
            return data;
        },
        enabled: !!roles
    });

    // Fetch DMs (My conversations)
    const { data: dms = [] } = useQuery({
        queryKey: ['discord-dms', user?.id],
        queryFn: async () => {
            if (!user) return [];

            console.log('Fetching DMs for user:', user.id);

            const { data, error } = await supabase
                .from('conversation_participants')
                .select('conversation_id, conversations(*)')
                .eq('user_id', user.id);

            if (error) {
                console.error('Error fetching conversations:', error);
                throw error;
            }

            console.log('Raw conversation data:', data);

            const conversations = await Promise.all(
                data
                    .map((p: any) => p.conversations)
                    .filter((c: any) => c && c.type !== 'channel') // Include NULL types (legacy conversations)
                    .map(async (convo: any) => {
                        // Get all participants for this conversation
                        const { data: participants } = await supabase
                            .from('conversation_participants')
                            .select('user_id')
                            .eq('conversation_id', convo.id);

                        const userIds = participants?.map(p => p.user_id) || [];
                        const { data: profiles } = await supabase
                            .from('profiles')
                            .select('id, full_name, email')
                            .in('id', userIds);

                        // Generate title for DMs and Untitled Groups
                        let displayTitle = convo.title;
                        if (!displayTitle) {
                            const others = profiles?.filter(p => p.id !== user.id) || [];
                            if (others.length === 0) {
                                displayTitle = 'Note to Self';
                            } else {
                                // For groups, join names. For DMs, it's just one name.
                                displayTitle = others.map(p => p.full_name || p.email || 'Unknown User').join(', ');
                            }
                        }

                        return {
                            ...convo,
                            displayTitle,
                            participants: profiles
                        };
                    })
            );

            // First sort by most recent to keep the latest one when deduplicating
            const sortedByDate = conversations.sort((a, b) =>
                new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
            );

            // Deduplicate:
            // 1. For groups: unique by ID
            // 2. For DMs: unique by 'other user'
            const uniqueConversations = sortedByDate.reduce((acc: any[], current) => {
                // If it's a group, just check ID
                if (current.is_group) {
                    const exists = acc.find(conv => conv.id === current.id);
                    if (!exists) acc.push(current);
                    return acc;
                }

                // If it's a DM, check if we already have a DM with this person
                const otherUser = current.participants?.find((p: any) => p.id !== user.id);
                const otherUserId = otherUser?.id;

                // If we can't identify the other user (e.g. self-DM or data error), fall back to ID check
                if (!otherUserId) {
                    const exists = acc.find(conv => conv.id === current.id);
                    if (!exists) acc.push(current);
                    return acc;
                }

                // Check if we already have a DM with this user
                // (Since we sorted by date first, the first one we see is the most recent)
                const exists = acc.find(conv => {
                    if (conv.is_group) return false;
                    const convOther = conv.participants?.find((p: any) => p.id !== user.id);
                    return convOther?.id === otherUserId;
                });

                if (!exists) {
                    acc.push(current);
                }

                return acc;
            }, []);

            const sorted = uniqueConversations;

            console.log('Processed conversations:', sorted);

            return sorted;
        },
        enabled: !!user,
    });

    const getInitials = (name?: string) => name?.substring(0, 2).toUpperCase() || '??';

    return (
        <div className="flex flex-col h-full bg-zinc-950 text-zinc-400">

            <ScrollArea className="flex-1 px-3">
                <div className="space-y-6 py-4">

                    {/* Channels Section */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between px-2 group mb-1">
                            <h2 className="text-xs font-bold uppercase hover:text-zinc-100 transition-colors cursor-pointer">
                                Text Channels
                            </h2>
                            {isAdmin && (
                                <button
                                    onClick={() => setIsCreateChannelOpen(true)}
                                    className="text-zinc-400 hover:text-zinc-100 transition-all"
                                >
                                    <Plus className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        {channels.map((channel: any) => (
                            <button
                                key={channel.id}
                                onClick={() => onSelectChannel(channel.id)}
                                className={`w-full flex items-center px-2 py-1.5 rounded-md group transition-all text-sm mb-0.5 ${selectedChannelId === channel.id
                                    ? 'bg-zinc-800 text-zinc-100 mb-1'
                                    : 'hover:bg-zinc-900 hover:text-zinc-200'
                                    }`}
                            >
                                <Hash className="h-4 w-4 mr-1.5 text-zinc-500 group-hover:text-zinc-400" />
                                <span className="truncate font-medium">{channel.slug || channel.title}</span>
                            </button>
                        ))}
                    </div>

                    <Separator className="bg-zinc-800/50" />

                    {/* DMs Section */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between px-2 mb-1">
                            <h2 className="text-xs font-bold uppercase">Direct Messages</h2>
                            <button
                                onClick={() => setIsCreateDMOpen(true)}
                                className="text-zinc-400 hover:text-zinc-100"
                            >
                                <Plus className="h-4 w-4" />
                            </button>
                        </div>
                        {dms.map((dm: any) => (
                            <button
                                key={dm.id}
                                onClick={() => onSelectChannel(dm.id)}
                                className={`w-full flex items-center px-2 py-2 rounded-md group transition-all text-sm ${selectedChannelId === dm.id
                                    ? 'bg-zinc-800 text-zinc-100'
                                    : 'hover:bg-zinc-900 hover:text-zinc-200'
                                    }`}
                            >
                                <div className="relative mr-3">
                                    <Avatar className="h-8 w-8 md:h-8 md:w-8">
                                        <AvatarFallback className="bg-zinc-700 text-xs">
                                            {dm.is_group ? <MessageSquare className="h-4 w-4" /> : getInitials(dm.title || 'U')}
                                        </AvatarFallback>
                                    </Avatar>
                                    {/* Online Indicator Mockup */}
                                    <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-green-500 border-2 border-zinc-950"></span>
                                </div>
                                <div className="flex-1 truncate text-left">
                                    <span className="block truncate font-medium text-zinc-300 group-hover:text-zinc-100">
                                        {dm.displayTitle || dm.title || (dm.is_group ? 'Group Chat' : 'User')}
                                    </span>
                                    <span className="block truncate text-xs text-zinc-500">
                                        Active now
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </ScrollArea>

            {/* User Mini Profile */}
            <div className="h-[52px] bg-zinc-900/50 flex items-center px-3 gap-2 border-t border-zinc-900">
                <Avatar className="h-8 w-8 hover:opacity-80 cursor-pointer transition-opacity">
                    <AvatarImage src={user?.user_metadata?.avatar_url} />
                    <AvatarFallback className="bg-emerald-600 text-zinc-100 text-xs">
                        {getInitials(user?.email)}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 flex flex-col">
                    <span className="text-sm font-semibold text-zinc-100 truncate">
                        {user?.email?.split('@')[0]}
                    </span>
                    <span className="text-xs text-zinc-500 truncate">
                        #{user?.id?.substring(0, 4)}
                    </span>
                </div>

            </div>

            <CreateChannelModal open={isCreateChannelOpen} onOpenChange={setIsCreateChannelOpen} />
            <CreateDMModal
                open={isCreateDMOpen}
                onOpenChange={setIsCreateDMOpen}
                onConversationCreated={(id) => onSelectChannel(id)}
            />
        </div>
    );
};
