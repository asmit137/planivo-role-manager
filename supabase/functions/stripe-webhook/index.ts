// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
// @ts-ignore
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

declare const Deno: any;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Helper to read request body as text
async function readBody(req: Request): Promise<string> {
    const reader = req.body?.getReader();
    if (!reader) return "";

    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return new TextDecoder().decode(result);
}

Deno.serve(async (req: Request) => {
    console.log("--- STRIPE-WEBHOOK REQUEST RECEIVED ---");

    if (req.method === "OPTIONS") {
        return new Response("ok", { status: 200, headers: corsHeaders });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
        console.error("Stripe keys not configured");
        return new Response(
            JSON.stringify({ error: "Stripe not configured" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
        apiVersion: "2023-10-16",
        httpClient: Stripe.createFetchHttpClient(),
    });

    const adminClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false },
    });

    try {
        // Get the signature from headers
        const signature = req.headers.get("stripe-signature");
        if (!signature) {
            console.error("No stripe-signature header");
            return new Response(
                JSON.stringify({ error: "No signature" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Read the raw body
        const body = await readBody(req);

        // Verify the webhook signature
        let event: Stripe.Event;
        try {
            event = await stripe.webhooks.constructEventAsync(
                body,
                signature,
                STRIPE_WEBHOOK_SECRET
            );
        } catch (err: any) {
            console.error("Webhook signature verification failed:", err.message);
            return new Response(
                JSON.stringify({ error: "Invalid signature", details: err.message }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`Processing webhook event: ${event.type}`);

        // Handle different event types
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;
                console.log("Checkout session completed:", session.id);

                const organizationId = session.metadata?.organization_id;
                const planId = session.metadata?.plan_id;

                if (!organizationId) {
                    console.error("No organization_id in session metadata");
                    break;
                }

                // Create or update subscription record
                const { error: subError } = await adminClient
                    .from("subscriptions")
                    .upsert({
                        organization_id: organizationId,
                        plan_id: planId,
                        stripe_customer_id: session.customer as string,
                        stripe_subscription_id: session.subscription as string,
                        status: "active",
                        billing_interval: session.mode === "subscription" ? "monthly" : "one_time",
                        updated_at: new Date().toISOString(),
                    }, {
                        onConflict: "organization_id",
                        ignoreDuplicates: false
                    });

                if (subError) {
                    console.error("Error creating subscription:", subError);
                } else {
                    console.log("Subscription created/updated for organization:", organizationId);
                }

                // Update organization limits based on plan
                if (planId) {
                    const { data: plan } = await adminClient
                        .from("subscription_plans")
                        .select("max_workspaces, max_facilities, max_users")
                        .eq("id", planId)
                        .single();

                    if (plan) {
                        await adminClient
                            .from("organizations")
                            .update({
                                max_workspaces: plan.max_workspaces,
                                max_facilities: plan.max_facilities,
                                max_users: plan.max_users,
                            })
                            .eq("id", organizationId);

                        console.log("Updated organization limits for:", organizationId);
                    }
                }
                break;
            }

            case "customer.subscription.updated": {
                const subscription = event.data.object as Stripe.Subscription;
                console.log("Subscription updated:", subscription.id);

                const status = subscription.status === "active" ? "active"
                    : subscription.status === "past_due" ? "past_due"
                        : subscription.status === "canceled" ? "canceled"
                            : subscription.status;

                const { error } = await adminClient
                    .from("subscriptions")
                    .update({
                        status,
                        cancel_at_period_end: subscription.cancel_at_period_end,
                        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
                        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("stripe_subscription_id", subscription.id);

                if (error) {
                    console.error("Error updating subscription:", error);
                }
                break;
            }

            case "customer.subscription.deleted": {
                const subscription = event.data.object as Stripe.Subscription;
                console.log("Subscription deleted:", subscription.id);

                // Get the subscription to find organization
                const { data: sub } = await adminClient
                    .from("subscriptions")
                    .select("organization_id")
                    .eq("stripe_subscription_id", subscription.id)
                    .single();

                // Mark subscription as canceled
                await adminClient
                    .from("subscriptions")
                    .update({
                        status: "canceled",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("stripe_subscription_id", subscription.id);

                // Downgrade organization to free tier limits
                if (sub?.organization_id) {
                    await adminClient
                        .from("organizations")
                        .update({
                            max_workspaces: 1,
                            max_facilities: 2,
                            max_users: 5,
                        })
                        .eq("id", sub.organization_id);

                    console.log("Downgraded organization to free tier:", sub.organization_id);
                }
                break;
            }

            case "invoice.payment_failed": {
                const invoice = event.data.object as Stripe.Invoice;
                console.log("Payment failed for invoice:", invoice.id);

                if (invoice.subscription) {
                    await adminClient
                        .from("subscriptions")
                        .update({
                            status: "past_due",
                            updated_at: new Date().toISOString(),
                        })
                        .eq("stripe_subscription_id", invoice.subscription as string);
                }
                break;
            }

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        return new Response(
            JSON.stringify({ received: true, type: event.type }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("Webhook error:", err);
        return new Response(
            JSON.stringify({ error: "Webhook handler failed", message: err.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
