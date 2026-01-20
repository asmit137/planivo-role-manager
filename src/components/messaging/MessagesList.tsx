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

      const { data: userConversations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user?.id);

      // console.log("User Conversations", userConversations)

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

      // Get conversation details with participants
      const { data: conversations } = await supabase
        .from('conversations')
        .select(`
          id, 
          title, 
          is_group,
          conversation_participants(
            user_id,
            profiles!user_id(id, full_name, email)
          )
        `)
        .in('id', conversationIds);

      // Get sender profiles
      const senderIds = [...new Set(messagesData.map(m => m.sender_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', senderIds);

      // Combine data
      return messagesData.map(message => {
        const convo = conversations?.find(c => c.id === message.conversation_id);
        const sender = profiles?.find(p => p.id === message.sender_id) || {
          id: message.sender_id,
          full_name: `User ${message.sender_id.substring(0, 4)}`,
          email: null
        };

        // Enhance conversation title logic
        let title = convo?.title;
        if (!title && convo) {
          const others = (convo.conversation_participants as any[])?.filter(p => p.user_id !== user?.id);
          if (others.length === 0) {
            title = 'Note to Self';
          } else {
            title = others.map(p => p.profiles?.full_name || p.profiles?.email || `User ${p.user_id.substring(0, 4)}`).join(', ');
          }
        }

        return {
          ...message,
          conversation: { ...convo, title },
          sender
        };
      });
    },
    enabled: !!user,
  });

  return (
    <Card className="border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl overflow-hidden">
      <CardHeader className="border-b border-white/5 bg-white/5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              All Messages
            </CardTitle>
            <CardDescription className="text-white/40">Securely messaging colleagues in real-time</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <p className="text-white/40 font-medium">Loading encrypted data...</p>
          </div>
        ) : messages && messages.length > 0 ? (
          <div className="divide-y divide-white/5">
            {messages.map((message) => {
              const isFromCurrentUser = message.sender_id === user?.id;
              const title = message.conversation?.title || 'Direct Message';

              return (
                <div
                  key={message.id}
                  className="p-6 hover:bg-white/5 transition-all duration-300 group"
                >
                  <div className="flex gap-6">
                    <div className="relative">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-600/20 flex items-center justify-center border border-white/10 group-hover:scale-105 transition-transform shadow-xl">
                        {message.conversation?.is_group ? (
                          <Users className="h-6 w-6 text-primary" />
                        ) : (
                          <span className="text-lg font-bold text-primary">{title[0]}</span>
                        )}
                      </div>
                      {isFromCurrentUser && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary rounded-full border-2 border-background flex items-center justify-center">
                          <Badge className="p-0 bg-transparent text-[8px] font-bold">YOU</Badge>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-lg text-white/90 group-hover:text-primary transition-colors">
                            {title}
                          </h4>
                        </div>
                        <span className="text-xs font-medium text-white/20 uppercase tracking-widest whitespace-nowrap">
                          {formatDistanceToNow(new Date(message.created_at || ''), { addSuffix: true })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-white/40 bg-white/5 w-fit px-2 py-1 rounded-md border border-white/5">
                        <span className="font-bold uppercase tracking-tighter text-white/20">From:</span>
                        <span className="font-semibold text-white/60">
                          {message.sender?.full_name || message.sender?.email || message.sender?.id.substring(0, 8)}
                        </span>
                      </div>

                      <p className="text-[15px] text-white/60 line-clamp-2 mt-3 font-medium leading-relaxed">
                        {message.content}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-32 px-10 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10">
              <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/10">
                <MessageSquare className="h-10 w-10 text-white/20" />
              </div>
              <h3 className="text-xl font-bold mb-2">No messages yet</h3>
              <p className="text-white/40 max-w-xs mx-auto">Your messaging hub is quiet. Open the sidebar and click the plus icon to start a conversation.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MessagesList;
