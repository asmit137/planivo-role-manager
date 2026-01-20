import { useNavigate } from "react-router-dom";
import { XCircle, ArrowLeft, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/landing/Navbar";
import { FooterSection } from "@/components/landing/FooterSection";

export default function CheckoutCancel() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <Navbar />

            <main className="flex-1 flex items-center justify-center p-4">
                <Card className="max-w-md w-full">
                    <CardHeader className="text-center">
                        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                            <XCircle className="h-10 w-10 text-destructive" />
                        </div>
                        <CardTitle className="text-2xl">Payment Cancelled</CardTitle>
                        <CardDescription>
                            Your payment was not completed. No charges have been made.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        <div className="rounded-lg bg-muted/50 p-4 text-center">
                            <p className="text-sm text-muted-foreground">
                                If you experienced any issues during checkout, please contact
                                our support team for assistance.
                            </p>
                        </div>

                        <div className="flex flex-col gap-2">
                            <Button
                                onClick={() => navigate("/#pricing")}
                                className="w-full"
                            >
                                <RefreshCcw className="mr-2 h-4 w-4" />
                                Try Again
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => navigate("/")}
                                className="w-full"
                            >
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Return to Home
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </main>

            <FooterSection />
        </div>
    );
}
