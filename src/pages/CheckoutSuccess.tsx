import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/landing/Navbar";
import { FooterSection } from "@/components/landing/FooterSection";

export default function CheckoutSuccess() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(true);
    const sessionId = searchParams.get("session_id");

    useEffect(() => {
        // Short delay for visual feedback
        const timer = setTimeout(() => {
            setLoading(false);
        }, 1500);

        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <Navbar />

            <main className="flex-1 flex items-center justify-center p-4">
                <Card className="max-w-md w-full">
                    <CardHeader className="text-center">
                        {loading ? (
                            <div className="mx-auto mb-4">
                                <Loader2 className="h-16 w-16 text-primary animate-spin" />
                            </div>
                        ) : (
                            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
                                <CheckCircle2 className="h-10 w-10 text-success" />
                            </div>
                        )}
                        <CardTitle className="text-2xl">
                            {loading ? "Processing..." : "Payment Successful!"}
                        </CardTitle>
                        <CardDescription>
                            {loading
                                ? "Please wait while we confirm your subscription..."
                                : "Thank you for subscribing! Your account has been upgraded."
                            }
                        </CardDescription>
                    </CardHeader>

                    {!loading && (
                        <CardContent className="space-y-4">
                            <div className="rounded-lg bg-muted/50 p-4 text-center">
                                <p className="text-sm text-muted-foreground">
                                    Your subscription is now active. You can manage your billing
                                    settings anytime from your dashboard.
                                </p>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Button onClick={() => navigate("/dashboard")} className="w-full">
                                    Go to Dashboard
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => navigate("/")}
                                    className="w-full"
                                >
                                    Return to Home
                                </Button>
                            </div>
                        </CardContent>
                    )}
                </Card>
            </main>

            <FooterSection />
        </div>
    );
}
