import { MagicLinkForm } from "./magic-link-form";
import { PasswordDevForm } from "./password-dev-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const showPasswordDev = process.env.AUTH_PASSWORD_LOGIN === "true";

  return (
    <div
      className="flex min-h-full flex-col items-center justify-center px-4 py-8"
      style={{ background: "var(--app-bg)" }}
    >
      <div className="card-canvas w-full max-w-sm p-8">
        <h1 className="text-xl font-medium" style={{ color: "var(--app-text)" }}>
          Done
        </h1>
        <MagicLinkForm />
        {showPasswordDev ? <PasswordDevForm /> : null}
      </div>
    </div>
  );
}
