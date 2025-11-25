import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Plus, X, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
    full_name: string;
    email: string;
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
      
      // Get user's workspaces
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('workspace_id')
        .eq('user_id', user.id);
      
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
    enabled: !!user && open,
  });

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
          
          // Get participants
          const { data: participants } = await supabase
            .from('conversation_participants')
            .select('user_id, profiles(id, full_name, email)')
            .eq('conversation_id', convo.id);
          
          // Get last message
          const { data: lastMessage } = await supabase
            .from('messages')
            .select('content, created_at')
            .eq('conversation_id', convo.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          return {
            ...convo,
            participants: participants?.map((p: any) => p.profiles) || [],
            last_message: lastMessage,
          };
        })
      );
      
      // Add fake test conversations if no real conversations exist
      if (convos.length === 0) {
        return [
          {
            id: 'fake-1',
            title: null,
            is_group: false,
            updated_at: new Date().toISOString(),
            participants: [
              { id: 'fake-user-1', full_name: 'John Smith', email: 'john@example.com' },
            ],
            last_message: {
              content: 'Hey, how are you doing today?',
              created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 mins ago
            },
          },
          {
            id: 'fake-2',
            title: 'Project Team',
            is_group: true,
            updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 mins ago
            participants: [
              { id: 'fake-user-2', full_name: 'Sarah Johnson', email: 'sarah@example.com' },
              { id: 'fake-user-3', full_name: 'Mike Wilson', email: 'mike@example.com' },
              { id: 'fake-user-4', full_name: 'Emily Davis', email: 'emily@example.com' },
            ],
            last_message: {
              content: 'The meeting is scheduled for tomorrow at 10 AM',
              created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
            },
          },
          {
            id: 'fake-3',
            title: null,
            is_group: false,
            updated_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
            participants: [
              { id: 'fake-user-5', full_name: 'Alex Brown', email: 'alex@example.com' },
            ],
            last_message: {
              content: 'Thanks for the help!',
              created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
            },
          },
        ] as Conversation[];
      }
      
      return convos.sort((a, b) => 
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      ) as Conversation[];
    },
    enabled: !!user && open,
  });

  // Fetch messages for selected conversation with fake data
  const { data: messages = [] } = useQuery({
    queryKey: ['messages', selectedConversation],
    queryFn: async () => {
      if (!selectedConversation) return [];
      
      // Return fake messages for fake conversations
      if (selectedConversation.startsWith('fake-')) {
        const fakeMessages: { [key: string]: Message[] } = {
          'fake-1': [
            {
              id: 'msg-1',
              content: 'Hey, how are you doing today?',
              sender_id: 'fake-user-1',
              created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
              sender: { full_name: 'John Smith', email: 'john@example.com' },
            },
            {
              id: 'msg-2',
              content: 'I\'m doing great! Just finished the project presentation.',
              sender_id: user?.id || '',
              created_at: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
              sender: { full_name: 'You', email: user?.email || '' },
            },
            {
              id: 'msg-3',
              content: 'That\'s awesome! How did it go?',
              sender_id: 'fake-user-1',
              created_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
              sender: { full_name: 'John Smith', email: 'john@example.com' },
            },
          ],
          'fake-2': [
            {
              id: 'msg-4',
              content: 'Good morning team! Quick reminder about tomorrow\'s meeting.',
              sender_id: 'fake-user-2',
              created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
              sender: { full_name: 'Sarah Johnson', email: 'sarah@example.com' },
            },
            {
              id: 'msg-5',
              content: 'Thanks for the reminder! What time again?',
              sender_id: 'fake-user-3',
              created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
              sender: { full_name: 'Mike Wilson', email: 'mike@example.com' },
            },
            {
              id: 'msg-6',
              content: 'The meeting is scheduled for tomorrow at 10 AM',
              sender_id: 'fake-user-2',
              created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
              sender: { full_name: 'Sarah Johnson', email: 'sarah@example.com' },
            },
            {
              id: 'msg-7',
              content: 'Perfect, I\'ll be there!',
              sender_id: user?.id || '',
              created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
              sender: { full_name: 'You', email: user?.email || '' },
            },
          ],
          'fake-3': [
            {
              id: 'msg-8',
              content: 'Can you help me with the report?',
              sender_id: user?.id || '',
              created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
              sender: { full_name: 'You', email: user?.email || '' },
            },
            {
              id: 'msg-9',
              content: 'Sure! What do you need help with?',
              sender_id: 'fake-user-5',
              created_at: new Date(Date.now() - 1000 * 60 * 60 * 2.5).toISOString(),
              sender: { full_name: 'Alex Brown', email: 'alex@example.com' },
            },
            {
              id: 'msg-10',
              content: 'I need to format the tables properly',
              sender_id: user?.id || '',
              created_at: new Date(Date.now() - 1000 * 60 * 60 * 2.2).toISOString(),
              sender: { full_name: 'You', email: user?.email || '' },
            },
            {
              id: 'msg-11',
              content: 'Thanks for the help!',
              sender_id: user?.id || '',
              created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
              sender: { full_name: 'You', email: user?.email || '' },
            },
          ],
        };
        
        return fakeMessages[selectedConversation] || [];
      }
      
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
            sender: sender || { full_name: 'Unknown', email: '' },
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
      
      // Create conversation
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
      
      // Add participants (including current user)
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
    const otherParticipants = convo.participants.filter(p => p.id !== user?.id);
    return otherParticipants.map(p => p.full_name).join(', ') || 'Unknown';
  };

  const selectedConvo = conversations.find(c => c.id === selectedConversation);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <MessageSquare className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:w-[500px] p-0">
        <div className="flex h-full">
          {/* Conversations List */}
          <div className={cn(
            "w-full border-r",
            selectedConversation && "hidden sm:block sm:w-2/5"
          )}>
            <SheetHeader className="p-4 border-b">
              <div className="flex items-center justify-between">
                <SheetTitle>Messages</SheetTitle>
                <Dialog open={newConvoOpen} onOpenChange={setNewConvoOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="ghost">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>New Conversation</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Select Users</Label>
                        <ScrollArea className="h-48 border rounded-md p-2">
                          {workspaceUsers.map((wsUser: any) => (
                            <div key={wsUser.id} className="flex items-center space-x-2 p-2">
                              <Checkbox
                                checked={selectedUsers.includes(wsUser.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedUsers([...selectedUsers, wsUser.id]);
                                  } else {
                                    setSelectedUsers(selectedUsers.filter(id => id !== wsUser.id));
                                  }
                                }}
                              />
                              <Label className="flex-1 cursor-pointer">
                                {wsUser.full_name}
                                <span className="text-xs text-muted-foreground block">
                                  {wsUser.email}
                                </span>
                              </Label>
                            </div>
                          ))}
                        </ScrollArea>
                      </div>
                      {selectedUsers.length > 1 && (
                        <div className="space-y-2">
                          <Label>Group Name</Label>
                          <Input
                            placeholder="Enter group name"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                          />
                        </div>
                      )}
                      <Button
                        className="w-full"
                        onClick={handleCreateConversation}
                        disabled={createConversationMutation.isPending}
                      >
                        Create Conversation
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </SheetHeader>
            <ScrollArea className="h-[calc(100vh-80px)]">
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground px-4">
                  <MessageSquare className="h-12 w-12 mb-2 opacity-50" />
                  <p className="text-center">No conversations yet</p>
                  <p className="text-xs text-center mt-1">Start a new conversation to begin messaging</p>
                </div>
              ) : (
                <div className="divide-y">
                  {conversations.map((convo) => (
                    <div
                      key={convo.id}
                      className={cn(
                        "p-4 hover:bg-muted/50 cursor-pointer transition-colors",
                        selectedConversation === convo.id && "bg-muted"
                      )}
                      onClick={() => setSelectedConversation(convo.id)}
                    >
                      <div className="flex gap-3">
                        <Avatar>
                          <AvatarFallback>
                            {convo.is_group ? <Users className="h-4 w-4" /> : getConversationTitle(convo)[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium truncate">{getConversationTitle(convo)}</h4>
                            {convo.last_message && (
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(convo.last_message.created_at), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                          {convo.last_message && (
                            <p className="text-sm text-muted-foreground truncate mt-1">
                              {convo.last_message.content}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Messages View */}
          {selectedConversation && (
            <div className="flex-1 flex flex-col">
              <div className="p-4 border-b flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="sm:hidden"
                  onClick={() => setSelectedConversation(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
                <div className="flex-1">
                  <h3 className="font-semibold">{selectedConvo && getConversationTitle(selectedConvo)}</h3>
                  {selectedConvo?.is_group && (
                    <p className="text-xs text-muted-foreground">
                      {selectedConvo.participants.length} members
                    </p>
                  )}
                </div>
              </div>
              
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.map((message) => {
                    const isOwn = message.sender_id === user?.id;
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "flex gap-2",
                          isOwn && "flex-row-reverse"
                        )}
                      >
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarFallback className="text-xs">
                            {message.sender.full_name[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className={cn(
                          "flex flex-col gap-1 max-w-[70%]",
                          isOwn && "items-end"
                        )}>
                          {!isOwn && (
                            <span className="text-xs font-medium">{message.sender.full_name}</span>
                          )}
                          <div className={cn(
                            "rounded-lg px-3 py-2",
                            isOwn ? "bg-primary text-primary-foreground" : "bg-muted"
                          )}>
                            <p className="text-sm">{message.content}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <Button
                    size="icon"
                    onClick={handleSendMessage}
                    disabled={!messageInput.trim() || sendMessageMutation.isPending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MessagingPanel;