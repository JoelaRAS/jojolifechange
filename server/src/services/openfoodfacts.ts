import axios from "axios";

const OFF_BASE_URL = "https://world.openfoodfacts.org";

interface OpenFoodFactsNutriments {
    "energy-kcal_100g"?: number;
    energy_100g?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    fiber_100g?: number;
    sugars_100g?: number;
    salt_100g?: number;
}

interface OpenFoodFactsProduct {
    code: string;
    product_name?: string;
    product_name_fr?: string;
    brands?: string;
    quantity?: string;
    serving_size?: string;
    nutriments?: OpenFoodFactsNutriments;
    image_url?: string;
    image_front_url?: string;
    image_front_small_url?: string;
    categories_tags?: string[];
}

interface SearchResult {
    count: number;
    page: number;
    page_size: number;
    products: OpenFoodFactsProduct[];
}

interface NormalizedProduct {
    barcode: string;
    name: string;
    brand?: string;
    quantity?: string;
    calories: number; // per 100g
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
    sugar?: number;
    salt?: number;
    imageUrl?: string;
    source: "openfoodfacts";
}

/**
 * Search products by name
 */
export async function searchProducts(
    query: string,
    page = 1,
    pageSize = 20
): Promise<{ products: NormalizedProduct[]; total: number }> {
    try {
        const response = await axios.get<SearchResult>(
            `${OFF_BASE_URL}/cgi/search.pl`,
            {
                params: {
                    search_terms: query,
                    search_simple: 1,
                    action: "process",
                    json: 1,
                    page,
                    page_size: pageSize,
                    // Prefer French products
                    tagtype_0: "countries",
                    tag_contains_0: "contains",
                    tag_0: "france",
                },
                timeout: 10000,
            }
        );

        const products = response.data.products
            .filter((p) => p.product_name || p.product_name_fr)
            .map(normalizeProduct);

        return {
            products,
            total: response.data.count,
        };
    } catch (error) {
        console.error("[OpenFoodFacts] Search error:", error);
        return { products: [], total: 0 };
    }
}

/**
 * Get product by barcode
 */
export async function getProductByBarcode(
    barcode: string
): Promise<NormalizedProduct | null> {
    try {
        const response = await axios.get(
            `${OFF_BASE_URL}/api/v0/product/${barcode}.json`,
            { timeout: 10000 }
        );

        if (response.data.status !== 1 || !response.data.product) {
            return null;
        }

        return normalizeProduct(response.data.product);
    } catch (error) {
        console.error("[OpenFoodFacts] Barcode lookup error:", error);
        return null;
    }
}

/**
 * Normalize product data from OpenFoodFacts
 */
function normalizeProduct(product: OpenFoodFactsProduct): NormalizedProduct {
    const nutriments = product.nutriments || {};

    // Get calories - try different fields
    let calories = nutriments["energy-kcal_100g"] || 0;
    if (!calories && nutriments.energy_100g) {
        // Convert kJ to kcal if needed
        calories = Math.round(nutriments.energy_100g / 4.184);
    }

    return {
        barcode: product.code,
        name: product.product_name_fr || product.product_name || "Produit inconnu",
        brand: product.brands,
        quantity: product.quantity || product.serving_size,
        calories: Math.round(calories * 100) / 100,
        protein: Math.round((nutriments.proteins_100g || 0) * 100) / 100,
        carbs: Math.round((nutriments.carbohydrates_100g || 0) * 100) / 100,
        fat: Math.round((nutriments.fat_100g || 0) * 100) / 100,
        fiber: nutriments.fiber_100g,
        sugar: nutriments.sugars_100g,
        salt: nutriments.salt_100g,
        imageUrl:
            product.image_front_small_url ||
            product.image_front_url ||
            product.image_url,
        source: "openfoodfacts",
    };
}

/**
 * Search products with autocomplete-friendly results
 */
export async function autocompleteProducts(
    query: string,
    limit = 10
): Promise<NormalizedProduct[]> {
    if (!query || query.length < 2) {
        return [];
    }

    const { products } = await searchProducts(query, 1, limit);
    return products;
}

export const openFoodFactsService = {
    searchProducts,
    getProductByBarcode,
    autocompleteProducts,
};
