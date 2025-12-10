import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Button } from "../../components/ui/button";
import { Link } from "react-router-dom";
import { cn, formatDate } from "../../lib/utils";

type DashboardOverview = {
  metrics: {
    weight: number | null;
    caloriesAverage: number;
    spending: number;
    savings: number;
    projectProgress: number;
    contactsToReach: number;
  };
  charts: {
    caloriesVsWeight: Array<{ date: string; calories: number; weight: number | null }>;
    finance: Array<{ month: string; expenses: number; savings: number }>;
    activity: Array<{ date: string; workouts: number; wellbeing: number }>;
  };
  highlights: Array<{ id: string; title: string; description: string; link: string }>;
};

export const DashboardPage = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: async () => {
      const response = await api.get<DashboardOverview>("/dashboard/overview");
      return response.data;
    }
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Chargement du tableau de bord...</div>;
  }

  if (!data) {
    return <div className="text-sm text-muted-foreground">Aucune donnée disponible.</div>;
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-semibold">Vue globale</h2>
        <p className="text-sm text-muted-foreground">
          Monitorer vos métriques clés et reliez toutes les dimensions de votre vie.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard title="Poids actuel" value={data.metrics.weight ? `${data.metrics.weight} kg` : "—"} />
          <StatCard title="Calories moyennes" value={`${Math.round(data.metrics.caloriesAverage)} kcal`} />
          <StatCard title="Dépenses mensuelles" value={`${data.metrics.spending.toFixed(2)} €`} trend="down" />
          <StatCard title="Épargne cumulée" value={`${data.metrics.savings.toFixed(2)} €`} trend="up" />
          <StatCard title="Progression projets" value={`${Math.round(data.metrics.projectProgress)} %`} />
          <StatCard title="Contacts à relancer" value={`${data.metrics.contactsToReach}`} trend="neutral" />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <ChartCard
          title="Poids & calories"
          description="Analyse du lien entre l'apport calorique et l'évolution du poids."
        >
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.charts.caloriesVsWeight}>
              <defs>
                <linearGradient id="colorCalories" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString("fr-FR", { month: "short", day: "numeric" })} />
              <YAxis />
              <CartesianGrid strokeDasharray="3 3" />
              <Tooltip
                labelFormatter={(value) => formatDate(value)}
                formatter={(value: number, name) =>
                  name === "calories" ? [`${Math.round(value)} kcal`, "Calories"] : [`${value ?? 0} kg`, "Poids"]
                }
              />
              <Legend />
              <Area type="monotone" dataKey="calories" stroke="#6366f1" fill="url(#colorCalories)" />
              <Area type="monotone" dataKey="weight" stroke="#f97316" fill="url(#colorWeight)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Finances"
          description="Dépenses vs épargne pour garder le cap sur vos objectifs."
        >
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.charts.finance}>
              <XAxis dataKey="month" />
              <YAxis />
              <CartesianGrid strokeDasharray="3 3" />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="expenses" stroke="#f87171" fill="#f87171" fillOpacity={0.3} />
              <Area type="monotone" dataKey="savings" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Activité & bien-être"
          description="Charge d'entraînement et ressenti moyen."
        >
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.charts.activity}>
              <XAxis dataKey="date" tickFormatter={(value) => new Date(value).toLocaleDateString("fr-FR", { month: "short", day: "numeric" })} />
              <YAxis />
              <CartesianGrid strokeDasharray="3 3" />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="workouts" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} name="Workouts" />
              <Area type="monotone" dataKey="wellbeing" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.2} name="RPE moyen" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section>
        <h3 className="text-lg font-semibold">Actions recommandées</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {data.highlights.map((highlight) => (
            <Card key={highlight.id}>
              <CardHeader className="space-y-2">
                <Badge className="w-fit">Recommandation</Badge>
                <CardTitle className="text-base">{highlight.title}</CardTitle>
                <CardDescription>{highlight.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="secondary" className="w-full">
                  <Link to={highlight.link}>Voir le détail</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
};

const StatCard = ({
  title,
  value,
  trend
}: {
  title: string;
  value: string;
  trend?: "up" | "down" | "neutral";
}) => (
  <Card className="border-border/70 bg-card/80">
    <CardHeader className="pb-2">
      <CardDescription>{title}</CardDescription>
      <CardTitle className="text-2xl">{value}</CardTitle>
    </CardHeader>
    <CardContent>
      <div
        className={cn(
          "text-xs font-medium",
          trend === "up"
            ? "text-emerald-500"
            : trend === "down"
            ? "text-rose-500"
            : "text-muted-foreground"
        )}
      >
        {trend === "up" && "En progression"}
        {trend === "down" && "À surveiller"}
        {trend === "neutral" && "Stable"}
      </div>
    </CardContent>
  </Card>
);

const ChartCard = ({
  children,
  title,
  description
}: {
  children: React.ReactNode;
  title: string;
  description: string;
}) => (
  <Card className="border-border/70 bg-card/80">
    <CardHeader className="pb-2">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent className="pt-4">{children}</CardContent>
  </Card>
);
