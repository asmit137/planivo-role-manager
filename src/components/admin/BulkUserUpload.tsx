import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Download, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { downloadBulkUserTemplate, parseBulkUserExcel, BulkUserTemplate } from '@/utils/excelTemplate';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface BulkUploadResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; email: string; error: string }>;
}

interface BulkUserUploadProps {
  organizationId?: string;
}

const BulkUserUpload = ({ organizationId }: BulkUserUploadProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<BulkUserTemplate[]>([]);
  const [uploadResult, setUploadResult] = useState<BulkUploadResult | null>(null);
  const queryClient = useQueryClient();

  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const effectiveOrgId = organizationId || selectedOrgId;

  // Fetch data for dropdowns
  const { data: organizations } = useQuery({
    queryKey: ['organizations', organizationId],
    queryFn: async () => {
      let query = supabase.from('organizations').select('id, name');

      // If organizationId is provided, only fetch that org
      // Otherwise, fetch all orgs (Super Admin universal template)
      if (organizationId) {
        query = query.eq('id', organizationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: workspaces } = useQuery({
    queryKey: ['workspaces', organizationId], // Depends on prop, not selection
    queryFn: async () => {
      let query = supabase.from('workspaces').select('id, name, organization_id');

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    // Always enabled if we are super admin or have orgId
    enabled: true,
  });

  const { data: facilities } = useQuery({
    queryKey: ['facilities', organizationId],
    queryFn: async () => {
      let query = supabase.from('facilities').select('id, name, workspace_id, workspaces!inner(organization_id)');

      if (organizationId) {
        query = query.eq('workspaces.organization_id', organizationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: true,
  });

  const { data: departments } = useQuery({
    queryKey: ['departments', organizationId],
    queryFn: async () => {
      let query = supabase.from('departments').select('id, name, facility_id, facilities!inner(workspaces!inner(organization_id))');

      if (organizationId) {
        query = query.eq('facilities.workspaces.organization_id', organizationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: true,
  });

  const handleDownload = () => {
    // 1. Build Lookup Maps
    const orgMap = new Map<string, any>();
    const wsMap = new Map<string, any>();
    const facMap = new Map<string, any>();

    // Initialize Organizations
    organizations?.forEach(org => {
      orgMap.set(org.id, { name: org.name, workspaces: [] });
    });

    // Process Workspaces
    workspaces?.forEach(ws => {
      const org = orgMap.get(ws.organization_id);
      if (org) {
        // Only add if parent org exists in our map (which it should)
        const wsObj = { id: ws.id, name: ws.name, facilities: [] };
        org.workspaces.push(wsObj);
        wsMap.set(ws.id, wsObj);
      } else if (!effectiveOrgId && organizations?.length === 0) {
        // Fallback: If no orgs loaded but we have vars (edge case), ignore
      }
    });

    // Process Facilities
    facilities?.forEach(fac => {
      const ws = wsMap.get(fac.workspace_id);
      if (ws) {
        const facObj = { id: fac.id, name: fac.name, departments: [] };
        ws.facilities.push(facObj);
        facMap.set(fac.id, facObj);
      }
    });

    // Process Departments
    departments?.forEach(dept => {
      const fac = facMap.get(dept.facility_id);
      if (fac) {
        fac.departments.push({ name: dept.name });
      }
    });

    // Convert map values to array
    const hierarchicalData = Array.from(orgMap.values());

    downloadBulkUserTemplate({
      organizations: hierarchicalData,
      roles: ['staff', 'department_head', 'facility_supervisor', 'workplace_supervisor', 'general_admin', 'organization_admin', 'workspace_supervisor', 'intern']
    });
  };

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error(`File is too large. Maximum size is 5MB. Your file is ${(selectedFile.size / (1024 * 1024)).toFixed(2)}MB.`);
      e.target.value = ''; // Reset input
      return;
    }

    if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      toast.error('Please upload an Excel file (.xlsx or .xls)');
      e.target.value = '';
      return;
    }

    setFile(selectedFile);

    try {
      const data = await parseBulkUserExcel(selectedFile);
      setParsedData(data);
      toast.success(`Parsed ${data.length} users from Excel file`);
    } catch (error) {
      toast.error('Failed to parse Excel file');
      console.error(error);
      setFile(null);
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async (users: BulkUserTemplate[]) => {
      // If no global org context, check that all rows have organization_name specified
      if (!effectiveOrgId) {
        const missingOrg = users.some(u => !u.organization_name);
        if (missingOrg) {
          throw new Error('No organization context found. Please select an organization or ensure all rows in the Excel file have an Organization Name specified.');
        }
      }

      console.log("INVOKING bulk-upload-users - Row count:", users.length);
      const { data: { session } } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke('bulk-upload-users', {
        body: {
          users,
          organizationId: effectiveOrgId || null  // Can be null if each row specifies its own org
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (error) {
        console.error("INVOKE ERROR:", error);
        throw error;
      }
      return data as BulkUploadResult;
    },
    onSuccess: (result) => {
      setUploadResult(result);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['unified-users'] });
      queryClient.invalidateQueries({ queryKey: ['department-staff'] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });

      if (result.failed === 0) {
        toast.success(`Successfully created ${result.success} users!`, {
          description: "Please remind them to check their spam folder for the welcome emails."
        });
      } else {
        toast.warning(`Created ${result.success} users, ${result.failed} failed`, {
          description: "Note: Successful users should check their spam folder for emails."
        });
      }

      // Clear file input
      setFile(null);
      setParsedData([]);
    },
    onError: async (error: any) => {
      // console.error("Bulk upload full error:", error);
      let errorMessage = 'Bulk upload failed';
      const rawMessage = error?.message ?? (typeof error === 'string' ? error : '');

      try {
        // Handle FunctionsHttpError explicitly if reachable
        if (error.context && typeof error.context.json === 'function') {
          const body = await error.context.json();
          if (body.details) errorMessage = body.details;
          else if (body.error) errorMessage = body.error;
        } else if (rawMessage) {
          // Fallback parsing for error messages containing JSON strings
          const jsonStart = rawMessage.indexOf('{');
          const parseTarget = jsonStart !== -1 ? rawMessage.substring(jsonStart) : rawMessage;

          const parsed = JSON.parse(parseTarget);
          if (parsed.details && typeof parsed.details === 'string') {
            errorMessage = parsed.details.split('; ').join('\n');
          } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.message) {
            errorMessage = parsed.map((e: any) => e.message).join('\n');
          } else if (parsed.error) {
            errorMessage = parsed.error;
          } else {
            errorMessage = rawMessage;
          }
        }
      } catch (e) {
        if (rawMessage.includes('already been registered') || rawMessage.includes('duplicate')) {
          errorMessage = 'One or more users already exist in the system';
        } else {
          errorMessage = rawMessage;
        }
      }

      toast.error(errorMessage, {
        duration: 10000,
        action: {
          label: 'Close',
          onClick: () => { }
        }
      });
    },
  });

  const handleUpload = () => {
    if (parsedData.length === 0) {
      toast.error('No data to upload');
      return;
    }
    uploadMutation.mutate(parsedData);
  };

  const handleReset = () => {
    setFile(null);
    setParsedData([]);
    setUploadResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Download Template */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Bulk User Upload
          </CardTitle>
          <CardDescription>
            Upload an Excel file to create multiple users at once
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!organizationId && (
            <div className="space-y-2">
              <Label>Target Organization</Label>
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations?.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Alert>
            <Download className="h-4 w-4" />
            <AlertDescription>
              Download the Excel template, fill in user information, and upload it back to create users in bulk.
            </AlertDescription>
          </Alert>

          <Button onClick={handleDownload} variant="outline" className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Download Excel Template
          </Button>
        </CardContent>
      </Card>

      {/* Upload File */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Filled Template</CardTitle>
          <CardDescription>
            Select the Excel file with user data to upload
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="flex-1">
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                disabled={uploadMutation.isPending}
                className="min-h-[40px] file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>
            {file && (
              <Badge variant="secondary" className="whitespace-nowrap py-1.5 justify-center sm:h-9 text-[10px] sm:text-xs">
                {file.name}
              </Badge>
            )}
          </div>

          {parsedData.length > 0 && (
            <>
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-success" />
                <AlertDescription>
                  Ready to create {parsedData.length} users. Review the data below and click Upload.
                </AlertDescription>
              </Alert>

              {/* Mobile Card Preview */}
              <div className="block sm:hidden space-y-3">
                {parsedData.slice(0, 5).map((user, idx) => (
                  <div key={idx} className="p-3 border rounded-lg bg-muted/30 space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="font-mono text-[10px] truncate max-w-[150px]">{user.email}</div>
                      <Badge variant="outline" className="text-[10px]">{user.role}</Badge>
                    </div>
                    <div className="text-xs font-semibold">{user.full_name}</div>
                    <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-2">
                      {user.workspace_name && <span>WS: {user.workspace_name}</span>}
                      {user.facility_name && <span>Fac: {user.facility_name}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table Preview */}
              <div className="hidden sm:block border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Workspace</TableHead>
                      <TableHead>Facility</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Specialty</TableHead>
                      <TableHead>Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.slice(0, 5).map((user, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm">{user.email}</TableCell>
                        <TableCell>{user.full_name}</TableCell>
                        <TableCell>{user.organization_name || '-'}</TableCell>
                        <TableCell>{user.workspace_name || '-'}</TableCell>
                        <TableCell>{user.facility_name || '-'}</TableCell>
                        <TableCell>{user.department_name || '-'}</TableCell>
                        <TableCell>{user.specialty_name || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{user.role}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {parsedData.length > 5 && (
                <div className="p-2 text-center text-xs text-muted-foreground bg-muted/50 rounded-b-lg">
                  ... and {parsedData.length - 5} more users
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleUpload}
                  disabled={uploadMutation.isPending}
                  className="flex-1"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating Users...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Create {parsedData.length} Users
                    </>
                  )}
                </Button>
                <Button onClick={handleReset} variant="outline">
                  Reset
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Upload Results */}
      {uploadResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {uploadResult.failed === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <AlertCircle className="h-5 w-5 text-warning" />
              )}
              Upload Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 rounded-lg bg-success/5">
                <div className="text-3xl font-bold text-success">{uploadResult.success}</div>
                <div className="text-sm text-muted-foreground">Successfully Created</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-destructive/5">
                <div className="text-3xl font-bold text-destructive">{uploadResult.failed}</div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
            </div>

            {uploadResult.errors.length > 0 && (
              <>
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {uploadResult.errors.length} users failed to create. See details below.
                  </AlertDescription>
                </Alert>

                {/* Mobile Results Cards */}
                <div className="block sm:hidden divide-y border rounded-lg">
                  {uploadResult.errors.map((err, idx) => (
                    <div key={idx} className="p-3 space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="font-mono text-muted-foreground">Row {err.row}</span>
                        <span className="font-mono truncate max-w-[150px]">{err.email}</span>
                      </div>
                      <div className="text-xs text-destructive">{err.error}</div>
                    </div>
                  ))}
                </div>

                {/* Desktop Results Table */}
                <div className="hidden sm:block border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {uploadResult.errors.map((err, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{err.row}</TableCell>
                          <TableCell className="font-mono text-sm">{err.email}</TableCell>
                          <TableCell className="text-destructive text-sm">{err.error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            <Button onClick={handleReset} variant="outline" className="w-full">
              Upload Another File
            </Button>
          </CardContent>
        </Card>
      )}

      {uploadMutation.isPending && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Creating users...</span>
                <span className="text-muted-foreground">Please wait</span>
              </div>
              <Progress value={undefined} className="w-full" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BulkUserUpload;
