import React from 'react';
import { Building } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

export const OrganizationSwitcher: React.FC = () => {
    const { organizations, selectedOrganizationId, setSelectedOrganizationId, isLoading } = useOrganization();
    const { data: roles } = useUserRole();
    const { state } = useSidebar();
    const isCollapsed = state === 'collapsed';

    const isSuperAdmin = roles?.some(r => r.role === 'super_admin' || r.role === 'general_admin');

    if (!isSuperAdmin) return null;

    return (
        <div className={cn(
            "px-4 py-2 mb-2 transition-all duration-300",
            isCollapsed ? "px-2" : "px-4"
        )}>
            <div className={cn(
                "flex flex-col gap-1.5",
                isCollapsed ? "items-center" : ""
            )}>
                {!isCollapsed && (
                    <label className="text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/50 px-1">
                        Active Organization
                    </label>
                )}
                <Select
                    value={selectedOrganizationId || undefined}
                    onValueChange={setSelectedOrganizationId}
                    disabled={isLoading}
                >
                    <SelectTrigger className={cn(
                        "h-9 bg-sidebar-accent/50 border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200",
                        isCollapsed ? "w-9 p-0 justify-center" : "w-full"
                    )}>
                        <div className="flex items-center gap-2 overflow-hidden">
                            <div className="flex-shrink-0 w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
                                <Building className="h-3 w-3 text-primary" />
                            </div>
                            {!isCollapsed && (
                                <div className="flex-1 text-left truncate font-medium text-sm">
                                    <SelectValue placeholder="Select Organization" />
                                </div>
                            )}
                        </div>
                    </SelectTrigger>
                    <SelectContent className="bg-sidebar-accent border-sidebar-border">
                        {organizations.length > 0 ? (
                            <>
                                <SelectItem
                                    value="all"
                                    className="focus:bg-primary focus:text-primary-foreground cursor-pointer font-semibold border-b"
                                >
                                    All Organizations
                                </SelectItem>
                                {organizations.map((org) => (
                                    <SelectItem
                                        key={org.id}
                                        value={org.id}
                                        className="focus:bg-primary focus:text-primary-foreground cursor-pointer"
                                    >
                                        {org.name}
                                    </SelectItem>
                                ))}
                            </>
                        ) : (
                            <div className="p-2 text-xs text-muted-foreground text-center">
                                No organizations found
                            </div>
                        )}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
};
