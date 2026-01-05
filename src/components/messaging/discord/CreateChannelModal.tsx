import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Hash, Lock } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';

interface CreateChannelModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const CreateChannelModal = ({ open, onOpenChange }: CreateChannelModalProps) => {
    const { user } = useAuth();
    const { data: roles } = useUserRole();
    const queryClient = useQueryClient();
    const [name, setName] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);

    const createChannelMutation = useMutation({
        mutationFn: async () => {
            if (!user) throw new Error("Not authenticated");

            const workspaceId = roles?.find(r => r.workspace_id)?.workspace_id;

            const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');

            const { data, error } = await supabase
                .from('conversations')
                .insert({
                    title: name,
                    slug: slug,
                    type: 'channel',
                    is_group: false,
                    created_by: user.id,
                    workspace_id: workspaceId
                } as any)
                .select()
                .single();

            if (error) throw error;

            // Add creator as participant
            const { error: participantError } = await supabase
                .from('conversation_participants')
                .insert({
                    conversation_id: data.id,
                    user_id: user.id
                });

            if (participantError) throw participantError;

            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['discord-channels'] });
            onOpenChange(false);
            setName('');
            toast.success('Channel created!');
        },
        onError: (error: any) => {
            toast.error(error.message || "Failed to create channel");
        }
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create Channel</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        in Text Channels
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 pt-4">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg cursor-not-allowed opacity-60">
                            <div className="flex items-center gap-3">
                                <Hash className="h-6 w-6 text-zinc-400" />
                                <div>
                                    <p className="font-semibold text-sm">Text</p>
                                    <p className="text-xs text-zinc-400">Send messages, images, GIFS, emoji, opinions, and puns</p>
                                </div>
                            </div>
                            <div className="h-4 w-4 rounded-full border-2 border-zinc-500 bg-zinc-500" />
                            {/* Radio button mockup selected */}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-zinc-400">Channel Name</Label>
                        <div className="relative">
                            <Hash className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="new-channel"
                                className="bg-zinc-950 border-zinc-900 pl-9 focus:ring-offset-0 focus:border-blue-500"
                            />
                        </div>
                    </div>

                    <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Lock className="h-4 w-4 text-zinc-400" />
                                <span className="font-medium text-zinc-200">Private Channel</span>
                            </div>
                            {/* Switch component would go here, omitting for simplicity/available UI components */}
                            <div className="h-5 w-9 bg-zinc-700 rounded-full cursor-not-allowed" />
                        </div>
                        <p className="text-xs text-zinc-400">
                            Only selected members and roles will be able to view this channel. (Coming soon)
                        </p>
                    </div>
                </div>

                <DialogFooter className="bg-zinc-900 pt-4">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="hover:bg-zinc-800 text-zinc-300">
                        Cancel
                    </Button>
                    <Button
                        onClick={() => createChannelMutation.mutate()}
                        disabled={!name || createChannelMutation.isPending}
                        className="bg-[#5865F2] hover:bg-[#4752C4] text-white"
                    >
                        Create Channel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
