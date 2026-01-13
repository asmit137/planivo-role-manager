import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTabsList } from '@/components/layout/ResponsiveTabsList';
import { Button } from '@/components/ui/button';
import { Plus, Calendar, List, MapPin, Users } from 'lucide-react';
import { LoadingState } from '@/components/layout/LoadingState';
import { ErrorState } from '@/components/layout/ErrorState';
import { ClinicList } from './ClinicList';
import { ClinicCalendar } from './ClinicCalendar';
import { ClinicDialog } from './ClinicDialog';
import { useOrganization } from '@/contexts/OrganizationContext';

interface ClinicHubProps {
    departmentId?: string;
}

export function ClinicHub({ departmentId }: ClinicHubProps) {
    const { organization } = useOrganization();
    const [showClinicDialog, setShowClinicDialog] = useState(false);

    if (!organization) return <LoadingState />;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4 border rounded-xl shadow-sm sticky top-0 z-10">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Clinic Management</h1>
                    <p className="text-muted-foreground text-sm">Organize and assign staff to clinical rotations.</p>
                </div>
                <Button onClick={() => setShowClinicDialog(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Add Clinic</span>
                </Button>
            </div>

            <Tabs defaultValue="list" className="space-y-4">
                <ResponsiveTabsList>
                    <TabsTrigger value="list" className="min-h-[44px] px-4">
                        <List className="h-4 w-4 mr-2" />
                        List View
                    </TabsTrigger>
                    <TabsTrigger value="calendar" className="min-h-[44px] px-4">
                        <Calendar className="h-4 w-4 mr-2" />
                        Calendar View
                    </TabsTrigger>
                </ResponsiveTabsList>

                <TabsContent value="list" className="space-y-4">
                    <ClinicList organizationId={organization.id} departmentId={departmentId} />
                </TabsContent>

                <TabsContent value="calendar">
                    <ClinicCalendar organizationId={organization.id} departmentId={departmentId} />
                </TabsContent>

            </Tabs>

            <ClinicDialog
                open={showClinicDialog}
                onOpenChange={setShowClinicDialog}
                organizationId={organization.id}
                departmentId={departmentId}
            />
        </div>
    );
}
