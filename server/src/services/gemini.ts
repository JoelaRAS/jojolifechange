import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";

const genAI = env.geminiApiKey ? new GoogleGenerativeAI(env.geminiApiKey) : null;

interface NutritionInfo {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  unit: string;
}

interface ExerciseCategory {
  muscleGroup: string;
  equipment: string;
}

interface RecipeSuggestion {
  name: string;
  description: string;
  ingredients: string[];
  estimatedCalories: number;
}

/**
 * Find the most similar ingredient from existing ingredients
 */
export async function findSimilarIngredient(
  productName: string,
  existingIngredients: string[]
): Promise<string | null> {
  if (!genAI) {
    console.warn("[Gemini] API key not configured");
    return null;
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001-001" });

    const prompt = `Tu es un assistant pour une application de nutrition.
Je viens de scanner un produit: "${productName}"

Voici la liste de mes ingrédients existants:
${existingIngredients.map((i) => `- ${i}`).join("\n")}

Si le produit scanné correspond à l'un de ces ingrédients (même partiellement ou sous un autre nom), retourne UNIQUEMENT le nom de l'ingrédient existant correspondant, sans aucune explication.

Si aucun ingrédient ne correspond, retourne UNIQUEMENT le mot "NOUVEAU".

Exemples:
- Produit "Riz Basmati Uncle Ben's" avec ingrédient existant "Riz" → Riz
- Produit "Coca-Cola Zero" sans correspondance → NOUVEAU`;

    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();

    if (response === "NOUVEAU" || response.length > 100) {
      return null;
    }

    // Vérifie que la réponse correspond à un ingrédient existant
    const match = existingIngredients.find(
      (i) => i.toLowerCase() === response.toLowerCase()
    );
    return match || null;
  } catch (error) {
    console.error("[Gemini] Error finding similar ingredient:", error);
    return null;
  }
}

/**
 * Categorize an exercise by muscle group and equipment
 */
export async function categorizeExercise(
  exerciseName: string
): Promise<ExerciseCategory> {
  const defaultCategory: ExerciseCategory = {
    muscleGroup: "other",
    equipment: "other",
  };

  if (!genAI) {
    return defaultCategory;
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001-001" });

    const prompt = `Tu es un expert en musculation.
Catégorise cet exercice: "${exerciseName}"

Réponds UNIQUEMENT en JSON avec ce format exact:
{"muscleGroup": "...", "equipment": "..."}

Valeurs possibles pour muscleGroup: chest, back, legs, shoulders, arms, core, cardio
Valeurs possibles pour equipment: barbell, dumbbell, machine, bodyweight, cable, other`;

    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();

    // Extraire le JSON de la réponse
    const jsonMatch = response.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        muscleGroup: parsed.muscleGroup || "other",
        equipment: parsed.equipment || "other",
      };
    }
  } catch (error) {
    console.error("[Gemini] Error categorizing exercise:", error);
  }

  return defaultCategory;
}

/**
 * Estimate nutrition info for an ingredient without OpenFoodFacts data
 */
export async function estimateNutrition(
  ingredientName: string
): Promise<NutritionInfo | null> {
  if (!genAI) {
    return null;
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001-001" });

    const prompt = `Tu es un expert en nutrition.
Estime les valeurs nutritionnelles pour 100g de: "${ingredientName}"

Réponds UNIQUEMENT en JSON avec ce format exact:
{"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "unit": "g"}

Les valeurs doivent être des nombres réalistes basés sur des données nutritionnelles standards.`;

    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();

    const jsonMatch = response.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        calories: Number(parsed.calories) || 0,
        protein: Number(parsed.protein) || 0,
        carbs: Number(parsed.carbs) || 0,
        fat: Number(parsed.fat) || 0,
        unit: parsed.unit || "g",
      };
    }
  } catch (error) {
    console.error("[Gemini] Error estimating nutrition:", error);
  }

  return null;
}

/**
 * Suggest recipes based on pantry items
 */
export async function suggestRecipes(
  pantryItems: string[],
  maxSuggestions = 3
): Promise<RecipeSuggestion[]> {
  if (!genAI || pantryItems.length === 0) {
    return [];
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001-001" });

    const prompt = `Tu es un chef cuisinier.
Voici les ingrédients disponibles dans mon garde-manger:
${pantryItems.map((i) => `- ${i}`).join("\n")}

Suggère ${maxSuggestions} recettes simples que je peux préparer avec ces ingrédients.

Réponds UNIQUEMENT en JSON avec ce format exact (un tableau):
[
  {
    "name": "Nom de la recette",
    "description": "Brève description",
    "ingredients": ["ingrédient 1", "ingrédient 2"],
    "estimatedCalories": 500
  }
]`;

    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error("[Gemini] Error suggesting recipes:", error);
  }

  return [];
}

/**
 * Smart search for ingredients - finds matches even with typos or variations
 */
export async function smartIngredientSearch(
  query: string,
  existingIngredients: string[]
): Promise<string[]> {
  if (!genAI || existingIngredients.length === 0) {
    // Fallback: simple fuzzy matching
    const lowerQuery = query.toLowerCase();
    return existingIngredients.filter((i) =>
      i.toLowerCase().includes(lowerQuery)
    );
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001-001" });

    const prompt = `Tu es un assistant de recherche.
L'utilisateur cherche: "${query}"

Voici tous les ingrédients disponibles:
${existingIngredients.map((i) => `- ${i}`).join("\n")}

Retourne les ingrédients qui correspondent à la recherche (même partiellement, avec fautes de frappe, ou synonymes).

Réponds UNIQUEMENT avec un tableau JSON des noms correspondants:
["ingrédient 1", "ingrédient 2"]

Si aucun ne correspond, retourne []`;

    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error("[Gemini] Error in smart search:", error);
  }

  // Fallback
  const lowerQuery = query.toLowerCase();
  return existingIngredients.filter((i) =>
    i.toLowerCase().includes(lowerQuery)
  );
}

export const geminiService = {
  findSimilarIngredient,
  categorizeExercise,
  estimateNutrition,
  suggestRecipes,
  smartIngredientSearch,
  isConfigured: () => !!genAI,
};
