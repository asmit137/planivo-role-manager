import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { ChatArea } from './ChatArea';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useSearchParams } from 'react-router-dom';
import { cn } from "@/lib/utils";

export const DiscordLayout = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const convoId = searchParams.get('convo');
    const [selectedChannelId, setSelectedChannelId] = useState<string | null>(convoId);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const isDesktop = useMediaQuery('(min-width: 768px)');

    // Sync selectedChannelId with search params
    React.useEffect(() => {
        if (convoId) {
            setSelectedChannelId(convoId);
        }
    }, [convoId]);

    const handleSelectChannel = (id: string | null) => {
        setSelectedChannelId(id);
        setMobileMenuOpen(false); // Close mobile drawer when a channel is selected
        if (id) {
            setSearchParams({ tab: 'messaging', convo: id });
        } else {
            setSearchParams({ tab: 'messaging' });
        }
    };

    return (
        <div className="flex h-[calc(100vh-4rem)] md:h-[calc(100vh-8rem)] w-full overflow-hidden bg-background text-foreground relative -m-4 md:-m-6 lg:-m-8">
            {/* Sidebar - Persistent on all screens, but can be hidden/shown */}
            <div className={cn(
                "w-72 flex-shrink-0 border-r border-border bg-muted/10 transition-all duration-300 ease-in-out h-full overflow-hidden",
                !isDesktop && !mobileMenuOpen && "w-0 border-none"
            )}>
                <div className="w-72 h-full">
                    <Sidebar
                        selectedChannelId={selectedChannelId}
                        onSelectChannel={handleSelectChannel}
                    />
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 h-full min-w-0">
                <ChatArea
                    channelId={selectedChannelId}
                    onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
                    sidebarOpen={mobileMenuOpen}
                />
            </div>
        </div>
    );
};
