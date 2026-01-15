import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingState } from '@/components/layout/LoadingState';
import { Calendar } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useUserRole } from '@/hooks/useUserRole';

export function LeaveBalanceView() {
    const { user } = useAuth();
    const { organization: currentOrganization } = useOrganization();
    const { data: roles } = useUserRole();
    const currentYear = new Date().getFullYear();

    const isSuperAdmin = roles?.some(r => r.role === 'super_admin');
    const isOrgAdmin = roles?.some(r => r.role === 'organization_admin');

    const { data: balances, isLoading } = useQuery({
        queryKey: ['leave-balances', user?.id, currentYear],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('leave_balances')
                .select('*, vacation_types(name)')
                .eq('staff_id', user?.id)
                .eq('year', currentYear);

            if (error) throw error;
            return data;
        },
        enabled: !!user?.id,
    });

    if (isSuperAdmin || isOrgAdmin) {
        return null;
    }

    if (isLoading) return <LoadingState />;

    if (!balances || balances.length === 0) {
        return null;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    My Leave Balances ({currentYear})
                </CardTitle>
                <CardDescription>View your available and used vacation days.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Vacation Type</TableHead>
                            <TableHead className="text-center">Total Allocated</TableHead>
                            <TableHead className="text-center">Used</TableHead>
                            <TableHead className="text-right">Remaining</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {balances.map((item: any) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium">{item.vacation_types?.name}</TableCell>
                                <TableCell className="text-center">{item.accrued}</TableCell>
                                <TableCell className="text-center">{item.used}</TableCell>
                                <TableCell className="text-right font-bold text-primary">{item.balance}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
