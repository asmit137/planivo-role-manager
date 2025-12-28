import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Receipt, Download, ExternalLink, FileText } from "lucide-react";
import { format } from "date-fns";

interface InvoicesListProps {
  organizationId: string;
}

export function InvoicesList({ organizationId }: InvoicesListProps) {
  const { data: invoices, isLoading } = useQuery({
    queryKey: ["subscription-invoices", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_invoices")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const statusColors = {
    draft: "bg-muted text-muted-foreground",
    pending: "bg-warning/10 text-warning",
    paid: "bg-success/10 text-success",
    failed: "bg-destructive/10 text-destructive",
    refunded: "bg-primary/10 text-primary",
    cancelled: "bg-muted text-muted-foreground",
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  if (!invoices?.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-12 text-center">
          <Receipt className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">No Invoices Yet</h3>
          <p className="text-sm text-muted-foreground">
            Your billing history will appear here once you have invoices.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          Billing History
        </CardTitle>
        <CardDescription>
          View and download your past invoices
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    {invoice.invoice_number}
                  </div>
                </TableCell>
                <TableCell>
                  {format(new Date(invoice.created_at), "MMM d, yyyy")}
                </TableCell>
                <TableCell>
                  <span className="font-semibold">
                    ${Number(invoice.amount).toFixed(2)}
                  </span>
                  <span className="text-muted-foreground ml-1">
                    {invoice.currency}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge 
                    className={statusColors[invoice.status as keyof typeof statusColors] || "bg-muted"}
                  >
                    {invoice.status.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {invoice.pdf_url && (
                      <Button variant="ghost" size="icon" asChild>
                        <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
