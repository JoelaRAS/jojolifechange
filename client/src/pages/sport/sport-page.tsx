import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { cn, formatDate } from "../../lib/utils";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
  ReferenceLine
} from "recharts";

type WorkoutExerciseTemplate = {
  id: string;
  name: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
};

type WorkoutTemplate = {
  id: string;
  name: string;
  description?: string | null;
  focus?: string | null;
  exercises: WorkoutExerciseTemplate[];
};

type WorkoutSet = {
  id: string;
  exercise: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  volume: number | null;
};

type WorkoutSession = {
  id: string;
  date: string;
  notes?: string | null;
  templateId?: string | null;
  template?: { id: string; name: string } | null;
  sets: WorkoutSet[];
};

type SportOverview = {
  sessions: WorkoutSession[];
  volumeByExercise: Array<{ name: string; volume: number }>;
  volumeByTemplate: Array<{ template: string; volume: number }>;
};

type SessionInputSet = {
  exercise: string;
  setNumber: number;
  weight?: number;
  reps?: number;
};

type StepStatus = {
  connected: boolean;
  target: number;
  hasCustomTarget: boolean;
  lastSyncedAt: string | null;
};

type DailyStep = {
  id: string;
  date: string;
  steps: number;
  source?: string | null;
};

export const SportPage = () => {
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [sessionSets, setSessionSets] = useState<SessionInputSet[]>([]);
  const [sessionNotes, setSessionNotes] = useState("");
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [focusExercise, setFocusExercise] = useState("Développé couché");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [stepGoalInput, setStepGoalInput] = useState("10000");

  const templatesQuery = useQuery({
    queryKey: ["sport", "templates"],
    queryFn: async () => {
      const { data } = await api.get<WorkoutTemplate[]>("/sport/templates");
      return data;
    }
  });

  const overviewQuery = useQuery({
    queryKey: ["sport", "overview"],
    queryFn: async () => {
      const { data } = await api.get<SportOverview>("/sport/overview");
      return data;
    }
  });

  const progressQuery = useQuery({
    queryKey: ["sport", "progress", focusExercise],
    queryFn: async () => {
      const { data } = await api.get<Array<{ date: string; setNumber: number; weight: number | null; reps: number | null; volume: number | null }>>("/sport/progress", {
        params: { exercise: focusExercise }
      });
      return data;
    },
    enabled: Boolean(focusExercise)
  });

  const sessionsQuery = useQuery({
    queryKey: ["sport", "sessions"],
    queryFn: async () => {
      const { data } = await api.get<WorkoutSession[]>("/sport/sessions");
      return data;
    }
  });

  const stepStatusQuery = useQuery({
    queryKey: ["sport", "steps", "status"],
    queryFn: async () => {
      const { data } = await api.get<StepStatus>("/sport/steps/status");
      return data;
    }
  });

  const stepDailyQuery = useQuery({
    queryKey: ["sport", "steps", "daily"],
    queryFn: async () => {
      const { data } = await api.get<{ data: DailyStep[] }>("/sport/steps/daily", { params: { days: 30 } });
      return data.data;
    }
  });

  const stepStatus = stepStatusQuery.data;
  const stepTarget = stepStatus?.target ?? null;
  const stepsConnected = stepStatus?.connected ?? false;
  const stepDaily = useMemo(() => stepDailyQuery.data ?? [], [stepDailyQuery.data]);

  useEffect(() => {
    if (typeof stepTarget === "number") {
      setStepGoalInput(stepTarget.toString());
    }
  }, [stepTarget]);

  const stepGoal = stepTarget ?? 10000;
  const latestStepEntry = stepDaily.length ? stepDaily[stepDaily.length - 1] : null;

  const stepChartData = useMemo(() => {
    return stepDaily.map((entry) => ({
      date: formatDate(entry.date),
      steps: entry.steps,
      goal: stepGoal
    }));
  }, [stepDaily, stepGoal]);

  const recentSteps = useMemo(() => {
    return [...stepDaily].reverse().slice(0, 7);
  }, [stepDaily]);

  const stepCompletion = useMemo(() => {
    if (!latestStepEntry) return 0;
    if (!stepGoal) return 0;
    return Math.min(100, Math.round((latestStepEntry.steps / Math.max(stepGoal, 1)) * 100));
  }, [latestStepEntry, stepGoal]);

  const connectStepsMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.get<{ url: string }>("/sport/steps/oauth/url");
      return data;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    }
  });

  const syncStepsMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ data: DailyStep[] }>("/sport/steps/sync", {});
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sport", "steps", "daily"] });
      void queryClient.invalidateQueries({ queryKey: ["sport", "steps", "status"] });
    }
  });

  const updateStepGoalMutation = useMutation({
    mutationFn: async (target: number) => {
      await api.put("/sport/steps/goal", { target });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sport", "steps", "status"] });
    }
  });

  const handleStepGoalSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = Number(stepGoalInput);
    if (!Number.isFinite(target) || target <= 0) return;
    updateStepGoalMutation.mutate(Math.round(target));
  };

  const handleSyncSteps = () => {
    syncStepsMutation.mutate();
  };

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateId) return;
      await api.post("/sport/sessions", {
        templateId: selectedTemplateId,
        date: sessionDate,
        notes: sessionNotes,
        sets: sessionSets
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sport", "sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["sport", "overview"] });
      void queryClient.invalidateQueries({ queryKey: ["sport", "progress"] });
      resetForm();
    }
  });

  const updateSessionMutation = useMutation({
    mutationFn: async () => {
      if (!editingSessionId) return;
      await api.put(`/sport/sessions/${editingSessionId}`, {
        templateId: selectedTemplateId ?? undefined,
        date: sessionDate,
        notes: sessionNotes,
        sets: sessionSets
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sport", "sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["sport", "overview"] });
      void queryClient.invalidateQueries({ queryKey: ["sport", "progress"] });
      resetForm();
    }
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/sport/sessions/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sport", "sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["sport", "overview"] });
      void queryClient.invalidateQueries({ queryKey: ["sport", "progress"] });
      resetForm();
    }
  });

  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;

  useEffect(() => {
    if (!selectedTemplateId && templates.length) {
      setSelectedTemplateId(templates[0].id);
      hydrateSets(templates[0]);
      setFocusExercise(templates[0].exercises[0]?.name ?? "");
    }
  }, [templates, selectedTemplateId]);

  const hydrateSets = (template: WorkoutTemplate) => {
    const generated = template.exercises.flatMap((exercise) =>
      Array.from({ length: exercise.sets }).map((_, index) => ({
        exercise: exercise.name,
        setNumber: index + 1,
        reps: undefined,
        weight: undefined
      }))
    );
    setSessionSets(generated);
  };

  const resetForm = () => {
    setEditingSessionId(null);
    if (selectedTemplate) {
      hydrateSets(selectedTemplate);
      setFocusExercise(selectedTemplate.exercises[0]?.name ?? "");
    } else {
      setSessionSets([]);
      setFocusExercise("");
    }
    setSessionNotes("");
    setSessionDate(new Date().toISOString().split("T")[0]);
  };

  useEffect(() => {
    if (selectedTemplate && !editingSessionId) {
      hydrateSets(selectedTemplate);
    }
  }, [selectedTemplate, editingSessionId]);

  const handleSetChange = (index: number, field: "weight" | "reps", value: string) => {
    const parsedValue = value === "" ? undefined : Number(value);
    setSessionSets((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: parsedValue
      };
      return next;
    });
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    if (template) {
      hydrateSets(template);
      setFocusExercise(template.exercises[0]?.name ?? focusExercise);
    }
  };

  const isSavingSession = createSessionMutation.isPending || updateSessionMutation.isPending;

  const handleSubmitSession = () => {
    if (editingSessionId) {
      updateSessionMutation.mutate();
    } else {
      createSessionMutation.mutate();
    }
  };

  const handleEditSession = (session: WorkoutSession) => {
    setEditingSessionId(session.id);
    const templateId = session.template?.id ?? session.templateId ?? null;
    setSelectedTemplateId(templateId);
    setSessionDate(new Date(session.date).toISOString().split("T")[0]);
    setSessionNotes(session.notes ?? "");
    const sortedSets = [...session.sets].sort((a, b) => a.setNumber - b.setNumber);
    setSessionSets(
      sortedSets.map((set) => ({
        exercise: set.exercise,
        setNumber: set.setNumber,
        weight: set.weight ?? undefined,
        reps: set.reps ?? undefined
      }))
    );
    if (session.sets.length) {
      setFocusExercise(session.sets[0].exercise);
    }
  };

  const handleDeleteSession = (id: string) => {
    deleteSessionMutation.mutate(id);
  };

  const progressData = useMemo(() => {
    return progressQuery.data?.map((entry) => ({
      date: formatDate(entry.date),
      volume: entry.volume ?? 0,
      weight: entry.weight ?? 0,
      reps: entry.reps ?? 0
    }));
  }, [progressQuery.data]);

  return (
    <div className="space-y-8">
      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle>Suivi des pas</CardTitle>
          <CardDescription>Connectez Google Fit pour visualiser vos pas quotidiens et votre objectif.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="text-muted-foreground">
              {stepsConnected
                ? `Google Fit connecté${stepStatus?.lastSyncedAt ? ` — Dernière synchro ${formatDate(stepStatus.lastSyncedAt)}` : ""}`
                : "Aucun compte Google Fit connecté."}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant={stepsConnected ? "outline" : "default"} onClick={() => connectStepsMutation.mutate()} disabled={connectStepsMutation.isPending}>
                {connectStepsMutation.isPending ? "Redirection..." : stepsConnected ? "Reconnecter Google Fit" : "Connecter Google Fit"}
              </Button>
              <Button variant="secondary" onClick={handleSyncSteps} disabled={!stepsConnected || syncStepsMutation.isPending}>
                {syncStepsMutation.isPending ? "Synchronisation..." : "Synchroniser"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 lg:gap-6 lg:grid-cols-[1.8fr_1fr]">
            <div className="rounded-md border border-border/70 bg-background/60 p-4">
              {stepChartData.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stepChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <ReferenceLine y={stepGoal} stroke="#f97316" strokeDasharray="4 4" label={`Objectif (${stepGoal.toLocaleString()} pas)`} />
                    <Bar dataKey="steps" fill="#34d399" name="Pas" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune donnée disponible. Lancez une synchronisation pour récupérer vos pas.</p>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-md border border-border/70 bg-background/60 p-4 text-sm">
                <p className="text-xs uppercase text-muted-foreground">Objectif quotidien</p>
                <p className="mt-2 text-2xl font-semibold">{stepGoal.toLocaleString()} pas</p>
                <p className="text-xs text-muted-foreground">
                  Progression du jour :{" "}
                  {latestStepEntry ? `${latestStepEntry.steps.toLocaleString()} pas (${stepCompletion}% atteint)` : "Synchronisez pour obtenir vos données."}
                </p>
              </div>

              <form className="space-y-2 rounded-md border border-border/70 bg-background/60 p-4" onSubmit={handleStepGoalSubmit}>
                <Label htmlFor="step-goal" className="text-xs text-muted-foreground">
                  Ajuster l’objectif quotidien
                </Label>
                <Input
                  id="step-goal"
                  type="number"
                  min={1000}
                  step={100}
                  value={stepGoalInput}
                  onChange={(event) => setStepGoalInput(event.target.value)}
                />
                <Button type="submit" className="w-full" disabled={updateStepGoalMutation.isPending}>
                  {updateStepGoalMutation.isPending ? "Enregistrement..." : "Mettre à jour l’objectif"}
                </Button>
              </form>

              <div className="rounded-md border border-border/70 bg-background/60 p-4">
                <p className="mb-2 text-xs uppercase text-muted-foreground">7 derniers jours</p>
                <div className="space-y-2 text-xs">
                  {recentSteps.length ? (
                    recentSteps.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between">
                        <span>{formatDate(entry.date)}</span>
                        <span className={entry.steps >= stepGoal ? "text-emerald-500" : ""}>{entry.steps.toLocaleString()} pas</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">Aucune donnée récente.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Journal d’entraînement</CardTitle>
            <CardDescription>Consignez vos séances Upper/Lower et suivez la progression de vos charges.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Programme</Label>
                <select
                  className="w-full rounded-md border border-border bg-background/70 px-3 py-2 text-sm"
                  value={selectedTemplateId ?? ""}
                  onChange={(event) => handleTemplateChange(event.target.value)}
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} />
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-background/60">
              <div className="grid grid-cols-4 border-b border-border/70 bg-card/60 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                <span>Exercice</span>
                <span>Série</span>
                <span>Charge (kg)</span>
                <span>Répétitions</span>
              </div>
              <div className="divide-y divide-border/70">
                {sessionSets.map((set, index) => (
                  <div key={`${set.exercise}-${set.setNumber}-${index}`} className="grid grid-cols-4 items-center gap-2 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{set.exercise}</span>
                    <span># {set.setNumber}</span>
                    <Input
                      type="number"
                      value={set.weight ?? ""}
                      onChange={(event) => handleSetChange(index, "weight", event.target.value)}
                      placeholder="Charge"
                    />
                    <Input
                      type="number"
                      value={set.reps ?? ""}
                      onChange={(event) => handleSetChange(index, "reps", event.target.value)}
                      placeholder="Rép"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes et sensations</Label>
              <Textarea rows={3} value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} placeholder="Volume de la séance, énergie, mobilité..." />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="ghost" type="button" onClick={resetForm}>
                {editingSessionId ? "Annuler" : "Réinitialiser"}
              </Button>
              <Button onClick={handleSubmitSession} disabled={isSavingSession || sessionSets.length === 0}>
                {isSavingSession
                  ? "Enregistrement..."
                  : editingSessionId
                  ? "Mettre à jour"
                  : "Ajouter la séance"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Templates</CardTitle>
            <CardDescription>Séances Upper/Lower preconfigurées Lucas Gouiffes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {templates.map((template) => (
              <div key={template.id} className={cn("rounded-lg border px-3 py-2", template.id === selectedTemplateId ? "border-primary bg-primary/5" : "border-border/70 bg-background/60")}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{template.name}</span>
                  <Badge variant="outline">{template.focus?.toUpperCase()}</Badge>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {template.exercises.map((exercise) => (
                    <li key={exercise.id}>
                      {exercise.name} — {exercise.sets} x {exercise.repsMin}-{exercise.repsMax} ({Math.round(exercise.restSeconds / 60)} min repos)
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!templates.length && <p className="text-sm text-muted-foreground">Chargement des templates...</p>}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Progression sur un exercice</CardTitle>
            <CardDescription>Analyse charge x reps par exercice.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs uppercase text-muted-foreground">Exercice</Label>
              <select
                className="rounded-md border border-border bg-background/60 px-3 py-1 text-sm"
                value={focusExercise}
                onChange={(event) => setFocusExercise(event.target.value)}
              >
                {Array.from(
                  new Set(
                    templates.flatMap((template) => template.exercises.map((exercise) => exercise.name))
                  )
                ).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            {progressData && progressData.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={progressData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="volume" stroke="#6366f1" name="Volume" />
                  <Line type="monotone" dataKey="weight" stroke="#f97316" name="Charge" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Logguez quelques séances pour voir votre progression.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Volume par séance</CardTitle>
            <CardDescription>Répartition volume total par template.</CardDescription>
          </CardHeader>
          <CardContent>
            {overviewQuery.data?.volumeByTemplate.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={overviewQuery.data.volumeByTemplate}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="template" interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="volume" fill="#22c55e" name="Volume" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Les volumes apparaîtront après vos premières séances.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Historique des dix dernières séances</CardTitle>
            <CardDescription>Visualisez le volume total et les charges principales.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-card/60 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Template</th>
                  <th className="px-3 py-2 text-left">Volume total</th>
                  <th className="px-3 py-2 text-left">Sets</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessionsQuery.data?.slice(0, 10).map((session) => {
                  const volumeTotal = session.sets.reduce((acc, set) => acc + (set.volume ?? 0), 0);
                  return (
                    <tr key={session.id} className="border-t border-border/70">
                      <td className="px-3 py-2">{formatDate(session.date)}</td>
                      <td className="px-3 py-2">{session.template?.name ?? "Custom"}</td>
                      <td className="px-3 py-2">{Math.round(volumeTotal)} kg</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                          {session.sets.map((set) => (
                            <span key={set.id} className="rounded bg-secondary px-2 py-0.5">
                              {set.exercise} #{set.setNumber} — {set.weight ?? 0}kg x {set.reps ?? 0}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleEditSession(session)}>
                            Modifier
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => handleDeleteSession(session.id)}
                            disabled={deleteSessionMutation.isPending}
                          >
                            Supprimer
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!sessionsQuery.data?.length && (
              <p className="mt-3 text-sm text-muted-foreground">Aucune séance enregistrée pour le moment.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};
