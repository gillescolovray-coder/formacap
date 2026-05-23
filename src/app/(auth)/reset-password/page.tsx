import { updatePassword } from "../actions";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Nouveau mot de passe</CardTitle>
        <CardDescription>
          Choisissez un nouveau mot de passe (au moins 6 caractères).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={updatePassword} className="space-y-4" id="reset-form">
          <div className="space-y-2">
            <Label htmlFor="password">Nouveau mot de passe</Label>
            <PasswordInput
              id="password"
              name="password"
              required
              autoComplete="new-password"
              minLength={6}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password_confirm">Confirmation</Label>
            <PasswordInput
              id="password_confirm"
              name="password_confirm"
              required
              autoComplete="new-password"
              minLength={6}
            />
          </div>
          {params.error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {params.error}
            </p>
          )}
          <Button type="submit" className="w-full">
            Mettre à jour le mot de passe
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
