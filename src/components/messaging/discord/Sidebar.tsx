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
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { ThemeToggleSimple } from '@/components/ThemeToggle';

interface SidebarProps {
    selectedChannelId: string | null;
    onSelectChannel: (id: string | null) => void;
}

export const Sidebar = ({ selectedChannelId, onSelectChannel }: SidebarProps) => {
    const { user, signOut } = useAuth();
    const { data: roles } = useUserRole();
    const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
    const [isCreateDMOpen, setIsCreateDMOpen] = useState(false);

    // Real-time subscriptions for live updates
    useRealtimeSubscription({
        table: 'messages',
        invalidateQueries: ['discord-channels', 'discord-dms'],
    });

    useRealtimeSubscription({
        table: 'conversations',
        invalidateQueries: ['discord-channels', 'discord-dms'],
    });

    useRealtimeSubscription({
        table: 'conversation_participants',
        invalidateQueries: ['discord-channels', 'discord-dms'],
    });

    const isAdmin = roles?.some(r =>
        ['super_admin', 'department_head', 'workplace_supervisor', 'facility_supervisor'].includes(r.role)
    );

    // Fetch Channels (Public in Workspace)
    const { data: channels = [] } = useQuery({
        queryKey: ['discord-channels', roles, user?.id],
        queryFn: async () => {
            if (!user) return [];

            let query: any = supabase
                .from('conversations');

            const { data, error } = await query
                .select('*')
                .eq('type', 'channel')
                .order('updated_at', { ascending: false })
                .limit(100);

            if (error) throw error;

            // Fetch last_read_at for each channel
            const channelsWithUnread = await Promise.all(
                data.map(async (channel: any) => {
                    const { data: participant } = await supabase
                        .from('conversation_participants')
                        .select('last_read_at')
                        .eq('conversation_id', channel.id)
                        .eq('user_id', user.id)
                        .maybeSingle();

                    const { data: lastMessage } = await supabase
                        .from('messages')
                        .select('created_at')
                        .eq('conversation_id', channel.id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    const lastRead = participant?.last_read_at ? new Date(participant.last_read_at) : new Date(0);
                    const lastMsgTime = lastMessage?.created_at ? new Date(lastMessage.created_at) : new Date(0);
                    const isUnread = lastMsgTime > lastRead;

                    return { ...channel, isUnread };
                })
            );

            return channelsWithUnread.sort((a, b) => {
                if (a.isUnread && !b.isUnread) return -1;
                if (!a.isUnread && b.isUnread) return 1;
                return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
            });
        },
        enabled: !!roles && !!user
    });

    // Fetch DMs (My conversations)
    const { data: dms = [] } = useQuery({
        queryKey: ['discord-dms', user?.id],
        queryFn: async () => {
            if (!user) return [];

            console.log('Fetching DMs for user:', user.id);

            const { data, error } = await supabase
                .from('conversation_participants')
                .select('conversation_id, last_read_at, conversations(*)')
                .eq('user_id', user.id);

            if (error) {
                console.error('Error fetching conversations:', error);
                throw error;
            }

            const conversations = await Promise.all(
                data
                    .map((p: any) => ({ convo: p.conversations, last_read_at: p.last_read_at }))
                    .filter((item: any) => item.convo && item.convo.type !== 'channel')
                    .map(async (item: any) => {
                        const convo = item.convo;

                        // Get last message time for unread calculation
                        const { data: lastMessage } = await supabase
                            .from('messages')
                            .select('created_at')
                            .eq('conversation_id', convo.id)
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .maybeSingle();

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

                        // Generate title
                        let displayTitle = convo.title;
                        if (!displayTitle) {
                            const others = profiles?.filter(p => p.id !== user.id) || [];
                            if (others.length === 0) displayTitle = 'Note to Self';
                            else displayTitle = others.map(p => p.full_name || p.email || 'Unknown User').join(', ');
                        }

                        const lastRead = item.last_read_at ? new Date(item.last_read_at) : new Date(0);
                        const lastMsgTime = lastMessage?.created_at ? new Date(lastMessage.created_at) : new Date(0);
                        const isUnread = lastMsgTime > lastRead;

                        return {
                            ...convo,
                            displayTitle,
                            participants: profiles,
                            isUnread
                        };
                    })
            );

            // Deduplicate and sort
            const sortedByPriority = conversations.sort((a, b) => {
                if (a.isUnread && !b.isUnread) return -1;
                if (!a.isUnread && b.isUnread) return 1;
                return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
            });

            const uniqueConversations = sortedByPriority.reduce((acc: any[], current) => {
                if (current.is_group) {
                    if (!acc.find(conv => conv.id === current.id)) acc.push(current);
                    return acc;
                }
                const otherUser = current.participants?.find((p: any) => p.id !== user.id);
                if (!otherUser?.id) {
                    if (!acc.find(conv => conv.id === current.id)) acc.push(current);
                    return acc;
                }
                const exists = acc.find(conv => {
                    if (conv.is_group) return false;
                    const convOther = conv.participants?.find((p: any) => p.id !== user.id);
                    return convOther?.id === otherUser.id;
                });
                if (!exists) acc.push(current);
                return acc;
            }, []);

            return uniqueConversations;
        },
        enabled: !!user,
    });

    const getInitials = (name?: string) => name?.substring(0, 2).toUpperCase() || '??';

    return (
        <div className="flex flex-col h-full bg-muted/10 text-muted-foreground border-r">

            <ScrollArea className="flex-1 px-3">
                <div className="space-y-6 py-4">

                    {/* Channels Section */}
                    <div className="space-y-2 mb-8">
                        <div className="flex items-center justify-between px-4 group mb-2">
                            <h2 className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/60 transition-colors cursor-pointer hover:text-foreground">
                                Text Channels
                            </h2>
                            {isAdmin && (
                                <button
                                    onClick={() => setIsCreateChannelOpen(true)}
                                    className="text-muted-foreground/60 hover:text-foreground transition-all p-1 hover:bg-muted rounded-full"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                        {channels.map((channel: any) => (
                            <button
                                key={channel.id}
                                onClick={() => onSelectChannel(channel.id)}
                                className={`group relative w-full flex items-center px-4 py-2 mx-0 transition-all text-sm font-medium
                                    ${selectedChannelId === channel.id
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                                    }`}
                            >
                                {selectedChannelId === channel.id && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full" />
                                )}
                                <div className="flex items-center flex-1 min-w-0">
                                    <Hash className={`h-4 w-4 mr-3 flex-shrink-0 transition-colors ${selectedChannelId === channel.id ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-muted-foreground'}`} />
                                    <span className="truncate leading-none">
                                        {channel.slug || channel.title}
                                    </span>
                                </div>
                                {channel.isUnread && (
                                    <div className="h-2 w-2 rounded-full bg-primary ml-2 shadow-[0_0_8px_rgba(var(--primary),0.5)] animate-pulse" />
                                )}
                            </button>
                        ))}
                    </div>

                    <Separator className="bg-border/50" />

                    {/* DMs Section */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between px-4 mb-2">
                            <h2 className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/60">Direct Messages</h2>
                            <button
                                onClick={() => setIsCreateDMOpen(true)}
                                className="text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-full transition-all"
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </button>
                        </div>
                        {dms.map((dm: any) => (
                            <button
                                key={dm.id}
                                onClick={() => onSelectChannel(dm.id)}
                                className={`group relative w-full flex items-center px-4 py-2.5 mx-0 transition-all text-sm
                                    ${selectedChannelId === dm.id
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                                    }`}
                            >
                                {selectedChannelId === dm.id && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full" />
                                )}
                                <div className="relative mr-3 flex-shrink-0">
                                    <Avatar className="h-8 w-8 ring-2 ring-background ring-offset-2 ring-offset-transparent group-hover:ring-muted transition-all">
                                        <AvatarFallback className={`text-[10px] font-bold ${selectedChannelId === dm.id ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                            {dm.is_group ? <MessageSquare className="h-3.5 w-3.5" /> : getInitials(dm.title || 'U')}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-background"></span>
                                </div>
                                <div className="flex-1 truncate text-left">
                                    <span className={`block truncate leading-tight ${dm.isUnread ? 'font-bold text-foreground' : 'font-medium'}`}>
                                        {dm.displayTitle || dm.title || (dm.is_group ? 'Group Chat' : 'User')}
                                    </span>
                                    <span className="block truncate text-[10px] text-muted-foreground/60 mt-0.5 font-medium">
                                        Active now
                                    </span>
                                </div>
                                {dm.isUnread && (
                                    <div className="h-2 w-2 rounded-full bg-primary ml-2 shadow-[0_0_8px_rgba(var(--primary),0.5)] animate-pulse" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </ScrollArea>

            {/* User Mini Profile */}
            <div className="h-[52px] bg-background/50 flex items-center px-3 gap-2 border-t border-border">
                <Avatar className="h-8 w-8 hover:opacity-80 cursor-pointer transition-opacity">
                    <AvatarImage src={user?.user_metadata?.avatar_url} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        {getInitials(user?.email)}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 flex flex-col">
                    <span className="text-sm font-semibold text-foreground truncate">
                        {user?.email?.split('@')[0]}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                        #{user?.id?.substring(0, 4)}
                    </span>
                </div>
                <ThemeToggleSimple />
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
