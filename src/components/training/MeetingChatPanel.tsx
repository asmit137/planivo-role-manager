import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Send, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface MeetingChatPanelProps {
  eventId: string;
}

interface ChatMessage {
  id: string;
  message: string;
  sent_at: string;
  user_id: string;
  profiles?: {
    full_name: string;
    email: string;
  };
}

const MeetingChatPanel = ({ eventId }: MeetingChatPanelProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Fetch chat messages
  const { data: messages, isLoading } = useQuery({
    queryKey: ['meeting-chat', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_meeting_chat')
        .select(`
          id,
          message,
          sent_at,
          user_id,
          profiles (
            full_name,
            email
          )
        `)
        .eq('event_id', eventId)
        .order('sent_at', { ascending: true });
      if (error) throw error;
      return data as ChatMessage[];
    },
  });

  // Subscribe to realtime chat updates
  useEffect(() => {
    const channel = supabase
      .channel(`meeting-chat-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'training_meeting_chat',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['meeting-chat', eventId] });
        }
      )
      .subscribe();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [eventId, queryClient]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('training_meeting_chat')
        .insert({
          event_id: eventId,
          user_id: user.id,
          message: message.trim(),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewMessage('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send message');
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    sendMessageMutation.mutate(newMessage);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <h3 className="font-semibold">Meeting Chat</h3>
        <p className="text-xs text-muted-foreground">
          {messages?.length || 0} messages
        </p>
      </div>

      <ScrollArea ref={scrollAreaRef} className="flex-1 p-3">
        <div className="space-y-3">
          {isLoading && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {messages?.map((msg) => {
            const isOwnMessage = msg.user_id === user?.id;
            const senderName = msg.profiles?.full_name || 'Unknown';

            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-xs">
                    {getInitials(senderName)}
                  </AvatarFallback>
                </Avatar>
                <div className={`flex flex-col ${isOwnMessage ? 'items-end' : ''}`}>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium">{isOwnMessage ? 'You' : senderName}</span>
                    <span>{format(new Date(msg.sent_at), 'h:mm a')}</span>
                  </div>
                  <div
                    className={`mt-1 px-3 py-2 rounded-lg max-w-[200px] break-words ${isOwnMessage
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                      }`}
                  >
                    <p className="text-sm">{msg.message}</p>
                  </div>
                </div>
              </div>
            );
          })}

          {messages?.length === 0 && !isLoading && (
            <p className="text-center text-sm text-muted-foreground py-4">
              No messages yet. Start the conversation!
            </p>
          )}
        </div>
      </ScrollArea>

      <form onSubmit={handleSendMessage} className="p-3 border-t">
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            disabled={sendMessageMutation.isPending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!newMessage.trim() || sendMessageMutation.isPending}
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default MeetingChatPanel;
