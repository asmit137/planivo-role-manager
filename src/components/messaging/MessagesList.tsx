import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { formatDistanceToNow } from 'date-fns';

const MessagesList = () => {
  const { user } = useAuth();

  const { data: messages, isLoading } = useQuery({
    queryKey: ['all-messages', user?.id],
    queryFn: async () => {
      // Get all conversations user is part of
      const { data: userConversations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user?.id);

      if (!userConversations || userConversations.length === 0) return [];

      const conversationIds = userConversations.map(c => c.conversation_id);

      // Get all messages from these conversations
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })
        .limit(100);

      if (messagesError) throw messagesError;
      if (!messagesData) return [];

      // Get conversation details
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id, title, is_group')
        .in('id', conversationIds);

      // Get sender profiles
      const senderIds = [...new Set(messagesData.map(m => m.sender_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', senderIds);

      // Combine data
      return messagesData.map(message => ({
        ...message,
        conversation: conversations?.find(c => c.id === message.conversation_id),
        sender: profiles?.find(p => p.id === message.sender_id)
      }));
    },
    enabled: !!user,
  });

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>All Messages</CardTitle>
            <CardDescription>View all your conversations and messages</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading messages...
          </div>
        ) : messages && messages.length > 0 ? (
          <div className="space-y-3">
            {messages.map((message) => {
              const isFromCurrentUser = message.sender_id === user?.id;
              const conversationTitle = message.conversation?.title || 'Direct Message';
              
              return (
                <div
                  key={message.id}
                  className="p-3 sm:p-4 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {message.conversation?.is_group && (
                          <Users className="h-4 w-4 text-muted-foreground" />
                        )}
                        <h4 className="font-semibold text-sm">{conversationTitle}</h4>
                        {isFromCurrentUser && (
                          <Badge variant="secondary" className="text-xs">You</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        From: <span className="font-medium">{message.sender?.full_name || message.sender?.email}</span>
                      </p>
                      <p className="text-sm text-foreground mt-2">{message.content}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatDistanceToNow(new Date(message.created_at || ''), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No messages yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MessagesList;
