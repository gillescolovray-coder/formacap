"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Page de réinitialisation du mot de passe.
 *
 * Accessible après avoir cliqué sur le lien envoyé par email (template
 * "Reset password" de Supabase). L'utilisateur est déjà authentifié à
 * ce stade (la session a été créée par /auth/confirm), il n'a plus
 * qu'à choisir un nouveau mot de passe.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });

    if (err) {
      setError(err.message);
      setSubmitting(false);
      return;
    }

    setDone(true);
    setSubmitting(false);
    setTimeout(() => router.push("/dashboard"), 1500);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white p-4">
        <div className="max-w-md w-full rounded-2xl bg-white border border-emerald-200 p-8 text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
          <h1 className="text-xl font-bold text-zinc-900">
            Mot de passe modifié
          </h1>
          <p className="text-sm text-zinc-600">
            Vous allez être redirigé vers votre tableau de bord…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white p-4">
      <div className="max-w-md w-full rounded-2xl bg-white border border-zinc-200 p-8 space-y-5">
        <header className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 rounded-full bg-cyan-100 items-center justify-center">
            <KeyRound className="h-6 w-6 text-cyan-700" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900">
            Choisissez un nouveau mot de passe
          </h1>
          <p className="text-sm text-zinc-600">
            Au moins 8 caractères. Évitez les mots de passe trop simples.
          </p>
        </header>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-bold uppercase tracking-wider text-zinc-700 mb-1"
            >
              Nouveau mot de passe
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                minLength={8}
                className="w-full h-10 pl-9 pr-3 rounded-md border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="confirm"
              className="block text-xs font-bold uppercase tracking-wider text-zinc-700 mb-1"
            >
              Confirmer le mot de passe
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                className="w-full h-10 pl-9 pr-3 rounded-md border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-11 rounded-md bg-cyan-600 text-white font-bold hover:bg-cyan-700 disabled:opacity-50"
          >
            {submitting ? "Enregistrement…" : "Enregistrer le mot de passe"}
          </button>
        </form>
      </div>
    </div>
  );
}
