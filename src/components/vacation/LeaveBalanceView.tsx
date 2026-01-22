import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingState } from '@/components/layout/LoadingState';
import { Calendar } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

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

    useRealtimeSubscription({
        table: 'leave_balances',
        invalidateQueries: ['leave-balances'],
    });

    if (isSuperAdmin || isOrgAdmin) {
        return null;
    }

    if (isLoading) return <LoadingState />;

    if (!balances || balances.length === 0) {
        return null;
    }

    return (
        <Card className="overflow-hidden">
            <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary shrink-0" />
                    My Leave Balances ({currentYear})
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">View your available and used vacation days.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 pt-0 sm:pt-0">
                <div className="hidden sm:block">
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
                </div>
                <div className="sm:hidden space-y-2 p-2">
                    {balances.map((item: any) => (
                        <div key={item.id} className="p-3 border rounded-lg space-y-2 bg-muted/30">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-sm">{item.vacation_types?.name}</span>
                                <span className="text-xs text-muted-foreground">{currentYear}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                <div className="flex flex-col">
                                    <span className="text-muted-foreground">Total</span>
                                    <span className="font-medium">{item.accrued}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-muted-foreground">Used</span>
                                    <span className="font-medium">{item.used}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-muted-foreground">Remaining</span>
                                    <span className="font-bold text-primary">{item.balance}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
