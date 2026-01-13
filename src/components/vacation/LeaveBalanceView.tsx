import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { LoadingState } from '@/components/layout/LoadingState';
import { Calendar, AlertCircle } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';

export function LeaveBalanceView() {
    const { user } = useAuth();
    const { organization: currentOrganization } = useOrganization();
    const currentYear = new Date().getFullYear();

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
        enabled: !!user?.id && currentOrganization?.vacation_mode === 'full',
    });

    if (currentOrganization?.vacation_mode !== 'full') {
        return null;
    }

    if (isLoading) return <LoadingState />;

    if (!balances || balances.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-primary" />
                        Leave Balances
                    </CardTitle>
                    <CardDescription>No leave balances allocated for {currentYear}.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Your Leave Balances ({currentYear})
                </CardTitle>
                <CardDescription>Track your available and used vacation days.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {balances.map((item: any) => {
                    const percentage = item.accrued > 0 ? (item.used / item.accrued) * 100 : 0;
                    return (
                        <div key={item.id} className="space-y-2">
                            <div className="flex justify-between items-end">
                                <div>
                                    <p className="font-medium">{item.vacation_types?.name}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {item.used} used / {item.accrued} total
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-bold">{item.balance}</p>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Remaining</p>
                                </div>
                            </div>
                            <Progress value={percentage} className="h-2" />
                            {item.balance <= 0 && (
                                <p className="text-xs text-destructive flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    No remaining balance for this type.
                                </p>
                            )}
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
