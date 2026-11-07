/** Signing in, or (on a new install) making the household's first account with the set-up code from the log. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiGet, apiSend, errorMessage } from "~/features/common/api";
import { Logo } from "~/features/common/brand";
import { Card } from "~/features/common/ds";
import { Chip, I } from "~/features/common/icons";
import { Button, ErrorText, Input, Label } from "~/features/common/ui";

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
    <div className="mx-auto grid min-h-screen w-full max-w-[1120px] items-center gap-8 px-4 py-10 md:grid-cols-[1fr_440px] md:gap-12">
      <div className="flex flex-col items-center gap-5 text-center md:items-start md:text-left">
        {/* The four accounts orbiting home: the app's art, in icon chips. */}
        <div aria-hidden className="relative h-[200px] w-[260px] md:h-[260px] md:w-[340px]">
          <span className="absolute inset-x-[12%] inset-y-[11%] rounded-[50%] border border-dashed border-line-2" />
          <Chip
            g={I.overview}
            tone="grad"
            size="xxl"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 shadow-[0_0_50px_-6px_var(--color-accent-fill)]"
          />
          <Chip g={I.accounts} tone="spending" size="xl" className="absolute top-0 left-[4%]" />
          <Chip g={I.bills} tone="bills" size="xl" className="absolute top-0 right-[4%]" />
          <Chip g={I.offset} tone="offset" size="xl" className="absolute bottom-0 left-0" />
          <Chip g={I.savings} tone="savings" size="xl" className="absolute right-0 bottom-0" />
        </div>
        <Logo />
        <h1 className="m-0 text-[30px] leading-9 font-semibold tracking-[-0.03em] md:text-[44px] md:leading-[50px]">
          {setup ? "Set up your household" : "Your household's money, on your own server"}
        </h1>
        <p className="m-0 max-w-[480px] text-[15px] text-ink-3">
          {setup
            ? "Enter the set-up code from the app's log (install.sh shows it too). The rest of the household is added in Settings afterwards."
            : "Nothing connects to your bank. Everyone in the house has their own sign-in."}
        </p>
      </div>
      <Card lit className="gap-4 p-7">
        <h2 className="m-0 text-[22px] font-semibold">{setup ? "Make the first account" : "Sign in"}</h2>
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
          <Button primary type="submit" className="min-h-12 text-[15px]" disabled={go.isPending}>
            {setup ? "Make the account" : "Sign in"}
          </Button>
        </form>
        {!setup && (
          <p className="m-0 text-[13px] text-ink-3">
            Forgot it? Someone in the household can reset it in Settings, Household.
          </p>
        )}
      </Card>
    </div>
  );
}
