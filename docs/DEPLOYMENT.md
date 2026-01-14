# Deployment & Setup Guide

This guide provides instructions for setting up the Planivo Role Manager development environment and deploying the application to production.

## 1. Local Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or later)
- [npm](https://www.npmjs.com/)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (optional, for local Edge Function development)

### Steps
1. **Clone the repository**:
   ```sh
   git clone <repository-url>
   cd <project-directory>
   ```

2. **Install dependencies**:
   ```sh
   npm install
   ```

3. **Configure environment variables**:
   Create a `.env` file in the root directory and add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Start the development server**:
   ```sh
   npm run dev
   ```
   The app will be available at `http://localhost:8080` (or similar).

---

## 2. Supabase Configuration

### Database Schema & Migrations
The database schema is managed via SQL migrations located in `supabase/migrations`.
- Apply migrations using the Supabase Dashboard SQL Editor or the CLI:
  ```sh
  supabase db push
  ```

### Edge Functions
The project uses several Edge Functions for administrative tasks.
- **Functions**: `bootstrap-admin`, `create-user`, `scheduling-reminder`.
- **Deployment**:
  ```sh
  supabase functions deploy <function-name>
  ```
- **Environment Secrets**: Ensure the following secrets are set in your Supabase project:
  - `SUPABASE_SERVICE_ROLE_KEY`: Required for admin actions.

### JWT Verification
Some functions (like `create-user`) have `verify_jwt = false` in `config.toml` because they handle internal authentication checks. Ensure your `config.toml` matches the production requirements.

---

## 3. Production Deployment

### Frontend (Static Site)
1. **Build the project**:
   ```sh
   npm run build
   ```
2. **Deploy the `dist` folder**:
   The project is optimized for deployment on platforms like Vercel, Netlify, or Supabase Hosting.

### Supabase Settings
1. **Auth Settings**:
   - Enable "Confirm Email" for new users if desired.
   - Configure "Site URL" to your production domain.
2. **RLS Policies**:
   - Ensure all RLS policies are enabled and tested in the production database.
3. **Storage**:
   - If the application uses storage buckets, ensure they are created and have the correct public/private access policies.
