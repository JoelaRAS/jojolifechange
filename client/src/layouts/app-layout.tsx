import { Link, useLocation } from "react-router-dom";
import { ReactNode, useMemo, useState } from "react";
import { LayoutDashboard, Salad, Dumbbell, Ruler, Wallet, UsersRound, Kanban, CalendarRange, Menu, Moon, Sun, LogOut } from "lucide-react";
import { useTheme } from "../providers/theme-provider";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "../components/ui/sheet";
import { useAuth } from "../providers/auth-provider";

type NavItem = {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Nutrition", path: "/nutrition", icon: Salad },
  { label: "Sport", path: "/sport", icon: Dumbbell },
  { label: "Metrics", path: "/metrics", icon: Ruler },
  { label: "Finance", path: "/finance", icon: Wallet },
  { label: "Social", path: "/social", icon: UsersRound },
  { label: "Projects", path: "/projects", icon: Kanban },
  { label: "Planner", path: "/planner", icon: CalendarRange }
];

type AppLayoutProps = {
  children: ReactNode;
};

export const AppLayout = ({ children }: AppLayoutProps) => {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();

  const initials = useMemo(() => {
    if (user?.name) {
      const letters = user.name
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0]?.toUpperCase())
        .join("");
      return letters.slice(0, 2) || "JJ";
    }
    if (user?.email) {
      return user.email[0]?.toUpperCase() ?? "JJ";
    }
    return "JJ";
  }, [user]);

  const currentRoute = useMemo(() => navItems.find((item) => location.pathname.startsWith(item.path)), [location.pathname]);

  const sidebar = (
    <nav className="flex h-full flex-col bg-card/40">
      <div className="px-4 pt-6">
        <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-lg" onClick={() => setMobileOpen(false)}>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">🧠</span>
          LifeOS
        </Link>
      </div>
      <div className="mt-6 flex-1 overflow-y-auto px-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="space-y-4 px-4 pb-6">
        <div className="rounded-md border border-border/60 bg-background/60 p-4 text-xs text-muted-foreground">
          <p className="text-sm font-semibold text-foreground">Dashboard global</p>
          <p className="mt-1">Suivez votre vie à 360° : nutrition, sport, finances, relations et projets.</p>
        </div>
        <div className="space-y-4 rounded-md border border-border/60 bg-background/70 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initials}</span>
            <div className="text-sm">
              <p className="font-semibold text-foreground">{user?.name ?? "Utilisateur"}</p>
              {user?.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => {
              toggleTheme();
              setMobileOpen(false);
            }}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            Basculer thème
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10"
            onClick={() => {
              logout();
              setMobileOpen(false);
            }}
          >
            <LogOut className="h-4 w-4" />
            Se déconnecter
          </Button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r border-border lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto lg:bg-card/40">{sidebar}</aside>
      <main className="flex min-h-screen flex-1 flex-col">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur lg:hidden">
            <div className="flex items-center gap-3">
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-lg border border-border" aria-label="Ouvrir le menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <span className="text-sm font-semibold text-foreground">{currentRoute?.label ?? "LifeOS"}</span>
            </div>
          </header>
          <SheetContent side="left" className="w-72 p-0">
            {sidebar}
          </SheetContent>
        </Sheet>

        <div className="flex-1 overflow-y-auto px-4 pb-16 pt-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
};
