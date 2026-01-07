import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

interface ModuleAccess {
  module_id: string;
  module_key: string;
  module_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_admin: boolean;
}

interface ModuleContextType {
  modules: ModuleAccess[];
  isLoading: boolean;
  hasAccess: (moduleKey: string) => boolean;
  canEdit: (moduleKey: string) => boolean;
  canDelete: (moduleKey: string) => boolean;
  canAdmin: (moduleKey: string) => boolean;
}

const ModuleContext = createContext<ModuleContextType | undefined>(undefined);

export const ModuleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [modules, setModules] = useState<ModuleAccess[]>([]);

  const { data: moduleData, isLoading } = useQuery({
    queryKey: ['user-modules', user?.id],
    queryFn: async () => {
      if (!user) return [];

      try {
        const { data, error } = await supabase.rpc('get_my_modules');

        if (error) {
          console.error('RPC Error:', error);
          // Fallback to core module if RPC fails
          return [{ module_key: 'core', can_view: true, can_edit: true, can_delete: true, can_admin: true }] as any;
        }

        return data as ModuleAccess[];
      } catch (err) {
        console.error('Module Fetch Error:', err);
        return [{ module_key: 'core', can_view: true, can_edit: true, can_delete: true, can_admin: true }] as any;
      }
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (moduleData) {
      setModules(moduleData);
    }
  }, [moduleData]);

  const hasAccess = (moduleKey: string): boolean => {
    return modules.some((m) => m.module_key === moduleKey && m.can_view);
  };

  const canEdit = (moduleKey: string): boolean => {
    return modules.some((m) => m.module_key === moduleKey && m.can_edit);
  };

  const canDelete = (moduleKey: string): boolean => {
    return modules.some((m) => m.module_key === moduleKey && m.can_delete);
  };

  const canAdmin = (moduleKey: string): boolean => {
    return modules.some((m) => m.module_key === moduleKey && m.can_admin);
  };

  return (
    <ModuleContext.Provider
      value={{
        modules,
        isLoading,
        hasAccess,
        canEdit,
        canDelete,
        canAdmin,
      }}
    >
      {children}
    </ModuleContext.Provider>
  );
};

export const useModuleContext = () => {
  const context = useContext(ModuleContext);
  if (context === undefined) {
    throw new Error('useModuleContext must be used within a ModuleProvider');
  }
  return context;
};
