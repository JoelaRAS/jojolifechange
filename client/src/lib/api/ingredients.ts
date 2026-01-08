import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

// ==================== TYPES ====================

export interface Ingredient {
    id: string;
    userId: string | null;
    name: string;
    barcode: string | null;
    unit: string | null;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    imageUrl: string | null;
    source: "manual" | "openfoodfacts" | "gemini";
    isGlobal: boolean;
    createdAt: string;
}

export interface OpenFoodFactsProduct {
    barcode: string;
    name: string;
    brand?: string;
    quantity?: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    imageUrl?: string;
    source: "openfoodfacts";
}

export interface IngredientSearchResult {
    local: Ingredient[];
    openfoodfacts: OpenFoodFactsProduct[];
}

export interface BarcodeResult {
    source: "local" | "openfoodfacts";
    ingredient?: Ingredient;
    product?: OpenFoodFactsProduct;
    suggestedMapping?: string;
}

export interface RecipeSuggestion {
    name: string;
    description: string;
    ingredients: string[];
    estimatedCalories: number;
}

// ==================== INGREDIENTS ====================

export function useIngredients(params?: { search?: string; limit?: number }) {
    return useQuery({
        queryKey: ["ingredients", params],
        queryFn: async () => {
            const { data } = await api.get<Ingredient[]>("/nutrition/ingredients", { params });
            return data;
        },
    });
}

export function useIngredientSearch(query: string, includeOpenFoodFacts = true) {
    return useQuery({
        queryKey: ["ingredients-search", query, includeOpenFoodFacts],
        queryFn: async () => {
            const { data } = await api.get<IngredientSearchResult>("/nutrition/ingredients/search", {
                params: { q: query, off: includeOpenFoodFacts ? "true" : "false" },
            });
            return data;
        },
        enabled: query.length >= 2,
        staleTime: 30000, // Cache for 30 seconds
    });
}

export function useBarcodeLookup() {
    return useMutation({
        mutationFn: async (barcode: string) => {
            const { data } = await api.get<BarcodeResult>(`/nutrition/ingredients/barcode/${barcode}`);
            return data;
        },
    });
}

export function useCreateIngredient() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (ingredient: {
            name: string;
            barcode?: string;
            unit?: string;
            calories?: number;
            protein?: number;
            carbs?: number;
            fat?: number;
            imageUrl?: string;
            source?: "manual" | "openfoodfacts" | "gemini";
        }) => {
            const { data } = await api.post<Ingredient>("/nutrition/ingredients", ingredient);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ingredients"] });
        },
    });
}

export function useImportFromOpenFoodFacts() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (params: { barcode: string; mapToIngredientId?: string }) => {
            const { data } = await api.post<{
                action: "created" | "mapped" | "existing";
                ingredient: Ingredient;
            }>("/nutrition/ingredients/import-off", params);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ingredients"] });
        },
    });
}

export function useUpdateIngredient() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            ...ingredient
        }: {
            id: string;
            name?: string;
            barcode?: string;
            unit?: string;
            calories?: number;
            protein?: number;
            carbs?: number;
            fat?: number;
            imageUrl?: string;
        }) => {
            const { data } = await api.put<Ingredient>(`/nutrition/ingredients/${id}`, ingredient);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ingredients"] });
        },
    });
}

export function useDeleteIngredient() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/nutrition/ingredients/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ingredients"] });
        },
    });
}

// ==================== PANTRY SCAN ====================

export function useScanToPantry() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (params: { barcode: string; quantity?: number; unit?: string }) => {
            const { data } = await api.post<{
                ingredient: Ingredient;
                pantryItem: { id: string; name: string; quantity: number; unit: string | null };
            }>("/nutrition/ingredients/pantry/scan", params);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["pantry"] });
            queryClient.invalidateQueries({ queryKey: ["ingredients"] });
        },
    });
}

// ==================== SHOPPING LIST SCAN ====================

export function useScanToShopping() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (params: { barcode: string; quantity?: number; unit?: string }) => {
            const { data } = await api.post<{
                ingredient: Ingredient;
                shoppingItem: { id: string; name: string; quantity: number; unit: string | null };
            }>("/nutrition/ingredients/shopping/scan", params);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
            queryClient.invalidateQueries({ queryKey: ["ingredients"] });
        },
    });
}

// ==================== AI SUGGESTIONS ====================

export function useRecipeSuggestions() {
    return useQuery({
        queryKey: ["recipe-suggestions"],
        queryFn: async () => {
            const { data } = await api.get<{ suggestions: RecipeSuggestion[] }>(
                "/nutrition/ingredients/suggestions/recipes"
            );
            return data.suggestions;
        },
        staleTime: 60000, // Cache for 1 minute
    });
}
