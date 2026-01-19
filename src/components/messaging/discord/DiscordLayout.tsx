import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { ChatArea } from './ChatArea';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useSearchParams } from 'react-router-dom';

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
        <div className="flex h-[calc(100vh-6rem)] w-full overflow-hidden bg-background text-foreground rounded-xl shadow-2xl border border-border/50 ring-1 ring-border/10">
            {/* Sidebar - Desktop persistent / Mobile drawer */}
            {isDesktop ? (
                <div className="w-72 flex-shrink-0 border-r border-border bg-muted/10">
                    <Sidebar
                        selectedChannelId={selectedChannelId}
                        onSelectChannel={handleSelectChannel}
                    />
                </div>
            ) : (
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                    <SheetContent side="left" className="p-0 w-72 bg-background border-r border-border">
                        <Sidebar
                            selectedChannelId={selectedChannelId}
                            onSelectChannel={handleSelectChannel}
                        />
                    </SheetContent>
                </Sheet>
            )}

            {/* Main Chat Area */}
            <div className="flex flex-1 flex-col min-w-0 bg-background">
                <ChatArea
                    channelId={selectedChannelId}
                    onMobileMenuToggle={() => setMobileMenuOpen(true)}
                />
            </div>
        </div>
    );
};
