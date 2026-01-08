import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../services/prisma";
import { geminiService } from "../../services/gemini";

const exercisesRouter = Router();
exercisesRouter.use(requireAuth);

// ==================== EXERCICES ====================

const exerciseSchema = z.object({
    name: z.string().min(1).max(100),
    muscleGroup: z.string().optional(),
    equipment: z.string().optional(),
    description: z.string().optional(),
});

// Liste tous les exercices (globaux + utilisateur)
exercisesRouter.get("/", async (req, res) => {
    const userId = req.userId!;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const muscleGroup = typeof req.query.muscleGroup === "string" ? req.query.muscleGroup : undefined;

    const exercises = await prisma.exercise.findMany({
        where: {
            OR: [
                { isGlobal: true },
                { userId },
            ],
            ...(muscleGroup ? { muscleGroup } : {}),
            ...(search ? {
                name: {
                    contains: search,
                    mode: "insensitive" as const,
                },
            } : {}),
        },
        orderBy: [
            { isGlobal: "desc" },
            { name: "asc" },
        ],
    });

    return res.json(exercises);
});

// Créer un exercice personnalisé
exercisesRouter.post("/", async (req, res) => {
    const userId = req.userId!;
    const parsed = exerciseSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
    }

    const { name, description } = parsed.data;
    let { muscleGroup, equipment } = parsed.data;

    // Si pas de catégorie fournie, utiliser Gemini pour catégoriser
    if (!muscleGroup || !equipment) {
        const category = await geminiService.categorizeExercise(name);
        muscleGroup = muscleGroup || category.muscleGroup;
        equipment = equipment || category.equipment;
    }

    try {
        const exercise = await prisma.exercise.create({
            data: {
                userId,
                name,
                muscleGroup,
                equipment,
                description,
                isGlobal: false,
            },
        });
        return res.status(201).json(exercise);
    } catch (error: unknown) {
        if ((error as { code?: string }).code === "P2002") {
            return res.status(409).json({ message: "Un exercice avec ce nom existe déjà" });
        }
        throw error;
    }
});

// Modifier un exercice
exercisesRouter.put("/:id", async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;
    const parsed = exerciseSchema.partial().safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
    }

    const existing = await prisma.exercise.findFirst({
        where: { id, userId, isGlobal: false },
    });
    if (!existing) {
        return res.status(404).json({ message: "Exercice non trouvé ou non modifiable" });
    }

    const exercise = await prisma.exercise.update({
        where: { id },
        data: parsed.data,
    });

    return res.json(exercise);
});

// Supprimer un exercice
exercisesRouter.delete("/:id", async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const existing = await prisma.exercise.findFirst({
        where: { id, userId, isGlobal: false },
    });
    if (!existing) {
        return res.status(404).json({ message: "Exercice non trouvé ou non supprimable" });
    }

    await prisma.exercise.delete({ where: { id } });
    return res.status(204).send();
});

// ==================== TEMPLATES PERSONNALISÉS ====================

const templateSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    focus: z.string().optional(),
    exercises: z.array(z.object({
        exerciseId: z.string().uuid().optional(),
        name: z.string().min(1), // Fallback si pas d'exerciseId
        sets: z.number().int().positive(),
        repsMin: z.number().int().nonnegative(),
        repsMax: z.number().int().nonnegative(),
        restSeconds: z.number().int().nonnegative(),
        ordering: z.number().int().nonnegative().optional(),
    })).min(1),
});

// Liste des templates (globaux + utilisateur)
exercisesRouter.get("/templates", async (req, res) => {
    const userId = req.userId!;

    const templates = await prisma.workoutTemplate.findMany({
        where: {
            OR: [
                { isGlobal: true },
                { userId },
            ],
        },
        include: {
            exercises: {
                orderBy: { ordering: "asc" },
                include: { exercise: true },
            },
        },
        orderBy: [
            { isGlobal: "desc" },
            { name: "asc" },
        ],
    });

    return res.json(templates);
});

// Créer un template personnalisé
exercisesRouter.post("/templates", async (req, res) => {
    const userId = req.userId!;
    const parsed = templateSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
    }

    const { name, description, focus, exercises } = parsed.data;

    try {
        const template = await prisma.workoutTemplate.create({
            data: {
                userId,
                name,
                description,
                focus,
                isGlobal: false,
                exercises: {
                    create: exercises.map((ex, index) => ({
                        exerciseId: ex.exerciseId,
                        name: ex.name,
                        sets: ex.sets,
                        repsMin: ex.repsMin,
                        repsMax: ex.repsMax,
                        restSeconds: ex.restSeconds,
                        ordering: ex.ordering ?? index,
                    })),
                },
            },
            include: {
                exercises: {
                    orderBy: { ordering: "asc" },
                    include: { exercise: true },
                },
            },
        });

        return res.status(201).json(template);
    } catch (error: unknown) {
        if ((error as { code?: string }).code === "P2002") {
            return res.status(409).json({ message: "Un template avec ce nom existe déjà" });
        }
        throw error;
    }
});

// Modifier un template
exercisesRouter.put("/templates/:id", async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;
    const parsed = templateSchema.partial().safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
    }

    const existing = await prisma.workoutTemplate.findFirst({
        where: { id, userId, isGlobal: false },
    });
    if (!existing) {
        return res.status(404).json({ message: "Template non trouvé ou non modifiable" });
    }

    const { name, description, focus, exercises } = parsed.data;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (focus !== undefined) updateData.focus = focus;

    if (exercises) {
        // Remplacer tous les exercices
        updateData.exercises = {
            deleteMany: {},
            create: exercises.map((ex, index) => ({
                exerciseId: ex.exerciseId,
                name: ex.name,
                sets: ex.sets,
                repsMin: ex.repsMin,
                repsMax: ex.repsMax,
                restSeconds: ex.restSeconds,
                ordering: ex.ordering ?? index,
            })),
        };
    }

    const template = await prisma.workoutTemplate.update({
        where: { id },
        data: updateData,
        include: {
            exercises: {
                orderBy: { ordering: "asc" },
                include: { exercise: true },
            },
        },
    });

    return res.json(template);
});

// Dupliquer un template (pour personnaliser un global)
exercisesRouter.post("/templates/:id/duplicate", async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;
    const { name } = req.body as { name?: string };

    const source = await prisma.workoutTemplate.findFirst({
        where: { id },
        include: { exercises: { orderBy: { ordering: "asc" } } },
    });

    if (!source) {
        return res.status(404).json({ message: "Template non trouvé" });
    }

    try {
        const duplicate = await prisma.workoutTemplate.create({
            data: {
                userId,
                name: name || `${source.name} (copie)`,
                description: source.description,
                focus: source.focus,
                isGlobal: false,
                exercises: {
                    create: source.exercises.map((ex) => ({
                        exerciseId: ex.exerciseId,
                        name: ex.name,
                        sets: ex.sets,
                        repsMin: ex.repsMin,
                        repsMax: ex.repsMax,
                        restSeconds: ex.restSeconds,
                        ordering: ex.ordering,
                    })),
                },
            },
            include: {
                exercises: {
                    orderBy: { ordering: "asc" },
                    include: { exercise: true },
                },
            },
        });

        return res.status(201).json(duplicate);
    } catch (error: unknown) {
        if ((error as { code?: string }).code === "P2002") {
            return res.status(409).json({ message: "Un template avec ce nom existe déjà" });
        }
        throw error;
    }
});

// Supprimer un template
exercisesRouter.delete("/templates/:id", async (req, res) => {
    const userId = req.userId!;
    const { id } = req.params;

    const existing = await prisma.workoutTemplate.findFirst({
        where: { id, userId, isGlobal: false },
    });
    if (!existing) {
        return res.status(404).json({ message: "Template non trouvé ou non supprimable" });
    }

    await prisma.workoutTemplate.delete({ where: { id } });
    return res.status(204).send();
});

// Liste des groupes musculaires et équipements disponibles
exercisesRouter.get("/categories", async (_req, res) => {
    return res.json({
        muscleGroups: [
            { id: "chest", label: "Pectoraux" },
            { id: "back", label: "Dos" },
            { id: "legs", label: "Jambes" },
            { id: "shoulders", label: "Épaules" },
            { id: "arms", label: "Bras" },
            { id: "core", label: "Abdominaux" },
            { id: "cardio", label: "Cardio" },
            { id: "other", label: "Autre" },
        ],
        equipment: [
            { id: "barbell", label: "Barre" },
            { id: "dumbbell", label: "Haltères" },
            { id: "machine", label: "Machine" },
            { id: "cable", label: "Câble/Poulie" },
            { id: "bodyweight", label: "Poids du corps" },
            { id: "other", label: "Autre" },
        ],
    });
});

/*
// Route de seed pour peupler la base (Admin only - à protéger idéalement)
exercisesRouter.post("/seed", async (req, res) => {
    const globalExercises = [
        // PECTORAUX (Chest)
        { name: "Développé couché barre", muscleGroup: "chest", equipment: "barbell" },
        { name: "Développé couché haltères", muscleGroup: "chest", equipment: "dumbbell" },
        { name: "Développé incliné barre", muscleGroup: "chest", equipment: "barbell" },
        { name: "Développé incliné haltères", muscleGroup: "chest", equipment: "dumbbell" },
        { name: "Développé décliné", muscleGroup: "chest", equipment: "barbell" },
        { name: "Pompes (Push-ups)", muscleGroup: "chest", equipment: "bodyweight" },
        { name: "Pompes diamant", muscleGroup: "chest", equipment: "bodyweight" },
        { name: "Ecartés couchés haltères", muscleGroup: "chest", equipment: "dumbbell" },
        { name: "Ecartés poulie vis-à-vis", muscleGroup: "chest", equipment: "cable" },
        { name: "Peck deck", muscleGroup: "chest", equipment: "machine" },
        { name: "Dips", muscleGroup: "chest", equipment: "bodyweight" },
        { name: "Pullover haltère", muscleGroup: "chest", equipment: "dumbbell" },

        // DOS (Back)
        { name: "Tractions pronation (Pull-ups)", muscleGroup: "back", equipment: "bodyweight" },
        { name: "Tractions supination (Chin-ups)", muscleGroup: "back", equipment: "bodyweight" },
        { name: "Tirage vertical poitrine (Lat pulldown)", muscleGroup: "back", equipment: "cable" },
        { name: "Tirage horizontal (Seated row)", muscleGroup: "back", equipment: "cable" },
        { name: "Rowing barre (Bent over row)", muscleGroup: "back", equipment: "barbell" },
        { name: "Rowing haltère unilatéral", muscleGroup: "back", equipment: "dumbbell" },
        { name: "Rowing T-Bar", muscleGroup: "back", equipment: "machine" },
        { name: "Soulevé de terre (Deadlift)", muscleGroup: "back", equipment: "barbell" },
        { name: "Extension lombaires", muscleGroup: "back", equipment: "bodyweight" },
        { name: "Pull over poulie haute", muscleGroup: "back", equipment: "cable" },

        // JAMBES (Legs)
        { name: "Squat barre", muscleGroup: "legs", equipment: "barbell" },
        { name: "Front Squat", muscleGroup: "legs", equipment: "barbell" },
        { name: "Presse à cuisses", muscleGroup: "legs", equipment: "machine" },
        { name: "Fentes haltères (Lunges)", muscleGroup: "legs", equipment: "dumbbell" },
        { name: "Fentes bulgares", muscleGroup: "legs", equipment: "dumbbell" },
        { name: "Leg Extension", muscleGroup: "legs", equipment: "machine" },
        { name: "Leg Curl allongé", muscleGroup: "legs", equipment: "machine" },
        { name: "Leg Curl assis", muscleGroup: "legs", equipment: "machine" },
        { name: "Soulevé de terre jambes tendues", muscleGroup: "legs", equipment: "barbell" },
        { name: "Hip Thrust", muscleGroup: "legs", equipment: "barbell" },
        { name: "Mollets debout", muscleGroup: "legs", equipment: "machine" },
        { name: "Mollets assis", muscleGroup: "legs", equipment: "machine" },
        { name: "Squat Goblet", muscleGroup: "legs", equipment: "dumbbell" },

        // EPAULES (Shoulders)
        { name: "Développé militaire barre (Overhead press)", muscleGroup: "shoulders", equipment: "barbell" },
        { name: "Développé épaules haltères", muscleGroup: "shoulders", equipment: "dumbbell" },
        { name: "Développé Arnold", muscleGroup: "shoulders", equipment: "dumbbell" },
        { name: "Elévations latérales", muscleGroup: "shoulders", equipment: "dumbbell" },
        { name: "Elévations frontales", muscleGroup: "shoulders", equipment: "dumbbell" },
        { name: "Oiseau (Rear delt fly)", muscleGroup: "shoulders", equipment: "dumbbell" },
        { name: "Face Pull", muscleGroup: "shoulders", equipment: "cable" },
        { name: "Shrugs (Trapèzes)", muscleGroup: "shoulders", equipment: "dumbbell" },
        { name: "Tirage menton", muscleGroup: "shoulders", equipment: "barbell" },

        // BRAS (Arms)
        { name: "Curl barre", muscleGroup: "arms", equipment: "barbell" },
        { name: "Curl haltères", muscleGroup: "arms", equipment: "dumbbell" },
        { name: "Curl marteau", muscleGroup: "arms", equipment: "dumbbell" },
        { name: "Curl pupitre (Larry Scott)", muscleGroup: "arms", equipment: "barbell" },
        { name: "Extension triceps poulie haute", muscleGroup: "arms", equipment: "cable" },
        { name: "Barre au front", muscleGroup: "arms", equipment: "barbell" },
        { name: "Extension triceps haltère nuque", muscleGroup: "arms", equipment: "dumbbell" },
        { name: "Kickback triceps", muscleGroup: "arms", equipment: "dumbbell" },
        { name: "Dips triceps (banc)", muscleGroup: "arms", equipment: "bodyweight" },

        // ABDOS (Core)
        { name: "Crunch", muscleGroup: "core", equipment: "bodyweight" },
        { name: "Relevé de jambes suspendu", muscleGroup: "core", equipment: "bodyweight" },
        { name: "Planche (Gainage)", muscleGroup: "core", equipment: "bodyweight" },
        { name: "Russian Twist", muscleGroup: "core", equipment: "bodyweight" },
        { name: "Roue abdominale", muscleGroup: "core", equipment: "other" },
        { name: "Woodchopper", muscleGroup: "core", equipment: "cable" },

        // CARDIO
        { name: "Course à pied", muscleGroup: "cardio", equipment: "other" },
        { name: "Vélo elliptique", muscleGroup: "cardio", equipment: "machine" },
        { name: "Rameur", muscleGroup: "cardio", equipment: "machine" },
        { name: "Corde à sauter", muscleGroup: "cardio", equipment: "other" },
        { name: "Burpees", muscleGroup: "cardio", equipment: "bodyweight" },
        { name: "Jumping Jacks", muscleGroup: "cardio", equipment: "bodyweight" },
        { name: "Mountain Climbers", muscleGroup: "cardio", equipment: "bodyweight" }
    ];

    let createdCount = 0;

    for (const ex of globalExercises) {
        // Vérifier si l'exercice existe déjà en tant qu'exercice global
        const existing = await prisma.exercise.findFirst({
            where: {
                name: ex.name,
                isGlobal: true,
                userId: null
            }
        });

        if (!existing) {
            await prisma.exercise.create({
                data: {
                    name: ex.name,
                    muscleGroup: ex.muscleGroup,
                    equipment: ex.equipment,
                    isGlobal: true,
                    userId: null,
                    description: "Exercice standard"
                }
            });
            createdCount++;
        }
    }

    return res.json({ message: "Seed completed", created: createdCount });
});
*/

export { exercisesRouter };
