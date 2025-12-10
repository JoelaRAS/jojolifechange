import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormReturn } from "react-hook-form";
import { api } from "../../lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import { formatDate } from "../../lib/utils";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";

type MetricEntry = {
  id: string;
  date: string;
  weight?: number | null;
  height?: number | null;
  waist?: number | null;
  hips?: number | null;
  chest?: number | null;
  leftArm?: number | null;
  rightArm?: number | null;
  leftThigh?: number | null;
  rightThigh?: number | null;
  notes?: string | null;
};

type ProgressPhoto = {
  id: string;
  date: string;
  url: string;
  side?: string | null;
};

type MetricsSummary = {
  current: MetricEntry | null;
  previous: MetricEntry | null;
  bmi: number | null;
  deltaWeight: number | null;
  photos: ProgressPhoto[];
};

const metricsSchema = z.object({
  date: z.string().optional(),
  weight: z.coerce.number().optional(),
  height: z.coerce.number().optional(),
  waist: z.coerce.number().optional(),
  hips: z.coerce.number().optional(),
  chest: z.coerce.number().optional(),
  leftArm: z.coerce.number().optional(),
  rightArm: z.coerce.number().optional(),
  leftThigh: z.coerce.number().optional(),
  rightThigh: z.coerce.number().optional(),
  notes: z.string().optional()
});

type MetricsFormValues = z.infer<typeof metricsSchema>;

export const MetricsPage = () => {
  const queryClient = useQueryClient();
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoDate, setPhotoDate] = useState(new Date().toISOString().split("T")[0]);
  const metricsForm = useForm<MetricsFormValues>({
    resolver: zodResolver(metricsSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0]
    }
  });

  const summaryQuery = useQuery({
    queryKey: ["metrics", "summary"],
    queryFn: async () => {
      const { data } = await api.get<MetricsSummary>("/metrics/summary");
      return data;
    }
  });

  const entriesQuery = useQuery({
    queryKey: ["metrics", "entries"],
    queryFn: async () => {
      const start = new Date();
      start.setMonth(start.getMonth() - 3);
      const { data } = await api.get<MetricEntry[]>("/metrics/entries", {
        params: { start: start.toISOString().split("T")[0] }
      });
      return data;
    }
  });

  const photosQuery = useQuery({
    queryKey: ["metrics", "photos"],
    queryFn: async () => {
      const { data } = await api.get<ProgressPhoto[]>("/metrics/photos");
      return data;
    }
  });

  const addEntryMutation = useMutation({
    mutationFn: async (values: MetricsFormValues) => {
      await api.post("/metrics/entries", values);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["metrics", "entries"] });
      void queryClient.invalidateQueries({ queryKey: ["metrics", "summary"] });
      metricsForm.reset({ date: new Date().toISOString().split("T")[0] });
    }
  });

  const uploadPhoto = async (file: File, side?: string) => {
    const formData = new FormData();
    formData.append("photo", file);
    formData.append("date", photoDate);
    if (side) formData.append("side", side);
    await api.post("/metrics/photos", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      await uploadPhoto(file);
      void queryClient.invalidateQueries({ queryKey: ["metrics", "photos"] });
      void queryClient.invalidateQueries({ queryKey: ["metrics", "summary"] });
    } finally {
      setPhotoUploading(false);
      event.target.value = "";
    }
  };

  const deletePhotoMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/metrics/photos/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["metrics", "photos"] });
      void queryClient.invalidateQueries({ queryKey: ["metrics", "summary"] });
    }
  });

  const chartData = useMemo(() => {
    return entriesQuery.data?.map((entry) => ({
      date: formatDate(entry.date),
      weight: entry.weight,
      waist: entry.waist,
      hips: entry.hips
    }));
  }, [entriesQuery.data]);

  const onSubmit = metricsForm.handleSubmit((values) => {
    addEntryMutation.mutate(values);
  });

  const summary = summaryQuery.data;

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Suivi des mensurations</CardTitle>
            <CardDescription>Enregistrez vos mesures et visualisez l’évolution de votre morphologie.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" {...metricsForm.register("date")} />
              </div>
              <NumberField label="Poids (kg)" field="weight" form={metricsForm} />
              <NumberField label="Taille (cm)" field="height" form={metricsForm} />
              <NumberField label="Taille de taille (cm)" field="waist" form={metricsForm} />
              <NumberField label="Hanches (cm)" field="hips" form={metricsForm} />
              <NumberField label="Poitrine (cm)" field="chest" form={metricsForm} />
              <NumberField label="Bras G (cm)" field="leftArm" form={metricsForm} />
              <NumberField label="Bras D (cm)" field="rightArm" form={metricsForm} />
              <NumberField label="Cuisse G (cm)" field="leftThigh" form={metricsForm} />
              <NumberField label="Cuisse D (cm)" field="rightThigh" form={metricsForm} />
              <div className="md:col-span-4 space-y-2">
                <Label>Notes</Label>
                <Textarea rows={2} {...metricsForm.register("notes")} placeholder="Sommeil, énergie, blessures..." />
              </div>
              <div className="md:col-span-4 flex justify-end">
                <Button type="submit" disabled={addEntryMutation.isPending}>
                  {addEntryMutation.isPending ? "Enregistrement..." : "Ajouter"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Résumé</CardTitle>
            <CardDescription>Derniers résultats et écarts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {summary ? (
              <>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Poids actuel</p>
                  <p className="text-2xl font-semibold">{summary.current?.weight ? `${summary.current.weight} kg` : "—"}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">BMI {summary.bmi ?? "—"}</Badge>
                  <Badge variant="outline">
                    Variation poids {summary.deltaWeight ? `${summary.deltaWeight > 0 ? "+" : ""}${summary.deltaWeight.toFixed(1)} kg` : "—"}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase text-muted-foreground">Ajouter une photo</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Date de la photo</Label>
                      <Input type="date" value={photoDate} onChange={(event) => setPhotoDate(event.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Image</Label>
                      <Input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={photoUploading} />
                      {photoUploading && <p className="text-xs text-muted-foreground">Téléversement en cours…</p>}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune donnée disponible.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Photos de progression</CardTitle>
            <CardDescription>Archivez vos visuels et suivez l’évolution dans le temps.</CardDescription>
          </CardHeader>
          <CardContent>
            {photosQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Chargement des photos…</p>
            ) : photosQuery.data && photosQuery.data.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {photosQuery.data.map((photo) => (
                  <div key={photo.id} className="space-y-3 rounded-lg border border-border/70 bg-background/60 p-3">
                    <div className="relative overflow-hidden rounded-md">
                      <img src={photo.url} alt={photo.side ?? "progress"} className="h-60 w-full object-cover" />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div>
                        <p className="font-medium text-foreground">{formatDate(photo.date)}</p>
                        {photo.side && <p className="mt-0.5">Profil : {photo.side}</p>}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deletePhotoMutation.mutate(photo.id)}
                        disabled={deletePhotoMutation.isPending}
                      >
                        Supprimer
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune photo enregistrée pour le moment.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Courbe de poids</CardTitle>
            <CardDescription>Visualisez la tendance sur les 90 derniers jours.</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData && chartData.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="weight" stroke="#6366f1" name="Poids" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Ajoutez au moins une mesure pour générer le graphique.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Mensurations clés</CardTitle>
            <CardDescription>Surveillez taille et hanches.</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData && chartData.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="waist" stroke="#f97316" name="Taille" />
                  <Line type="monotone" dataKey="hips" stroke="#22c55e" name="Hanches" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Ajoutez une mesure de taille pour alimenter ce graphe.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Historique détaillé</CardTitle>
            <CardDescription>Toutes vos mesures pour audit rapide.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-card/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Poids</th>
                  <th className="px-3 py-2 text-left">Taille</th>
                  <th className="px-3 py-2 text-left">Taille (cm)</th>
                  <th className="px-3 py-2 text-left">Hanches (cm)</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {entriesQuery.data?.map((entry) => (
                  <tr key={entry.id} className="border-t border-border/70">
                    <td className="px-3 py-2">{formatDate(entry.date)}</td>
                    <td className="px-3 py-2">{entry.weight ?? "—"}</td>
                    <td className="px-3 py-2">{entry.height ?? "—"}</td>
                    <td className="px-3 py-2">{entry.waist ?? "—"}</td>
                    <td className="px-3 py-2">{entry.hips ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{entry.notes ?? ""}</td>
                  </tr>
                ))}
                {!entriesQuery.data?.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-sm text-muted-foreground">
                      Aucune mesure enregistrée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

type NumberFieldProps = {
  label: string;
  field: keyof MetricsFormValues;
  form: UseFormReturn<MetricsFormValues>;
};

const NumberField = ({ label, field, form }: NumberFieldProps) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <Input type="number" step="0.1" {...form.register(field)} />
  </div>
);
