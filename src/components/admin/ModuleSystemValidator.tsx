import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';

interface TestResult {
  test: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

interface ValidationResponse {
  success: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  results: TestResult[];
  timestamp: string;
}

const ModuleSystemValidator = () => {
  const [validationResults, setValidationResults] = useState<ValidationResponse | null>(null);

  const runValidation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('validate-module-system');

      if (error) throw error;
      return data as ValidationResponse;
    },
    onSuccess: (data) => {
      setValidationResults(data);
      if (data.success) {
        toast.success(`All tests passed! ${data.summary.passed}/${data.summary.total} checks successful`);
      } else {
        toast.error(`${data.summary.failed} test(s) failed`);
      }
    },
    onError: async (error: any) => {
      let message = error.message;

      // Try to parse detailed error from Edge Function response
      if (error.context && typeof error.context.json === 'function') {
        try {
          const body = await error.context.json();
          if (body.error) {
            message = body.error;
            if (body.details) message += `: ${body.details}`;
            if (body.diagnostic?.authErrorMessage) {
              message += ` (Auth Error: ${body.diagnostic.authErrorMessage})`;
            }
          }
        } catch (e) {
          console.error("Failed to parse error body", e);
        }
      }

      toast.error('Validation failed: ' + message);
      console.error(error);
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case 'fail':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-warning" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pass':
        return <Badge className="bg-success text-success-foreground">Passed</Badge>;
      case 'fail':
        return <Badge variant="destructive">Failed</Badge>;
      case 'warning':
        return <Badge className="bg-warning text-warning-foreground">Warning</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5" />
            Module System Validator
          </CardTitle>
          <CardDescription>
            Run automated checks to validate module configuration, dependencies, and access control
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => runValidation.mutate()}
            disabled={runValidation.isPending}
            className="w-full"
          >
            {runValidation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running Validation Tests...
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-2" />
                Run Validation Tests
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {validationResults && (
        <>
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle>Validation Summary</CardTitle>
              <CardDescription>
                Test execution completed at {new Date(validationResults.timestamp).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-4 rounded-lg bg-primary/5">
                  <div className="text-3xl font-bold text-primary">
                    {validationResults.summary.total}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Tests</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-success/5">
                  <div className="text-3xl font-bold text-success">
                    {validationResults.summary.passed}
                  </div>
                  <div className="text-sm text-muted-foreground">Passed</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-destructive/5">
                  <div className="text-3xl font-bold text-destructive">
                    {validationResults.summary.failed}
                  </div>
                  <div className="text-sm text-muted-foreground">Failed</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-warning/5">
                  <div className="text-3xl font-bold text-warning">
                    {validationResults.summary.warnings}
                  </div>
                  <div className="text-sm text-muted-foreground">Warnings</div>
                </div>
              </div>

              {validationResults.success ? (
                <Alert className="mt-4 border-success">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <AlertDescription>
                    All validation checks passed successfully! The module system is properly configured.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive" className="mt-4">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>
                    Some validation checks failed. Please review the results below and address any issues.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Detailed Results */}
          <Card>
            <CardHeader>
              <CardTitle>Test Results</CardTitle>
              <CardDescription>Detailed breakdown of each validation check</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {validationResults.results.map((result, index) => (
                  <Card key={index} className="border-2">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(result.status)}
                          <h4 className="font-semibold">{result.test}</h4>
                        </div>
                        {getStatusBadge(result.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{result.message}</p>
                      {result.details && (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                            View Details
                          </summary>
                          <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto">
                            {JSON.stringify(result.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default ModuleSystemValidator;
