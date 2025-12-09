import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Building2, Users, MapPin } from 'lucide-react';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';

interface OrganizationFacilitiesViewProps {
  organizationId: string;
}

const OrganizationFacilitiesView = ({ organizationId }: OrganizationFacilitiesViewProps) => {
  const { data: workspacesWithFacilities, isLoading } = useQuery({
    queryKey: ['org-facilities-view', organizationId],
    queryFn: async () => {
      // Get all workspaces in this organization
      const { data: workspaces, error: wsError } = await supabase
        .from('workspaces')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');

      if (wsError) throw wsError;
      if (!workspaces || workspaces.length === 0) return [];

      // Get facilities for each workspace
      const workspacesWithData = await Promise.all(
        workspaces.map(async (ws) => {
          const { data: facilities, error: facError } = await supabase
            .from('facilities')
            .select('id, name')
            .eq('workspace_id', ws.id)
            .order('name');

          if (facError) throw facError;

          // Get department count and user count for each facility
          const facilitiesWithStats = await Promise.all(
            (facilities || []).map(async (fac) => {
              const { count: deptCount } = await supabase
                .from('departments')
                .select('*', { count: 'exact', head: true })
                .eq('facility_id', fac.id);

              const { count: userCount } = await supabase
                .from('user_roles')
                .select('*', { count: 'exact', head: true })
                .eq('facility_id', fac.id);

              return {
                ...fac,
                departmentCount: deptCount || 0,
                userCount: userCount || 0,
              };
            })
          );

          return {
            ...ws,
            facilities: facilitiesWithStats,
            facilityCount: facilitiesWithStats.length,
          };
        })
      );

      return workspacesWithData;
    },
    enabled: !!organizationId,
  });

  if (isLoading) {
    return <LoadingState message="Loading facilities..." />;
  }

  if (!workspacesWithFacilities || workspacesWithFacilities.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No Facilities"
        description="No facilities have been created in your organization yet."
      />
    );
  }

  const totalFacilities = workspacesWithFacilities.reduce((acc, ws) => acc + ws.facilityCount, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Organization Facilities
          </CardTitle>
          <CardDescription>
            {totalFacilities} facilities across {workspacesWithFacilities.length} workspaces
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="space-y-2">
            {workspacesWithFacilities.map((workspace) => (
              <AccordionItem key={workspace.id} value={workspace.id} className="border rounded-lg">
                <AccordionTrigger className="px-4 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    <span className="font-semibold">{workspace.name}</span>
                    <Badge variant="secondary">{workspace.facilityCount} facilities</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  {workspace.facilities.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No facilities in this workspace</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {workspace.facilities.map((facility: any) => (
                        <Card key={facility.id} className="bg-muted/30">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">{facility.name}</span>
                            </div>
                            <div className="flex gap-2 text-xs">
                              <Badge variant="outline">
                                {facility.departmentCount} depts
                              </Badge>
                              <Badge variant="outline">
                                <Users className="h-3 w-3 mr-1" />
                                {facility.userCount} users
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrganizationFacilitiesView;
