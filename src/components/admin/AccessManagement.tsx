import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Loader2, Building2, Users, ChevronRight, User } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const AccessManagement = () => {
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [selectedFacility, setSelectedFacility] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [emails, setEmails] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch workspaces with full hierarchy
  const { data: organizationData } = useQuery({
    queryKey: ['organization-hierarchy'],
    queryFn: async () => {
      const { data: workspaces, error: wsError } = await supabase
        .from('workspaces')
        .select('*')
        .order('name');
      
      if (wsError) throw wsError;

      const hierarchyData = await Promise.all(
        workspaces.map(async (workspace) => {
          const { data: facilities, error: facilityError } = await supabase
            .from('facilities')
            .select('*')
            .eq('workspace_id', workspace.id)
            .order('name');
          
          if (facilityError) throw facilityError;

          const facilitiesWithDepts = await Promise.all(
            facilities.map(async (facility) => {
              const { data: departments, error: deptError } = await supabase
                .from('departments')
                .select('*')
                .eq('facility_id', facility.id)
                .order('name');
              
              if (deptError) throw deptError;

              const deptsWithHeads = await Promise.all(
                departments.map(async (dept) => {
                  const { data: deptHeads, error: headError } = await supabase
                    .from('user_roles')
                    .select('*, profiles(id, full_name, email)')
                    .eq('department_id', dept.id)
                    .eq('role', 'department_head');
                  
                  if (headError) throw headError;

                  // Count staff in this department
                  const { count: staffCount } = await supabase
                    .from('user_roles')
                    .select('*', { count: 'exact', head: true })
                    .eq('department_id', dept.id)
                    .eq('role', 'staff');

                  // Fetch subdepartments
                  const { data: subdepartments, error: subDeptError } = await supabase
                    .from('departments')
                    .select('*')
                    .eq('parent_department_id', dept.id)
                    .order('name');
                  
                  if (subDeptError) throw subDeptError;

                  // Get staff count for each subdepartment
                  const subDeptsWithData = await Promise.all(
                    (subdepartments || []).map(async (subDept) => {
                      const { data: subDeptHeads } = await supabase
                        .from('user_roles')
                        .select('*, profiles(id, full_name, email)')
                        .eq('department_id', subDept.id)
                        .eq('role', 'department_head');

                      const { count: subStaffCount } = await supabase
                        .from('user_roles')
                        .select('*', { count: 'exact', head: true })
                        .eq('department_id', subDept.id)
                        .eq('role', 'staff');

                      return {
                        ...subDept,
                        department_heads: subDeptHeads?.map((dh: any) => dh.profiles) || [],
                        staff_count: subStaffCount || 0,
                      };
                    })
                  );

                  return {
                    ...dept,
                    department_heads: deptHeads.map((dh: any) => dh.profiles),
                    staff_count: staffCount || 0,
                    subdepartments: subDeptsWithData,
                  };
                })
              );

              return {
                ...facility,
                departments: deptsWithHeads,
              };
            })
          );

          return {
            ...workspace,
            facilities: facilitiesWithDepts,
          };
        })
      );

      return hierarchyData;
    },
  });

  // Get filtered facilities based on workspace
  const facilities = organizationData?.find(w => w.id === selectedWorkspace)?.facilities || [];
  
  // Get filtered departments based on facility (including subdepartments)
  const departments = facilities.find(f => f.id === selectedFacility)?.departments || [];
  
  // Filter by category if selected
  const filteredDepartments = selectedCategory === 'all' 
    ? departments 
    : departments.filter((d: any) => d.category === selectedCategory);
  
  // Flatten departments to include subdepartments
  const allDepartments: any[] = [];
  filteredDepartments.forEach((dept: any) => {
    allDepartments.push(dept);
    if (dept.subdepartments && dept.subdepartments.length > 0) {
      dept.subdepartments.forEach((subDept: any) => {
        allDepartments.push({ ...subDept, isSubDepartment: true, parentName: dept.name });
      });
    }
  });
  
  // Get selected department details
  const selectedDept = allDepartments.find(d => d.id === selectedDepartment);
  
  // Get unique categories from all departments
  const categories = Array.from(new Set(departments.map((d: any) => d.category).filter(Boolean)));

  const createStaffMutation = useMutation({
    mutationFn: async ({ emails, departmentId }: { emails: string[]; departmentId: string }) => {
      const { data, error } = await supabase.functions.invoke('bulk-create-staff', {
        body: { emails, departmentId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Success',
        description: `${data.created} staff user(s) created successfully. Default password: 1234`,
      });
      setEmails('');
      queryClient.invalidateQueries({ queryKey: ['organization-hierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['totalUsers'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = () => {
    if (!emails.trim() || !selectedDepartment) {
      toast({
        title: 'Missing Information',
        description: 'Please select a department and enter email addresses',
        variant: 'destructive',
      });
      return;
    }

    const emailList = emails
      .split('\n')
      .map(e => e.trim())
      .filter(e => e && e.includes('@'));

    if (emailList.length === 0) {
      toast({
        title: 'Invalid Emails',
        description: 'Please enter at least one valid email address',
        variant: 'destructive',
      });
      return;
    }

    createStaffMutation.mutate({
      emails: emailList,
      departmentId: selectedDepartment,
    });
  };

  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Access Management
          </CardTitle>
          <CardDescription>
            Manage user access across the organizational hierarchy
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Hierarchy Selection */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>1. Select Workspace</Label>
                <Select value={selectedWorkspace} onValueChange={(val) => {
                  setSelectedWorkspace(val);
                  setSelectedFacility('');
                  setSelectedDepartment('');
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose workspace..." />
                  </SelectTrigger>
                  <SelectContent>
                    {organizationData?.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedWorkspace && (
                <div className="space-y-2">
                  <Label>2. Select Facility</Label>
                  <Select value={selectedFacility} onValueChange={(val) => {
                    setSelectedFacility(val);
                    setSelectedDepartment('');
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose facility..." />
                    </SelectTrigger>
                    <SelectContent>
                      {facilities.map((facility: any) => (
                        <SelectItem key={facility.id} value={facility.id}>
                          {facility.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedFacility && (
                <>
                  <div className="space-y-2">
                    <Label>3. Filter by Category (Optional)</Label>
                    <Select value={selectedCategory} onValueChange={(val) => {
                      setSelectedCategory(val);
                      setSelectedDepartment('');
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="All categories..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map((category: string) => (
                          <SelectItem key={category} value={category}>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="capitalize">{category}</Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>4. Select Department / Sub-Department</Label>
                    <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose department..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allDepartments.map((dept: any) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            <div className="flex items-center justify-between w-full">
                              <span className={dept.isSubDepartment ? "ml-4" : ""}>
                                {dept.isSubDepartment && "↳ "}
                                {dept.name}
                                {dept.isSubDepartment && <span className="text-xs text-muted-foreground ml-1">({dept.parentName})</span>}
                              </span>
                              <div className="flex items-center gap-1">
                                {dept.category && (
                                  <Badge variant="secondary" className="text-xs capitalize mr-1">
                                    {dept.category}
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {dept.staff_count} staff
                                </Badge>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {selectedDept && (
                <div className="p-4 rounded-lg bg-muted/50 border">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Department Head(s):</span>
                    </div>
                    {selectedDept.department_heads && selectedDept.department_heads.length > 0 ? (
                      <div className="space-y-2">
                        {selectedDept.department_heads.map((head: any) => (
                          <div key={head.id} className="flex items-center justify-between p-2 bg-background rounded">
                            <div>
                              <p className="font-medium text-sm">{head.full_name}</p>
                              <p className="text-xs text-muted-foreground">{head.email}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No department head assigned</p>
                    )}
                    <div className="pt-2 border-t">
                      <p className="text-sm text-muted-foreground">
                        Current Staff Count: <span className="font-semibold">{selectedDept.staff_count}</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Staff Creation */}
      {selectedDepartment && (
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Bulk Staff Creation
            </CardTitle>
            <CardDescription>
              Add multiple staff members to <span className="font-semibold">{selectedDept?.name}</span> department. 
              Default password: 1234 (must be changed on first login)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emails">Email Addresses (one per line)</Label>
              <Textarea
                id="emails"
                placeholder="john@example.com&#10;jane@example.com&#10;mike@example.com"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
              <p className="text-sm text-muted-foreground">
                Enter one email address per line. Invalid emails will be skipped.
              </p>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={createStaffMutation.isPending}
              className="w-full bg-gradient-primary"
            >
              {createStaffMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Staff Users
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Organizational Overview */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle>Organizational Overview</CardTitle>
          <CardDescription>View complete hierarchy with staff distribution</CardDescription>
        </CardHeader>
        <CardContent>
          {!organizationData || organizationData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No organizational structure found</p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-2">
              {organizationData.map((workspace: any) => (
                <AccordionItem key={workspace.id} value={workspace.id} className="border rounded-lg">
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      <span className="font-semibold">{workspace.name}</span>
                      <Badge variant="secondary">{workspace.facilities?.length || 0} facilities</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    {workspace.facilities?.length > 0 ? (
                      <div className="space-y-3 mt-2">
                        {workspace.facilities.map((facility: any) => (
                          <div key={facility.id} className="border rounded-lg p-3 bg-muted/30">
                            <div className="flex items-center gap-2 mb-3">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{facility.name}</span>
                              <Badge variant="outline">{facility.departments?.length || 0} departments</Badge>
                            </div>
                            {facility.departments?.length > 0 && (
                              <div className="space-y-2 ml-6">
                                {facility.departments.map((dept: any) => (
                                  <div key={dept.id} className="space-y-2">
                                    <div className="p-2 rounded bg-background text-sm">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">{dept.name}</span>
                                          {dept.category && (
                                            <Badge variant="outline" className="text-xs capitalize">
                                              {dept.category}
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {dept.department_heads?.length > 0 && (
                                            <Badge variant="secondary" className="text-xs">
                                              <User className="h-3 w-3 mr-1" />
                                              {dept.department_heads[0].full_name}
                                            </Badge>
                                          )}
                                          <Badge className="text-xs">
                                            <Users className="h-3 w-3 mr-1" />
                                            {dept.staff_count} staff
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>
                                    {/* Subdepartments */}
                                    {dept.subdepartments && dept.subdepartments.length > 0 && (
                                      <div className="ml-4 space-y-1">
                                        {dept.subdepartments.map((subDept: any) => (
                                          <div key={subDept.id} className="p-2 rounded bg-muted/50 text-sm border-l-2 border-primary/30">
                                            <div className="flex items-center justify-between">
                                              <div className="flex items-center gap-2">
                                                <span className="text-sm">↳ {subDept.name}</span>
                                                {subDept.category && (
                                                  <Badge variant="outline" className="text-xs capitalize">
                                                    {subDept.category}
                                                  </Badge>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-2">
                                                {subDept.department_heads?.length > 0 && (
                                                  <Badge variant="outline" className="text-xs">
                                                    <User className="h-3 w-3 mr-1" />
                                                    {subDept.department_heads[0].full_name}
                                                  </Badge>
                                                )}
                                                <Badge variant="outline" className="text-xs">
                                                  <Users className="h-3 w-3 mr-1" />
                                                  {subDept.staff_count} staff
                                                </Badge>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">No facilities in this workspace</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AccessManagement;
