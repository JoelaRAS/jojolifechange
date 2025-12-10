import { Router } from "express";
import { ContactStatus } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../services/prisma";

const socialRouter = Router();

socialRouter.use(requireAuth);

const contactSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().optional(),
  frequencyDays: z.number().int().positive().default(30),
  status: z.nativeEnum(ContactStatus).optional(),
  notes: z.string().optional()
});

const interactionSchema = z.object({
  occurredAt: z.coerce.date().optional(),
  type: z.string().optional(),
  notes: z.string().optional()
});

socialRouter.get("/contacts", async (req, res) => {
  const userId = req.userId!;
  const contacts = await prisma.contact.findMany({
    where: { userId },
    include: {
      interactions: {
        orderBy: { occurredAt: "desc" }
      }
    },
    orderBy: { name: "asc" }
  });

  return res.json(contacts);
});

socialRouter.post("/contacts", async (req, res) => {
  const userId = req.userId!;
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const contact = await prisma.contact.create({
    data: {
      userId,
      ...parsed.data
    }
  });

  return res.status(201).json(contact);
});

socialRouter.put("/contacts/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  const parsed = contactSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const contact = await prisma.contact.findFirst({ where: { id, userId } });
  if (!contact) {
    return res.status(404).json({ message: "Contact not found" });
  }

  const updated = await prisma.contact.update({
    where: { id },
    data: parsed.data
  });

  return res.json(updated);
});

socialRouter.post("/contacts/:id/interactions", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const contact = await prisma.contact.findFirst({ where: { id, userId } });
  if (!contact) {
    return res.status(404).json({ message: "Contact not found" });
  }

  const parsed = interactionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const interaction = await prisma.contactInteraction.create({
    data: {
      contactId: id,
      occurredAt: parsed.data.occurredAt ?? new Date(),
      type: parsed.data.type,
      notes: parsed.data.notes
    }
  });

  await prisma.contact.update({
    where: { id },
    data: {
      lastContact: interaction.occurredAt
    }
  });

  return res.status(201).json(interaction);
});

socialRouter.get("/overview", async (req, res) => {
  const userId = req.userId!;
  const contacts = await prisma.contact.findMany({ where: { userId } });
  const today = new Date();

  const toReach = contacts
    .map((contact) => {
      if (!contact.frequencyDays) return null;
      const last = contact.lastContact ?? new Date(0);
      const next = new Date(last);
      next.setDate(last.getDate() + contact.frequencyDays);
      const overdue = next < today;
      const daysUntil = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return {
        contact,
        nextContact: next,
        overdue,
        daysUntil
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a!.nextContact.getTime() - b!.nextContact.getTime()))
    .slice(0, 10);

  return res.json({
    total: contacts.length,
    toReach: toReach as Array<{
      contact: typeof contacts[number];
      nextContact: Date;
      overdue: boolean;
      daysUntil: number;
    }>
  });
});

socialRouter.delete("/contacts/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const contact = await prisma.contact.findFirst({ where: { id, userId } });
  if (!contact) {
    return res.status(404).json({ message: "Contact not found" });
  }

  await prisma.contact.delete({ where: { id } });
  return res.status(204).send();
});

socialRouter.delete("/contacts/:id/interactions/:interactionId", async (req, res) => {
  const userId = req.userId!;
  const { id, interactionId } = req.params;

  const interaction = await prisma.contactInteraction.findFirst({
    where: {
      id: interactionId,
      contact: {
        id,
        userId
      }
    }
  });

  if (!interaction) {
    return res.status(404).json({ message: "Interaction not found" });
  }

  await prisma.contactInteraction.delete({ where: { id: interactionId } });
  return res.status(204).send();
});

export { socialRouter };
