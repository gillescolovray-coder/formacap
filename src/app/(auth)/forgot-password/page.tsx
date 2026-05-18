import Link from "next/link";
import { requestPasswordReset } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;
  const sent = params.sent === "1";

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Mot de passe oublié</CardTitle>
        <CardDescription>
          {sent
            ? "Vérifiez votre boîte mail."
            : "Saisissez votre email pour recevoir un lien de réinitialisation."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-900 p-3 text-cyan-800 dark:text-cyan-200">
              Si un compte existe avec cet email, un lien de
              réinitialisation a été envoyé. Pensez à vérifier vos
              <strong> spams</strong> si vous ne le voyez pas dans 2 minutes.
            </div>
          </div>
        ) : (
          <form
            action={requestPasswordReset}
            className="space-y-4"
            id="forgot-form"
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="vous@capnumerique.com"
              />
            </div>
            {params.error && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {params.error}
              </p>
            )}
            <Button type="submit" className="w-full">
              Envoyer le lien
            </Button>
          </form>
        )}
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-zinc-500">
          <Link
            href="/login"
            className="font-medium text-zinc-900 dark:text-zinc-100 underline"
          >
            ← Retour à la connexion
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
