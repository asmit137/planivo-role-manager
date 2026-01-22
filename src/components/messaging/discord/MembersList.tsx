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
                .eq('is_active', true)
                .order('full_name');

            if (error) throw error;
            return data;
        }
    });

    const getInitials = (name?: string) => name?.substring(0, 1).toUpperCase() || 'U';

    return (
        <div className="flex flex-col h-full bg-muted/10 text-muted-foreground border-l border-border/50">
            <ScrollArea className="flex-1 px-3 py-4">
                <h3 className="text-[10px] font-extrabold uppercase tracking-wider mb-4 px-3 text-muted-foreground/60 transition-colors cursor-default">
                    Online — {members.length}
                </h3>

                <div className="space-y-1">
                    {members.map((member: any) => (
                        <div key={member.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 cursor-pointer group transition-all duration-200">
                            <div className="relative">
                                <Avatar className="h-9 w-9 ring-2 ring-background group-hover:ring-muted transition-all">
                                    <AvatarFallback className="bg-muted text-muted-foreground text-xs font-bold">
                                        {getInitials(member.full_name)}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 border-2 border-background rounded-full" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-muted-foreground group-hover:text-foreground text-sm flex items-center gap-2 transition-colors">
                                    <span className="truncate">{member.full_name || 'Anonymous'}</span>
                                    {member.id === user?.id && (
                                        <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md uppercase tracking-wider font-bold">
                                            You
                                        </span>
                                    )}
                                </div>
                                <div className="text-[10px] text-muted-foreground/60 truncate group-hover:text-muted-foreground/80 transition-colors">
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
