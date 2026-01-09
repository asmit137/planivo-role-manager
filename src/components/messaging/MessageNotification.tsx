import { useState, useEffect } from 'react';
import { MessageSquare, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

interface Conversation {
    id: string;
    title: string | null;
    is_group: boolean;
    updated_at: string;
    participants: any[];
    last_message?: any;
    unread_count?: number;
}

const MessageNotification = () => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    // Real-time subscriptions for live updates
    useRealtimeSubscription({
        table: 'messages',
        invalidateQueries: ['user-conversations-summary'],
    });

    useRealtimeSubscription({
        table: 'conversations',
        invalidateQueries: ['user-conversations-summary'],
    });

    useRealtimeSubscription({
        table: 'conversation_participants',
        invalidateQueries: ['user-conversations-summary'],
    });

    // Fetch conversations summary
    const { data: conversations = [] } = useQuery({
        queryKey: ['user-conversations-summary', user?.id],
        queryFn: async () => {
            if (!user) return [];

            const { data: participantData, error } = await supabase
                .from('conversation_participants')
                .select(`
                  conversation_id,
                  last_read_at,
                  conversations (
                    id,
                    title,
                    is_group,
                    updated_at
                  )
                `)
                .eq('user_id', user.id);

            if (error) throw error;

            const convos = await Promise.all(
                (participantData || []).map(async (p: any) => {
                    const convo = p.conversations;
                    if (!convo) return null;

                    // Get participant profiles
                    const { data: participantRows } = await supabase
                        .from('conversation_participants')
                        .select('user_id')
                        .eq('conversation_id', convo.id);

                    const userIds = participantRows?.map(p_row => p_row.user_id) ?? [];

                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, full_name, email')
                        .in('id', userIds);

                    // Get last message
                    const { data: lastMessageArray } = await supabase
                        .from('messages')
                        .select('content, created_at, sender_id')
                        .eq('conversation_id', convo.id)
                        .order('created_at', { ascending: false })
                        .limit(1);

                    const lastMessage = lastMessageArray?.[0] || null;

                    const mappedParticipants = userIds.map(id => {
                        const profile = profiles?.find(prof => prof.id === id);
                        return {
                            id,
                            name: profile?.full_name || "User",
                            email: profile?.email ?? null
                        };
                    });

                    // Check unread status using last_read_at
                    const lastRead = p.last_read_at ? new Date(p.last_read_at) : new Date(0);
                    const lastMsgTime = lastMessage?.created_at ? new Date(lastMessage.created_at) : new Date(0);
                    const isUnread = lastMsgTime > lastRead;

                    return {
                        ...convo,
                        participants: mappedParticipants,
                        last_message: lastMessage,
                        unread_count: isUnread ? 1 : 0
                    };
                })
            );

            const validConvos = convos.filter(c => c && c.last_message) as Conversation[];

            return validConvos.sort((a, b) => {
                const aUnread = (a.unread_count || 0) > 0;
                const bUnread = (b.unread_count || 0) > 0;
                if (aUnread && !bUnread) return -1;
                if (!aUnread && bUnread) return 1;
                return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
            }).slice(0, 5); // Only show top 5
        },
        enabled: !!user,
    });

    const totalUnread = conversations.reduce((acc, curr) => acc + (curr.unread_count || 0), 0);

    const getConversationTitle = (convo: Conversation) => {
        if (convo.title) return convo.title;
        const otherParticipants = convo.participants.filter(p => p?.id !== user?.id);
        if (otherParticipants.length === 0) return 'Note to Self';
        return otherParticipants
            .map(p => p?.name || 'Unknown User')
            .join(', ');
    };

    const handleConversationClick = (convoId: string) => {
        setOpen(false);
        navigate(`/dashboard?tab=messaging&convo=${convoId}`);
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative hover:bg-muted transition-colors rounded-full"
                >
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                    {totalUnread > 0 && (
                        <Badge
                            variant="destructive"
                            className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] min-w-0"
                        >
                            {totalUnread > 9 ? '9+' : totalUnread}
                        </Badge>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0 border-border bg-popover/95 backdrop-blur-xl">
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h3 className="font-semibold text-foreground">Messages</h3>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-primary hover:text-primary/80"
                        onClick={() => {
                            setOpen(false);
                            navigate('/dashboard?tab=messaging');
                        }}
                    >
                        View All
                    </Button>
                </div>

                <ScrollArea className="max-h-[400px]">
                    {conversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 px-4 opacity-40">
                            <MessageSquare className="h-10 w-10 mb-2" />
                            <p className="text-sm">No recent messages</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {conversations.map((convo) => {
                                const title = getConversationTitle(convo);
                                return (
                                    <div
                                        key={convo.id}
                                        className={cn(
                                            "p-4 hover:bg-muted/50 transition-colors cursor-pointer flex gap-3 items-start",
                                            convo.unread_count ? "bg-primary/5" : ""
                                        )}
                                        onClick={() => handleConversationClick(convo.id)}
                                    >
                                        <Avatar className="h-10 w-10 border border-border">
                                            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                                                {convo.is_group ? <Users className="h-4 w-4" /> : title[0]}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <h4 className={cn(
                                                    "text-sm font-medium truncate",
                                                    convo.unread_count ? "text-foreground font-semibold" : "text-muted-foreground"
                                                )}>
                                                    {title}
                                                </h4>
                                                {convo.last_message && (
                                                    <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap">
                                                        {formatDistanceToNow(new Date(convo.last_message.created_at), { addSuffix: false })}
                                                    </span>
                                                )}
                                            </div>
                                            {convo.last_message && (
                                                <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                                                    {convo.last_message.sender_id === user?.id ? 'You: ' : ''}
                                                    {convo.last_message.content}
                                                </p>
                                            )}
                                        </div>
                                        {convo.unread_count > 0 && (
                                            <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </ScrollArea>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default MessageNotification;
