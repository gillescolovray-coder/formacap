import Link from "next/link";
import { login } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Connexion</CardTitle>
        <CardDescription>Accédez à votre espace</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={login} className="space-y-4" id="login-form">
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Mot de passe</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
              >
                Mot de passe oublié ?
              </Link>
            </div>
            <PasswordInput
              id="password"
              name="password"
              required
              autoComplete="current-password"
            />
          </div>
          {params.message && (
            <p className="text-sm text-cyan-600 dark:text-cyan-400">
              {params.message}
            </p>
          )}
          {params.error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {params.error}
            </p>
          )}
          <Button type="submit" className="w-full">
            Se connecter
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-zinc-500">
          Pas encore de compte ?{" "}
          <Link href="/signup" className="font-medium text-zinc-900 dark:text-zinc-100 underline">
            Créer un compte
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
