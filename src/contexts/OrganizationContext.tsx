import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';

interface Organization {
    id: string;
    name: string;
    vacation_mode: 'planning' | 'full';
}

interface OrganizationContextType {
    organizations: Organization[];
    selectedOrganizationId: string | null;
    setSelectedOrganizationId: (id: string | null) => void;
    organization: Organization | undefined;
    isLoading: boolean;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export const OrganizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { data: roles } = useUserRole();
    const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);

    const isSuperAdmin = roles?.some(r => r.role === 'super_admin');

    const { data: organizations = [], isLoading } = useQuery({
        queryKey: ['super-admin-organizations', user?.id],
        queryFn: async () => {
            if (!user || !isSuperAdmin) return [];

            const { data, error } = await supabase
                .from('organizations')

                .select('id, name, vacation_mode')
                .eq('is_active', true)
                .order('name');

            if (error) {
                console.error('Error fetching organizations:', error);
                return [];
            }

            return data || [];
        },
        enabled: !!user && !!isSuperAdmin,
    });

    // Set default organization if none selected
    useEffect(() => {
        if (organizations.length > 0 && !selectedOrganizationId) {
            setSelectedOrganizationId(organizations[0].id);
        }
    }, [organizations, selectedOrganizationId]);

    return (
        <OrganizationContext.Provider
            value={{
                organizations,
                selectedOrganizationId,
                setSelectedOrganizationId,
                organization: selectedOrganizationId === 'all'
                    ? { id: 'all', name: 'All Organizations', vacation_mode: 'full' } as Organization
                    : organizations.find(o => o.id === selectedOrganizationId),
                isLoading,
            }}
        >
            {children}
        </OrganizationContext.Provider>
    );
};

export const useOrganization = () => {
    const context = useContext(OrganizationContext);
    if (context === undefined) {
        throw new Error('useOrganization must be used within an OrganizationProvider');
    }
    return context;
};
