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
    const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(() => {
        // Initialize from localStorage if available
        if (typeof window !== 'undefined') {
            return localStorage.getItem('selectedOrganizationId');
        }
        return null;
    });

    const isSuperAdmin = roles?.some(r => r.role === 'super_admin' || r.role === 'general_admin');

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

    // Handle persistence and default selection
    useEffect(() => {
        if (organizations.length > 0) {
            // Check if current selection is valid
            const isValid = selectedOrganizationId === 'all' || organizations.some(o => o.id === selectedOrganizationId);

            if (!selectedOrganizationId || !isValid) {
                const firstOrgId = organizations[0].id;
                setSelectedOrganizationId(firstOrgId);
                localStorage.setItem('selectedOrganizationId', firstOrgId);
            }
        }
    }, [organizations, selectedOrganizationId]);

    const handleSetSelectedOrganizationId = (id: string | null) => {
        setSelectedOrganizationId(id);
        if (id) {
            localStorage.setItem('selectedOrganizationId', id);
        } else {
            localStorage.removeItem('selectedOrganizationId');
        }
    };

    return (
        <OrganizationContext.Provider
            value={{
                organizations,
                selectedOrganizationId,
                setSelectedOrganizationId: handleSetSelectedOrganizationId,
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
