import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import { formatDate } from "../../lib/utils";

type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  dueDate?: string | null;
  completedAt?: string | null;
};

type Project = {
  id: string;
  name: string;
  description?: string | null;
  status: "ACTIVE" | "COMPLETED" | "ON_HOLD";
  createdAt: string;
  tasks: Task[];
};

type ProjectSummary = Array<{
  id: string;
  name: string;
  status: string;
  progress: number;
}>;

const projectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional()
});

const taskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  dueDate: z.string().optional()
});

export const ProjectsPage = () => {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const projectForm = useForm<z.infer<typeof projectSchema>>({
    resolver: zodResolver(projectSchema)
  });

  const taskForm = useForm<z.infer<typeof taskSchema>>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      projectId: "",
      status: "TODO"
    }
  });

  const projectsQuery = useQuery({
    queryKey: ["projects", "list"],
    queryFn: async () => {
      const { data } = await api.get<Project[]>("/projects/projects");
      return data;
    }
  });

  const summaryQuery = useQuery({
    queryKey: ["projects", "summary"],
    queryFn: async () => {
      const { data } = await api.get<ProjectSummary>("/projects/summary");
      return data;
    }
  });

  const addProjectMutation = useMutation({
    mutationFn: async (values: z.infer<typeof projectSchema>) => {
      await api.post("/projects/projects", values);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "summary"] });
      setEditingProjectId(null);
      projectForm.reset();
    }
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: z.infer<typeof projectSchema> }) => {
      await api.put(`/projects/projects/${id}`, values);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "summary"] });
      setEditingProjectId(null);
      projectForm.reset();
    }
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/projects/projects/${id}`);
    },
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "summary"] });
      setEditingProjectId(null);
      if (selectedProjectId === id) {
        setSelectedProjectId(null);
      }
    }
  });

  const addTaskMutation = useMutation({
    mutationFn: async (values: z.infer<typeof taskSchema>) => {
      await api.post(`/projects/projects/${values.projectId}/tasks`, values);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "summary"] });
      setEditingTaskId(null);
      taskForm.reset({ projectId: selectedProjectId ?? "", status: "TODO" });
    }
  });

  const saveTaskMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: z.infer<typeof taskSchema> }) => {
      await api.patch(`/projects/tasks/${id}`, values);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "summary"] });
      setEditingTaskId(null);
      taskForm.reset({ projectId: selectedProjectId ?? "", status: "TODO" });
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/projects/tasks/${id}`);
    },
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "summary"] });
      if (editingTaskId === id) {
        setEditingTaskId(null);
        taskForm.reset({ projectId: selectedProjectId ?? "", status: "TODO" });
      }
    }
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Task["status"] }) => {
      await api.patch(`/projects/tasks/${id}`, { status, completedAt: status === "DONE" ? new Date().toISOString() : undefined });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "summary"] });
    }
  });

  const onProjectSubmit = projectForm.handleSubmit((values) => {
    if (editingProjectId) {
      updateProjectMutation.mutate({ id: editingProjectId, values });
    } else {
      addProjectMutation.mutate(values);
    }
  });

  const onTaskSubmit = taskForm.handleSubmit((values) => {
    if (editingTaskId) {
      saveTaskMutation.mutate({ id: editingTaskId, values });
    } else {
      addTaskMutation.mutate(values);
    }
  });

  const columns = useMemo(() => {
    const project = projectsQuery.data?.find((p) => p.id === (selectedProjectId ?? projectsQuery.data?.[0]?.id));
    if (!project) return { TODO: [], IN_PROGRESS: [], DONE: [] } as Record<Task["status"], Task[]>;
    return {
      TODO: project.tasks.filter((task) => task.status === "TODO"),
      IN_PROGRESS: project.tasks.filter((task) => task.status === "IN_PROGRESS"),
      DONE: project.tasks.filter((task) => task.status === "DONE")
    } as Record<Task["status"], Task[]>;
  }, [projectsQuery.data, selectedProjectId]);

  const activeProject = projectsQuery.data?.find((project) => project.id === selectedProjectId) ?? projectsQuery.data?.[0] ?? null;

  const isSavingProject = addProjectMutation.isPending || updateProjectMutation.isPending;
  const isSavingTask = addTaskMutation.isPending || saveTaskMutation.isPending;

  useEffect(() => {
    if (projectsQuery.data?.length && !selectedProjectId) {
      const first = projectsQuery.data[0];
      setSelectedProjectId(first.id);
      taskForm.setValue("projectId", first.id);
    }
  }, [projectsQuery.data, selectedProjectId, taskForm]);

  useEffect(() => {
    if (selectedProjectId) {
      taskForm.setValue("projectId", selectedProjectId);
    }
  }, [selectedProjectId, taskForm]);

  const handleEditProject = (project: Project) => {
    setEditingProjectId(project.id);
    projectForm.reset({
      name: project.name,
      description: project.description ?? ""
    });
  };

  const handleCancelProjectEdit = () => {
    setEditingProjectId(null);
    projectForm.reset();
  };

  const handleDeleteProject = (projectId: string) => {
    deleteProjectMutation.mutate(projectId);
  };

  const handleEditTask = (task: Task, projectId: string) => {
    setEditingTaskId(task.id);
    setSelectedProjectId(projectId);
    taskForm.reset({
      projectId,
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      dueDate: task.dueDate ? task.dueDate.split("T")[0] : ""
    });
  };

  const handleCancelTaskEdit = () => {
    setEditingTaskId(null);
    taskForm.reset({ projectId: selectedProjectId ?? "", status: "TODO" });
  };

  const handleDeleteTask = (taskId: string) => {
    deleteTaskMutation.mutate(taskId);
  };

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Projets</CardTitle>
            <CardDescription>Centralisez vos projets pro/perso et leur avancement.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="grid gap-3 md:grid-cols-4" onSubmit={onProjectSubmit}>
              <div className="space-y-2 md:col-span-2">
                <Label>Nom du projet</Label>
                <Input placeholder="LifeOS, Side project..." {...projectForm.register("name")} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Description</Label>
                <Input placeholder="Objectif principal" {...projectForm.register("description")} />
              </div>
              <div className="md:col-span-4 flex justify-end gap-2">
                {editingProjectId && (
                  <Button type="button" variant="ghost" onClick={handleCancelProjectEdit}>
                    Annuler
                  </Button>
                )}
                <Button type="submit" disabled={isSavingProject}>
                  {isSavingProject ? "Enregistrement..." : editingProjectId ? "Mettre à jour" : "Ajouter"}
                </Button>
              </div>
            </form>

            <div className="flex flex-col gap-2">
              {projectsQuery.data?.map((project) => (
                <div key={project.id} className="flex items-center gap-2">
                  <Button
                    variant={project.id === activeProject?.id ? "default" : "secondary"}
                    size="sm"
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      taskForm.setValue("projectId", project.id);
                    }}
                  >
                    {project.name}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleEditProject(project)}>
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => handleDeleteProject(project.id)}
                    disabled={deleteProjectMutation.isPending}
                  >
                    Supprimer
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Progression</CardTitle>
            <CardDescription>Vue d’ensemble des objectifs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summaryQuery.data?.map((project) => (
              <div key={project.id} className="rounded-lg border border-border/70 bg-background/60 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{project.name}</span>
                  <Badge variant="outline">{project.progress}%</Badge>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary/50">
                  <div className="h-full bg-primary" style={{ width: `${project.progress}%` }} />
                </div>
              </div>
            ))}
            {!summaryQuery.data?.length && <p className="text-sm text-muted-foreground">Ajoutez votre premier projet.</p>}
          </CardContent>
        </Card>
      </section>

      {activeProject && (
        <section className="space-y-6">
          <Card className="bg-card/70">
            <CardHeader>
              <CardTitle>Kanban — {activeProject.name}</CardTitle>
              <CardDescription>Séparez les tâches par état et faites-les progresser.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 md:grid-cols-5" onSubmit={onTaskSubmit}>
                <input type="hidden" value={activeProject.id} {...taskForm.register("projectId")} />
                <div className="space-y-2 md:col-span-2">
                  <Label>Tâche</Label>
                  <Input placeholder="Action à réaliser" {...taskForm.register("title")} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Échéance</Label>
                  <Input type="date" {...taskForm.register("dueDate")} />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <Label>Statut</Label>
                  <select
                    className="w-full rounded-md border border-border bg-background/70 px-3 py-2 text-sm"
                    {...taskForm.register("status")}
                  >
                    <option value="TODO">À faire</option>
                    <option value="IN_PROGRESS">En cours</option>
                    <option value="DONE">Terminé</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-5">
                  <Label>Description</Label>
                  <Textarea rows={2} {...taskForm.register("description")} />
                </div>
                <div className="md:col-span-5 flex justify-end gap-2">
                  {editingTaskId && (
                    <Button type="button" variant="ghost" onClick={handleCancelTaskEdit}>
                      Annuler
                    </Button>
                  )}
                  <Button type="submit" disabled={isSavingTask}>
                    {isSavingTask ? "Enregistrement..." : editingTaskId ? "Mettre à jour" : "Ajouter la tâche"}
                  </Button>
                </div>
              </form>

              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                {(["TODO", "IN_PROGRESS", "DONE"] as Task["status"][]).map((status) => (
                  <div key={status} className="rounded-xl border border-border/70 bg-background/60 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{statusLabel(status)}</h3>
                      <Badge variant="outline">{columns[status]?.length ?? 0}</Badge>
                    </div>
                    <div className="mt-3 space-y-3">
                      {columns[status]?.map((task) => (
                        <div key={task.id} className="rounded-lg border border-border/60 bg-card/70 p-3 text-sm">
                          <p className="font-medium">{task.title}</p>
                          {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
                          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{task.dueDate ? `Due ${formatDate(task.dueDate)}` : "Sans échéance"}</span>
                            <div className="flex gap-1">
                              {status !== "TODO" && (
                                <Button
                                  size="sm"
                                  className="h-7 px-2"
                                  variant="ghost"
                                  onClick={() => updateTaskStatusMutation.mutate({ id: task.id, status: "TODO" })}
                                  disabled={updateTaskStatusMutation.isPending}
                                >
                                  ↺
                                </Button>
                              )}
                              {status !== "IN_PROGRESS" && (
                                <Button
                                  size="sm"
                                  className="h-7 px-2"
                                  variant="ghost"
                                  onClick={() => updateTaskStatusMutation.mutate({ id: task.id, status: "IN_PROGRESS" })}
                                  disabled={updateTaskStatusMutation.isPending}
                                >
                                  ▶
                                </Button>
                              )}
                              {status !== "DONE" && (
                                <Button
                                  size="sm"
                                  className="h-7 px-2"
                                  variant="ghost"
                                  onClick={() => updateTaskStatusMutation.mutate({ id: task.id, status: "DONE" })}
                                  disabled={updateTaskStatusMutation.isPending}
                                >
                                  ✓
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="mt-3 flex justify-end gap-2 text-xs">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => activeProject && handleEditTask(task, activeProject.id)}
                            >
                              Modifier
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => handleDeleteTask(task.id)}
                              disabled={deleteTaskMutation.isPending}
                            >
                              Supprimer
                            </Button>
                          </div>
                        </div>
                      ))}
                      {!columns[status]?.length && (
                        <p className="text-xs text-muted-foreground">Aucune tâche.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
};

const statusLabel = (status: Task["status"]) => {
  if (status === "TODO") return "À faire";
  if (status === "IN_PROGRESS") return "En cours";
  return "Terminé";
};
