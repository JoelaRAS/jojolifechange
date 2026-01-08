import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { Camera, X, Loader2, AlertCircle } from "lucide-react";

interface BarcodeScannerProps {
    onScan: (barcode: string) => void;
    onClose: () => void;
    isOpen: boolean;
}

export function BarcodeScanner({ onScan, onClose, isOpen }: BarcodeScannerProps) {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [scannerReady, setScannerReady] = useState(false);
    const containerIdRef = useRef(`barcode-scanner-${Date.now()}`);

    const stopScanner = useCallback(async () => {
        if (scannerRef.current) {
            try {
                const state = scannerRef.current.getState();
                if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
                    await scannerRef.current.stop();
                }
            } catch (err) {
                console.error("Error stopping scanner:", err);
            }
            try {
                scannerRef.current.clear();
            } catch (err) {
                console.error("Error clearing scanner:", err);
            }
            scannerRef.current = null;
        }
        setScannerReady(false);
    }, []);

    const startScanner = useCallback(async () => {
        // Don't start if already starting or already have a scanner
        if (isStarting || scannerRef.current) return;

        setIsStarting(true);
        setError(null);

        try {
            // Check if camera is available
            const devices = await Html5Qrcode.getCameras();
            if (devices.length === 0) {
                setError("Aucune caméra trouvée sur cet appareil");
                setIsStarting(false);
                return;
            }

            const html5QrCode = new Html5Qrcode(containerIdRef.current, {
                verbose: false,
                formatsToSupport: undefined, // All formats
            });
            scannerRef.current = html5QrCode;

            // Get container element for sizing
            const container = document.getElementById(containerIdRef.current);
            const width = container?.clientWidth || 300;
            const height = Math.min(width * 0.75, 400);

            await html5QrCode.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: {
                        width: Math.min(width * 0.8, 250),
                        height: Math.min(height * 0.5, 150)
                    },
                    aspectRatio: width / height,
                },
                (decodedText) => {
                    // Successfully scanned
                    onScan(decodedText);
                    stopScanner();
                },
                () => {
                    // Scan error - ignore, this happens constantly while scanning
                }
            );

            setScannerReady(true);
        } catch (err) {
            console.error("Error starting scanner:", err);
            const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";

            if (errorMessage.includes("NotAllowedError") || errorMessage.includes("Permission")) {
                setError("Veuillez autoriser l'accès à la caméra dans les paramètres de votre navigateur");
            } else if (errorMessage.includes("NotFoundError")) {
                setError("Aucune caméra trouvée");
            } else if (errorMessage.includes("NotReadableError")) {
                setError("La caméra est utilisée par une autre application");
            } else if (errorMessage.includes("OverconstrainedError")) {
                setError("Configuration de caméra non supportée");
            } else {
                setError(`Erreur: ${errorMessage}`);
            }

            scannerRef.current = null;
        } finally {
            setIsStarting(false);
        }
    }, [onScan, stopScanner, isStarting]);

    useEffect(() => {
        if (isOpen) {
            // Longer delay to ensure the DOM is ready
            const timer = setTimeout(() => {
                startScanner();
            }, 300);
            return () => clearTimeout(timer);
        } else {
            stopScanner();
        }
    }, [isOpen, startScanner, stopScanner]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopScanner();
        };
    }, [stopScanner]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
            <div className="relative w-full max-w-md">
                {/* Header */}
                <div className="flex items-center justify-between bg-card rounded-t-lg p-4 border-b">
                    <div className="flex items-center gap-2">
                        <Camera className="h-5 w-5 text-primary" />
                        <span className="font-medium">Scanner un code-barres</span>
                    </div>
                    <button
                        onClick={() => {
                            stopScanner();
                            onClose();
                        }}
                        className="p-2 hover:bg-accent rounded-full transition-colors"
                        aria-label="Fermer"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Scanner area */}
                <div className="bg-gray-900 rounded-b-lg overflow-hidden relative">
                    {/* Loading state */}
                    {isStarting && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10 bg-gray-900">
                            <Loader2 className="h-10 w-10 animate-spin mb-3 text-primary" />
                            <span className="text-lg">Démarrage de la caméra...</span>
                            <span className="text-sm text-gray-400 mt-1">Veuillez autoriser l'accès à la caméra</span>
                        </div>
                    )}

                    {/* Error state */}
                    {error && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 text-center z-10 bg-gray-900">
                            <AlertCircle className="h-12 w-12 mb-4 text-red-400" />
                            <p className="text-red-400 mb-4 text-lg">{error}</p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setError(null);
                                        startScanner();
                                    }}
                                    className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium"
                                >
                                    Réessayer
                                </button>
                                <button
                                    onClick={() => {
                                        stopScanner();
                                        onClose();
                                    }}
                                    className="px-6 py-2 bg-gray-700 text-white rounded-lg font-medium"
                                >
                                    Fermer
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Scanner container - MUST have fixed dimensions */}
                    <div
                        id={containerIdRef.current}
                        style={{
                            width: "100%",
                            minHeight: "350px",
                            opacity: (isStarting || error) ? 0 : 1,
                        }}
                    />
                </div>

                {/* Instructions */}
                {scannerReady && !error && (
                    <div className="mt-4 text-center text-white/80 text-sm">
                        <p>📷 Placez le code-barres dans le cadre</p>
                        <p className="text-white/50 mt-1">Le scan est automatique</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// Hook for using the scanner
export function useBarcodeScanner() {
    const [isOpen, setIsOpen] = useState(false);
    const [lastScanned, setLastScanned] = useState<string | null>(null);

    const openScanner = useCallback(() => {
        setLastScanned(null);
        setIsOpen(true);
    }, []);

    const closeScanner = useCallback(() => {
        setIsOpen(false);
    }, []);

    const handleScan = useCallback((barcode: string) => {
        setLastScanned(barcode);
        setIsOpen(false);
    }, []);

    return {
        isOpen,
        lastScanned,
        openScanner,
        closeScanner,
        handleScan,
        ScannerComponent: (
            <BarcodeScanner
                isOpen={isOpen}
                onScan={handleScan}
                onClose={closeScanner}
            />
        ),
    };
}
