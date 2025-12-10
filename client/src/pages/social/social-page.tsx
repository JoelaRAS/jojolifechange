import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import { formatDate } from "../../lib/utils";

type Contact = {
  id: string;
  name: string;
  relationship?: string | null;
  frequencyDays: number;
  lastContact?: string | null;
  status: "ACTIVE" | "COLD" | "GHOSTED";
  notes?: string | null;
  interactions: Array<{
    id: string;
    occurredAt: string;
    type?: string | null;
    notes?: string | null;
  }>;
};

type SocialOverview = {
  total: number;
  toReach: Array<{
    contact: Contact;
    nextContact: string;
    overdue: boolean;
    daysUntil: number;
  }>;
};

const contactSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().optional(),
  frequencyDays: z.coerce.number().positive().default(30),
  notes: z.string().optional()
});

const interactionSchema = z.object({
  occurredAt: z.string(),
  type: z.string().optional(),
  notes: z.string().optional()
});

type ContactFormValues = z.infer<typeof contactSchema>;
type InteractionFormValues = z.infer<typeof interactionSchema>;

export const SocialPage = () => {
  const queryClient = useQueryClient();
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

  const contactForm = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { frequencyDays: 30 }
  });

  const interactionForm = useForm<InteractionFormValues>({
    resolver: zodResolver(interactionSchema),
    defaultValues: {
      occurredAt: new Date().toISOString().split("T")[0]
    }
  });

  const contactsQuery = useQuery({
    queryKey: ["social", "contacts"],
    queryFn: async () => {
      const { data } = await api.get<Contact[]>("/social/contacts");
      return data;
    }
  });

  const overviewQuery = useQuery({
    queryKey: ["social", "overview"],
    queryFn: async () => {
      const { data } = await api.get<SocialOverview>("/social/overview");
      return data;
    }
  });

  const addContactMutation = useMutation({
    mutationFn: async (values: ContactFormValues) => {
      await api.post("/social/contacts", values);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["social", "contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["social", "overview"] });
      setEditingContactId(null);
      contactForm.reset({ frequencyDays: 30 });
    }
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ContactFormValues }) => {
      await api.put(`/social/contacts/${id}`, values);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["social", "contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["social", "overview"] });
      setEditingContactId(null);
      contactForm.reset({ frequencyDays: 30 });
    }
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/social/contacts/${id}`);
    },
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ["social", "contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["social", "overview"] });
      if (selectedContactId === id) {
        setSelectedContactId(null);
      }
      setEditingContactId(null);
    }
  });

  const addInteractionMutation = useMutation({
    mutationFn: async ({ contactId, values }: { contactId: string; values: InteractionFormValues }) => {
      await api.post(`/social/contacts/${contactId}/interactions`, values);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["social", "contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["social", "overview"] });
      interactionForm.reset({ occurredAt: new Date().toISOString().split("T")[0] });
    }
  });

  const deleteInteractionMutation = useMutation({
    mutationFn: async ({ contactId, interactionId }: { contactId: string; interactionId: string }) => {
      await api.delete(`/social/contacts/${contactId}/interactions/${interactionId}`);
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["social", "contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["social", "overview"] });
      queryClient.setQueryData<Contact[] | undefined>(["social", "contacts"], (previous) => {
        if (!previous) return previous;
        return previous.map((contact) =>
          contact.id === variables.contactId
            ? {
                ...contact,
                interactions: contact.interactions.filter((interaction) => interaction.id !== variables.interactionId)
              }
            : contact
        );
      });
    }
  });

  const onContactSubmit = contactForm.handleSubmit((values) => {
    if (editingContactId) {
      updateContactMutation.mutate({ id: editingContactId, values });
    } else {
      addContactMutation.mutate(values);
    }
  });

  const isSavingContact = addContactMutation.isPending || updateContactMutation.isPending;

  const onInteractionSubmit = interactionForm.handleSubmit((values) => {
    if (!selectedContactId) return;
    addInteractionMutation.mutate({ contactId: selectedContactId, values });
  });

  const handleEditContact = (contact: Contact) => {
    setEditingContactId(contact.id);
    contactForm.reset({
      name: contact.name,
      relationship: contact.relationship ?? "",
      frequencyDays: contact.frequencyDays,
      notes: contact.notes ?? ""
    });
  };

  const handleCancelEdit = () => {
    setEditingContactId(null);
    contactForm.reset({ frequencyDays: 30 });
  };

  const handleDeleteContact = (id: string) => {
    deleteContactMutation.mutate(id);
    if (selectedContactId === id) {
      setSelectedContactId(null);
    }
  };

  const handleDeleteInteraction = (contactId: string, interactionId: string) => {
    deleteInteractionMutation.mutate({ contactId, interactionId });
  };

  useEffect(() => {
    if (!selectedContactId) return;
    if (contactsQuery.data === undefined) return;
    const stillExists = contactsQuery.data.some((contact) => contact.id === selectedContactId);
    if (!stillExists) {
      setSelectedContactId(null);
    }
  }, [contactsQuery.data, selectedContactId]);

  useEffect(() => {
    interactionForm.reset({
      occurredAt: new Date().toISOString().split("T")[0],
      type: "",
      notes: ""
    });
  }, [interactionForm, selectedContactId]);

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
            <CardDescription>Gestion des relations et rappels de prise de nouvelles.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="grid gap-3 md:grid-cols-4" onSubmit={onContactSubmit}>
              <div className="space-y-2 md:col-span-2">
                <Label>Nom</Label>
                <Input placeholder="Nom et prénom" {...contactForm.register("name")} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Relation</Label>
                <Input placeholder="Famille, ami, client..." {...contactForm.register("relationship")} />
              </div>
              <div className="space-y-2">
                <Label>Fréquence (jours)</Label>
                <Input type="number" {...contactForm.register("frequencyDays", { valueAsNumber: true })} />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>Notes</Label>
                <Textarea rows={2} {...contactForm.register("notes")} placeholder="Contexte, passion, anniversaire..." />
              </div>
              <div className="md:col-span-4 flex justify-end gap-2">
                {editingContactId && (
                  <Button type="button" variant="ghost" onClick={handleCancelEdit}>
                    Annuler
                  </Button>
                )}
                <Button type="submit" disabled={isSavingContact}>
                  {isSavingContact
                    ? "Enregistrement..."
                    : editingContactId
                    ? "Mettre à jour"
                    : "Ajouter le contact"}
                </Button>
              </div>
            </form>

            <div className="space-y-3">
              {contactsQuery.data?.map((contact) => {
                const isSelected = selectedContactId === contact.id;
                return (
                  <div
                    key={contact.id}
                    className={`rounded-lg border border-border/70 bg-background/60 p-4 transition-shadow ${
                      isSelected ? "border-primary/70 shadow-md shadow-primary/10" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{contact.name}</p>
                        <p className="text-xs text-muted-foreground">{contact.relationship ?? "—"}</p>
                      </div>
                      <Badge variant="outline">{mapStatus(contact.status)}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>Fréquence : {contact.frequencyDays}j</span>
                      <span>Dernier contact : {contact.lastContact ? formatDate(contact.lastContact) : "Jamais"}</span>
                    </div>
                    {contact.notes && <p className="mt-2 text-xs text-muted-foreground">{contact.notes}</p>}
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {contact.interactions.slice(0, 3).map((interaction) => (
                        <div key={interaction.id} className="flex items-center justify-between rounded border border-secondary/30 bg-secondary/20 px-2 py-1">
                          <span>
                            {formatDate(interaction.occurredAt)} — {interaction.type ?? "Interaction"}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => handleDeleteInteraction(contact.id, interaction.id)}
                            disabled={deleteInteractionMutation.isPending}
                          >
                            Supprimer
                          </Button>
                        </div>
                      ))}
                      {contact.interactions.length > 3 && <span>... ({contact.interactions.length - 3} autres)</span>}
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => handleEditContact(contact)}>
                        Modifier
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleDeleteContact(contact.id)}
                        disabled={deleteContactMutation.isPending}
                      >
                        Supprimer
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={isSelected ? "default" : "secondary"}
                        onClick={() => setSelectedContactId(isSelected ? null : contact.id)}
                      >
                        {isSelected ? "Fermer" : "Consigner un échange"}
                      </Button>
                    </div>
                    {isSelected && (
                      <div className="mt-4 rounded-md border border-primary/40 bg-primary/5 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Nouvelle interaction</p>
                        <form className="mt-3 grid gap-3 md:grid-cols-4" onSubmit={onInteractionSubmit}>
                          <div className="space-y-2">
                            <Label>Date</Label>
                            <Input type="date" {...interactionForm.register("occurredAt")} />
                          </div>
                          <div className="space-y-2 md:col-span-3">
                            <Label>Type</Label>
                            <Input placeholder="Appel, café, message..." {...interactionForm.register("type")} />
                          </div>
                          <div className="space-y-2 md:col-span-4">
                            <Label>Notes</Label>
                          <Textarea rows={2} {...interactionForm.register("notes")} placeholder="Contenu de l’échange, actions à suivre..." />
                          </div>
                          <div className="md:col-span-4 flex justify-between">
                            <Button type="button" variant="ghost" onClick={() => setSelectedContactId(null)}>
                              Annuler
                            </Button>
                            <Button type="submit" disabled={addInteractionMutation.isPending}>
                              {addInteractionMutation.isPending ? "Enregistrement..." : "Ajouter l’interaction"}
                            </Button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                );
              })}
              {!contactsQuery.data?.length && <p className="text-sm text-muted-foreground">Ajoutez vos proches pour planifier vos follow-ups.</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>À recontacter</CardTitle>
            <CardDescription>Priorisez les relances de la semaine.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {overviewQuery.data?.toReach.length ? (
              overviewQuery.data.toReach.map(({ contact, nextContact, overdue, daysUntil }) => (
                <div key={contact.id} className="rounded-md border border-border/70 bg-background/60 p-3">
                  <p className="font-medium">{contact.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Rappel le {formatDate(nextContact)} {overdue ? "(en retard)" : daysUntil >= 0 ? `dans ${daysUntil}j` : ""}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Aucune relance urgente. Continuez d’entretenir votre réseau !</p>
            )}
          </CardContent>
        </Card>
      </section>

    </div>
  );
};

const mapStatus = (status: Contact["status"]) => {
  switch (status) {
    case "ACTIVE":
      return "Actif";
    case "COLD":
      return "À réchauffer";
    case "GHOSTED":
      return "Distancé";
    default:
      return status;
  }
};
