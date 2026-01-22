import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataTable, Column } from '@/components/shared/DataTable';
import { Users, Search, Mail, Building2, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { StaffDetailsDialog } from './StaffDetailsDialog';

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

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    const handleRowClick = (member: StaffMember) => {
        setSelectedStaffId(member.id);
        setIsDetailsOpen(true);
    };

    const filteredStaff = staffMembers?.filter(member =>
        member.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (member.department_name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

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
        <Card className="border-2 shadow-sm overflow-hidden">
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div className="space-y-0.5">
                            <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">Staff Members</CardTitle>
                            <CardDescription className="text-xs sm:text-sm">
                                View staff members and their department assignments
                            </CardDescription>
                        </div>
                    </div>
                </div>

                <div className="relative w-full sm:max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name, email, or department..."
                        className="pl-9 h-10 bg-muted/50 border-border/60"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
                {/* Mobile Card List */}
                <div className="block sm:hidden divide-y divide-border/60 max-h-[500px] overflow-y-auto custom-scrollbar">
                    {filteredStaff?.map((member) => (
                        <div
                            key={member.id}
                            className="p-4 space-y-3 bg-card/50 active:bg-accent/50 transition-colors cursor-pointer"
                            onClick={() => handleRowClick(member)}
                        >
                            <div className="flex justify-between items-start gap-2">
                                <div className="space-y-1 min-w-0">
                                    <h4 className="font-semibold text-sm truncate">{member.full_name}</h4>
                                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground truncate">
                                        <Mail className="h-3 w-3" />
                                        {member.email}
                                    </div>
                                </div>
                                <Badge variant={member.is_active ? 'default' : 'secondary'} className="text-[10px] h-5 shrink-0 px-1.5 font-normal">
                                    {member.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                            </div>

                            {member.department_name && (
                                <div className="flex items-center gap-1.5 text-[10px] bg-secondary/40 text-secondary-foreground px-2 py-1 rounded-md w-fit">
                                    <Building2 className="h-3 w-3 text-muted-foreground" />
                                    {member.department_name}
                                </div>
                            )}
                        </div>
                    ))}
                    {filteredStaff?.length === 0 && !staffLoading && (
                        <div className="p-8 text-center space-y-1">
                            <Filter className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                            <p className="text-sm font-medium">No results found</p>
                            <p className="text-xs text-muted-foreground">Try adjusting your search criteria</p>
                        </div>
                    )}
                </div>

                {/* Desktop Data Table */}
                <div className="hidden sm:block">
                    <DataTable
                        data={filteredStaff}
                        columns={columns}
                        isLoading={staffLoading}
                        error={staffError as Error}
                        maxHeight={500}
                        enableStickyHeader={true}
                        onRowClick={handleRowClick}
                        emptyState={{
                            title: 'No staff members found',
                            description: 'There are no staff members in the system yet.',
                        }}
                    />
                </div>
            </CardContent>

            <StaffDetailsDialog
                staffId={selectedStaffId}
                open={isDetailsOpen}
                onOpenChange={setIsDetailsOpen}
            />
        </Card>
    );
};

export default StaffManagementPage;
