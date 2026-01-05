import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { ChatArea } from './ChatArea';
import { MembersList } from './MembersList';
import { useMediaQuery } from '@/hooks/use-media-query';

export const DiscordLayout = () => {
    const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const isDesktop = useMediaQuery('(min-width: 1024px)');

    return (
        <div className="flex h-[calc(100vh-8rem)] md:h-[calc(100vh-10rem)] w-full overflow-hidden bg-zinc-900 text-zinc-100 rounded-lg shadow-inner">
            {/* Sidebar - Channels & DMs */}
            <div className={`${isDesktop ? 'w-72' : 'w-0'} flex-shrink-0 border-r border-zinc-800 bg-zinc-950/50 transition-all duration-300`}>
                <Sidebar
                    selectedChannelId={selectedChannelId}
                    onSelectChannel={setSelectedChannelId}
                />
            </div>

            {/* Main Chat Area */}
            <div className="flex flex-1 flex-col min-w-0 bg-zinc-900">
                <ChatArea
                    channelId={selectedChannelId}
                    onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
                />
            </div>

            {/* Members List - Right Side */}
            {isDesktop && selectedChannelId && (
                <div className="w-60 flex-shrink-0 border-l border-zinc-800 bg-zinc-950/30">
                    <MembersList channelId={selectedChannelId} />
                </div>
            )}
        </div>
    );
};
