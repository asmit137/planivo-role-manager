import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { CreditCard, Loader2, AlertCircle } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "");

interface Plan {
    slug: string;
    name: string;
    description: string;
    priceMonthly: number;
    priceYearly: number;
    features: string[];
    isEnterprise?: boolean;
}

interface CheckoutDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    plan: Plan | null;
}

export function CheckoutDialog({ open, onOpenChange, plan }: CheckoutDialogProps) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [isYearly, setIsYearly] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!plan) return null;

    const price = isYearly ? plan.priceYearly : plan.priceMonthly;
    const period = isYearly ? "/year" : "/month";
    const savings = plan.priceMonthly > 0
        ? Math.round(((plan.priceMonthly * 12 - plan.priceYearly) / (plan.priceMonthly * 12)) * 100)
        : 0;

    const handleCheckout = async () => {
        setLoading(true);
        setError(null);

        try {
            // Check if user is authenticated
            if (!user) {
                // Store plan info in session storage for after auth
                sessionStorage.setItem("pendingCheckout", JSON.stringify({
                    planSlug: plan.slug,
                    billingInterval: isYearly ? "yearly" : "monthly",
                }));
                navigate("/auth");
                return;
            }

            // Call the Edge Function to create checkout session
            const { data, error: fnError } = await supabase.functions.invoke("create-checkout-session", {
                body: {
                    planSlug: plan.slug,
                    billingInterval: isYearly ? "yearly" : "monthly",
                },
            });

            if (fnError) {
                throw new Error(fnError.message);
            }

            if (data?.error) {
                throw new Error(data.error);
            }

            // Handle special cases (free plan, enterprise)
            if (data?.redirect) {
                navigate(data.redirect);
                onOpenChange(false);
                return;
            }

            // Redirect to Stripe Checkout
            if (data?.url) {
                window.location.href = data.url;
            } else {
                throw new Error("No checkout URL received");
            }
        } catch (err: any) {
            console.error("Checkout error:", err);
            setError(err.message || "Failed to start checkout");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-primary" />
                        Subscribe to {plan.name}
                    </DialogTitle>
                    <DialogDescription>
                        {plan.description}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Price Display */}
                    <div className="text-center">
                        <div className="text-4xl font-bold text-foreground">
                            ${price}
                            <span className="text-lg font-normal text-muted-foreground">{period}</span>
                        </div>
                        {plan.priceMonthly > 0 && isYearly && savings > 0 && (
                            <p className="text-sm text-success mt-1">
                                Save {savings}% with yearly billing
                            </p>
                        )}
                    </div>

                    {/* Billing Toggle */}
                    {plan.priceMonthly > 0 && (
                        <div className="flex items-center justify-center gap-3">
                            <Label htmlFor="billing-toggle" className={!isYearly ? "text-foreground" : "text-muted-foreground"}>
                                Monthly
                            </Label>
                            <Switch
                                id="billing-toggle"
                                checked={isYearly}
                                onCheckedChange={setIsYearly}
                            />
                            <Label htmlFor="billing-toggle" className={isYearly ? "text-foreground" : "text-muted-foreground"}>
                                Yearly
                            </Label>
                        </div>
                    )}

                    {/* Features Preview */}
                    <div className="rounded-lg bg-muted/50 p-4">
                        <p className="text-sm font-medium mb-2">What's included:</p>
                        <ul className="text-sm text-muted-foreground space-y-1">
                            {plan.features.slice(0, 4).map((feature, i) => (
                                <li key={i}>• {feature}</li>
                            ))}
                            {plan.features.length > 4 && (
                                <li className="text-primary">+ {plan.features.length - 4} more features</li>
                            )}
                        </ul>
                    </div>

                    {/* Error Alert */}
                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Auth Notice */}
                    {!user && (
                        <Alert>
                            <AlertDescription>
                                You'll need to sign in or create an account to complete your subscription.
                            </AlertDescription>
                        </Alert>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        Cancel
                    </Button>
                    <Button onClick={handleCheckout} disabled={loading}>
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Processing...
                            </>
                        ) : user ? (
                            "Continue to Payment"
                        ) : (
                            "Sign in to Subscribe"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
