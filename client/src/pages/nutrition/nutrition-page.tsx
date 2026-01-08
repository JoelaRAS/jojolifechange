import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "../../lib/api";
import { QuickScanButton } from "../../components/QuickScanButton";
import { IngredientAutocomplete } from "../../components/IngredientAutocomplete";
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
import { cn, formatDate } from "../../lib/utils";
import { Badge } from "../../components/ui/badge";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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

const mealTypeEnum = z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]);

type MealType = z.infer<typeof mealTypeEnum>;

type RecipeIngredient = {
  id: string;
  quantity: number;
  unit: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ordering?: number | null;
  ingredient: {
    id: string;
    name: string;
    unit: string | null;
  };
};

type Recipe = {
  id: string;
  name: string;
  description?: string | null;
  servings: number;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  ingredients: RecipeIngredient[];
};

type MealSlot = {
  id: string;
  date: string;
  mealType: MealType;
  recipeId: string | null;
  notes?: string | null;
  recipe?: Recipe | null;
};

type MealPlan = {
  id: string;
  weekStart: string;
  slots: MealSlot[];
};

type ShoppingListItem = {
  id: string;
  name: string;
  quantity: number;
  unit?: string | null;
  checked: boolean;
  source: "AUTO" | "MANUAL";
};

type PantryItem = {
  id: string;
  name: string;
  quantity: number;
  unit?: string | null;
};

type DailyLog = {
  id: string;
  date: string;
  mealType?: MealType | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  notes?: string | null;
  recipeId?: string | null;
};

type WeekAnalytics = {
  days: Array<{ date: string; calories: number; protein: number; carbs: number; fat: number }>;
  averages: { calories: number; protein: number; carbs: number; fat: number };
};

type PantryFormValues = {
  name: string;
  quantity: number;
  unit?: string;
};

type MealPlanPayload = {
  weekStart: string;
  slots: Array<{ date: string; mealType: MealType; recipeId: string }>;
};

const ingredientFormSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  quantity: z.coerce.number().positive(),
  unit: z.string().optional(),
  calories: z.coerce.number().nonnegative(),
  protein: z.coerce.number().nonnegative(),
  carbs: z.coerce.number().nonnegative(),
  fat: z.coerce.number().nonnegative()
});

const recipeFormSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  description: z.string().optional(),
  servings: z.coerce.number().int().positive().default(1),
  ingredients: z.array(ingredientFormSchema).min(1, "Ajoutez au moins un ingrédient")
});

const coerceOptionalNumber = (schema: z.ZodTypeAny) =>
  z.preprocess(
    (value) => {
      if (value === "" || value === null || typeof value === "undefined") return undefined;
      if (typeof value === "number" && Number.isNaN(value)) return undefined;
      return value;
    },
    schema.optional()
  );

const dailyLogSchema = z.object({
  date: z.string(),
  mealType: mealTypeEnum,
  recipeId: z.preprocess(
    (value) => {
      if (value === "" || value === null || typeof value === "undefined") return undefined;
      return value;
    },
    z.string().uuid().optional()
  ),
  servings: z
    .preprocess(
      (value) => {
        if (value === "" || value === null || typeof value === "undefined") return undefined;
        if (typeof value === "number" && Number.isNaN(value)) return undefined;
        return value;
      },
      z.coerce.number().positive()
    )
    .default(1),
  calories: coerceOptionalNumber(z.coerce.number().nonnegative()),
  protein: coerceOptionalNumber(z.coerce.number().nonnegative()),
  carbs: coerceOptionalNumber(z.coerce.number().nonnegative()),
  fat: coerceOptionalNumber(z.coerce.number().nonnegative()),
  notes: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    },
    z.string().optional()
  )
});

type RecipeFormValues = z.infer<typeof recipeFormSchema>;
type DailyLogFormValues = z.infer<typeof dailyLogSchema>;

const pantryFormSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  quantity: z.coerce.number().nonnegative(),
  unit: z.string().optional()
});

const mealTypeLabels: Record<MealType, string> = {
  BREAKFAST: "Petit-déjeuner",
  LUNCH: "Déjeuner",
  DINNER: "Dîner",
  SNACK: "Snack"
};

const mealTypeOrder: MealType[] = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];

const getWeekStart = (date: Date) => {
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

const toISODate = (date: Date) => date.toISOString().split("T")[0];

export const NutritionPage = () => {
  const queryClient = useQueryClient();
  const [currentWeek, setCurrentWeek] = useState(() => getWeekStart(new Date()));
  const isoWeek = toISODate(currentWeek);
  const [mealDraft, setMealDraft] = useState<Record<string, string>>({});

  const recipesQuery = useQuery({
    queryKey: ["recipes"],
    queryFn: async () => {
      const { data } = await api.get<Recipe[]>("/nutrition/recipes");
      return data;
    }
  });

  const mealPlanQuery = useQuery({
    queryKey: ["meal-plan", isoWeek],
    queryFn: async () => {
      const { data } = await api.get<MealPlan | null>("/nutrition/meal-plans", {
        params: { weekStart: isoWeek }
      });
      return data;
    }
  });

  const shoppingListQuery = useQuery({
    queryKey: ["shopping-list"],
    queryFn: async () => {
      const { data } = await api.get<ShoppingListItem[]>("/nutrition/shopping-list");
      return data;
    }
  });

  const pantryQuery = useQuery({
    queryKey: ["pantry"],
    queryFn: async () => {
      const { data } = await api.get<PantryItem[]>("/nutrition/pantry");
      return data;
    }
  });

  const dailyLogsQuery = useQuery({
    queryKey: ["daily-log", isoWeek],
    queryFn: async () => {
      const end = new Date(currentWeek);
      end.setDate(end.getDate() + 6);
      const { data } = await api.get<DailyLog[]>("/nutrition/daily-log", {
        params: { start: isoWeek, end: toISODate(end) }
      });
      return data;
    }
  });

  const analyticsQuery = useQuery({
    queryKey: ["nutrition-analytics", isoWeek],
    queryFn: async () => {
      const { data } = await api.get<WeekAnalytics>("/nutrition/analytics/week", {
        params: { weekStart: isoWeek }
      });
      return data;
    }
  });

  const recipeForm = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: {
      servings: 1,
      ingredients: [
        {
          name: "",
          quantity: 100,
          unit: "g",
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0
        }
      ]
    }
  });

  const ingredientFields = useFieldArray({
    control: recipeForm.control,
    name: "ingredients"
  });

  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [shoppingDraft, setShoppingDraft] = useState<Record<string, string>>({});

  const createRecipeMutation = useMutation({
    mutationFn: async (values: RecipeFormValues) => {
      const response = await api.post<Recipe>("/nutrition/recipes", values);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recipes"] });
      recipeForm.reset();
      setEditingRecipeId(null);
    }
  });

  const updateRecipeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: RecipeFormValues }) => {
      const response = await api.put<Recipe>(`/nutrition/recipes/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recipes"] });
      recipeForm.reset();
      setEditingRecipeId(null);
    }
  });

  const duplicateRecipeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<Recipe>(`/nutrition/recipes/${id}/duplicate`);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recipes"] });
    }
  });

  const deleteRecipeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/nutrition/recipes/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recipes"] });
      if (editingRecipeId) {
        recipeForm.reset();
        setEditingRecipeId(null);
      }
    }
  });

  const saveMealPlanMutation = useMutation({
    mutationFn: async (mealPlan: MealPlanPayload) => {
      const response = await api.post<MealPlan>("/nutrition/meal-plans", mealPlan);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meal-plan", isoWeek] });
      void queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
    }
  });

  const generateShoppingListMutation = useMutation({
    mutationFn: async () => {
      await api.post("/nutrition/shopping-list/generate", { weekStart: isoWeek });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      void queryClient.invalidateQueries({ queryKey: ["pantry"] });
    }
  });

  const toggleShoppingItemMutation = useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      const { data } = await api.patch<ShoppingListItem>(`/nutrition/shopping-list/${id}`, { checked });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      void queryClient.invalidateQueries({ queryKey: ["pantry"] });
    }
  });

  const deleteShoppingItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/nutrition/shopping-list/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
    }
  });

  const updateShoppingItemMutation = useMutation({
    mutationFn: async ({ id, quantity, unit }: { id: string; quantity: number; unit?: string }) => {
      const { data } = await api.patch<ShoppingListItem>(`/nutrition/shopping-list/${id}`, {
        quantity,
        unit
      });
      return { data, id };
    },
    onSuccess: ({ data, id }) => {
      setShoppingDraft((prev) => ({ ...prev, [id]: data.quantity.toString() }));
      void queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
    }
  });

  const createShoppingItemMutation = useMutation({
    mutationFn: async (values: { name: string; quantity: number; unit?: string }) => {
      await api.post<ShoppingListItem>("/nutrition/shopping-list", {
        name: values.name,
        quantity: values.quantity,
        unit: values.unit?.trim() ? values.unit.trim() : undefined
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      shoppingItemForm.reset({ name: "", quantity: 1, unit: "" });
    }
  });

  const pantryUpsertMutation = useMutation({
    mutationFn: async (values: PantryFormValues) => {
      const { data } = await api.post<PantryItem>("/nutrition/pantry", values);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pantry"] });
    }
  });

  const updatePantryItemMutation = useMutation({
    mutationFn: async ({ id, quantity, unit }: { id: string; quantity: number; unit?: string }) => {
      const { data } = await api.patch<PantryItem>(`/nutrition/pantry/${id}`, { quantity, unit });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pantry"] });
    }
  });

  const deletePantryItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/nutrition/pantry/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pantry"] });
    }
  });

  const logMealMutation = useMutation({
    mutationFn: async (payload: DailyLogFormValues) => {
      await api.post("/nutrition/daily-log", payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["daily-log", isoWeek] });
      void queryClient.invalidateQueries({ queryKey: ["nutrition-analytics", isoWeek] });
    }
  });

  const deleteDailyLogMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/nutrition/daily-log/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["daily-log", isoWeek] });
      void queryClient.invalidateQueries({ queryKey: ["nutrition-analytics", isoWeek] });
    }
  });

  const dailyLogForm = useForm<DailyLogFormValues>({
    resolver: zodResolver(dailyLogSchema),
    defaultValues: {
      date: isoWeek,
      mealType: "LUNCH",
      servings: 1
    }
  });

  const pantryForm = useForm<PantryFormValues>({
    resolver: zodResolver(pantryFormSchema),
    defaultValues: {
      name: "",
      quantity: 0,
      unit: ""
    }
  });

  const shoppingItemForm = useForm<{ name: string; quantity: number; unit?: string }>({
    defaultValues: {
      name: "",
      quantity: 1,
      unit: ""
    }
  });

  const totals = useMemo(() => {
    const ingredients = recipeForm.watch("ingredients");
    return ingredients.reduce(
      (acc, ingredient) => {
        acc.calories += Number(ingredient.calories) || 0;
        acc.protein += Number(ingredient.protein) || 0;
        acc.carbs += Number(ingredient.carbs) || 0;
        acc.fat += Number(ingredient.fat) || 0;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [recipeForm]);

  const isSavingRecipe = createRecipeMutation.isPending || updateRecipeMutation.isPending;

  const currentMealPlan = mealPlanQuery.data;

  useEffect(() => {
    if (currentMealPlan) {
      const nextDraft: Record<string, string> = {};
      currentMealPlan.slots.forEach((slot) => {
        if (slot.recipeId) {
          const dateKey = slot.date.split("T")[0];
          nextDraft[`${dateKey}_${slot.mealType}`] = slot.recipeId;
        }
      });
      setMealDraft(nextDraft);
    } else {
      setMealDraft({});
    }
  }, [currentMealPlan, isoWeek]);
  const recipes = useMemo(() => recipesQuery.data ?? [], [recipesQuery.data]);

  useEffect(() => {
    if (shoppingListQuery.data) {
      const draftEntries: Record<string, string> = {};
      shoppingListQuery.data.forEach((item) => {
        draftEntries[item.id] = item.quantity.toString();
      });
      setShoppingDraft(draftEntries);
    }
  }, [shoppingListQuery.data]);

  const mealGrid = useMemo(() => {
    return Array.from({ length: 7 }).map((_, index) => {
      const day = new Date(currentWeek);
      day.setDate(currentWeek.getDate() + index);
      const iso = toISODate(day);
      return {
        date: iso,
        slots: mealTypeOrder.map((mealType) => {
          const recipeId = mealDraft[`${iso}_${mealType}`];
          if (!recipeId) return null;
          const recipe = recipes.find((item) => item.id === recipeId);
          return {
            id: `${iso}-${mealType}`,
            date: iso,
            mealType,
            recipeId,
            recipe
          } as MealSlot;
        })
      };
    });
  }, [currentWeek, mealDraft, recipes]);

  const handleRecipeSubmit = recipeForm.handleSubmit(async (values) => {
    if (editingRecipeId) {
      await updateRecipeMutation.mutateAsync({ id: editingRecipeId, data: values });
    } else {
      await createRecipeMutation.mutateAsync(values);
    }
  });

  const handleWeekChange = (direction: -1 | 1) => {
    const next = new Date(currentWeek);
    next.setDate(next.getDate() + direction * 7);
    setCurrentWeek(next);
    dailyLogForm.setValue("date", toISODate(next));
  };

  const handleSaveMealPlan = () => {
    const slots = Object.entries(mealDraft).map(([key, recipeId]) => {
      const [date, mealType] = key.split("_");
      return {
        date,
        mealType: mealType as MealType,
        recipeId
      };
    });

    if (!slots.length) return;

    saveMealPlanMutation.mutate({
      weekStart: isoWeek,
      slots
    });
  };

  const handleLogMeal = dailyLogForm.handleSubmit(async (values) => {
    const normalizeNumber = (value?: number | null) =>
      typeof value === "number" && Number.isFinite(value) ? value : undefined;
    const payload: DailyLogFormValues = {
      ...values,
      recipeId: values.recipeId ? values.recipeId : undefined,
      servings: normalizeNumber(values.servings) ?? 1,
      calories: normalizeNumber(values.calories),
      protein: normalizeNumber(values.protein),
      carbs: normalizeNumber(values.carbs),
      fat: normalizeNumber(values.fat),
      notes: values.notes?.trim() ? values.notes : undefined
    };

    await logMealMutation.mutateAsync(payload);
    dailyLogForm.reset({ date: isoWeek, mealType: "LUNCH", servings: 1 });
  });

  const handleEditRecipe = (recipe: Recipe) => {
    setEditingRecipeId(recipe.id);
    recipeForm.reset({
      name: recipe.name,
      description: recipe.description ?? "",
      servings: recipe.servings,
      ingredients: recipe.ingredients
        .sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))
        .map((item) => ({
          name: item.ingredient.name,
          quantity: item.quantity,
          unit: item.unit ?? "",
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat
        }))
    });
  };

  const handleResetRecipeForm = () => {
    setEditingRecipeId(null);
    recipeForm.reset();
  };

  const handleRecipeDuplicate = (id: string) => {
    duplicateRecipeMutation.mutate(id);
  };

  const handleRecipeDelete = (id: string) => {
    deleteRecipeMutation.mutate(id);
  };

  const handleShoppingQuantityChange = (id: string, value: string) => {
    setShoppingDraft((prev) => ({ ...prev, [id]: value }));
  };

  const handleShoppingQuantityCommit = (item: ShoppingListItem) => {
    const raw = shoppingDraft[item.id];
    if (raw === undefined) return;
    const quantity = Number(raw);
    if (Number.isNaN(quantity)) return;
    updateShoppingItemMutation.mutate({ id: item.id, quantity, unit: item.unit ?? undefined });
  };

  const handlePantrySubmit = pantryForm.handleSubmit(async (values) => {
    await pantryUpsertMutation.mutateAsync(values);
    pantryForm.reset({ name: "", quantity: 0, unit: "" });
  });

  const handlePantryQuantityCommit = (item: PantryItem, quantity: number) => {
    if (Number.isNaN(quantity)) return;
    updatePantryItemMutation.mutate({ id: item.id, quantity, unit: item.unit ?? undefined });
  };

  const handlePantryDelete = (id: string) => {
    deletePantryItemMutation.mutate(id);
  };

  const handleShoppingItemSubmit = shoppingItemForm.handleSubmit(async (values) => {
    if (!values.name.trim()) return;
    await createShoppingItemMutation.mutateAsync({
      name: values.name.trim(),
      quantity: values.quantity,
      unit: values.unit?.trim() ? values.unit : undefined
    });
  });

  const handleSlotChange = (date: string, mealType: MealType, recipeId: string) => {
    setMealDraft((prev) => {
      const next = { ...prev };
      const key = `${date}_${mealType}`;
      if (recipeId) {
        next[key] = recipeId;
      } else {
        delete next[key];
      }
      return next;
    });
  };

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Recettes</CardTitle>
            <CardDescription>Bibliothèque de repas avec macros calculées automatiquement.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleRecipeSubmit} className="space-y-4">
              {editingRecipeId && (
                <div className="flex items-center justify-between rounded-md border border-secondary bg-secondary/20 px-3 py-2 text-xs">
                  <span className="font-medium text-secondary-foreground">Modification de la recette</span>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={handleResetRecipeForm}>
                      Annuler
                    </Button>
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="recipe-name">Nom</Label>
                  <Input id="recipe-name" placeholder="Poulet riz" {...recipeForm.register("name")} />
                  {recipeForm.formState.errors.name && (
                    <p className="text-xs text-destructive">{recipeForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="servings">Portions</Label>
                  <Input id="servings" type="number" min={1} {...recipeForm.register("servings", { valueAsNumber: true })} />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" rows={2} placeholder="Préparation, notes..." {...recipeForm.register("description")} />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Ingrédients</h4>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      ingredientFields.append({
                        name: "",
                        quantity: 100,
                        unit: "g",
                        calories: 0,
                        protein: 0,
                        carbs: 0,
                        fat: 0
                      })
                    }
                  >
                    Ajouter
                  </Button>
                </div>
                <div className="space-y-3">
                  {ingredientFields.fields.map((field, index) => (
                    <div key={field.id} className="rounded-lg border border-border/80 p-4">
                      <div className="grid gap-3 sm:grid-cols-6">
                        <div className="sm:col-span-2 space-y-2">
                          <Label>Nom</Label>
                          <IngredientAutocomplete
                            value={recipeForm.watch(`ingredients.${index}.name`) || ""}
                            onChange={(name) => recipeForm.setValue(`ingredients.${index}.name`, name)}
                            onSelect={(data) => {
                              recipeForm.setValue(`ingredients.${index}.name`, data.name);
                              recipeForm.setValue(`ingredients.${index}.unit`, data.unit || "g");
                              recipeForm.setValue(`ingredients.${index}.calories`, data.calories);
                              recipeForm.setValue(`ingredients.${index}.protein`, data.protein);
                              recipeForm.setValue(`ingredients.${index}.carbs`, data.carbs);
                              recipeForm.setValue(`ingredients.${index}.fat`, data.fat);
                            }}
                            placeholder="Rechercher un ingrédient..."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Quantité</Label>
                          <Input type="number" step="0.01" {...recipeForm.register(`ingredients.${index}.quantity`, { valueAsNumber: true })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Unité</Label>
                          <Input {...recipeForm.register(`ingredients.${index}.unit`)} placeholder="g" />
                        </div>
                        <div className="space-y-2">
                          <Label>Calories</Label>
                          <Input type="number" step="0.1" {...recipeForm.register(`ingredients.${index}.calories`, { valueAsNumber: true })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Protéines</Label>
                          <Input type="number" step="0.1" {...recipeForm.register(`ingredients.${index}.protein`, { valueAsNumber: true })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Glucides</Label>
                          <Input type="number" step="0.1" {...recipeForm.register(`ingredients.${index}.carbs`, { valueAsNumber: true })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Lipides</Label>
                          <Input type="number" step="0.1" {...recipeForm.register(`ingredients.${index}.fat`, { valueAsNumber: true })} />
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <Button type="button" variant="ghost" size="sm" onClick={() => ingredientFields.remove(index)}>
                          Supprimer
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Total :</span>
                <Badge variant="outline">{Math.round(totals.calories)} kcal</Badge>
                <Badge variant="outline">{totals.protein.toFixed(1)} g protéines</Badge>
                <Badge variant="outline">{totals.carbs.toFixed(1)} g glucides</Badge>
                <Badge variant="outline">{totals.fat.toFixed(1)} g lipides</Badge>
              </div>

              <Button type="submit" disabled={isSavingRecipe}>
                {editingRecipeId
                  ? isSavingRecipe
                    ? "Mise à jour..."
                    : "Mettre à jour"
                  : isSavingRecipe
                    ? "Enregistrement..."
                    : "Créer la recette"}
              </Button>
            </form>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground">Recettes sauvegardées</h4>
              <div className="grid gap-3 md:grid-cols-2">
                {recipes.map((recipe) => (
                  <Card key={recipe.id} className="border border-border/60 bg-background/60">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{recipe.name}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {recipe.description ?? "Aucune description"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{Math.round(recipe.totalCalories)} kcal</Badge>
                        <Badge variant="outline">{recipe.totalProtein.toFixed(1)}P</Badge>
                        <Badge variant="outline">{recipe.totalCarbs.toFixed(1)}G</Badge>
                        <Badge variant="outline">{recipe.totalFat.toFixed(1)}L</Badge>
                        <Badge variant="outline">{recipe.servings} portions</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => handleEditRecipe(recipe)}>
                          Modifier
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleRecipeDuplicate(recipe.id)}>
                          Dupliquer
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => handleRecipeDelete(recipe.id)}
                        >
                          Supprimer
                        </Button>
                      </div>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {recipe.ingredients.map((item) => (
                          <li key={item.id}>
                            {item.ingredient.name} — {item.quantity}
                            {item.unit ? ` ${item.unit}` : ""}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
                {!recipes.length && (
                  <p className="text-sm text-muted-foreground">
                    Créez une recette pour commencer votre bibliothèque personnalisée.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Liste de courses</CardTitle>
            <CardDescription>
              Générée automatiquement depuis votre meal plan. Cochez pour alimenter le garde-manger.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => generateShoppingListMutation.mutate()}
              disabled={generateShoppingListMutation.isPending}
            >
              {generateShoppingListMutation.isPending ? "Calcul..." : "Générer"}
            </Button>
            <form className="flex flex-wrap gap-2" onSubmit={handleShoppingItemSubmit}>
              <Input
                className="h-8 flex-1 min-w-[140px]"
                placeholder="Ajouter un article"
                {...shoppingItemForm.register("name")}
              />
              <Input
                className="h-8 w-24"
                type="number"
                step="0.01"
                {...shoppingItemForm.register("quantity", { valueAsNumber: true })}
              />
              <Input
                className="h-8 w-24"
                placeholder="Unité"
                {...shoppingItemForm.register("unit")}
              />
              <Button type="submit" size="sm" disabled={createShoppingItemMutation.isPending}>
                {createShoppingItemMutation.isPending ? "Ajout..." : "Ajouter"}
              </Button>
              <QuickScanButton type="shopping" onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["shopping-list"] })} />
            </form>
            <div className="space-y-3">
              {shoppingListQuery.data?.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 gap-3",
                    item.checked ? "bg-secondary/50" : "bg-background/60"
                  )}
                >
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className={cn("text-sm font-medium", item.checked && "line-through opacity-60")}>{item.name}</p>
                      {item.source === "MANUAL" && <Badge variant="outline" className="text-xs uppercase tracking-wide">Manuel</Badge>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Input
                        className="h-8 w-24"
                        type="number"
                        step="0.01"
                        value={shoppingDraft[item.id] ?? item.quantity.toString()}
                        onChange={(event) => handleShoppingQuantityChange(item.id, event.target.value)}
                        onBlur={() => handleShoppingQuantityCommit(item)}
                      />
                      <span>{item.unit ?? ""}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={item.checked ? "outline" : "default"}
                      onClick={() => toggleShoppingItemMutation.mutate({ id: item.id, checked: !item.checked })}
                    >
                      {item.checked ? "Annuler" : "Acheté"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteShoppingItemMutation.mutate(item.id)}>
                      Supprimer
                    </Button>
                  </div>
                </div>
              ))}
              {!shoppingListQuery.data?.length && (
                <p className="text-sm text-muted-foreground">Générez votre liste pour la semaine en cours.</p>
              )}
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">Garde-manger</h4>
              <form onSubmit={handlePantrySubmit} className="mt-2 flex gap-2">
                <Input
                  placeholder="Ingrédient"
                  className="h-8"
                  {...pantryForm.register("name")}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Quantité"
                  className="h-8 w-24"
                  {...pantryForm.register("quantity", { valueAsNumber: true })}
                />
                <Input placeholder="Unité" className="h-8 w-24" {...pantryForm.register("unit")} />
                <Button type="submit" variant="secondary" size="sm" disabled={pantryUpsertMutation.isPending}>
                  Ajouter
                </Button>
                <QuickScanButton type="pantry" onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["pantry"] })} />
              </form>
              <div className="mt-3 space-y-2">
                {pantryQuery.data?.length ? (
                  pantryQuery.data.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{item.name}</span>
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-7 w-20"
                            type="number"
                            step="0.01"
                            defaultValue={item.quantity}
                            onBlur={(event) =>
                              handlePantryQuantityCommit(item, Number(event.target.value ?? item.quantity))
                            }
                          />
                          <span>{item.unit ?? ""}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handlePantryDelete(item.id)}
                      >
                        Supprimer
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">Garde-manger vide.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Meal plan hebdomadaire</h2>
            <p className="text-sm text-muted-foreground">Planifiez vos repas pour optimiser vos courses.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => handleWeekChange(-1)}>Semaine précédente</Button>
            <div className="rounded-md border border-border/70 px-3 py-2 text-sm">
              {formatDate(currentWeek)}
            </div>
            <Button variant="ghost" onClick={() => handleWeekChange(1)}>Semaine suivante</Button>
            <Button variant="secondary" onClick={handleSaveMealPlan} disabled={saveMealPlanMutation.isPending}>
              {saveMealPlanMutation.isPending ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border border-border/70 text-left text-sm">
            <thead className="bg-card/60">
              <tr>
                <th className="px-3 py-2">Jour</th>
                {mealTypeOrder.map((meal) => (
                  <th key={meal} className="px-3 py-2">
                    {mealTypeLabels[meal]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mealGrid.map((day) => (
                <tr key={day.date} className="border-t border-border/70">
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{formatDate(day.date)}</td>
                  {day.slots.map((slot, index) => (
                    <td key={index} className="px-3 py-2">
                      <select
                        className="w-full rounded-md border border-border bg-background/70 px-2 py-1 text-sm"
                        value={slot?.recipeId ?? ""}
                        onChange={(event) => handleSlotChange(day.date, mealTypeOrder[index], event.target.value)}
                      >
                        <option value="">—</option>
                        {recipes.map((recipe) => (
                          <option key={recipe.id} value={recipe.id}>
                            {recipe.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Daily tracker</CardTitle>
            <CardDescription>Logguez vos repas pour suivre les calories et macros journaliers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="grid gap-4 md:grid-cols-4" onSubmit={handleLogMeal}>
              <div className="space-y-2 md:col-span-1">
                <Label htmlFor="log-date">Date</Label>
                <Input id="log-date" type="date" {...dailyLogForm.register("date")} />
              </div>
              <div className="space-y-2 md:col-span-1">
                <Label htmlFor="log-meal">Repas</Label>
                <Controller
                  control={dailyLogForm.control}
                  name="mealType"
                  render={({ field }) => (
                    <select
                      id="log-meal"
                      className="w-full rounded-md border border-border bg-background/70 px-2 py-2 text-sm"
                      {...field}
                    >
                      {mealTypeOrder.map((type) => (
                        <option key={type} value={type}>
                          {mealTypeLabels[type]}
                        </option>
                      ))}
                    </select>
                  )}
                />
              </div>
              <div className="space-y-2 md:col-span-1">
                <Label htmlFor="log-recipe">Recette</Label>
                <select
                  id="log-recipe"
                  className="w-full rounded-md border border-border bg-background/70 px-2 py-2 text-sm"
                  {...dailyLogForm.register("recipeId")}
                >
                  <option value="">Personnalisé</option>
                  {recipes.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {recipe.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 md:col-span-1">
                <Label htmlFor="log-servings">Portions</Label>
                <Input id="log-servings" type="number" step="0.1" {...dailyLogForm.register("servings", { valueAsNumber: true })} />
              </div>

              {!dailyLogForm.watch("recipeId") && (
                <>
                  <div className="space-y-2">
                    <Label>Calories</Label>
                    <Input type="number" {...dailyLogForm.register("calories", { valueAsNumber: true })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Protéines</Label>
                    <Input type="number" step="0.1" {...dailyLogForm.register("protein", { valueAsNumber: true })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Glucides</Label>
                    <Input type="number" step="0.1" {...dailyLogForm.register("carbs", { valueAsNumber: true })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Lipides</Label>
                    <Input type="number" step="0.1" {...dailyLogForm.register("fat", { valueAsNumber: true })} />
                  </div>
                </>
              )}

              <div className="md:col-span-4">
                <Label>Notes</Label>
                <Textarea rows={2} {...dailyLogForm.register("notes")} placeholder="Sensations, énergie..." />
              </div>

              <div className="md:col-span-4 flex justify-end">
                <Button type="submit" disabled={logMealMutation.isPending}>
                  {logMealMutation.isPending ? "Enregistrement..." : "Ajouter"}
                </Button>
              </div>
            </form>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground">Historique</h4>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-border/60 p-3">
                {dailyLogsQuery.data?.map((log) => (
                  <div key={log.id} className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{formatDate(log.date)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{log.mealType ? mealTypeLabels[log.mealType] : "Custom"}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => deleteDailyLogMutation.mutate(log.id)}
                        >
                          Supprimer
                        </Button>
                      </div>
                    </div>
                    <div className="mt-1 flex gap-3 text-muted-foreground">
                      <span>{log.calories} kcal</span>
                      <span>{log.protein} P</span>
                      <span>{log.carbs} G</span>
                      <span>{log.fat} L</span>
                    </div>
                    {log.notes && <p className="mt-1 text-muted-foreground">{log.notes}</p>}
                  </div>
                ))}
                {!dailyLogsQuery.data?.length && (
                  <p className="text-sm text-muted-foreground">Aucune entrée pour cette semaine.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Analyse hebdomadaire</CardTitle>
            <CardDescription>Suivi des calories et macros sur la semaine.</CardDescription>
          </CardHeader>
          <CardContent>
            {analyticsQuery.data ? (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={analyticsQuery.data.days}>
                    <defs>
                      <linearGradient id="caloriesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tickFormatter={(value) => new Date(value).toLocaleDateString("fr-FR", { weekday: "short" })} />
                    <YAxis />
                    <CartesianGrid strokeDasharray="3 3" />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="calories" stroke="#6366f1" fill="url(#caloriesGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <Stat label="Calories moyennes" value={`${Math.round(analyticsQuery.data.averages.calories)} kcal`} />
                  <Stat label="Protéines moyennes" value={`${analyticsQuery.data.averages.protein.toFixed(1)} g`} />
                  <Stat label="Glucides moyens" value={`${analyticsQuery.data.averages.carbs.toFixed(1)} g`} />
                  <Stat label="Lipides moyens" value={`${analyticsQuery.data.averages.fat.toFixed(1)} g`} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune donnée pour la semaine.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-border/70 bg-background/50 p-3">
    <p className="text-muted-foreground">{label}</p>
    <p className="text-sm font-semibold text-foreground">{value}</p>
  </div>
);
