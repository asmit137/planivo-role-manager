import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/shared/DataTable';
import { Users } from 'lucide-react';

interface StaffMember {
    id: string;
    full_name: string;
    email: string;
    is_active: boolean;
    department_id: string | null;
    department_name: string | null;
    role: string;
}

const StaffManagementPage = () => {
    // Fetch all staff members
    const { data: staffMembers, isLoading: staffLoading, error: staffError } = useQuery({
        queryKey: ['staff-members'],
        queryFn: async () => {
            // Get all user_roles with role = 'staff'
            const { data: userRoles, error: rolesError } = await supabase
                .from('user_roles')
                .select('user_id, department_id, role')
                .eq('role', 'staff');

            if (rolesError) throw rolesError;

            // Get profile information for all staff
            const userIds = userRoles?.map(ur => ur.user_id) || [];
            if (userIds.length === 0) return [];

            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, full_name, email, is_active')
                .in('id', userIds);

            if (profilesError) throw profilesError;

            // Get all departments to match with user_roles
            const { data: allDepts, error: deptsError } = await supabase
                .from('departments')
                .select('id, name');

            if (deptsError) throw deptsError;

            // Combine the data
            const staffData: StaffMember[] = profiles?.map(profile => {
                const userRole = userRoles?.find(ur => ur.user_id === profile.id);
                const department = allDepts?.find(d => d.id === userRole?.department_id);

                return {
                    id: profile.id,
                    full_name: profile.full_name,
                    email: profile.email,
                    is_active: profile.is_active,
                    department_id: userRole?.department_id || null,
                    department_name: department?.name || null,
                    role: userRole?.role || 'staff',
                };
            }) || [];

            return staffData;
        },
    });

    // Define table columns
    const columns: Column<StaffMember>[] = [
        {
            key: 'name',
            header: 'Name',
            cell: (row) => <span className="font-medium">{row.full_name}</span>,
        },
        {
            key: 'email',
            header: 'Email',
            cell: (row) => row.email,
        },
        {
            key: 'status',
            header: 'Status',
            cell: (row) => (
                <Badge variant={row.is_active ? 'default' : 'secondary'}>
                    {row.is_active ? 'Active' : 'Inactive'}
                </Badge>
            ),
        },
    ];

    return (
        <Card className="border-2">
            <CardHeader>

                <CardDescription>
                    View staff members and their department assignments
                </CardDescription>
            </CardHeader>
            <CardContent>
                <DataTable
                    data={staffMembers}
                    columns={columns}
                    isLoading={staffLoading}
                    error={staffError as Error}
                    emptyState={{
                        title: 'No staff members found',
                        description: 'There are no staff members in the system yet.',
                    }}
                />
            </CardContent>
        </Card>
    );
};

export default StaffManagementPage;
