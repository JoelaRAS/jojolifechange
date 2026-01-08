import { useState, useEffect, useRef } from "react";
import { Search, Loader2, Check } from "lucide-react";
import { api } from "../lib/api";

interface NutritionData {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    unit?: string;
    barcode?: string;
    source: "local" | "openfoodfacts";
}

interface LocalIngredient {
    id: string;
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    unit?: string | null;
}

interface OFFProduct {
    barcode: string;
    name: string;
    brand?: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    imageUrl?: string;
}

interface IngredientAutocompleteProps {
    value: string;
    onChange: (name: string) => void;
    onSelect: (data: NutritionData) => void;
    placeholder?: string;
    className?: string;
}

export function IngredientAutocomplete({
    value,
    onChange,
    onSelect,
    placeholder = "Rechercher un ingrédient...",
    className = "",
}: IngredientAutocompleteProps) {
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [results, setResults] = useState<{
        local: LocalIngredient[];
        openfoodfacts: OFFProduct[];
    }>({ local: [], openfoodfacts: [] });
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Debounced search
    useEffect(() => {
        if (value.length < 2) {
            setResults({ local: [], openfoodfacts: [] });
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const { data } = await api.get("/nutrition/ingredients/search", {
                    params: { q: value },
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
    }, [value]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelectLocal = (ingredient: LocalIngredient) => {
        onSelect({
            name: ingredient.name,
            calories: ingredient.calories,
            protein: ingredient.protein,
            carbs: ingredient.carbs,
            fat: ingredient.fat,
            unit: ingredient.unit || "g",
            source: "local",
        });
        setShowResults(false);
    };

    const handleSelectOFF = (product: OFFProduct) => {
        onSelect({
            name: product.name,
            calories: product.calories,
            protein: product.protein,
            carbs: product.carbs,
            fat: product.fat,
            unit: "g",
            barcode: product.barcode,
            source: "openfoodfacts",
        });
        setShowResults(false);
    };

    const hasResults = results.local.length > 0 || results.openfoodfacts.length > 0;

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={() => value.length >= 2 && hasResults && setShowResults(true)}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 pr-10 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
                {isSearching ? (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                ) : value.length >= 2 ? (
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                ) : null}
            </div>

            {/* Results dropdown */}
            {showResults && hasResults && (
                <div className="absolute z-50 w-full mt-1 bg-card border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {results.local.length > 0 && (
                        <div className="p-2">
                            <p className="text-xs text-muted-foreground px-2 mb-1 font-medium">
                                Mes ingrédients
                            </p>
                            {results.local.slice(0, 5).map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleSelectLocal(item)}
                                    className="w-full flex items-center justify-between p-2 hover:bg-accent rounded text-left text-sm"
                                >
                                    <div>
                                        <p className="font-medium">{item.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {item.calories} kcal | P: {item.protein}g | G: {item.carbs}g | L: {item.fat}g
                                        </p>
                                    </div>
                                    <Check className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100" />
                                </button>
                            ))}
                        </div>
                    )}

                    {results.openfoodfacts.length > 0 && (
                        <div className={`p-2 ${results.local.length > 0 ? "border-t" : ""}`}>
                            <p className="text-xs text-muted-foreground px-2 mb-1 font-medium flex items-center gap-1">
                                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                OpenFoodFacts
                            </p>
                            {results.openfoodfacts.slice(0, 5).map((product) => (
                                <button
                                    key={product.barcode}
                                    type="button"
                                    onClick={() => handleSelectOFF(product)}
                                    className="w-full flex items-center gap-3 p-2 hover:bg-accent rounded text-left text-sm"
                                >
                                    {product.imageUrl && (
                                        <img
                                            src={product.imageUrl}
                                            alt={product.name}
                                            className="w-8 h-8 object-cover rounded"
                                        />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{product.name}</p>
                                        {product.brand && (
                                            <p className="text-xs text-muted-foreground truncate">{product.brand}</p>
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                            {product.calories} kcal | P: {product.protein}g | G: {product.carbs}g | L: {product.fat}g
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
