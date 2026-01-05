import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

import { useAuth } from '@/lib/auth';

interface MembersListProps {
    channelId: string;
}

export const MembersList = ({ channelId }: MembersListProps) => {
    const { user } = useAuth();

    const { data: members = [] } = useQuery({
        queryKey: ['discord-members', channelId],
        queryFn: async () => {
            // Fetch all profiles to ensure current user is visible
            // In a real app, this should be paginated or filtered by workspace
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .order('full_name');

            if (error) throw error;
            return data;
        }
    });

    const getInitials = (name?: string) => name?.substring(0, 1).toUpperCase() || 'U';

    return (
        <div className="flex flex-col h-full bg-zinc-950 text-zinc-400">
            <ScrollArea className="flex-1 px-3 py-4">
                <h3 className="text-xs font-bold uppercase mb-4 px-2 hover:text-zinc-300">
                    Online — {members.length}
                </h3>

                <div className="space-y-1">
                    {members.map((member: any) => (
                        <div key={member.id} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-zinc-900 cursor-pointer group opacity-90 hover:opacity-100">
                            <div className="relative">
                                <Avatar className="h-8 w-8">
                                    <AvatarFallback className="bg-zinc-700 text-xs">
                                        {getInitials(member.full_name)}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 border-2 border-zinc-950 rounded-full" />
                            </div>
                            <div>
                                <div className="font-medium text-zinc-300 group-hover:text-zinc-100 text-sm flex items-center gap-2">
                                    {member.full_name || 'Anonymous'}
                                    {member.id === user?.id && (
                                        <span className="text-[10px] bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">
                                            You
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-zinc-500">
                                    Playing VS Code
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
};
