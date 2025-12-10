import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layouts/app-layout";
import { DashboardPage } from "./pages/dashboard/dashboard-page";
import { NutritionPage } from "./pages/nutrition/nutrition-page";
import { SportPage } from "./pages/sport/sport-page";
import { MetricsPage } from "./pages/metrics/metrics-page";
import { FinancePage } from "./pages/finance/finance-page";
import { SocialPage } from "./pages/social/social-page";
import { ProjectsPage } from "./pages/projects/projects-page";
import { PlannerPage } from "./pages/planner/planner-page";
import { LoginPage } from "./pages/auth/login-page";
import { RegisterPage } from "./pages/auth/register-page";
import { useAuth } from "./providers/auth-provider";
import { useMemo } from "react";

const ProtectedRoutes = () => {
  const { user, loading } = useAuth();

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      );
    }

    if (!user) {
      return <Navigate to="/login" replace />;
    }

    return (
      <AppLayout>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/nutrition" element={<NutritionPage />} />
          <Route path="/sport" element={<SportPage />} />
          <Route path="/metrics" element={<MetricsPage />} />
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/social" element={<SocialPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AppLayout>
    );
  }, [loading, user]);

  return content;
};

const App = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/*" element={<ProtectedRoutes />} />
  </Routes>
);

export default App;
