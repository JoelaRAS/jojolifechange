import { useState } from "react";
import { Plus, Dumbbell, Trash2, Edit2, X, Loader2 } from "lucide-react";
import { useExercises, useCreateExercise, useDeleteExercise, useExerciseCategories } from "../lib/api/exercises";

interface ExerciseLibraryProps {
    onSelectExercise?: (exercise: { id: string; name: string; muscleGroup: string; equipment: string }) => void;
    selectionMode?: boolean;
}

export function ExerciseLibrary({ onSelectExercise, selectionMode = false }: ExerciseLibraryProps) {
    const [search, setSearch] = useState("");
    const [muscleGroupFilter, setMuscleGroupFilter] = useState<string>("");
    const [showAddForm, setShowAddForm] = useState(false);

    const { data: exercises, isLoading } = useExercises({ search, muscleGroup: muscleGroupFilter || undefined });
    const { data: categories } = useExerciseCategories();
    const createExercise = useCreateExercise();
    const deleteExercise = useDeleteExercise();

    const [newExercise, setNewExercise] = useState({
        name: "",
        muscleGroup: "",
        equipment: "",
        description: "",
    });

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newExercise.name) return;

        try {
            await createExercise.mutateAsync(newExercise);
            setNewExercise({ name: "", muscleGroup: "", equipment: "", description: "" });
            setShowAddForm(false);
        } catch (error) {
            console.error("Error creating exercise:", error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Supprimer cet exercice ?")) return;
        try {
            await deleteExercise.mutateAsync(id);
        } catch (error) {
            console.error("Error deleting exercise:", error);
        }
    };

    const muscleGroupLabels: Record<string, string> = {
        chest: "Pectoraux",
        back: "Dos",
        legs: "Jambes",
        shoulders: "Épaules",
        arms: "Bras",
        core: "Abdos",
        cardio: "Cardio",
        other: "Autre",
    };

    const equipmentLabels: Record<string, string> = {
        barbell: "Barre",
        dumbbell: "Haltères",
        machine: "Machine",
        cable: "Câble",
        bodyweight: "Poids du corps",
        other: "Autre",
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Dumbbell className="h-5 w-5" />
                    Bibliothèque d'exercices
                </h3>
                <button
                    onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90"
                >
                    <Plus className="h-4 w-4" />
                    Ajouter
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher..."
                    className="flex-1 min-w-[200px] px-3 py-2 border rounded-lg bg-background"
                />
                <select
                    value={muscleGroupFilter}
                    onChange={(e) => setMuscleGroupFilter(e.target.value)}
                    className="px-3 py-2 border rounded-lg bg-background"
                >
                    <option value="">Tous les muscles</option>
                    {categories?.muscleGroups.map((mg) => (
                        <option key={mg.id} value={mg.id}>
                            {mg.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Add Form Modal */}
            {showAddForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-card rounded-lg p-6 w-full max-w-md mx-4 shadow-xl">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-semibold">Nouvel exercice</h4>
                            <button onClick={() => setShowAddForm(false)} className="p-1 hover:bg-accent rounded">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Nom *</label>
                                <input
                                    type="text"
                                    value={newExercise.name}
                                    onChange={(e) => setNewExercise({ ...newExercise, name: e.target.value })}
                                    required
                                    placeholder="ex: Développé couché"
                                    className="w-full px-3 py-2 border rounded-lg bg-background"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Groupe musculaire</label>
                                    <select
                                        value={newExercise.muscleGroup}
                                        onChange={(e) => setNewExercise({ ...newExercise, muscleGroup: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg bg-background"
                                    >
                                        <option value="">(Auto-detect IA)</option>
                                        {categories?.muscleGroups.map((mg) => (
                                            <option key={mg.id} value={mg.id}>
                                                {mg.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-1">Équipement</label>
                                    <select
                                        value={newExercise.equipment}
                                        onChange={(e) => setNewExercise({ ...newExercise, equipment: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg bg-background"
                                    >
                                        <option value="">(Auto-detect IA)</option>
                                        {categories?.equipment.map((eq) => (
                                            <option key={eq.id} value={eq.id}>
                                                {eq.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Description</label>
                                <textarea
                                    value={newExercise.description}
                                    onChange={(e) => setNewExercise({ ...newExercise, description: e.target.value })}
                                    placeholder="Instructions, notes..."
                                    rows={3}
                                    className="w-full px-3 py-2 border rounded-lg bg-background resize-none"
                                />
                            </div>

                            <div className="flex gap-2 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setShowAddForm(false)}
                                    className="px-4 py-2 border rounded-lg hover:bg-accent"
                                >
                                    Annuler
                                </button>
                                <button
                                    type="submit"
                                    disabled={createExercise.isPending}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
                                >
                                    {createExercise.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Créer
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Exercise List */}
            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : !exercises || exercises.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <Dumbbell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Aucun exercice trouvé</p>
                    <p className="text-sm">Créez votre premier exercice !</p>
                </div>
            ) : (
                <div className="grid gap-2">
                    {exercises.map((exercise) => (
                        <div
                            key={exercise.id}
                            onClick={() => selectionMode && onSelectExercise?.({
                                id: exercise.id,
                                name: exercise.name,
                                muscleGroup: exercise.muscleGroup || "other",
                                equipment: exercise.equipment || "other",
                            })}
                            className={`flex items-center justify-between p-3 border rounded-lg bg-card ${selectionMode ? "cursor-pointer hover:bg-accent" : ""
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Dumbbell className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <p className="font-medium">{exercise.name}</p>
                                    <div className="flex gap-2 text-xs text-muted-foreground">
                                        <span className="px-1.5 py-0.5 bg-accent rounded">
                                            {muscleGroupLabels[exercise.muscleGroup || "other"] || exercise.muscleGroup}
                                        </span>
                                        <span className="px-1.5 py-0.5 bg-accent rounded">
                                            {equipmentLabels[exercise.equipment || "other"] || exercise.equipment}
                                        </span>
                                        {exercise.isGlobal && (
                                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Global</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {!exercise.isGlobal && !selectionMode && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(exercise.id);
                                    }}
                                    className="p-2 hover:bg-accent rounded text-muted-foreground hover:text-destructive"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
