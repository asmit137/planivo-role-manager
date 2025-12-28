import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { ModuleProvider } from "@/contexts/ModuleContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { NetworkStatusIndicator } from "@/components/NetworkStatusIndicator";
import Auth from "./pages/Auth";
import Bootstrap from "./pages/Bootstrap";
import Dashboard from "./pages/Dashboard";
import MeetingRoom from "./pages/MeetingRoom";
import ResetPassword from "./pages/ResetPassword";
import ScheduleDisplay from "./pages/ScheduleDisplay";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <NetworkStatusIndicator />
        <BrowserRouter>
          <AuthProvider>
            <ModuleProvider>
              <Routes>
                <Route path="/" element={<Auth />} />
                <Route path="/bootstrap" element={<Bootstrap />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/meeting" element={<MeetingRoom />} />
                <Route path="/schedule-display" element={<ScheduleDisplay />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ModuleProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
