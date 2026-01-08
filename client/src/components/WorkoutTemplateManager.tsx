import { useState } from "react";
import { Plus, X, Loader2, Copy, Trash2, GripVertical, ChevronDown, ChevronUp } from "lucide-react";
import { useWorkoutTemplates, useCreateTemplate, useDuplicateTemplate, useDeleteTemplate, useExercises } from "../lib/api/exercises";
import { ExerciseCombobox } from "./ExerciseCombobox";

interface TemplateExercise {
    name: string;
    exerciseId?: string;
    sets: number;
    repsMin: number;
    repsMax: number;
    restSeconds: number;
}

interface WorkoutTemplateManagerProps {
    onTemplateSelect?: (templateId: string) => void;
}

export function WorkoutTemplateManager({ onTemplateSelect }: WorkoutTemplateManagerProps) {
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);

    const { data: templates, isLoading } = useWorkoutTemplates();
    const { data: exercises } = useExercises({});
    const createTemplate = useCreateTemplate();
    const duplicateTemplate = useDuplicateTemplate();
    const deleteTemplate = useDeleteTemplate();

    const [newTemplate, setNewTemplate] = useState({
        name: "",
        description: "",
        focus: "full",
        exercises: [] as TemplateExercise[],
    });

    const focusOptions = [
        { id: "upper", label: "Haut du corps" },
        { id: "lower", label: "Bas du corps" },
        { id: "push", label: "Push" },
        { id: "pull", label: "Pull" },
        { id: "full", label: "Full body" },
        { id: "cardio", label: "Cardio" },
    ];

    const handleAddExercise = () => {
        setNewTemplate((prev) => ({
            ...prev,
            exercises: [
                ...prev.exercises,
                { name: "", sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90 },
            ],
        }));
    };

    const handleRemoveExercise = (index: number) => {
        setNewTemplate((prev) => ({
            ...prev,
            exercises: prev.exercises.filter((_, i) => i !== index),
        }));
    };

    const handleExerciseChange = (index: number, field: keyof TemplateExercise, value: string | number) => {
        setNewTemplate((prev) => {
            const updated = [...prev.exercises];
            updated[index] = { ...updated[index], [field]: value };

            // Si on sélectionne un exercice existant, mettre aussi le nom
            if (field === "exerciseId" && exercises) {
                const exercise = exercises.find((e) => e.id === value);
                if (exercise) {
                    updated[index].name = exercise.name;
                }
            }

            return { ...prev, exercises: updated };
        });
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTemplate.name || newTemplate.exercises.length === 0) {
            alert("Nom et au moins un exercice requis");
            return;
        }

        try {
            await createTemplate.mutateAsync({
                name: newTemplate.name,
                description: newTemplate.description || undefined,
                focus: newTemplate.focus,
                exercises: newTemplate.exercises.map((ex, i) => ({
                    ...ex,
                    ordering: i,
                })),
            });
            setNewTemplate({ name: "", description: "", focus: "full", exercises: [] });
            setShowCreateForm(false);
        } catch (error) {
            console.error("Error creating template:", error);
        }
    };

    const handleDuplicate = async (id: string) => {
        try {
            await duplicateTemplate.mutateAsync({ id });
        } catch (error) {
            console.error("Error duplicating template:", error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Supprimer ce template ?")) return;
        try {
            await deleteTemplate.mutateAsync(id);
        } catch (error) {
            console.error("Error deleting template:", error);
        }
    };

    const userTemplates = templates?.filter((t) => !t.isGlobal) || [];
    const globalTemplates = templates?.filter((t) => t.isGlobal) || [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Mes programmes d'entraînement</h3>
                    <p className="text-sm text-muted-foreground">Créez vos propres séances personnalisées</p>
                </div>
                <button
                    onClick={() => setShowCreateForm(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
                >
                    <Plus className="h-4 w-4" />
                    Nouveau programme
                </button>
            </div>

            {/* Create Form Modal */}
            {showCreateForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-card rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
                        <div className="sticky top-0 bg-card border-b p-4 flex items-center justify-between">
                            <h4 className="font-semibold text-lg">Créer un programme</h4>
                            <button onClick={() => setShowCreateForm(false)} className="p-1 hover:bg-accent rounded">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreate} className="p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Nom du programme *</label>
                                    <input
                                        type="text"
                                        value={newTemplate.name}
                                        onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                                        required
                                        placeholder="ex: Push Day, Jambes, Full Body..."
                                        className="w-full px-3 py-2 border rounded-lg bg-background"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Focus</label>
                                    <select
                                        value={newTemplate.focus}
                                        onChange={(e) => setNewTemplate({ ...newTemplate, focus: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg bg-background"
                                    >
                                        {focusOptions.map((opt) => (
                                            <option key={opt.id} value={opt.id}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Description</label>
                                <textarea
                                    value={newTemplate.description}
                                    onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                                    placeholder="Notes, objectifs..."
                                    rows={2}
                                    className="w-full px-3 py-2 border rounded-lg bg-background resize-none"
                                />
                            </div>

                            {/* Exercises */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium">Exercices *</label>
                                    <button
                                        type="button"
                                        onClick={handleAddExercise}
                                        className="flex items-center gap-1 px-3 py-1 text-sm bg-secondary rounded-lg hover:opacity-90"
                                    >
                                        <Plus className="h-3 w-3" />
                                        Ajouter
                                    </button>
                                </div>

                                {newTemplate.exercises.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                                        Aucun exercice. Cliquez sur "Ajouter" pour commencer.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {newTemplate.exercises.map((exercise, index) => (
                                            <div key={index} className="border rounded-lg p-3 bg-background/50">
                                                <div className="flex items-start gap-2">
                                                    <GripVertical className="h-5 w-5 text-muted-foreground mt-2 cursor-grab" />

                                                    <div className="flex-1 grid gap-3 sm:grid-cols-6">
                                                        <div className="sm:col-span-2">
                                                            <label className="text-xs text-muted-foreground">Exercice</label>
                                                            {/* Utilisation du Combobox intelligent */}
                                                            <ExerciseCombobox
                                                                exercises={exercises || []}
                                                                value={exercise.name}
                                                                onChange={(val, id) => {
                                                                    handleExerciseChange(index, "name", val);
                                                                    if (id) {
                                                                        handleExerciseChange(index, "exerciseId", id);
                                                                    } else {
                                                                        handleExerciseChange(index, "exerciseId", "");
                                                                    }
                                                                }}
                                                                placeholder="Rechercher un exercice..."
                                                            />
                                                            {!exercise.exerciseId && (
                                                                <input
                                                                    type="text"
                                                                    value={exercise.name}
                                                                    onChange={(e) => handleExerciseChange(index, "name", e.target.value)}
                                                                    placeholder="Nom personnalisé"
                                                                    className="w-full px-2 py-1.5 border rounded bg-background text-sm mt-1"
                                                                />
                                                            )}
                                                        </div>

                                                        <div>
                                                            <label className="text-xs text-muted-foreground">Séries</label>
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                value={exercise.sets}
                                                                onChange={(e) => handleExerciseChange(index, "sets", Number(e.target.value))}
                                                                className="w-full px-2 py-1.5 border rounded bg-background text-sm"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="text-xs text-muted-foreground">Reps min</label>
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                value={exercise.repsMin}
                                                                onChange={(e) => handleExerciseChange(index, "repsMin", Number(e.target.value))}
                                                                className="w-full px-2 py-1.5 border rounded bg-background text-sm"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="text-xs text-muted-foreground">Reps max</label>
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                value={exercise.repsMax}
                                                                onChange={(e) => handleExerciseChange(index, "repsMax", Number(e.target.value))}
                                                                className="w-full px-2 py-1.5 border rounded bg-background text-sm"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="text-xs text-muted-foreground">Repos (s)</label>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step={15}
                                                                value={exercise.restSeconds}
                                                                onChange={(e) => handleExerciseChange(index, "restSeconds", Number(e.target.value))}
                                                                className="w-full px-2 py-1.5 border rounded bg-background text-sm"
                                                            />
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveExercise(index)}
                                                        className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2 justify-end pt-4 border-t">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateForm(false)}
                                    className="px-4 py-2 border rounded-lg hover:bg-accent"
                                >
                                    Annuler
                                </button>
                                <button
                                    type="submit"
                                    disabled={createTemplate.isPending || !newTemplate.name || newTemplate.exercises.length === 0}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
                                >
                                    {createTemplate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Créer le programme
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* User Templates */}
            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="space-y-4">
                    {/* User's custom templates */}
                    {userTemplates.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-muted-foreground">Mes programmes personnalisés</h4>
                            {userTemplates.map((template) => (
                                <TemplateCard
                                    key={template.id}
                                    template={template}
                                    isExpanded={expandedTemplateId === template.id}
                                    onToggle={() => setExpandedTemplateId(expandedTemplateId === template.id ? null : template.id)}
                                    onSelect={() => onTemplateSelect?.(template.id)}
                                    onDuplicate={() => handleDuplicate(template.id)}
                                    onDelete={() => handleDelete(template.id)}
                                    canDelete
                                />
                            ))}
                        </div>
                    )}

                    {/* Global templates */}
                    {globalTemplates.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-muted-foreground">Programmes globaux (Lucas Gouiffes)</h4>
                            {globalTemplates.map((template) => (
                                <TemplateCard
                                    key={template.id}
                                    template={template}
                                    isExpanded={expandedTemplateId === template.id}
                                    onToggle={() => setExpandedTemplateId(expandedTemplateId === template.id ? null : template.id)}
                                    onSelect={() => onTemplateSelect?.(template.id)}
                                    onDuplicate={() => handleDuplicate(template.id)}
                                    canDelete={false}
                                />
                            ))}
                        </div>
                    )}

                    {userTemplates.length === 0 && globalTemplates.length === 0 && (
                        <p className="text-center py-8 text-muted-foreground">
                            Aucun programme. Créez votre premier programme d'entraînement !
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

interface TemplateCardProps {
    template: {
        id: string;
        name: string;
        description?: string | null;
        focus?: string | null;
        isGlobal?: boolean;
        exercises: Array<{
            id: string;
            name: string;
            sets: number;
            repsMin: number;
            repsMax: number;
            restSeconds: number;
        }>;
    };
    isExpanded: boolean;
    onToggle: () => void;
    onSelect?: () => void;
    onDuplicate: () => void;
    onDelete?: () => void;
    canDelete?: boolean;
}

function TemplateCard({ template, isExpanded, onToggle, onSelect, onDuplicate, onDelete, canDelete }: TemplateCardProps) {
    const focusLabels: Record<string, string> = {
        upper: "Haut",
        lower: "Bas",
        push: "Push",
        pull: "Pull",
        full: "Full",
        cardio: "Cardio",
    };

    return (
        <div className="border rounded-lg bg-card overflow-hidden">
            <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/50"
                onClick={onToggle}
            >
                <div className="flex items-center gap-3">
                    <div>
                        <p className="font-medium">{template.name}</p>
                        <div className="flex gap-2 mt-1">
                            <span className="text-xs px-2 py-0.5 bg-secondary rounded">
                                {focusLabels[template.focus || "full"] || template.focus}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {template.exercises.length} exercices
                            </span>
                            {template.isGlobal && (
                                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">Global</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDuplicate();
                        }}
                        className="p-2 hover:bg-accent rounded text-muted-foreground"
                        title="Dupliquer"
                    >
                        <Copy className="h-4 w-4" />
                    </button>
                    {canDelete && onDelete && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                            }}
                            className="p-2 hover:bg-accent rounded text-muted-foreground hover:text-destructive"
                            title="Supprimer"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    )}
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
            </div>

            {isExpanded && (
                <div className="border-t p-3 bg-background/50">
                    {template.description && (
                        <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
                    )}
                    <ul className="space-y-1 text-sm">
                        {template.exercises.map((exercise) => (
                            <li key={exercise.id} className="flex justify-between">
                                <span>{exercise.name}</span>
                                <span className="text-muted-foreground">
                                    {exercise.sets} x {exercise.repsMin}-{exercise.repsMax} ({Math.round(exercise.restSeconds / 60)}min repos)
                                </span>
                            </li>
                        ))}
                    </ul>
                    {onSelect && (
                        <button
                            onClick={onSelect}
                            className="mt-3 w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90"
                        >
                            Utiliser ce programme
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
