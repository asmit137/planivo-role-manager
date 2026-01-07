import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { ModuleProvider } from "@/contexts/ModuleContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { NetworkStatusIndicator } from "@/components/NetworkStatusIndicator";
import { useSecurityProtection } from "@/hooks/useSecurityProtection";
import Auth from "./pages/Auth";
import Bootstrap from "./pages/Bootstrap";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import MeetingRoom from "./pages/MeetingRoom";
import ResetPassword from "./pages/ResetPassword";
import ScheduleDisplay from "./pages/ScheduleDisplay";
import NotFound from "./pages/NotFound";

import TermsOfService from "./pages/policies/TermsOfService";
import PrivacyPolicy from "./pages/policies/PrivacyPolicy";
import CookiePolicy from "./pages/policies/CookiePolicy";

const queryClient = new QueryClient();

// Security wrapper component
const SecurityWrapper = ({ children }: { children: React.ReactNode }) => {
  useSecurityProtection({
    disableRightClick: true,
    disableDevTools: true,
    disableTextSelection: false, // Keep text selection for UX
  });

  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <SecurityWrapper>
          <Toaster />
          <Sonner />
          <NetworkStatusIndicator />
          <BrowserRouter>
            <AuthProvider>
              <ModuleProvider>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/bootstrap" element={<Bootstrap />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/meeting" element={<MeetingRoom />} />
                  <Route path="/schedule-display" element={<ScheduleDisplay />} />

                  {/* Policy Pages */}
                  <Route path="/policies/terms" element={<TermsOfService />} />
                  <Route path="/policies/privacy" element={<PrivacyPolicy />} />
                  <Route path="/policies/cookies" element={<CookiePolicy />} />

                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </ModuleProvider>
            </AuthProvider>
          </BrowserRouter>
        </SecurityWrapper>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
