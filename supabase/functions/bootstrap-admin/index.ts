import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BootstrapRequest {
  email: string;
  password: string;
  full_name: string;
  bootstrap_secret: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { email, password, full_name, bootstrap_secret }: BootstrapRequest = await req.json();

    // Verify bootstrap secret (simple security for initial setup)
    // In production, this should be a more secure mechanism
    if (bootstrap_secret !== "planivo_bootstrap_2024") {
      return new Response(
        JSON.stringify({ error: "Invalid bootstrap secret" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if any super admin already exists
    const { data: existingAdmins, error: checkError } = await supabaseClient
      .from("user_roles")
      .select("id")
      .eq("role", "super_admin")
      .limit(1);

    if (checkError) {
      console.error("Error checking existing admins:", checkError);
      return new Response(
        JSON.stringify({ error: "Database error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existingAdmins && existingAdmins.length > 0) {
      return new Response(
        JSON.stringify({ error: "Super Admin already exists. Use regular user creation." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if a user with this email already exists in auth
    const { data: { users }, error: listError } = await supabaseClient.auth.admin.listUsers();
    
    if (listError) {
      console.error("Error listing users:", listError);
    } else {
      const existingAuthUser = users.find(u => u.email === email);
      if (existingAuthUser) {
        console.log(`Cleaning up existing user: ${existingAuthUser.id}`);
        
        // First, delete all database records for this user
        // Delete conversations and related data
        const { data: userConvs } = await supabaseClient
          .from('conversations')
          .select('id')
          .eq('created_by', existingAuthUser.id);
        
        if (userConvs && userConvs.length > 0) {
          const convIds = userConvs.map(c => c.id);
          
          // Delete messages in conversations
          await supabaseClient
            .from('messages')
            .delete()
            .in('conversation_id', convIds);
          
          // Delete conversation participants
          await supabaseClient
            .from('conversation_participants')
            .delete()
            .in('conversation_id', convIds);
          
          // Delete conversations
          await supabaseClient
            .from('conversations')
            .delete()
            .in('id', convIds);
        }
        
        // Delete user roles
        await supabaseClient
          .from('user_roles')
          .delete()
          .eq('user_id', existingAuthUser.id);
        
        // Delete profile
        await supabaseClient
          .from('profiles')
          .delete()
          .eq('id', existingAuthUser.id);
        
        // Now delete the auth user
        const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(existingAuthUser.id);
        if (deleteError) {
          console.error("Error deleting existing auth user:", deleteError);
          return new Response(
            JSON.stringify({ error: "Failed to clean up existing user" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.log(`Successfully deleted existing user: ${existingAuthUser.id}`);
      }
    }

    // Create the first super admin user
    const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      console.error("User creation error:", createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!newUser.user) {
      return new Response(
        JSON.stringify({ error: "Failed to create user" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create profile
    const { error: profileError } = await supabaseClient
      .from("profiles")
      .insert([
        {
          id: newUser.user.id,
          email,
          full_name,
        },
      ]);

    if (profileError) {
      console.error("Profile creation error:", profileError);
      await supabaseClient.auth.admin.deleteUser(newUser.user.id);
      return new Response(
        JSON.stringify({ error: "Failed to create profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create super admin role
    const { error: roleError } = await supabaseClient
      .from("user_roles")
      .insert([
        {
          user_id: newUser.user.id,
          role: "super_admin",
          workspace_id: null,
        },
      ]);

    if (roleError) {
      console.error("Role creation error:", roleError);
      await supabaseClient.auth.admin.deleteUser(newUser.user.id);
      return new Response(
        JSON.stringify({ error: "Failed to create role" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully bootstrapped Super Admin: ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Super Admin created successfully",
        user: { 
          email, 
          full_name 
        } 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
