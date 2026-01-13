import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export type AppRole = 'super_admin' | 'organization_admin' | 'general_admin' | 'workplace_supervisor' | 'workspace_supervisor' | 'facility_supervisor' | 'department_head' | 'staff' | 'intern' | 'custom';

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  workspace_id: string | null;
  organization_id?: string | null;
  facility_id: string | null;
  department_id: string | null;
  custom_role_id: string | null;
  custom_role?: {
    id: string;
    name: string;
  };
}

export const useUserRole = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['userRole', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          *,
          custom_role:custom_roles(id, name)
        `)
        .eq('user_id', user.id);

      if (error) throw error;

      return data as unknown as UserRole[];
    },
    enabled: !!user,
  });
};

export const useHasRole = (role: AppRole) => {
  const { data: roles } = useUserRole();
  return roles?.some(r => r.role === role) ?? false;
};
