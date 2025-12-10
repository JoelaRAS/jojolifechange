import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { api } from "../../lib/api";

type PlannerStatusResponse = {
  connected: boolean;
};

type PlannerEvent = {
  id: string | null | undefined;
  summary?: string | null;
  description?: string | null;
  start?: string | null;
  end?: string | null;
  htmlLink?: string | null;
};

type PlannerEventsResponse = {
  events: PlannerEvent[];
};

const plannerFormSchema = z.object({
  title: z.string().min(1, "Titre requis"),
  description: z.string().optional(),
  date: z.string().min(1, "Date requise"),
  startTime: z.string().min(1, "Heure requise"),
  durationMinutes: z.coerce.number().min(5, "Durée minimale 5 minutes").max(1440, "Durée maximale 24h"),
  timezone: z.string().optional()
});

type PlannerFormValues = z.infer<typeof plannerFormSchema>;

const defaultTimezone = "Europe/Paris";

export const PlannerPage = () => {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["planner", "status"],
    queryFn: async () => {
      const { data } = await api.get<PlannerStatusResponse>("/planner/status");
      return data;
    }
  });

  const eventsQuery = useQuery({
    queryKey: ["planner", "events"],
    queryFn: async () => {
      const { data } = await api.get<PlannerEventsResponse>("/planner/events");
      return data.events;
    },
    enabled: Boolean(statusQuery.data?.connected)
  });

  const form = useForm<PlannerFormValues>({
    resolver: zodResolver(plannerFormSchema),
    defaultValues: {
      title: "",
      description: "",
      date: new Date().toISOString().split("T")[0],
      startTime: "09:00",
      durationMinutes: 60,
      timezone: defaultTimezone
    }
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.get<{ url: string }>("/planner/oauth/url");
      return data;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    }
  });

  const createEventMutation = useMutation({
    mutationFn: async (values: PlannerFormValues) => {
      await api.post("/planner/events", values);
    },
    onSuccess: () => {
      form.reset({
        title: "",
        description: "",
        date: form.getValues("date"),
        startTime: form.getValues("startTime"),
        durationMinutes: form.getValues("durationMinutes"),
        timezone: defaultTimezone
      });
      void queryClient.invalidateQueries({ queryKey: ["planner", "events"] });
    }
  });

  const handleConnectClick = () => {
    connectMutation.mutate();
  };

  const onSubmit = form.handleSubmit((values) => {
    createEventMutation.mutate(values);
  });

  const plannerEvents = useMemo(() => {
    if (!eventsQuery.data) return [];
    return eventsQuery.data
      .filter((event) => event.start)
      .slice(0, 20);
  }, [eventsQuery.data]);

  const formatDateTime = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    return date.toLocaleString("fr-FR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) {
      void queryClient.invalidateQueries({ queryKey: ["planner", "status"] });
      void queryClient.invalidateQueries({ queryKey: ["planner", "events"] });
    }
  }, [queryClient]);

  const isConnected = statusQuery.data?.connected;

  return (
    <div className="space-y-6">
      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle>Connexion calendrier</CardTitle>
          <CardDescription>
            Connectez votre Google Calendar pour planifier et synchroniser automatiquement vos événements LifeOS.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {isConnected ? "Google Calendar connecté." : "Aucun calendrier connecté."}
          </div>
          <Button variant={isConnected ? "outline" : "default"} onClick={handleConnectClick} disabled={connectMutation.isPending}>
            {connectMutation.isPending ? "Redirection..." : isConnected ? "Re-connecter Google Calendar" : "Connecter Google Calendar"}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle>Planifier un événement</CardTitle>
          <CardDescription>Créez une tâche (formation, travail, sport…) directement dans votre agenda Google.</CardDescription>
        </CardHeader>
        <CardContent>
          {isConnected ? (
            <form className="grid gap-4 md:grid-cols-4" onSubmit={onSubmit}>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="planner-title">Titre</Label>
                <Input id="planner-title" placeholder="Réunion, séance, tâche..." {...form.register("title")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="planner-date">Date</Label>
                <Input id="planner-date" type="date" {...form.register("date")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="planner-start">Heure de début</Label>
                <Input id="planner-start" type="time" {...form.register("startTime")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="planner-duration">Durée (minutes)</Label>
                <Input id="planner-duration" type="number" min={5} step={5} {...form.register("durationMinutes", { valueAsNumber: true })} />
              </div>
              <div className="space-y-2 md:col-span-4">
                <Label>Description</Label>
                <Textarea rows={3} placeholder="Notes, lieu, rappel..." {...form.register("description")} />
              </div>
              <div className="space-y-2">
                <Label>Fuseau horaire</Label>
                <Input placeholder="Europe/Paris" {...form.register("timezone")} />
              </div>
              <div className="md:col-span-4 flex justify-end">
                <Button type="submit" disabled={createEventMutation.isPending}>
                  {createEventMutation.isPending ? "Création..." : "Créer l'événement"}
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Connectez votre Google Calendar pour planifier des événements depuis LifeOS.
            </p>
          )}
        </CardContent>
      </Card>

      {isConnected && (
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Événements à venir</CardTitle>
            <CardDescription>Les prochains événements de votre Google Calendar (lecture seule).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {eventsQuery.isLoading && <p className="text-sm text-muted-foreground">Chargement des événements...</p>}
            {!eventsQuery.isLoading && plannerEvents.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun événement à venir trouvé.</p>
            )}
            {plannerEvents.map((event) => {
              const startFormatted = formatDateTime(event.start);
              const endFormatted = formatDateTime(event.end);
              return (
                <div key={event.id ?? `${startFormatted}-${event.summary}`} className="rounded-md border border-border/60 bg-background/60 p-3">
                  <p className="text-sm font-semibold">{event.summary ?? "Sans titre"}</p>
                  <p className="text-xs text-muted-foreground">
                    {startFormatted} – {endFormatted}
                  </p>
                  {event.description && <p className="mt-1 text-xs text-muted-foreground">{event.description}</p>}
                  {event.htmlLink && (
                    <a
                      className="mt-2 inline-flex text-xs text-primary underline"
                      href={event.htmlLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ouvrir dans Google Calendar
                    </a>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
