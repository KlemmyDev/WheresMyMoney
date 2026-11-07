/** Signing in, or (on a new install) making the household's first account with the set-up code from the log. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiGet, apiSend, errorMessage } from "~/features/common/api";
import { Logo } from "~/features/common/brand";
import { Button, ErrorText, Input, Label, Tile } from "~/features/common/ui";

export type Session = {
  authenticated: boolean;
  setup_required: boolean;
  username: string | null;
  name: string | null;
  user_id: number | null;
  auth_enabled: boolean;
};

export const sessionQuery = {
  queryKey: ["auth", "session"],
  queryFn: () => apiGet<Session>("auth/session"),
  staleTime: 5 * 60_000,
};

export function LoginPage({ redirectTo }: { redirectTo?: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const session = useQuery(sessionQuery);
  const setup = session.data?.setup_required;
  const [f, setF] = useState({ username: "", password: "", code: "" });
  const go = useMutation({
    mutationFn: () => apiSend("POST", setup ? "auth/setup" : "auth/login", f),
    onSuccess: async () => {
      await qc.invalidateQueries();
      navigate({ to: redirectTo || (setup ? "/setup" : "/") });
    },
  });
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Tile i={0} className="w-full max-w-[400px] gap-4 p-7">
        <div className="flex items-center gap-2.5">
          <Logo />
        </div>
        <div>
          <h1 className="m-0 text-xl font-semibold">{setup ? "Make the first account" : "Sign in"}</h1>
          <p className="mt-1 mb-0 text-[13px] text-ink-2">
            {setup
              ? "Enter the set-up code from the app's log (install.sh shows it too). The rest of the household is added in Settings afterwards."
              : "The household's money, on your own server."}
          </p>
        </div>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            go.mutate();
          }}
        >
          {setup && (
            <div>
              <Label htmlFor="li-code">Set-up code</Label>
              <Input
                id="li-code"
                autoComplete="one-time-code"
                placeholder="ABCD-2345"
                value={f.code}
                onChange={(e) => setF({ ...f, code: e.target.value })}
              />
            </div>
          )}
          <div>
            <Label htmlFor="li-user">Username</Label>
            <Input
              id="li-user"
              className="font-sans"
              autoComplete="username"
              value={f.username}
              onChange={(e) => setF({ ...f, username: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="li-pass">Password</Label>
            <Input
              id="li-pass"
              type="password"
              autoComplete={setup ? "new-password" : "current-password"}
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
            />
          </div>
          {go.isError && <ErrorText>{errorMessage(go.error)}</ErrorText>}
          <Button primary type="submit" className="min-h-11" disabled={go.isPending}>
            {setup ? "Make the account" : "Sign in"}
          </Button>
        </form>
      </Tile>
    </div>
  );
}
