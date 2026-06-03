import { Clock } from "lucide-react";

export default function StubSessionsPage() {
  return (
    <div className="rounded-2xl bg-white border border-zinc-200 p-8 text-center">
      <Clock className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
      <p className="text-sm text-zinc-600">
        La liste de vos formations sera bientôt disponible ici.
      </p>
    </div>
  );
}
