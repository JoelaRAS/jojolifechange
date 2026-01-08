import { useState, useEffect, useCallback } from "react";
import { Search, Barcode, Plus, Loader2, X } from "lucide-react";
import { useBarcodeScanner, BarcodeScanner } from "./BarcodeScanner";
import { api } from "../lib/api";

interface Ingredient {
    id: string;
    name: string;
    barcode?: string | null;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    imageUrl?: string | null;
    source?: string;
}

interface OpenFoodFactsProduct {
    barcode: string;
    name: string;
    brand?: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    imageUrl?: string;
}

interface IngredientSearchProps {
    onSelect: (ingredient: {
        name: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        barcode?: string;
        source: string;
    }) => void;
    placeholder?: string;
}

export function IngredientSearch({ onSelect, placeholder = "Rechercher un ingrédient..." }: IngredientSearchProps) {
    const [query, setQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState<{
        local: Ingredient[];
        openfoodfacts: OpenFoodFactsProduct[];
    }>({ local: [], openfoodfacts: [] });
    const [showResults, setShowResults] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [barcodeLoading, setBarcodeLoading] = useState(false);

    // Debounced search
    useEffect(() => {
        if (query.length < 2) {
            setResults({ local: [], openfoodfacts: [] });
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const { data } = await api.get("/nutrition/ingredients/search", {
                    params: { q: query },
                });
                setResults(data);
                setShowResults(true);
            } catch (error) {
                console.error("Search error:", error);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    const handleSelectLocal = (ingredient: Ingredient) => {
        onSelect({
            name: ingredient.name,
            calories: ingredient.calories,
            protein: ingredient.protein,
            carbs: ingredient.carbs,
            fat: ingredient.fat,
            barcode: ingredient.barcode ?? undefined,
            source: "local",
        });
        setQuery("");
        setShowResults(false);
    };

    const handleSelectOFF = async (product: OpenFoodFactsProduct) => {
        onSelect({
            name: product.name,
            calories: product.calories,
            protein: product.protein,
            carbs: product.carbs,
            fat: product.fat,
            barcode: product.barcode,
            source: "openfoodfacts",
        });
        setQuery("");
        setShowResults(false);
    };

    const handleBarcodeScan = async (barcode: string) => {
        setScannerOpen(false);
        setBarcodeLoading(true);

        try {
            const { data } = await api.get(`/nutrition/ingredients/barcode/${barcode}`);

            if (data.source === "local" && data.ingredient) {
                handleSelectLocal(data.ingredient);
            } else if (data.source === "openfoodfacts" && data.product) {
                handleSelectOFF(data.product);
            }
        } catch (error) {
            console.error("Barcode lookup error:", error);
            alert("Produit non trouvé");
        } finally {
            setBarcodeLoading(false);
        }
    };

    return (
        <div className="relative">
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => query.length >= 2 && setShowResults(true)}
                        placeholder={placeholder}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {isSearching && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                </div>

                <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    disabled={barcodeLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                    {barcodeLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Barcode className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Scanner</span>
                </button>
            </div>

            {/* Results dropdown */}
            {showResults && (results.local.length > 0 || results.openfoodfacts.length > 0) && (
                <div className="absolute z-50 w-full mt-1 bg-card border rounded-lg shadow-lg max-h-80 overflow-y-auto">
                    <button
                        type="button"
                        onClick={() => setShowResults(false)}
                        className="absolute top-2 right-2 p-1 hover:bg-accent rounded"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    {results.local.length > 0 && (
                        <div className="p-2">
                            <p className="text-xs text-muted-foreground px-2 mb-1">Mes ingrédients</p>
                            {results.local.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleSelectLocal(item)}
                                    className="w-full flex items-center gap-3 p-2 hover:bg-accent rounded text-left"
                                >
                                    <div className="flex-1">
                                        <p className="font-medium">{item.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {item.calories} kcal | P: {item.protein}g | G: {item.carbs}g | L: {item.fat}g
                                        </p>
                                    </div>
                                    <Plus className="h-4 w-4 text-muted-foreground" />
                                </button>
                            ))}
                        </div>
                    )}

                    {results.openfoodfacts.length > 0 && (
                        <div className="p-2 border-t">
                            <p className="text-xs text-muted-foreground px-2 mb-1 flex items-center gap-1">
                                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                OpenFoodFacts
                            </p>
                            {results.openfoodfacts.map((product) => (
                                <button
                                    key={product.barcode}
                                    type="button"
                                    onClick={() => handleSelectOFF(product)}
                                    className="w-full flex items-center gap-3 p-2 hover:bg-accent rounded text-left"
                                >
                                    {product.imageUrl && (
                                        <img
                                            src={product.imageUrl}
                                            alt={product.name}
                                            className="w-10 h-10 object-cover rounded"
                                        />
                                    )}
                                    <div className="flex-1">
                                        <p className="font-medium">{product.name}</p>
                                        {product.brand && (
                                            <p className="text-xs text-muted-foreground">{product.brand}</p>
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                            {product.calories} kcal | P: {product.protein}g | G: {product.carbs}g | L: {product.fat}g
                                        </p>
                                    </div>
                                    <Plus className="h-4 w-4 text-muted-foreground" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Barcode Scanner Modal */}
            <BarcodeScanner
                isOpen={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onScan={handleBarcodeScan}
            />
        </div>
    );
}

// Hook for quick barcode add to pantry/shopping
export function useQuickScan(type: "pantry" | "shopping") {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [lastResult, setLastResult] = useState<{ name: string; success: boolean } | null>(null);

    const handleScan = useCallback(async (barcode: string) => {
        setIsOpen(false);
        setIsLoading(true);

        try {
            const endpoint = type === "pantry"
                ? "/nutrition/ingredients/pantry/scan"
                : "/nutrition/ingredients/shopping/scan";

            const { data } = await api.post(endpoint, { barcode });
            setLastResult({ name: data.ingredient.name, success: true });
        } catch (error) {
            console.error("Quick scan error:", error);
            setLastResult({ name: "Produit non trouvé", success: false });
        } finally {
            setIsLoading(false);
        }
    }, [type]);

    return {
        isOpen,
        isLoading,
        lastResult,
        openScanner: () => setIsOpen(true),
        closeScanner: () => setIsOpen(false),
        handleScan,
        clearResult: () => setLastResult(null),
    };
}
