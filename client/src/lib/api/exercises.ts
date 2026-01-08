import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

// ==================== TYPES ====================

export interface Exercise {
    id: string;
    userId: string | null;
    name: string;
    muscleGroup: string | null;
    equipment: string | null;
    description: string | null;
    isGlobal: boolean;
    createdAt: string;
}

export interface WorkoutTemplate {
    id: string;
    userId: string | null;
    name: string;
    description: string | null;
    focus: string | null;
    isGlobal: boolean;
    createdAt: string;
    exercises: WorkoutExerciseTemplate[];
}

export interface WorkoutExerciseTemplate {
    id: string;
    templateId: string;
    exerciseId: string | null;
    name: string;
    sets: number;
    repsMin: number;
    repsMax: number;
    restSeconds: number;
    ordering: number;
    exercise?: Exercise;
}

export interface ExerciseCategory {
    muscleGroups: { id: string; label: string }[];
    equipment: { id: string; label: string }[];
}

// ==================== EXERCISES ====================

export function useExercises(params?: { search?: string; muscleGroup?: string }) {
    return useQuery({
        queryKey: ["exercises", params],
        queryFn: async () => {
            const { data } = await api.get<Exercise[]>("/sport/exercises", { params });
            return data;
        },
    });
}

export function useExerciseCategories() {
    return useQuery({
        queryKey: ["exercise-categories"],
        queryFn: async () => {
            const { data } = await api.get<ExerciseCategory>("/sport/exercises/categories");
            return data;
        },
        staleTime: Infinity, // Categories don't change
    });
}

export function useCreateExercise() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (exercise: {
            name: string;
            muscleGroup?: string;
            equipment?: string;
            description?: string;
        }) => {
            const { data } = await api.post<Exercise>("/sport/exercises", exercise);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["exercises"] });
        },
    });
}

export function useUpdateExercise() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            ...exercise
        }: {
            id: string;
            name?: string;
            muscleGroup?: string;
            equipment?: string;
            description?: string;
        }) => {
            const { data } = await api.put<Exercise>(`/sport/exercises/${id}`, exercise);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["exercises"] });
        },
    });
}

export function useDeleteExercise() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/sport/exercises/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["exercises"] });
        },
    });
}

// ==================== TEMPLATES ====================

export function useWorkoutTemplates() {
    return useQuery({
        queryKey: ["workout-templates-custom"],
        queryFn: async () => {
            const { data } = await api.get<WorkoutTemplate[]>("/sport/exercises/templates");
            return data;
        },
    });
}

export function useCreateTemplate() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (template: {
            name: string;
            description?: string;
            focus?: string;
            exercises: {
                exerciseId?: string;
                name: string;
                sets: number;
                repsMin: number;
                repsMax: number;
                restSeconds: number;
                ordering?: number;
            }[];
        }) => {
            const { data } = await api.post<WorkoutTemplate>("/sport/exercises/templates", template);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["workout-templates"] });
            queryClient.invalidateQueries({ queryKey: ["workout-templates-custom"] });
        },
    });
}

export function useUpdateTemplate() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            ...template
        }: {
            id: string;
            name?: string;
            description?: string;
            focus?: string;
            exercises?: {
                exerciseId?: string;
                name: string;
                sets: number;
                repsMin: number;
                repsMax: number;
                restSeconds: number;
                ordering?: number;
            }[];
        }) => {
            const { data } = await api.put<WorkoutTemplate>(`/sport/exercises/templates/${id}`, template);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["workout-templates"] });
            queryClient.invalidateQueries({ queryKey: ["workout-templates-custom"] });
        },
    });
}

export function useDuplicateTemplate() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, name }: { id: string; name?: string }) => {
            const { data } = await api.post<WorkoutTemplate>(`/sport/exercises/templates/${id}/duplicate`, { name });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["workout-templates"] });
            queryClient.invalidateQueries({ queryKey: ["workout-templates-custom"] });
        },
    });
}

export function useDeleteTemplate() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/sport/exercises/templates/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["workout-templates"] });
            queryClient.invalidateQueries({ queryKey: ["workout-templates-custom"] });
        },
    });
}
