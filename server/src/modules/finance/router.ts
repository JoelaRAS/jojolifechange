import { Router } from "express";
import { FinanceType } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../services/prisma";

const financeRouter = Router();

financeRouter.use(requireAuth);

const transactionSchema = z.object({
  type: z.nativeEnum(FinanceType),
  category: z.string().min(1),
  amount: z.number(),
  occurredAt: z.coerce.date(),
  notes: z.string().optional()
});

const querySchema = z.object({
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
  type: z.nativeEnum(FinanceType).optional()
});

financeRouter.post("/transactions", async (req, res) => {
  const userId = req.userId!;
  const parsed = transactionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const transaction = await prisma.financeTransaction.create({
    data: {
      userId,
      ...parsed.data
    }
  });

  return res.status(201).json(transaction);
});

financeRouter.get("/transactions", async (req, res) => {
  const userId = req.userId!;
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const { start, end, type } = parsed.data;
  const transactions = await prisma.financeTransaction.findMany({
    where: {
      userId,
      type,
      occurredAt: {
        gte: start,
        lte: end
      }
    },
    orderBy: { occurredAt: "desc" }
  });

  return res.json(transactions);
});

financeRouter.get("/summary", async (req, res) => {
  const userId = req.userId!;
  const schema = z.object({ month: z.coerce.date().optional() });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const month = parsed.data.month ? new Date(parsed.data.month) : new Date();
  const start = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0, 23, 59, 59));

  const transactions = await prisma.financeTransaction.findMany({
    where: {
      userId,
      occurredAt: {
        gte: start,
        lte: end
      }
    }
  });

  const totals = transactions.reduce(
    (acc, tx) => {
      if (tx.type === "INCOME") acc.income += tx.amount;
      if (tx.type === "EXPENSE") acc.expense += tx.amount;
      if (tx.type === "SAVINGS") acc.savings += tx.amount;
      if (tx.type === "INVESTMENT") acc.investment += tx.amount;
      return acc;
    },
    { income: 0, expense: 0, savings: 0, investment: 0 }
  );

  const byCategory = transactions.reduce<Record<string, number>>((acc, tx) => {
    acc[tx.category] = (acc[tx.category] ?? 0) + tx.amount;
    return acc;
  }, {});

  return res.json({ totals, byCategory });
});

financeRouter.patch("/transactions/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  const parsed = transactionSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const transaction = await prisma.financeTransaction.findFirst({ where: { id, userId } });
  if (!transaction) {
    return res.status(404).json({ message: "Transaction not found" });
  }

  const updated = await prisma.financeTransaction.update({
    where: { id },
    data: parsed.data
  });

  return res.json(updated);
});

financeRouter.delete("/transactions/:id", async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const transaction = await prisma.financeTransaction.findFirst({ where: { id, userId } });
  if (!transaction) {
    return res.status(404).json({ message: "Transaction not found" });
  }

  await prisma.financeTransaction.delete({ where: { id } });
  return res.status(204).send();
});

export { financeRouter };
