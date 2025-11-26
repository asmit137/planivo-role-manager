import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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

interface BulkUploadResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; email: string; error: string }>;
}

const BulkUserUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<BulkUserTemplate[]>([]);
  const [uploadResult, setUploadResult] = useState<BulkUploadResult | null>(null);
  const queryClient = useQueryClient();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      toast.error('Please upload an Excel file (.xlsx or .xls)');
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
      const { data, error } = await supabase.functions.invoke('bulk-upload-users', {
        body: { users },
      });

      if (error) throw error;
      return data as BulkUploadResult;
    },
    onSuccess: (result) => {
      setUploadResult(result);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      
      if (result.failed === 0) {
        toast.success(`Successfully created ${result.success} users!`);
      } else {
        toast.warning(`Created ${result.success} users, ${result.failed} failed`);
      }
      
      // Clear file input
      setFile(null);
      setParsedData([]);
    },
    onError: (error: any) => {
      let errorMessage = 'Bulk upload failed';
      
      if (error.message?.includes('already been registered') || error.message?.includes('duplicate')) {
        errorMessage = 'One or more users already exist in the system';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
      console.error(error);
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
          <Alert>
            <Download className="h-4 w-4" />
            <AlertDescription>
              Download the Excel template, fill in user information, and upload it back to create users in bulk.
            </AlertDescription>
          </Alert>

          <Button onClick={downloadBulkUserTemplate} variant="outline" className="w-full">
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
          <div className="flex items-center gap-4">
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              disabled={uploadMutation.isPending}
            />
            {file && (
              <Badge variant="secondary" className="whitespace-nowrap">
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

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
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
                        <TableCell>{user.facility_name}</TableCell>
                        <TableCell>{user.department_name}</TableCell>
                        <TableCell>{user.specialty_name || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{user.role}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsedData.length > 5 && (
                  <div className="p-2 text-center text-sm text-muted-foreground bg-muted">
                    ... and {parsedData.length - 5} more users
                  </div>
                )}
              </div>

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

                <div className="border rounded-lg overflow-hidden">
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
