import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export type AppRole = 'super_admin' | 'general_admin' | 'workplace_supervisor' | 'facility_supervisor' | 'department_head' | 'staff';

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  workspace_id: string | null;
  facility_id: string | null;
  department_id: string | null;
}

export const useUserRole = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['userRole', user?.id],
    queryFn: async () => {
      if (!user) return null;

      console.log('Fetching roles for user:', user.id);
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching user roles:', error);
        throw error;
      }
      
      console.log('User roles fetched:', data);
      return data as UserRole[];
    },
    enabled: !!user,
  });
};

export const useHasRole = (role: AppRole) => {
  const { data: roles } = useUserRole();
  return roles?.some(r => r.role === role) ?? false;
};
