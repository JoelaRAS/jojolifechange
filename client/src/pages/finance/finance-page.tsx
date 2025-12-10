import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";
import { cn, formatDate } from "../../lib/utils";

type FinanceTransaction = {
  id: string;
  type: "INCOME" | "EXPENSE" | "INVESTMENT" | "SAVINGS";
  category: string;
  amount: number;
  occurredAt: string;
  notes?: string | null;
};

type FinanceSummary = {
  totals: {
    income: number;
    expense: number;
    savings: number;
    investment: number;
  };
  byCategory: Record<string, number>;
};

const transactionSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "SAVINGS", "INVESTMENT"]),
  category: z.string().min(1),
  amount: z.coerce.number(),
  occurredAt: z.string(),
  notes: z.string().optional()
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

const colors = ["#6366f1", "#f97316", "#22c55e", "#facc15", "#ec4899", "#0ea5e9"];

export const FinancePage = () => {
  const queryClient = useQueryClient();
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: "EXPENSE",
      occurredAt: new Date().toISOString().split("T")[0]
    }
  });
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["finance", "summary"],
    queryFn: async () => {
      const { data } = await api.get<FinanceSummary>("/finance/summary");
      return data;
    }
  });

  const transactionsQuery = useQuery({
    queryKey: ["finance", "transactions"],
    queryFn: async () => {
      const start = new Date();
      start.setMonth(start.getMonth() - 2);
      const { data } = await api.get<FinanceTransaction[]>("/finance/transactions", {
        params: { start: start.toISOString().split("T")[0] }
      });
      return data;
    }
  });

  const addTransactionMutation = useMutation({
    mutationFn: async (payload: TransactionFormValues) => {
      await api.post("/finance/transactions", payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance", "transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["finance", "summary"] });
      setEditingTransactionId(null);
      form.reset({ type: "EXPENSE", occurredAt: new Date().toISOString().split("T")[0] });
    }
  });

  const updateTransactionMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: TransactionFormValues }) => {
      await api.patch(`/finance/transactions/${id}`, values);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance", "transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["finance", "summary"] });
      setEditingTransactionId(null);
      form.reset({ type: "EXPENSE", occurredAt: new Date().toISOString().split("T")[0] });
    }
  });

  const deleteTransactionMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/finance/transactions/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance", "transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["finance", "summary"] });
      if (editingTransactionId) {
        setEditingTransactionId(null);
        form.reset({ type: "EXPENSE", occurredAt: new Date().toISOString().split("T")[0] });
      }
    }
  });

  const isSaving = addTransactionMutation.isPending || updateTransactionMutation.isPending;

  const onSubmit = form.handleSubmit((values) => {
    if (editingTransactionId) {
      updateTransactionMutation.mutate({ id: editingTransactionId, values });
    } else {
      addTransactionMutation.mutate(values);
    }
  });

  const pieData = useMemo(() => {
    const summary = summaryQuery.data;
    if (!summary) return [];
    return Object.entries(summary.byCategory).map(([category, amount]) => ({ name: category, value: amount }));
  }, [summaryQuery.data]);

  const barData = useMemo(() => {
    return transactionsQuery.data?.map((tx) => ({
      date: formatDate(tx.occurredAt),
      amount: tx.amount,
      type: tx.type
    }));
  }, [transactionsQuery.data]);

  const summary = summaryQuery.data;

  const handleEditTransaction = (transaction: FinanceTransaction) => {
    setEditingTransactionId(transaction.id);
    form.reset({
      type: transaction.type,
      category: transaction.category,
      amount: transaction.amount,
      occurredAt: transaction.occurredAt.split("T")[0],
      notes: transaction.notes ?? ""
    });
  };

  const handleCancelEdit = () => {
    setEditingTransactionId(null);
    form.reset({ type: "EXPENSE", occurredAt: new Date().toISOString().split("T")[0] });
  };

  const handleDeleteTransaction = (id: string) => {
    deleteTransactionMutation.mutate(id);
  };

  return (
    <div className="space-y-8">
      <section className="grid gap-4 lg:gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Saisie rapide</CardTitle>
            <CardDescription>Consignez vos revenus, dépenses, épargne et investissements.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-4" onSubmit={onSubmit}>
              <div className="space-y-2 md:col-span-2">
                <Label>Type</Label>
                <select
                  className="w-full rounded-md border border-border bg-background/70 px-3 py-2 text-sm"
                  {...form.register("type")}
                >
                  <option value="INCOME">Revenu</option>
                  <option value="EXPENSE">Dépense</option>
                  <option value="SAVINGS">Épargne</option>
                  <option value="INVESTMENT">Investissement</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Montant</Label>
                <Input type="number" step="0.01" {...form.register("amount", { valueAsNumber: true })} />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" {...form.register("occurredAt")} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Catégorie</Label>
                <Input placeholder="Abonnement, Salaire..." {...form.register("category")} />
              </div>
              <div className="space-y-2 md:col-span-4">
                <Label>Notes</Label>
                <Textarea rows={2} {...form.register("notes")} placeholder="Détails complémentaires..." />
              </div>
              <div className="md:col-span-4 flex justify-end gap-2">
                {editingTransactionId && (
                  <Button type="button" variant="ghost" onClick={handleCancelEdit}>
                    Annuler
                  </Button>
                )}
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Enregistrement..." : editingTransactionId ? "Mettre à jour" : "Ajouter"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Résumé du mois</CardTitle>
            <CardDescription>Vue synthétique de votre cashflow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {summary ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <FinanceStat label="Revenus" amount={summary.totals.income} variant="positive" />
                  <FinanceStat label="Dépenses" amount={summary.totals.expense} variant="negative" />
                  <FinanceStat label="Épargne" amount={summary.totals.savings} />
                  <FinanceStat label="Investissement" amount={summary.totals.investment} />
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Solde</p>
                  <p className="text-lg font-semibold">
                    {(summary.totals.income - summary.totals.expense + summary.totals.savings).toFixed(2)} €
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune transaction pour le moment.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:gap-6 lg:grid-cols-2">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Répartition par catégorie</CardTitle>
            <CardDescription>Identifiez vos postes de dépenses prioritaires.</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={colors[index % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)} €`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Enregistrez quelques transactions pour alimenter cette vue.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Chronologie des mouvements</CardTitle>
            <CardDescription>Suivi des montants sur les dernières semaines.</CardDescription>
          </CardHeader>
          <CardContent>
            {barData && barData.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="amount" fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Saisissez des mouvements financiers pour lancer votre historique.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Dernières transactions</CardTitle>
            <CardDescription>Liste des opérations des deux derniers mois.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-card/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Catégorie</th>
                  <th className="px-3 py-2 text-left">Montant</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactionsQuery.data?.map((tx) => (
                  <tr key={tx.id} className="border-t border-border/70">
                    <td className="px-3 py-2">{formatDate(tx.occurredAt)}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">{translateType(tx.type)}</Badge>
                    </td>
                    <td className="px-3 py-2">{tx.category}</td>
                    <td className="px-3 py-2">{tx.amount.toFixed(2)} €</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{tx.notes ?? ""}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEditTransaction(tx)}>
                          Modifier
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => handleDeleteTransaction(tx.id)}
                          disabled={deleteTransactionMutation.isPending}
                        >
                          Supprimer
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!transactionsQuery.data?.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-sm text-muted-foreground">
                      Aucune transaction enregistrée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

const translateType = (type: FinanceTransaction["type"]) => {
  switch (type) {
    case "INCOME":
      return "Revenu";
    case "EXPENSE":
      return "Dépense";
    case "SAVINGS":
      return "Épargne";
    case "INVESTMENT":
      return "Investissement";
    default:
      return type;
  }
};

const FinanceStat = ({
  label,
  amount,
  variant
}: {
  label: string;
  amount: number;
  variant?: "positive" | "negative" | "neutral";
}) => (
  <div className={cn("rounded-md border border-border/60 bg-background/60 p-3", variant === "positive" ? "border-emerald-500/40" : variant === "negative" ? "border-rose-500/40" : "")}
  >
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-semibold">{amount.toFixed(2)} €</p>
  </div>
);
