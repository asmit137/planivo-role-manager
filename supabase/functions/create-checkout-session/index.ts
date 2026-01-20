// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
// @ts-ignore
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

declare const Deno: any;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
    console.log("--- CREATE-CHECKOUT-SESSION REQUEST RECEIVED ---");

    if (req.method === "OPTIONS") {
        return new Response("ok", { status: 200, headers: corsHeaders });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

    if (!STRIPE_SECRET_KEY) {
        console.error("STRIPE_SECRET_KEY not configured");
        return new Response(
            JSON.stringify({ error: "Stripe not configured" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
        apiVersion: "2023-10-16",
        httpClient: Stripe.createFetchHttpClient(),
    });

    try {
        // 1. Authenticate the requesting user
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: "Missing Authorization header" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const token = authHeader.replace("Bearer ", "");
        const authClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
            auth: { persistSession: false },
        });

        const { data: { user }, error: authError } = await authClient.auth.getUser(token);
        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: "Unauthorized", details: authError?.message }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`Authenticated user: ${user.email}`);

        // 2. Parse request body
        const body = await req.json();
        const {
            planSlug,
            billingInterval = "monthly",
            successUrl,
            cancelUrl,
            organizationName // Optional: for auto-creating organization
        } = body;

        if (!planSlug) {
            return new Response(
                JSON.stringify({ error: "Missing planSlug" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 3. Admin client for database operations
        const adminClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
            auth: { persistSession: false },
        });

        // 4. Get the subscription plan
        const { data: plan, error: planError } = await adminClient
            .from("subscription_plans")
            .select("*")
            .eq("slug", planSlug)
            .eq("is_active", true)
            .single();

        if (planError || !plan) {
            console.error("Plan not found:", planError);
            return new Response(
                JSON.stringify({ error: "Plan not found", details: planError?.message }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Skip checkout for free plan
        if (plan.price_monthly === 0 && planSlug !== "enterprise") {
            return new Response(
                JSON.stringify({
                    success: true,
                    message: "Free plan - no checkout required",
                    redirect: successUrl || "/dashboard"
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Enterprise plan - redirect to contact
        if (planSlug === "enterprise") {
            return new Response(
                JSON.stringify({
                    success: true,
                    message: "Enterprise plan - contact sales",
                    redirect: "/contact-us"
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 5. Get or create organization for user
        let organizationId: string;

        // Check if user already has an organization
        const { data: userRoles } = await adminClient
            .from("user_roles")
            .select("organization_id")
            .eq("user_id", user.id)
            .not("organization_id", "is", null)
            .limit(1);

        if (userRoles && userRoles.length > 0 && userRoles[0].organization_id) {
            organizationId = userRoles[0].organization_id;
            console.log("Using existing organization:", organizationId);
        } else {
            // Auto-create organization
            const orgName = organizationName || `${user.email?.split("@")[0]}'s Organization`;
            const { data: newOrg, error: orgError } = await adminClient
                .from("organizations")
                .insert({
                    name: orgName,
                    owner_id: user.id,
                    created_by: user.id,
                    max_workspaces: plan.max_workspaces,
                    max_facilities: plan.max_facilities,
                    max_users: plan.max_users,
                })
                .select()
                .single();

            if (orgError) {
                console.error("Failed to create organization:", orgError);
                return new Response(
                    JSON.stringify({ error: "Failed to create organization", details: orgError.message }),
                    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            organizationId = newOrg.id;
            console.log("Created new organization:", organizationId);

            // Assign organization_admin role to user
            await adminClient.from("user_roles").insert({
                user_id: user.id,
                role: "organization_admin",
                organization_id: organizationId,
                created_by: user.id,
            });
        }

        // 6. Get or create Stripe customer
        const { data: org } = await adminClient
            .from("organizations")
            .select("stripe_customer_id, name")
            .eq("id", organizationId)
            .single();

        let stripeCustomerId = org?.stripe_customer_id;

        if (!stripeCustomerId) {
            // Create new Stripe customer
            const customer = await stripe.customers.create({
                email: user.email,
                name: org?.name || organizationName,
                metadata: {
                    organization_id: organizationId,
                    user_id: user.id,
                },
            });

            stripeCustomerId = customer.id;
            console.log("Created Stripe customer:", stripeCustomerId);

            // Save to database
            await adminClient
                .from("organizations")
                .update({ stripe_customer_id: stripeCustomerId })
                .eq("id", organizationId);
        }

        // 7. Get the appropriate price
        const priceId = billingInterval === "yearly"
            ? plan.stripe_price_id_yearly
            : plan.stripe_price_id_monthly;

        // If no Stripe price ID is configured, create a dynamic price
        let checkoutPrice: string | {
            unit_amount: number;
            currency: string;
            recurring: { interval: string };
            product_data: { name: string; description?: string }
        };

        if (priceId) {
            checkoutPrice = priceId;
        } else {
            // Create a dynamic price (for test mode without pre-configured prices)
            checkoutPrice = {
                unit_amount: billingInterval === "yearly" ? plan.price_yearly : plan.price_monthly,
                currency: "usd",
                recurring: { interval: billingInterval === "yearly" ? "year" : "month" },
                product_data: {
                    name: `${plan.name} Plan`,
                    description: plan.description,
                },
            };
        }

        // 8. Create Checkout Session
        const appUrl = Deno.env.get("PUBLIC_APP_URL") || "http://localhost:8080";

        const session = await stripe.checkout.sessions.create({
            customer: stripeCustomerId,
            mode: "subscription",
            payment_method_types: ["card"],
            line_items: [
                {
                    price: typeof checkoutPrice === "string" ? checkoutPrice : undefined,
                    price_data: typeof checkoutPrice === "object" ? checkoutPrice : undefined,
                    quantity: 1,
                },
            ],
            success_url: successUrl || `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl || `${appUrl}/checkout/cancel`,
            subscription_data: {
                metadata: {
                    organization_id: organizationId,
                    plan_id: plan.id,
                    plan_slug: plan.slug,
                },
            },
            metadata: {
                organization_id: organizationId,
                plan_id: plan.id,
                user_id: user.id,
            },
        });

        console.log("Created checkout session:", session.id);

        return new Response(
            JSON.stringify({
                success: true,
                sessionId: session.id,
                url: session.url,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("Error creating checkout session:", err);
        return new Response(
            JSON.stringify({
                error: "Internal server error",
                message: err.message,
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
