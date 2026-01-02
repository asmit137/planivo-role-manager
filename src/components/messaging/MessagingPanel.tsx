import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Plus, X, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  sender: {
    id: string;
    full_name: string | null;
    email: string | null;
  };
}

const MessagingPanel = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [newConvoOpen, setNewConvoOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Real-time subscriptions for live updates
  useRealtimeSubscription({
    table: 'messages',
    invalidateQueries: ['conversation-messages', 'user-conversations'],
  });

  useRealtimeSubscription({
    table: 'conversations',
    invalidateQueries: ['user-conversations'],
  });

  useRealtimeSubscription({
    table: 'conversation_participants',
    invalidateQueries: ['user-conversations', 'conversation-messages'],
  });

  // Fetch workspace users
  const { data: workspaceUsers = [] } = useQuery({
    queryKey: ['workspace-users', user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Check if user is super admin
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role, workspace_id')
        .eq('user_id', user.id);

      const isSuperAdmin = userRoles?.some(r => r.role === 'super_admin');

      if (isSuperAdmin) {
        // Super admin can message anyone
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .neq('id', user.id);

        return allProfiles || [];
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
        .in('id', userIds);
      return profiles || [];
    },
    enabled: !!user && (open || newConvoOpen),
  });

  const filteredUsers = workspaceUsers.filter((u: any) =>
  (u.full_name?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearchTerm.toLowerCase()))
  );

  // Fetch conversations with fake data for testing
  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data: participantData, error } = await supabase
        .from('conversation_participants')
        .select(`
          conversation_id,
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


          // Get participants with profile join (explicit FK hint)
          // const { data: participants, error: participantsError } = await supabase
          //   .from('conversation_participants')
          //   .select('user_id, profiles:profiles!user_id(id, full_name, email)')
          //   .eq('conversation_id', convo.id);


          const { data: participantRows } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', convo.id);

          const userIds = participantRows?.map(p => p.user_id) ?? [];

          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', userIds);



          const { data: lastMessageArray } = await supabase
            .from('messages')
            .select('content, created_at, sender_id')
            .eq('conversation_id', convo.id)
            .order('created_at', { ascending: false })
            .limit(1);

          const lastMessage = lastMessageArray?.[0] || null;

          const mappedParticipants = userIds.map(id => {
            const profile = profiles?.find(p => p.id === id);

            return {
              id,
              name:
                profile?.full_name || "user",
              email: profile?.email ?? null
            };
          });

          return {
            ...convo,
            participants: mappedParticipants,
            last_message: lastMessage,
          };
        })
      );

      // Filter out null conversations and conversations without messages
      const validConvos = convos.filter(c => c && c.last_message) as Conversation[];

      return validConvos.sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    },
    enabled: !!user && open,
  });

  // Fetch messages for selected conversation with fake data
  const { data: messages = [] } = useQuery({
    queryKey: ['messages', selectedConversation],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', selectedConversation)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch sender details separately
      const messagesWithSenders = await Promise.all(
        (data || []).map(async (msg) => {
          const { data: sender } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', msg.sender_id)
            .single();

          return {
            ...msg,
            sender: sender || { id: msg.sender_id, full_name: null, email: null },
          };
        })
      );

      return messagesWithSenders as Message[];
    },
    enabled: !!selectedConversation,
  });

  // Create conversation mutation
  const createConversationMutation = useMutation({
    mutationFn: async ({ userIds, isGroup, title }: { userIds: string[]; isGroup: boolean; title?: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          title: isGroup ? title : null,
          is_group: isGroup,
          created_by: user.id,
        })
        .select()
        .single();

      if (convError) throw convError;

      const participants = [...userIds, user.id].map(userId => ({
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
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setSelectedConversation(conversation.id);
      setNewConvoOpen(false);
      setSelectedUsers([]);
      setGroupName('');
      toast.success('Conversation created');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create conversation');
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: string; content: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setMessageInput('');
    },
  });

  // Real-time message subscription
  useEffect(() => {
    if (!selectedConversation) return;

    const channel = supabase
      .channel(`messages-${selectedConversation}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedConversation}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', selectedConversation] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConversation, queryClient]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if (!messageInput.trim() || !selectedConversation) return;

    sendMessageMutation.mutate({
      conversationId: selectedConversation,
      content: messageInput.trim(),
    });
  };

  const handleCreateConversation = () => {
    if (selectedUsers.length === 0) {
      toast.error('Please select at least one user');
      return;
    }

    const isGroup = selectedUsers.length > 1;
    if (isGroup && !groupName.trim()) {
      toast.error('Please enter a group name');
      return;
    }

    createConversationMutation.mutate({
      userIds: selectedUsers,
      isGroup,
      title: isGroup ? groupName : undefined,
    });
  };


  const getConversationTitle = (convo: Conversation) => {

    if (convo.title) return convo.title;

    const otherParticipants = convo.participants.filter(p => {
      const isNotCurrentUser = p?.id !== user?.id;

      return isNotCurrentUser;
    });

    if (otherParticipants.length === 0) {

      return 'Note to Self';
    }


    const title = otherParticipants
      .map(p => p?.name || `User ${p?.id?.substring(0, 4)}` || 'Unknown User')
      .join(', ');

    return title;
  };

  const selectedConvo = conversations.find(c => c.id === selectedConversation);


  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative hover:bg-white/10 transition-colors rounded-full"
        >
          <MessageSquare className="h-5 w-5 text-white/80" />
          {conversations.some(c => (c.unread_count || 0) > 0) && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background animate-pulse" />
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full sm:w-[500px] p-0 border-l border-white/10 bg-black/60 backdrop-blur-3xl"
      >
        <div className="flex h-full overflow-hidden">
          {/* Conversations List */}
          <div className={cn(
            "w-full flex flex-col border-r border-white/5 bg-white/5 backdrop-blur-md",
            selectedConversation && "hidden sm:flex sm:w-2/5"
          )}>
            <SheetHeader className="sr-only">
              <SheetTitle>Messenger</SheetTitle>
              <SheetDescription>View and send messages to your colleagues.</SheetDescription>
            </SheetHeader>
            <div className="p-6 border-b border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                  Messages
                </h2>
                <Dialog open={newConvoOpen} onOpenChange={setNewConvoOpen}>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full h-8 w-8 p-0 hover:bg-white/10"
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-zinc-950 border-white/10 backdrop-blur-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-xl">New Chat</DialogTitle>
                      <DialogDescription className="text-white/40">
                        Select users to start a new private or group conversation.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 pt-4">
                      <div className="space-y-2">
                        <Label className="text-white/60">Search Users</Label>
                        <Input
                          placeholder="Name or email..."
                          value={userSearchTerm}
                          onChange={(e) => setUserSearchTerm(e.target.value)}
                          className="bg-white/5 border-white/10 focus:ring-primary/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-white/60">Participants</Label>
                        <ScrollArea className="h-60 rounded-xl bg-white/5 p-4 border border-white/10">
                          {filteredUsers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full space-y-2 py-8 opacity-40">
                              <Users className="h-10 w-10" />
                              <p className="text-sm">No users found</p>
                            </div>
                          ) : (
                            filteredUsers.map((wsUser: any) => (
                              <div
                                key={wsUser.id}
                                className="flex items-center space-x-3 p-3 rounded-lg hover:bg-white/5 transition-all mb-1 cursor-pointer group"
                                onClick={() => {
                                  if (selectedUsers.includes(wsUser.id)) {
                                    setSelectedUsers(selectedUsers.filter(id => id !== wsUser.id));
                                  } else {
                                    setSelectedUsers([...selectedUsers, wsUser.id]);
                                  }
                                }}
                              >
                                <Checkbox
                                  id={`user-${wsUser.id}`}
                                  checked={selectedUsers.includes(wsUser.id)}
                                  className="border-white/20 data-[state=checked]:bg-primary"
                                />
                                <div className="flex-1">
                                  <p className="text-sm font-medium group-hover:text-primary transition-colors">
                                    {wsUser.full_name || wsUser.email || wsUser.id.substring(0, 8)}
                                  </p>
                                  <p className="text-xs text-white/40 truncate">{wsUser.email}</p>
                                </div>
                              </div>
                            ))
                          )}
                        </ScrollArea>
                      </div>

                      {selectedUsers.length > 1 && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                          <Label className="text-white/60">Group Name</Label>
                          <Input
                            placeholder="Engineering Team, Lunch Buddies..."
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            className="bg-white/5 border-white/10 focus:ring-primary/50"
                          />
                        </div>
                      )}

                      <Button
                        className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-6 rounded-xl transition-all shadow-lg shadow-primary/20"
                        onClick={handleCreateConversation}
                        disabled={createConversationMutation.isPending || selectedUsers.length === 0}
                      >
                        {createConversationMutation.isPending ? 'Launching Chat...' : 'Start Conversation'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 px-6 opacity-30">
                    <MessageSquare className="h-16 w-16 mb-4" />
                    <p className="text-center font-medium">Clear Inbox</p>
                    <p className="text-xs text-center mt-2">Start a chat to keep connections alive</p>
                  </div>
                ) : (
                  conversations.map((convo) => {
                    const title = getConversationTitle(convo);
                    const isSelected = selectedConversation === convo.id;
                    return (
                      <div
                        key={convo.id}
                        className={cn(
                          "group relative p-4 rounded-2xl cursor-pointer transition-all duration-300",
                          isSelected ? "bg-white/10 ring-1 ring-white/20" : "hover:bg-white/5"
                        )}
                        onClick={() => setSelectedConversation(convo.id)}
                      >
                        <div className="flex gap-4">
                          <Avatar className="h-12 w-12 border border-white/10 shadow-xl group-hover:scale-105 transition-transform">
                            <AvatarFallback className="bg-gradient-to-br from-primary/50 to-purple-600/50 text-white font-bold">
                              {convo.is_group ? <Users className="h-5 w-5" /> : title[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className={cn(
                                "font-semibold truncate text-[15px]",
                                isSelected ? "text-white" : "text-white/80"
                              )}>
                                {title}
                              </h4>
                              {convo.last_message && (
                                <span className="text-[10px] uppercase tracking-wider text-white/30 shrink-0 ml-2">
                                  {formatDistanceToNow(new Date(convo.last_message.created_at), { addSuffix: false })}
                                </span>
                              )}
                            </div>
                            {convo.last_message && (
                              <p className="text-sm text-white/40 truncate">
                                <span className="font-semibold text-white/20 mr-1">
                                  {convo.last_message.sender_id === user?.id ? 'You:' : ''}
                                </span>
                                {convo.last_message.content}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Messages View */}
          <div className={cn(
            "flex-1 flex flex-col bg-zinc-950/40 relative",
            !selectedConversation && "hidden sm:flex items-center justify-center"
          )}>
            {!selectedConversation ? (
              <div className="text-center space-y-4 animate-in fade-in zoom-in duration-700">
                <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto ring-1 ring-primary/20 shadow-2xl">
                  <MessageSquare className="h-10 w-10 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Your Inbox</h3>
                  <p className="text-white/40 text-sm max-w-[240px] mt-2">
                    Send secure, encrypted messages to your teammates instantly.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-6 border-b border-white/5 flex items-center gap-4 bg-white/5 backdrop-blur-xl z-10">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="sm:hidden rounded-full hover:bg-white/10"
                    onClick={() => setSelectedConversation(null)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                  <Avatar className="h-10 w-10 border border-white/10 ring-2 ring-primary/20">
                    <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
                      {selectedConvo && getConversationTitle(selectedConvo)[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg truncate">
                      {selectedConvo && getConversationTitle(selectedConvo)}
                    </h3>
                    {selectedConvo?.is_group && (
                      <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold">
                        Group • {selectedConvo.participants.length} Active
                      </p>
                    )}
                  </div>
                </div>

                <ScrollArea className="flex-1 p-6">
                  <div className="space-y-6">
                    {messages.map((message, idx) => {
                      const isOwn = message.sender_id === user?.id;
                      const showSenderName = !isOwn && (idx === 0 || messages[idx - 1].sender_id !== message.sender_id);

                      return (
                        <div
                          key={message.id}
                          className={cn(
                            "flex gap-3",
                            isOwn ? "flex-row-reverse" : "flex-row",
                            "animate-in slide-in-from-bottom-2 duration-300"
                          )}
                        >
                          {!isOwn && (
                            <Avatar className="h-8 w-8 mt-1 border border-white/10 self-end">
                              <AvatarFallback className="text-[10px] bg-zinc-800">
                                {message.sender?.full_name?.[0] || '?'}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div className={cn(
                            "flex flex-col gap-1.5 max-w-[75%]",
                            isOwn ? "items-end" : "items-start"
                          )}>
                            {showSenderName && (
                              <span className="text-[10px] font-bold text-white/30 ml-2 uppercase tracking-wider">
                                {message.sender?.full_name || message.sender?.email || message.sender?.id.substring(0, 8)}
                              </span>
                            )}
                            <div className={cn(
                              "rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed shadow-lg",
                              isOwn
                                ? "bg-primary text-white rounded-tr-none shadow-primary/20 font-medium"
                                : "bg-white/10 text-white/90 rounded-tl-none border border-white/5 backdrop-blur-md"
                            )}>
                              {message.content}
                            </div>
                            <span className="text-[9px] text-white/20 font-medium ml-1">
                              {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                <div className="p-6 bg-gradient-to-t from-zinc-950 to-transparent">
                  <div className="flex gap-2 relative group items-center">
                    <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
                    <Input
                      placeholder="Share your thoughts..."
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      className="bg-white/5 border-white/10 focus:bg-white/10 focus:ring-primary/40 rounded-xl py-6 pr-12 relative z-10 transition-all placeholder:text-white/20"
                    />
                    <Button
                      size="icon"
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim() || sendMessageMutation.isPending}
                      className="absolute right-2 h-10 w-10 rounded-lg bg-primary hover:bg-primary/90 text-white shadow-xl z-20 transition-all active:scale-95"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MessagingPanel;


