import { useState } from "react";
import { Barcode, Loader2, Check, X } from "lucide-react";
import { BarcodeScanner } from "./BarcodeScanner";
import { api } from "../lib/api";

interface QuickScanButtonProps {
    type: "pantry" | "shopping";
    onSuccess?: (name: string) => void;
    className?: string;
}

export function QuickScanButton({ type, onSuccess, className = "" }: QuickScanButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<{ name: string; success: boolean } | null>(null);

    const handleScan = async (barcode: string) => {
        setIsOpen(false);
        setIsLoading(true);
        setResult(null);

        try {
            const endpoint = type === "pantry"
                ? "/nutrition/ingredients/pantry/scan"
                : "/nutrition/ingredients/shopping/scan";

            const { data } = await api.post(endpoint, { barcode });
            setResult({ name: data.ingredient.name, success: true });
            onSuccess?.(data.ingredient.name);

            // Clear result after 3 seconds
            setTimeout(() => setResult(null), 3000);
        } catch (error) {
            console.error("Scan error:", error);
            setResult({ name: "Produit non trouvé", success: false });
            setTimeout(() => setResult(null), 3000);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                disabled={isLoading}
                className={`flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 text-sm ${className}`}
            >
                {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : result ? (
                    result.success ? (
                        <Check className="h-4 w-4 text-green-300" />
                    ) : (
                        <X className="h-4 w-4 text-red-300" />
                    )
                ) : (
                    <Barcode className="h-4 w-4" />
                )}
                <span>
                    {isLoading
                        ? "Ajout..."
                        : result
                            ? result.name
                            : "Scanner"}
                </span>
            </button>

            <BarcodeScanner
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                onScan={handleScan}
            />
        </>
    );
}
