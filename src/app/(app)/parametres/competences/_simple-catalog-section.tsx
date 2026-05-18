import { Plus, Trash2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type CatalogItem = {
  id: string;
  name: string;
  position: number;
  is_active: boolean;
};

type Props<T extends CatalogItem> = {
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  items: T[];
  addAction: (formData: FormData) => void | Promise<void>;
  updateAction: (
    id: string,
    formData: FormData,
  ) => void | Promise<void>;
  deleteAction: (id: string) => void | Promise<void>;
  placeholder?: string;
};

export function SimpleCatalogSection<T extends CatalogItem>({
  title,
  description,
  icon: Icon,
  accent,
  items,
  addAction,
  updateAction,
  deleteAction,
  placeholder,
}: Props<T>) {
  return (
    <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center",
            accent,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          {items.map((it) => {
            const update = updateAction.bind(null, it.id);
            const remove = deleteAction.bind(null, it.id);
            return (
              <li
                key={it.id}
                className="px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50"
              >
                <form action={update} className="space-y-2">
                  <div className="grid gap-3 md:grid-cols-[3fr_auto_auto_auto] items-end">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-slate-500">
                        Nom
                      </Label>
                      <Input
                        name="name"
                        defaultValue={it.name}
                        required
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-slate-500">
                        Ordre
                      </Label>
                      <Input
                        name="position"
                        type="number"
                        defaultValue={it.position}
                        className="h-8 w-20 text-sm"
                      />
                    </div>
                    <label className="flex items-center gap-1 text-xs cursor-pointer pb-1.5">
                      <input
                        type="checkbox"
                        name="is_active"
                        defaultChecked={it.is_active}
                        className="h-4 w-4 rounded border-slate-300 text-cyan-600"
                      />
                      Actif
                    </label>
                    <Button type="submit" size="sm" variant="outline">
                      Enregistrer
                    </Button>
                  </div>
                </form>
                <form action={remove} className="mt-1 flex justify-end">
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Supprimer
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-500 italic">
          Aucun élément. Ajoutez-en ci-dessous.
        </p>
      )}

      <form
        action={addAction}
        className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-[3fr_auto_auto] items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Nom</Label>
            <Input name="name" required placeholder={placeholder} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ordre</Label>
            <Input
              name="position"
              type="number"
              defaultValue={items.length * 10 + 10}
              className="w-20"
            />
          </div>
          <Button type="submit">
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        </div>
      </form>
    </section>
  );
}
