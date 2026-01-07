import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Hash, Menu, PlusCircle, Gift, Sticker, Smile, Send, MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface ChatAreaProps {
    channelId: string | null;
    onMobileMenuToggle: () => void;
}
export const ChatArea = ({ channelId, onMobileMenuToggle }: ChatAreaProps) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [messageInput, setMessageInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        }
        // Reset input to allow re-selection
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleRemoveFile = () => {
        setSelectedFile(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
    };

    // Check if user is a participant
    const { data: isParticipant, refetch: refetchParticipant } = useQuery({
        queryKey: ['is-participant', channelId, user?.id],
        queryFn: async () => {
            if (!channelId || !user) return false;
            // For channels, strictly check participation. DMs often implicit, but let's be consistent.
            const { data, error } = await supabase
                .from('conversation_participants')
                .select('id')
                .eq('conversation_id', channelId)
                .eq('user_id', user.id)
                .maybeSingle();

            if (error) return false;
            return !!data;
        },
        enabled: !!channelId && !!user
    });

    const joinChannelMutation = useMutation({
        mutationFn: async () => {
            if (!user || !channelId) return;
            const { error } = await supabase
                .from('conversation_participants')
                .insert({
                    conversation_id: channelId,
                    user_id: user.id
                });
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Joined channel!');
            refetchParticipant();
            queryClient.invalidateQueries({ queryKey: ['discord-messages', channelId] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to join channel');
        }
    });

    // Fetch Conversation Details
    const { data: conversation } = useQuery({
        queryKey: ['conversation', channelId, user?.id],
        queryFn: async () => {
            if (!channelId) return null;

            // 1. Fetch Conversation
            const { data: conversationData, error: convError } = await supabase
                .from('conversations')
                .select('*')
                .eq('id', channelId)
                .single();

            if (convError) throw convError;

            const fullConversation = conversationData as any;

            // 2. Fetch Participants
            const { data: participants, error: partError } = await supabase
                .from('conversation_participants')
                .select('user_id')
                .eq('conversation_id', channelId);

            if (partError) console.error('Error fetching participants:', partError);

            // 3. Fetch Profiles
            if (participants && participants.length > 0) {
                const userIds = participants.map(p => p.user_id);
                const { data: profiles, error: profError } = await supabase
                    .from('profiles')
                    .select('id, full_name, email')
                    .in('id', userIds);

                if (profError) console.error('Error fetching profiles:', profError);

                // Attach to conversation object structure expected by UI
                fullConversation.conversation_participants = participants.map(p => ({
                    user_id: p.user_id,
                    profiles: profiles?.find(prof => prof.id === p.user_id)
                }));
            }

            // 4. Generate Title Logic
            if (fullConversation && !fullConversation.title && fullConversation.type !== 'channel') {
                console.log('Generating title for conversation:', fullConversation.id);

                const others = fullConversation.conversation_participants?.filter(
                    (p: any) => p.user_id !== user?.id
                ) || [];

                if (others.length === 0) {
                    fullConversation.title = 'Note to Self';
                } else {
                    fullConversation.title = others
                        .map((p: any) => {
                            const profile = p.profiles;
                            return profile?.full_name || profile?.email || 'Unknown User';
                        })
                        .join(', ');
                }
                console.log('Generated Title:', fullConversation.title);
            }

            return fullConversation;
        },
        enabled: !!channelId,
    });

    // Fetch Messages
    const { data: messages = [] } = useQuery({
        queryKey: ['discord-messages', channelId],
        queryFn: async () => {
            if (!channelId) return [];

            // Fetch messages
            const { data: messagesData, error: messagesError } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', channelId)
                .order('created_at', { ascending: true });

            if (messagesError) throw messagesError;

            // Fetch sender profiles separately
            const senderIds = [...new Set(messagesData?.map(m => m.sender_id) || [])];
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .in('id', senderIds);

            // Combine messages with sender data
            const messagesWithSenders = messagesData?.map(msg => ({
                ...msg,
                sender: profiles?.find(p => p.id === msg.sender_id)
            })) || [];

            return messagesWithSenders;
        },
        enabled: !!channelId,
    });

    // Real-time subscription
    useEffect(() => {
        if (!channelId) return;

        const channel = supabase
            .channel(`discord-messages-${channelId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${channelId}` },
                () => queryClient.invalidateQueries({ queryKey: ['discord-messages', channelId] })
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [channelId]);


    // Automatic "Read Receipt" Logic
    useEffect(() => {
        if (!channelId || !user || !isParticipant) return;

        const markAsRead = async () => {
            const { error } = await supabase
                .from('conversation_participants')
                .update({ last_read_at: new Date().toISOString() })
                .eq('conversation_id', channelId)
                .eq('user_id', user.id);

            if (error) {
                console.error('Error marking as read:', error);
            } else {
                // Invalidate queries to refresh sidebar and notification unread status
                queryClient.invalidateQueries({ queryKey: ['discord-channels'] });
                queryClient.invalidateQueries({ queryKey: ['discord-dms'] });
                queryClient.invalidateQueries({ queryKey: ['user-conversations-summary'] });
            }
        };

        markAsRead();
    }, [channelId, user?.id, isParticipant]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessageMutation = useMutation({
        mutationFn: async (content: string) => {
            if (!user || !channelId) return;

            const { error } = await supabase
                .from('messages')
                .insert({
                    conversation_id: channelId,
                    sender_id: user.id,
                    content: content
                });

            if (error) throw error;
        },
        onSuccess: () => {
            setMessageInput('');
            queryClient.invalidateQueries({ queryKey: ['discord-messages', channelId] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to send message');
            console.error('Message send error:', error);
        }
    });

    const handleSendMessage = async () => {
        if (!messageInput.trim() && !selectedFile) return;

        let finalContent = messageInput.trim();

        if (selectedFile && channelId) {
            try {
                const fileName = `${Date.now()}-${selectedFile.name}`;
                const filePath = `${channelId}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('chat-attachments')
                    .upload(filePath, selectedFile);

                if (uploadError) {
                    console.error('Upload Error', uploadError);
                    toast.error('Failed to upload file');
                    return;
                }

                const { data } = supabase.storage
                    .from('chat-attachments')
                    .getPublicUrl(filePath);

                if (data?.publicUrl) {
                    finalContent = finalContent
                        ? `${finalContent} \n[File: ${selectedFile.name}](${data.publicUrl})`
                        : `[File: ${selectedFile.name}](${data.publicUrl})`;
                }
            } catch (error) {
                console.error('Upload failed', error);
                toast.error('Upload failed');
                return;
            }
        }

        if (finalContent) {
            sendMessageMutation.mutate(finalContent);
            handleRemoveFile();
        }
    };

    if (!channelId) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-background/50">
                <div className="bg-primary/10 p-6 rounded-full mb-6 ring-1 ring-primary/20">
                    <MessageSquare className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-3">
                    Welcome back, {user?.user_metadata?.full_name?.split(' ')[0] || 'Member'}!
                </h3>
                <p className="text-muted-foreground/80 text-center max-w-sm">
                    Select a channel or conversation from the sidebar to start collaborating with your team.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden bg-background">
            {/* Channel Header */}
            <div className="h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-4 shadow-sm flex-shrink-0">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" className="lg:hidden mr-2 px-0" onClick={onMobileMenuToggle}>
                        <Menu className="h-6 w-6" />
                    </Button>
                    {conversation?.type === 'channel' ? (
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <Hash className="h-6 w-6 text-muted-foreground" />
                                <h3 className="text-foreground font-bold capitalize">{conversation?.slug || conversation?.title}</h3>
                            </div>
                            {conversation.conversation_participants && (
                                <span className="text-xs text-muted-foreground ml-8 truncate max-w-md block">
                                    {conversation.conversation_participants
                                        .map((p: any) => {
                                            const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
                                            return profile?.full_name || profile?.email;
                                        })
                                        .filter(Boolean)
                                        .join(', ')}
                                </span>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                                <h3 className="text-foreground font-bold text-sm sm:text-base capitalize">{conversation?.title || 'Unknown User'}</h3>
                            </div>
                            {conversation?.is_group && conversation.conversation_participants && (
                                <span className="text-xs text-muted-foreground ml-7 truncate max-w-md block">
                                    {conversation.conversation_participants
                                        .map((p: any) => p.profiles?.full_name || p.profiles?.email)
                                        .filter(Boolean)
                                        .join(', ')}
                                </span>
                            )}
                        </div>
                    )}
                    {conversation?.description && (
                        <>
                            <div className="h-4 w-[1px] bg-border mx-2 hidden md:block" />
                            <span className="text-xs text-muted-foreground hidden md:block truncate max-w-sm">
                                {conversation.description}
                            </span>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-4 text-zinc-400">
                    {/* Header Controls Removed as requested */}
                </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 relative min-h-0">
                <div className="h-full px-4 py-4 overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                    <div className="flex flex-col justify-end min-h-full space-y-4"> {/* Align bottom if few messages */}
                        {/* Welcome Message - only show if no messages */}
                        {messages.length === 0 && (
                            conversation?.type === 'channel' ? (
                                <div className="mt-10 mb-8 px-4">
                                    <div className="bg-muted h-16 w-16 rounded-full flex items-center justify-center mb-4">
                                        <Hash className="h-10 w-10 text-muted-foreground" />
                                    </div>
                                    <h1 className="text-3xl font-bold text-foreground mb-2">Welcome to #{conversation?.slug || conversation?.title}</h1>
                                    <p className="text-muted-foreground">This is the start of the #{conversation?.slug || conversation?.title} channel.</p>
                                </div>
                            ) : (
                                <div className="mt-10 mb-8 px-4">
                                    <div className="bg-muted h-16 w-16 rounded-full flex items-center justify-center mb-4">
                                        <MessageSquare className="h-10 w-10 text-muted-foreground" />
                                    </div>
                                    <h1 className="text-3xl font-bold text-foreground mb-2">{conversation?.title || 'Direct Message'}</h1>
                                    <p className="text-muted-foreground">This is the beginning of your conversation{conversation?.is_group ? ' with this group' : ''}.</p>
                                </div>
                            )
                        )}

                        {messages.map((msg: any, index: number) => {
                            const isOwnMessage = msg.sender_id === user?.id;
                            const isSequence = index > 0 && messages[index - 1].sender_id === msg.sender_id && (new Date(msg.created_at).getTime() - new Date(messages[index - 1].created_at).getTime() < 300000); // 5 mins

                            return (
                                <div key={msg.id} className={`flex gap-3 mb-2 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}>
                                    {/* Avatar - only show for first message in sequence */}
                                    {!isSequence && (
                                        <div className="flex-shrink-0">
                                            <Avatar className="h-8 w-8 ring-2 ring-background ring-offset-2 ring-offset-transparent">
                                                <AvatarFallback className={isOwnMessage ? "bg-primary text-primary-foreground font-bold" : "bg-muted text-muted-foreground font-bold"}>
                                                    {(msg.sender?.full_name || msg.sender?.email || 'U').substring(0, 1).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                        </div>
                                    )}

                                    {/* Spacer for sequence messages */}
                                    {isSequence && <div className="w-8 flex-shrink-0" />}

                                    {/* Message bubble */}
                                    <div className={`flex flex-col max-w-[70%] ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                                        {/* Sender name and time - only for first in sequence */}
                                        {!isSequence && !isOwnMessage && (
                                            <div className="flex items-center gap-2 mb-1 px-1">
                                                <span className="text-xs font-semibold text-foreground">
                                                    {msg.sender?.full_name || msg.sender?.email || 'Unknown User'}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {format(new Date(msg.created_at), 'h:mm a')}
                                                </span>
                                            </div>
                                        )}

                                        {/* Message content */}
                                        <div className={`px-5 py-2.5 shadow-sm relative group/msg transition-all duration-200
                                            ${isOwnMessage
                                                ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-3xl rounded-tr-sm'
                                                : 'bg-muted/80 backdrop-blur-sm text-foreground rounded-3xl rounded-tl-sm hover:bg-muted'
                                            }
                                            ${isSequence && isOwnMessage ? 'rounded-tr-3xl mr-10' : ''}
                                            ${isSequence && !isOwnMessage ? 'rounded-tl-3xl ml-10' : ''}
                                        `}>
                                            <div className="text-[15px] leading-relaxed break-words">
                                                {(() => {
                                                    return msg.content.split('\n').map((line: string, i: number) => {
                                                        const fileMatch = line.match(/^\[File: (.*?)\]\((.*?)\)$/);
                                                        if (fileMatch) {
                                                            const [_, name, url] = fileMatch;
                                                            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(name) || url.includes('chat-attachments');
                                                            if (isImage) {
                                                                return (
                                                                    <div key={i} className="mt-2">
                                                                        <img
                                                                            src={url}
                                                                            alt={name}
                                                                            className="max-h-60 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                                                            onClick={() => window.open(url, '_blank')}
                                                                        />
                                                                    </div>
                                                                );
                                                            }
                                                            return <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="underline block hover:opacity-80">{name}</a>;
                                                        }
                                                        return <p key={i} className="mb-1 last:mb-0">{line}</p>;
                                                    });
                                                })()}
                                            </div>
                                            {isOwnMessage && (
                                                <span className="text-[9px] opacity-70 mt-1 block text-right font-medium tracking-wide">
                                                    {format(new Date(msg.created_at), 'h:mm a')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                </div>
            </div>

            {/* Input Area or Join Button */}
            <div className="p-4 bg-background border-t border-border/40 flex-shrink-0 z-10">
                {!isParticipant && conversation?.type === 'channel' ? (
                    <div className="flex items-center justify-center p-6 bg-muted/30 rounded-2xl border border-dashed border-border">
                        <div className="text-center">
                            <p className="text-muted-foreground mb-3 font-medium">You are viewing <strong>#{conversation.title || conversation.slug}</strong></p>
                            <Button
                                onClick={() => joinChannelMutation.mutate()}
                                disabled={joinChannelMutation.isPending}
                                className="bg-primary hover:bg-primary/90 text-white font-bold px-8 shadow-lg shadow-primary/20 rounded-full"
                            >
                                {joinChannelMutation.isPending ? 'Joining...' : 'Join Channel'}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-muted/30 border border-border/50 rounded-3xl p-2 flex flex-col gap-2 transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:bg-background focus-within:shadow-xl">
                        {previewUrl && (
                            <div className="relative w-24 h-24 group mx-2 mt-2">
                                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover rounded-xl shadow-md" />
                                <button
                                    onClick={handleRemoveFile}
                                    className="absolute -top-2 -right-2 bg-background rounded-full p-1.5 shadow-md hover:bg-destructive hover:text-destructive-foreground transition-all border border-border"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        )}
                        <div className="flex items-center gap-2 w-full pl-2 pr-2">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleFileSelect}
                            />
                            <button
                                className={`text-muted-foreground hover:text-primary transition-colors p-2 hover:bg-muted rounded-full ${previewUrl ? 'text-primary bg-primary/10' : ''}`}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <PlusCircle className="h-6 w-6" />
                            </button>
                            <Input
                                placeholder={
                                    conversation?.type === 'channel'
                                        ? `Message #${conversation?.slug || conversation?.title || 'channel'}`
                                        : `Message ${conversation?.title || 'user'}`
                                }
                                value={messageInput}
                                onChange={(e) => setMessageInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                className="bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-foreground placeholder:text-muted-foreground/70 p-2 h-auto flex-1 font-medium"
                            />
                            <div className="flex items-center gap-1 text-muted-foreground">
                                {(messageInput.trim() || selectedFile) && (
                                    <button
                                        onClick={handleSendMessage}
                                        className="text-primary-foreground bg-primary hover:bg-primary/90 p-2 rounded-full shadow-md transition-all active:scale-95"
                                    >
                                        <Send className="h-5 w-5 ml-0.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
