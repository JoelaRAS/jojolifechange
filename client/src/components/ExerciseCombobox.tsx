import { useState, useEffect, useRef } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

interface Exercise {
    id: string;
    name: string;
}

interface ExerciseComboboxProps {
    exercises: Exercise[];
    value: string;
    onChange: (name: string, id?: string) => void;
    placeholder?: string;
}

export function ExerciseCombobox({ exercises, value, onChange, placeholder }: ExerciseComboboxProps) {
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState(value);
    const containerRef = useRef<HTMLDivElement>(null);

    // Mettre à jour l'input si la valeur externe change (ex: reset form)
    useEffect(() => {
        setInputValue(value);
    }, [value]);

    // Fermer si on clique dehors
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Fonction de normalisation pour la recherche floue (enlève accents et casse)
    const normalize = (str: string) =>
        str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    // Distance de Levenshtein pour la tolérance aux fautes
    const levenshtein = (a: string, b: string): number => {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
                }
            }
        }
        return matrix[b.length][a.length];
    };

    const filterExercise = (exercise: Exercise, query: string) => {
        const nName = normalize(exercise.name);
        const nQuery = normalize(query);
        if (!nQuery) return true;

        // 1. Inclusion simple (ex: "developpe" -> "Développé")
        if (nName.includes(nQuery)) return true;

        // 2. Tolérance aux fautes (Levenshtein) sur les mots
        // Si query assez longue (> 2 chars)
        if (nQuery.length > 2) {
            const words = nName.split(/[ -]/); // Split sur espace ou tiret
            // Si un des mots de l'exercice est proche de la query
            // Ex: "develope" (query) vs "Développé" (word) -> distance 1 (manque un p)
            return words.some(w => {
                // Optimisation: check longueur d'abord
                if (Math.abs(w.length - nQuery.length) > 2) return false;
                const dist = levenshtein(w, nQuery);
                // Tolérer 1 erreur pour mots courts (3-5), 2 erreurs pour longs (>5)
                return dist <= (nQuery.length > 5 ? 2 : 1);
            });
        }
        return false;
    };

    const filteredExercises = exercises.filter((exercise) =>
        filterExercise(exercise, inputValue)
    );

    const handleSelect = (exercise: Exercise) => {
        setInputValue(exercise.name);
        onChange(exercise.name, exercise.id);
        setOpen(false);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        setInputValue(newVal);
        setOpen(true);

        // Chercher si correspondance exacte pour l'ID, sinon ID vide (nouvel exo)
        const exactMatch = exercises.find(ex => ex.name.toLowerCase() === newVal.toLowerCase());
        onChange(newVal, exactMatch?.id);
    };

    return (
        <div className="relative w-full" ref={containerRef}>
            <div className="relative">
                <input
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={() => setOpen(true)}
                    placeholder={placeholder}
                    className="w-full px-2 py-1.5 border rounded bg-background text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <ChevronsUpDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50 pointer-events-none" />
            </div>

            {open && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto bg-white dark:bg-slate-950">
                    {filteredExercises.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground text-center">
                            Nouvel exercice : "{inputValue}"
                        </div>
                    ) : (
                        <ul className="py-1">
                            {filteredExercises.map((exercise) => (
                                <li
                                    key={exercise.id}
                                    onClick={() => handleSelect(exercise)}
                                    className="px-2 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
                                >
                                    {exercise.name}
                                    {exercise.name === inputValue && <Check className="h-3 w-3 opacity-50" />}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
