import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../services/prisma";
import { openFoodFactsService } from "../../services/openfoodfacts";
import { geminiService } from "../../services/gemini";

const ingredientsRouter = Router();
ingredientsRouter.use(requireAuth);

// ==================== SCHEMAS ====================

const ingredientSchema = z.object({
    name: z.string().min(1).max(200),
    barcode: z.string().optional(),
    unit: z.string().optional(),
    calories: z.number().nonnegative().default(0),
    protein: z.number().nonnegative().default(0),
    carbs: z.number().nonnegative().default(0),
    fat: z.number().nonnegative().default(0),
    imageUrl: z.string().url().optional(),
    source: z.enum(["manual", "openfoodfacts", "gemini"]).default("manual"),
});

// ==================== ROUTES ====================

// Liste tous les ingrédients (globaux + utilisateur)
ingredientsRouter.get("/", async (req, res) => {
    const userId = req.userId!;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit) : 50;

    const ingredients = await prisma.ingredient.findMany({
        where: {
            OR: [
                { isGlobal: true },
                { userId },
                { userId: null }, // Legacy global ingredients
            ],
            ...(search ? {
                name: {
                    contains: search,
                    mode: "insensitive" as const,
                },
            } : {}),
        },
        orderBy: { name: "asc" },
        take: limit,
    });

    return res.json(ingredients);
});

// Recherche combinée: local + OpenFoodFacts
ingredientsRouter.get("/search", async (req, res) => {
    const userId = req.userId!;
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const includeOpenFoodFacts = req.query.off !== "false";

    if (!query || query.length < 2) {
        return res.json({ local: [], openfoodfacts: [] });
    }

    // Recherche locale
    const localIngredients = await prisma.ingredient.findMany({
        where: {
            OR: [
                { isGlobal: true },
                { userId },
                { userId: null },
            ],
            name: {
                contains: query,
                mode: "insensitive" as const,
            },
        },
        orderBy: { name: "asc" },
        take: 10,
    });

    // Recherche OpenFoodFacts (si activée)
    let offProducts: Awaited<ReturnType<typeof openFoodFactsService.autocompleteProducts>> = [];
    if (includeOpenFoodFacts) {
        offProducts = await openFoodFactsService.autocompleteProducts(query, 10);
    }

    return res.json({
        local: localIngredients,
        openfoodfacts: offProducts,
    });
});

// Recherche par code-barres
ingredientsRouter.get("/barcode/:code", async (req, res) => {
    const userId = req.userId!;
    const { code } = req.params;

    // D'abord, chercher dans la base locale
    const localIngredient = await prisma.ingredient.findFirst({
        where: {
            barcode: code,
            OR: [
                { isGlobal: true },
                { userId },
                { userId: null },
            ],
        },
    });

    if (localIngredient) {
        return res.json({
            source: "local",
            ingredient: localIngredient,
        });
    }

    // Sinon, chercher sur OpenFoodFacts
    const offProduct = await openFoodFactsService.getProductByBarcode(code);

    if (offProduct) {
        // Chercher un ingrédient similaire pour mapper
        const existingNames = await prisma.ingredient.findMany({
            where: {
                OR: [
                    { isGlobal: true },
                    { userId },
                    { userId: null },
                ],
            },
            select: { name: true },
        });

        const similarIngredient = await geminiService.findSimilarIngredient(
            offProduct.name,
            existingNames.map((i) => i.name)
        );

        return res.json({
            source: "openfoodfacts",
            product: offProduct,
            suggestedMapping: similarIngredient,
        });
    }

    return res.status(404).json({ message: "Produit non trouvé" });
});

// Créer un ingrédient manuellement
ingredientsRouter.post("/", async (req, res) => {
    const userId = req.userId!;
    const parsed = ingredientSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
    }

    const data = parsed.data;

    // Si pas de valeurs nutritionnelles, essayer d'estimer avec Gemini
    if (data.calories === 0 && data.protein === 0 && data.carbs === 0 && data.fat === 0) {
        const estimated = await geminiService.estimateNutrition(data.name);
        if (estimated) {
            data.calories = estimated.calories;
            data.protein = estimated.protein;
            data.carbs = estimated.carbs;
            data.fat = estimated.fat;
            data.unit = estimated.unit;
            data.source = "gemini";
        }
    }

    try {
        const ingredient = await prisma.ingredient.create({
            data: {
                userId,
                ...data,
                isGlobal: false,
            },
        });
        return res.status(201).json(ingredient);
    } catch (error: unknown) {
        if ((error as { code?: string }).code === "P2002") {
            return res.status(409).json({ message: "Un ingrédient avec ce nom ou code-barres existe déjà" });
        }
        throw error;
    }
});

// Importer depuis OpenFoodFacts
ingredientsRouter.post("/import-off", async (req, res) => {
    const userId = req.userId!;
    const { barcode, mapToIngredientId } = req.body as {
        barcode: string;
        mapToIngredientId?: string;
    };

    if (!barcode) {
        return res.status(400).json({ message: "barcode is required" });
    }

    // Récupérer le produit OpenFoodFacts
    const product = await openFoodFactsService.getProductByBarcode(barcode);
    if (!product) {
        return res.status(404).json({ message: "Produit non trouvé sur OpenFoodFacts" });
    }

    // Si on veut mapper à un ingrédient existant
    if (mapToIngredientId) {
        const existingIngredient = await prisma.ingredient.findFirst({
            where: {
                id: mapToIngredientId,
                OR: [
                    { userId },
                    { isGlobal: true },
                    { userId: null },
                ],
            },
        });

        if (!existingIngredient) {
            return res.status(404).json({ message: "Ingrédient cible non trouvé" });
        }

        // Mettre à jour l'ingrédient avec le code-barres
        const updated = await prisma.ingredient.update({
            where: { id: mapToIngredientId },
            data: {
                barcode: product.barcode,
                imageUrl: product.imageUrl,
            },
        });

        return res.json({
            action: "mapped",
            ingredient: updated,
        });
    }

    // Sinon, créer un nouvel ingrédient
    try {
        const ingredient = await prisma.ingredient.create({
            data: {
                userId,
                name: product.name,
                barcode: product.barcode,
                unit: "g",
                calories: product.calories,
                protein: product.protein,
                carbs: product.carbs,
                fat: product.fat,
                imageUrl: product.imageUrl,
                source: "openfoodfacts",
                isGlobal: false,
            },
        });

        return res.status(201).json({
            action: "created",
            ingredient,
        });
    } catch (error: unknown) {
        if ((error as { code?: string }).code === "P2002") {
            // Déjà importé, retourner l'existant
            const existing = await prisma.ingredient.findFirst({
                where: { barcode: product.barcode },
            });
            return res.json({
                action: "existing",
                ingredient: existing,
            });
        }
        throw error;
    }
});

// Modifier un ingrédient
ingredientsRouter.put("/:id", async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;
    const parsed = ingredientSchema.partial().safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
    }

    const existing = await prisma.ingredient.findFirst({
        where: { id, userId, isGlobal: false },
    });
    if (!existing) {
        return res.status(404).json({ message: "Ingrédient non trouvé ou non modifiable" });
    }

    const ingredient = await prisma.ingredient.update({
        where: { id },
        data: parsed.data,
    });

    return res.json(ingredient);
});

// Supprimer un ingrédient
ingredientsRouter.delete("/:id", async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const existing = await prisma.ingredient.findFirst({
        where: { id, userId, isGlobal: false },
    });
    if (!existing) {
        return res.status(404).json({ message: "Ingrédient non trouvé ou non supprimable" });
    }

    await prisma.ingredient.delete({ where: { id } });
    return res.status(204).send();
});

// ==================== GARDE-MANGER AVEC SCAN ====================

// Ajouter au garde-manger via code-barres
ingredientsRouter.post("/pantry/scan", async (req, res) => {
    const userId = req.userId!;
    const { barcode, quantity, unit } = req.body as {
        barcode: string;
        quantity?: number;
        unit?: string;
    };

    if (!barcode) {
        return res.status(400).json({ message: "barcode is required" });
    }

    // Chercher l'ingrédient par code-barres
    let ingredient = await prisma.ingredient.findFirst({
        where: { barcode },
    });

    // Si pas trouvé, importer depuis OpenFoodFacts
    if (!ingredient) {
        const product = await openFoodFactsService.getProductByBarcode(barcode);
        if (!product) {
            return res.status(404).json({ message: "Produit non trouvé" });
        }

        ingredient = await prisma.ingredient.create({
            data: {
                userId,
                name: product.name,
                barcode: product.barcode,
                unit: "g",
                calories: product.calories,
                protein: product.protein,
                carbs: product.carbs,
                fat: product.fat,
                imageUrl: product.imageUrl,
                source: "openfoodfacts",
                isGlobal: false,
            },
        });
    }

    // Ajouter ou mettre à jour le garde-manger
    const pantryItem = await prisma.pantryItem.upsert({
        where: {
            userId_name: {
                userId,
                name: ingredient.name,
            },
        },
        update: {
            quantity: {
                increment: quantity ?? 1,
            },
            unit: unit ?? ingredient.unit,
        },
        create: {
            userId,
            name: ingredient.name,
            quantity: quantity ?? 1,
            unit: unit ?? ingredient.unit,
        },
    });

    return res.json({
        ingredient,
        pantryItem,
    });
});

// ==================== LISTE DE COURSES AVEC SCAN ====================

// Ajouter à la liste de courses via code-barres
ingredientsRouter.post("/shopping/scan", async (req, res) => {
    const userId = req.userId!;
    const { barcode, quantity, unit } = req.body as {
        barcode: string;
        quantity?: number;
        unit?: string;
    };

    if (!barcode) {
        return res.status(400).json({ message: "barcode is required" });
    }

    // Chercher l'ingrédient par code-barres
    let ingredient = await prisma.ingredient.findFirst({
        where: { barcode },
    });

    // Si pas trouvé, importer depuis OpenFoodFacts
    if (!ingredient) {
        const product = await openFoodFactsService.getProductByBarcode(barcode);
        if (!product) {
            return res.status(404).json({ message: "Produit non trouvé" });
        }

        ingredient = await prisma.ingredient.create({
            data: {
                userId,
                name: product.name,
                barcode: product.barcode,
                unit: "g",
                calories: product.calories,
                protein: product.protein,
                carbs: product.carbs,
                fat: product.fat,
                imageUrl: product.imageUrl,
                source: "openfoodfacts",
                isGlobal: false,
            },
        });
    }

    // Ajouter à la liste de courses
    const shoppingItem = await prisma.shoppingListItem.create({
        data: {
            userId,
            name: ingredient.name,
            quantity: quantity ?? 1,
            unit: unit ?? ingredient.unit,
            source: "MANUAL",
        },
    });

    return res.json({
        ingredient,
        shoppingItem,
    });
});

// ==================== SUGGESTIONS IA ====================

// Suggestions de recettes basées sur le garde-manger
ingredientsRouter.get("/suggestions/recipes", async (req, res) => {
    const userId = req.userId!;

    // Récupérer les items du garde-manger
    const pantryItems = await prisma.pantryItem.findMany({
        where: { userId },
        select: { name: true },
    });

    if (pantryItems.length === 0) {
        return res.json({ suggestions: [] });
    }

    const suggestions = await geminiService.suggestRecipes(
        pantryItems.map((p) => p.name),
        3
    );

    return res.json({ suggestions });
});

export { ingredientsRouter };
