import { Router } from "express";
import { z } from "zod";
import { MealType, Prisma, ShoppingListSource } from "@prisma/client";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../services/prisma";

const nutritionRouter = Router();

nutritionRouter.use(requireAuth);

const ingredientSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1).optional(),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative()
});

const recipeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  servings: z.number().int().positive().default(1),
  ingredients: z.array(ingredientSchema).min(1)
});

const mealPlanSchema = z.object({
  weekStart: z.coerce.date(),
  slots: z
    .array(
      z.object({
        date: z.coerce.date(),
        mealType: z.nativeEnum(MealType),
        recipeId: z.string().uuid(),
        notes: z.string().optional()
      })
    )
    .min(1)
});

const shoppingListGenerateSchema = z.object({
  weekStart: z.coerce.date()
});

const shoppingListUpdateSchema = z.object({
  checked: z.boolean().optional(),
  quantity: z.number().nonnegative().optional(),
  unit: z.string().optional()
});

const shoppingListCreateSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().nonnegative().default(1),
  unit: z.string().optional()
});

const pantrySchema = z.object({
  name: z.string().min(1),
  quantity: z.number().nonnegative(),
  unit: z.string().optional()
});

const dailyLogSchema = z.object({
  date: z.coerce.date(),
  mealType: z.nativeEnum(MealType).optional(),
  recipeId: z.string().uuid().optional(),
  servings: z.number().positive().default(1),
  calories: z.number().nonnegative().optional(),
  protein: z.number().nonnegative().optional(),
  carbs: z.number().nonnegative().optional(),
  fat: z.number().nonnegative().optional(),
  notes: z.string().optional()
});

const analyticsQuerySchema = z.object({
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional()
});

const weekAnalyticsSchema = z.object({
  weekStart: z.coerce.date()
});

type RecipeWithIngredients = Prisma.RecipeGetPayload<{
  include: { ingredients: { include: { ingredient: true } } };
}>;

const normalizeUnit = (unit?: string | null) => (unit ? unit.trim().toLowerCase() : null);
const roundQuantity = (value: number) => Math.round(value * 1000) / 1000;

const adjustPantryForRecipe = async (
  tx: Prisma.TransactionClient,
  userId: string,
  recipe: RecipeWithIngredients,
  servings: number,
  direction: "consume" | "restore"
) => {
  if (!recipe.ingredients.length || servings <= 0) return;
  const baseServings = recipe.servings || 1;
  const multiplier = servings / baseServings;

  for (const recipeIngredient of recipe.ingredients) {
    const amount = recipeIngredient.quantity * multiplier;
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const ingredientName = recipeIngredient.ingredient.name.trim();
    const pantryItem = await tx.pantryItem.findFirst({
      where: { userId, name: { equals: ingredientName, mode: "insensitive" } }
    });
    if (!pantryItem) continue;

    const pantryUnit = normalizeUnit(pantryItem.unit);
    const ingredientUnit = normalizeUnit(recipeIngredient.unit ?? recipeIngredient.ingredient.unit ?? null);
    if (pantryUnit && ingredientUnit && pantryUnit !== ingredientUnit) {
      continue;
    }

    const delta = direction === "consume" ? -amount : amount;
    const nextQuantityRaw = pantryItem.quantity + delta;
    const nextQuantity = direction === "consume" ? Math.max(0, nextQuantityRaw) : Math.max(0, nextQuantityRaw);

    await tx.pantryItem.update({
      where: { id: pantryItem.id },
      data: { quantity: roundQuantity(nextQuantity) }
    });
  }
};

const sumNutrition = (items: Array<{ calories: number; protein: number; carbs: number; fat: number }>) =>
  items.reduce(
    (acc, curr) => {
      acc.calories += curr.calories;
      acc.protein += curr.protein;
      acc.carbs += curr.carbs;
      acc.fat += curr.fat;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

const getWeekRange = (weekStart: Date) => {
  const start = new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
};

nutritionRouter.get("/recipes", async (req, res) => {
  const userId = req.userId!;

  const recipes = await prisma.recipe.findMany({
    where: { userId },
    include: {
      ingredients: {
        include: {
          ingredient: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return res.json(recipes);
});

nutritionRouter.post("/recipes", async (req, res) => {
  const userId = req.userId!;
  const parsed = recipeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const { name, description, servings, ingredients } = parsed.data;
  const totals = sumNutrition(ingredients);

  const recipe = await prisma.recipe.create({
    data: {
      userId,
      name,
      description,
      servings,
      totalCalories: totals.calories,
      totalProtein: totals.protein,
      totalCarbs: totals.carbs,
      totalFat: totals.fat,
      ingredients: {
        create: await Promise.all(
          ingredients.map(async (item, index) => {
            const existing = await prisma.ingredient.findFirst({
              where: { name: { equals: item.name.trim(), mode: "insensitive" } }
            });

            const ingredient = existing
              ? await prisma.ingredient.update({
                  where: { id: existing.id },
                  data: {
                    unit: item.unit ?? existing.unit ?? undefined,
                    calories: item.quantity ? item.calories / item.quantity : existing.calories,
                    protein: item.quantity ? item.protein / item.quantity : existing.protein,
                    carbs: item.quantity ? item.carbs / item.quantity : existing.carbs,
                    fat: item.quantity ? item.fat / item.quantity : existing.fat
                  }
                })
              : await prisma.ingredient.create({
                  data: {
                    name: item.name.trim(),
                    unit: item.unit,
                    calories: item.quantity ? item.calories / item.quantity : 0,
                    protein: item.quantity ? item.protein / item.quantity : 0,
                    carbs: item.quantity ? item.carbs / item.quantity : 0,
                    fat: item.quantity ? item.fat / item.quantity : 0
                  }
                });

            return {
              ingredientId: ingredient.id,
              quantity: item.quantity,
              unit: item.unit,
              calories: item.calories,
              protein: item.protein,
              carbs: item.carbs,
              fat: item.fat,
              ordering: index
            } as const;
          })
        )
      }
    },
    include: {
      ingredients: {
        include: {
          ingredient: true
        }
      }
    }
  });

  return res.status(201).json(recipe);
});

nutritionRouter.put("/recipes/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  const parsed = recipeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const existingRecipe = await prisma.recipe.findFirst({ where: { id, userId } });
  if (!existingRecipe) {
    return res.status(404).json({ message: "Recipe not found" });
  }

  const { name, description, servings, ingredients } = parsed.data;
  const totals = sumNutrition(ingredients);

  const recipe = await prisma.recipe.update({
    where: { id },
    data: {
      name,
      description,
      servings,
      totalCalories: totals.calories,
      totalProtein: totals.protein,
      totalCarbs: totals.carbs,
      totalFat: totals.fat,
      ingredients: {
        deleteMany: {},
        create: await Promise.all(
          ingredients.map(async (item, index) => {
            const existing = await prisma.ingredient.findFirst({
              where: { name: { equals: item.name.trim(), mode: "insensitive" } }
            });

            const ingredient = existing
              ? await prisma.ingredient.update({
                  where: { id: existing.id },
                  data: {
                    unit: item.unit ?? existing.unit ?? undefined,
                    calories: item.quantity ? item.calories / item.quantity : existing.calories,
                    protein: item.quantity ? item.protein / item.quantity : existing.protein,
                    carbs: item.quantity ? item.carbs / item.quantity : existing.carbs,
                    fat: item.quantity ? item.fat / item.quantity : existing.fat
                  }
                })
              : await prisma.ingredient.create({
                  data: {
                    name: item.name.trim(),
                    unit: item.unit,
                    calories: item.quantity ? item.calories / item.quantity : 0,
                    protein: item.quantity ? item.protein / item.quantity : 0,
                    carbs: item.quantity ? item.carbs / item.quantity : 0,
                    fat: item.quantity ? item.fat / item.quantity : 0
                  }
                });

            return {
              ingredientId: ingredient.id,
              quantity: item.quantity,
              unit: item.unit,
              calories: item.calories,
              protein: item.protein,
              carbs: item.carbs,
              fat: item.fat,
              ordering: index
            } as const;
          })
        )
      }
    },
    include: {
      ingredients: {
        include: {
          ingredient: true
        }
      }
    }
  });

  return res.json(recipe);
});

nutritionRouter.post("/recipes/:id/duplicate", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const recipe = await prisma.recipe.findFirst({
    where: { id, userId },
    include: { ingredients: true }
  });

  if (!recipe) {
    return res.status(404).json({ message: "Recipe not found" });
  }

  const duplicate = await prisma.recipe.create({
    data: {
      userId,
      name: `${recipe.name} (copie)`,
      description: recipe.description,
      servings: recipe.servings,
      totalCalories: recipe.totalCalories,
      totalProtein: recipe.totalProtein,
      totalCarbs: recipe.totalCarbs,
      totalFat: recipe.totalFat,
      ingredients: {
        create: recipe.ingredients
          .sort((a, b) => a.ordering - b.ordering)
          .map((ingredient) => ({
            ingredientId: ingredient.ingredientId,
            quantity: ingredient.quantity,
            unit: ingredient.unit ?? undefined,
            calories: ingredient.calories,
            protein: ingredient.protein,
            carbs: ingredient.carbs,
            fat: ingredient.fat,
            ordering: ingredient.ordering
          }))
      }
    },
    include: {
      ingredients: {
        include: { ingredient: true }
      }
    }
  });

  return res.status(201).json(duplicate);
});

nutritionRouter.delete("/recipes/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const recipe = await prisma.recipe.findFirst({ where: { id, userId } });
  if (!recipe) {
    return res.status(404).json({ message: "Recipe not found" });
  }

  await prisma.recipe.delete({ where: { id } });
  return res.status(204).send();
});

nutritionRouter.post("/meal-plans", async (req, res) => {
  const userId = req.userId!;
  const parsed = mealPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const { weekStart, slots } = parsed.data;
  const weekISO = new Date(weekStart.toISOString().split("T")[0]);

  const existingPlan = await prisma.mealPlan.findFirst({ where: { userId, weekStart: weekISO } });

  let mealPlan;
  if (existingPlan) {
    mealPlan = await prisma.mealPlan.update({
      where: { id: existingPlan.id },
      data: {
        slots: {
          deleteMany: {},
          create: slots.map((slot) => ({
            date: slot.date,
            mealType: slot.mealType,
            recipeId: slot.recipeId,
            notes: slot.notes
          }))
        }
      },
      include: {
        slots: {
          include: { recipe: true },
          orderBy: { date: "asc" }
        }
      }
    });
  } else {
    mealPlan = await prisma.mealPlan.create({
      data: {
        userId,
        weekStart: weekISO,
        slots: {
          create: slots.map((slot) => ({
            date: slot.date,
            mealType: slot.mealType,
            recipeId: slot.recipeId,
            notes: slot.notes
          }))
        }
      },
      include: {
        slots: {
          include: { recipe: true },
          orderBy: { date: "asc" }
        }
      }
    });
  }

  return res.json(mealPlan);
});

nutritionRouter.get("/meal-plans", async (req, res) => {
  const userId = req.userId!;
  const parsed = shoppingListGenerateSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const { weekStart } = parsed.data;
  const weekISO = new Date(weekStart.toISOString().split("T")[0]);

  const mealPlan = await prisma.mealPlan.findFirst({
    where: { userId, weekStart: weekISO },
    include: {
      slots: {
        include: {
          recipe: {
            include: {
              ingredients: {
                include: {
                  ingredient: true
                }
              }
            }
          }
        },
        orderBy: { date: "asc" }
      }
    }
  });

  return res.json(mealPlan);
});

nutritionRouter.post("/shopping-list/generate", async (req, res) => {
  const userId = req.userId!;
  const parsed = shoppingListGenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const { weekStart } = parsed.data;
  const weekISO = new Date(weekStart.toISOString().split("T")[0]);
  const { start, end } = getWeekRange(weekISO);

  const slots = await prisma.mealSlot.findMany({
    where: {
      mealPlan: {
        userId,
        weekStart: weekISO
      },
      date: {
        gte: start,
        lt: end
      }
    },
    include: {
      recipe: {
        include: {
          ingredients: {
            include: { ingredient: true }
          }
        }
      }
    }
  });

  const pantryItems = await prisma.pantryItem.findMany({ where: { userId } });
  const aggregated = new Map<
    string,
    {
      name: string;
      quantity: number;
      unit?: string | null;
    }
  >();

  slots.forEach((slot) => {
    slot.recipe?.ingredients.forEach((ingredient) => {
      const key = `${ingredient.ingredient.name.toLowerCase()}::${ingredient.unit ?? ""}`;
      const current = aggregated.get(key) ?? {
        name: ingredient.ingredient.name,
        quantity: 0,
        unit: ingredient.unit
      };
      current.quantity += ingredient.quantity;
      aggregated.set(key, current);
    });
  });

  pantryItems.forEach((item) => {
    const key = `${item.name.toLowerCase()}::${item.unit ?? ""}`;
    const current = aggregated.get(key);
    if (current) {
      current.quantity = Math.max(0, current.quantity - item.quantity);
      aggregated.set(key, current);
    }
  });

  const items = Array.from(aggregated.values()).filter((item) => item.quantity > 0);

  await prisma.shoppingListItem.deleteMany({ where: { userId, source: ShoppingListSource.AUTO } });

  const created = await Promise.all(
    items.map((item) =>
      prisma.shoppingListItem.create({
        data: {
          userId,
          name: item.name,
          quantity: Math.round(item.quantity * 100) / 100,
          unit: item.unit ?? undefined,
          source: ShoppingListSource.AUTO
        }
      })
    )
  );

  return res.json(created);
});

nutritionRouter.get("/shopping-list", async (req, res) => {
  const userId = req.userId!;
  const items = await prisma.shoppingListItem.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" }
  });
  return res.json(items);
});

nutritionRouter.post("/shopping-list", async (req, res) => {
  const userId = req.userId!;
  const parsed = shoppingListCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const { name, quantity, unit } = parsed.data;
  const item = await prisma.shoppingListItem.create({
    data: {
      userId,
      name: name.trim(),
      quantity,
      unit: unit?.trim() || undefined,
      source: ShoppingListSource.MANUAL
    }
  });

  return res.status(201).json(item);
});

nutritionRouter.patch("/shopping-list/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  const parsed = shoppingListUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const item = await prisma.shoppingListItem.findFirst({ where: { id, userId } });
  if (!item) {
    return res.status(404).json({ message: "Item not found" });
  }

  const updated = await prisma.shoppingListItem.update({
    where: { id },
    data: {
      checked: parsed.data.checked ?? item.checked,
      quantity: parsed.data.quantity ?? item.quantity,
      unit: parsed.data.unit ?? item.unit
    }
  });

  if (parsed.data.checked) {
    await prisma.pantryItem.upsert({
      where: {
        userId_name: {
          userId,
          name: updated.name
        }
      },
      update: {
        quantity: { increment: updated.quantity },
        unit: updated.unit ?? undefined
      },
      create: {
        userId,
        name: updated.name,
        quantity: updated.quantity,
        unit: updated.unit
      }
    });
  }

  return res.json(updated);
});

nutritionRouter.delete("/shopping-list/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const item = await prisma.shoppingListItem.findFirst({ where: { id, userId } });
  if (!item) {
    return res.status(404).json({ message: "Item not found" });
  }

  await prisma.shoppingListItem.delete({ where: { id } });
  return res.status(204).send();
});

nutritionRouter.get("/pantry", async (req, res) => {
  const userId = req.userId!;
  const items = await prisma.pantryItem.findMany({ where: { userId }, orderBy: { name: "asc" } });
  return res.json(items);
});

nutritionRouter.post("/pantry", async (req, res) => {
  const userId = req.userId!;
  const parsed = pantrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const { name, quantity, unit } = parsed.data;
  const item = await prisma.pantryItem.upsert({
    where: {
      userId_name: {
        userId,
        name
      }
    },
    create: { userId, name, quantity, unit },
    update: {
      quantity,
      unit: unit ?? undefined
    }
  });

  return res.status(201).json(item);
});

nutritionRouter.patch("/pantry/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  const parsed = pantrySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const item = await prisma.pantryItem.findFirst({ where: { id, userId } });
  if (!item) {
    return res.status(404).json({ message: "Pantry item not found" });
  }

  const updated = await prisma.pantryItem.update({
    where: { id },
    data: {
      name: parsed.data.name ?? item.name,
      quantity: parsed.data.quantity ?? item.quantity,
      unit: parsed.data.unit ?? item.unit
    }
  });

  return res.json(updated);
});

nutritionRouter.delete("/pantry/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  const item = await prisma.pantryItem.findFirst({ where: { id, userId } });
  if (!item) {
    return res.status(404).json({ message: "Pantry item not found" });
  }

  await prisma.pantryItem.delete({ where: { id } });
  return res.status(204).send();
});

nutritionRouter.post("/daily-log", async (req, res) => {
  const userId = req.userId!;
  const parsed = dailyLogSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const { date, mealType, recipeId, servings, calories, protein, carbs, fat, notes } = parsed.data;
  let totals = { calories: calories ?? 0, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 };
  let recipe: RecipeWithIngredients | null = null;

  if (recipeId) {
    recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, userId },
      include: { ingredients: { include: { ingredient: true } } }
    });
    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }
    totals = {
      calories: (recipe.totalCalories / recipe.servings) * servings,
      protein: (recipe.totalProtein / recipe.servings) * servings,
      carbs: (recipe.totalCarbs / recipe.servings) * servings,
      fat: (recipe.totalFat / recipe.servings) * servings
    };
  }

  const log = await prisma.$transaction(async (tx) => {
    const created = await tx.dailyLog.create({
      data: {
        userId,
        date,
        mealType,
        recipeId: recipe?.id,
        servings,
        calories: Math.round(totals.calories),
        protein: Math.round(totals.protein * 100) / 100,
        carbs: Math.round(totals.carbs * 100) / 100,
        fat: Math.round(totals.fat * 100) / 100,
        notes
      }
    });

    if (recipe) {
      await adjustPantryForRecipe(tx, userId, recipe, servings, "consume");
    }

    return created;
  });

  return res.status(201).json(log);
});

nutritionRouter.get("/daily-log", async (req, res) => {
  const userId = req.userId!;
  const parsed = analyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const { start, end } = parsed.data;
  const logs = await prisma.dailyLog.findMany({
    where: {
      userId,
      date: {
        gte: start,
        lte: end
      }
    },
    orderBy: { date: "asc" }
  });

  return res.json(logs);
});

nutritionRouter.patch("/daily-log/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  const parsed = dailyLogSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const existing = await prisma.dailyLog.findFirst({
    where: { id, userId },
    include: {
      recipe: {
        include: { ingredients: { include: { ingredient: true } } }
      }
    }
  });
  if (!existing) {
    return res.status(404).json({ message: "Daily log not found" });
  }

  const nextServings = parsed.data.servings ?? existing.servings;
  let targetRecipe: RecipeWithIngredients | null = existing.recipe as RecipeWithIngredients | null;
  let targetRecipeId: string | null = existing.recipeId ?? null;

  if (parsed.data.recipeId !== undefined) {
    if (parsed.data.recipeId) {
      const recipe = await prisma.recipe.findFirst({
        where: { id: parsed.data.recipeId, userId },
        include: { ingredients: { include: { ingredient: true } } }
      });
      if (!recipe) {
        return res.status(404).json({ message: "Recipe not found" });
      }
      targetRecipe = recipe;
      targetRecipeId = recipe.id;
    } else {
      targetRecipe = null;
      targetRecipeId = null;
    }
  }

  const totals = targetRecipe
    ? {
        calories: (targetRecipe.totalCalories / targetRecipe.servings) * nextServings,
        protein: (targetRecipe.totalProtein / targetRecipe.servings) * nextServings,
        carbs: (targetRecipe.totalCarbs / targetRecipe.servings) * nextServings,
        fat: (targetRecipe.totalFat / targetRecipe.servings) * nextServings
      }
    : {
        calories: parsed.data.calories ?? existing.calories,
        protein: parsed.data.protein ?? existing.protein,
        carbs: parsed.data.carbs ?? existing.carbs,
        fat: parsed.data.fat ?? existing.fat
      };

  const updated = await prisma.$transaction(async (tx) => {
    if (existing.recipe) {
      await adjustPantryForRecipe(tx, userId, existing.recipe as RecipeWithIngredients, existing.servings, "restore");
    }

    const updateData: Prisma.DailyLogUncheckedUpdateInput = {
      servings: nextServings,
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein * 100) / 100,
      carbs: Math.round(totals.carbs * 100) / 100,
      fat: Math.round(totals.fat * 100) / 100,
      recipeId: targetRecipeId ?? null
    };

    if (parsed.data.date !== undefined) updateData.date = parsed.data.date;
    if (parsed.data.mealType !== undefined) updateData.mealType = parsed.data.mealType;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes ?? null;

    const result = await tx.dailyLog.update({
      where: { id },
      data: updateData
    });

    if (targetRecipe) {
      await adjustPantryForRecipe(tx, userId, targetRecipe, nextServings, "consume");
    }

    return result;
  });

  return res.json(updated);
});

nutritionRouter.delete("/daily-log/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const existing = await prisma.dailyLog.findFirst({
    where: { id, userId },
    include: {
      recipe: {
        include: { ingredients: { include: { ingredient: true } } }
      }
    }
  });
  if (!existing) {
    return res.status(404).json({ message: "Daily log not found" });
  }

  await prisma.$transaction(async (tx) => {
    if (existing.recipe) {
      await adjustPantryForRecipe(tx, userId, existing.recipe as RecipeWithIngredients, existing.servings, "restore");
    }
    await tx.dailyLog.delete({ where: { id } });
  });

  return res.status(204).send();
});

nutritionRouter.get("/analytics/week", async (req, res) => {
  const userId = req.userId!;
  const parsed = weekAnalyticsSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const { weekStart } = parsed.data;
  const { start, end } = getWeekRange(weekStart);

  const logs = await prisma.dailyLog.findMany({
    where: {
      userId,
      date: {
        gte: start,
        lt: end
      }
    }
  });

  const perDay = new Map<string, { calories: number; protein: number; carbs: number; fat: number }>();

  logs.forEach((log) => {
    const key = log.date.toISOString().split("T")[0];
    const current = perDay.get(key) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
    current.calories += log.calories;
    current.protein += log.protein;
    current.carbs += log.carbs;
    current.fat += log.fat;
    perDay.set(key, current);
  });

  const result = Array.from(perDay.entries()).map(([dateKey, totals]) => ({
    date: dateKey,
    ...totals
  }));

  const aggregate = sumNutrition(
    logs.map((log) => ({
      calories: log.calories,
      protein: log.protein,
      carbs: log.carbs,
      fat: log.fat
    }))
  );

  return res.json({
    days: result.sort((a, b) => (a.date > b.date ? 1 : -1)),
    averages: {
      calories: result.length ? aggregate.calories / result.length : 0,
      protein: result.length ? aggregate.protein / result.length : 0,
      carbs: result.length ? aggregate.carbs / result.length : 0,
      fat: result.length ? aggregate.fat / result.length : 0
    }
  });
});

export { nutritionRouter };
