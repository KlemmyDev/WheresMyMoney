/**
 * Settings (design: CkHousehold): the household and who's in it, check-ins, notifications (the devices turned on,
 * and what to be told), developers' API keys, updates and backups, the retirement estimate's assumptions
 * and each super fund's fees and options, and appearance.
 */
import { Earnings } from "~/features/settings/Earnings";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { apiGet, apiSend, errorMessage } from "~/features/common/api";
import { refresh, settingsQuery } from "~/features/common/queries";
import { useToast } from "~/features/common/overlay";
import { Link } from "@tanstack/react-router";
import { Chip, I } from "~/features/common/icons";
import { useStoredFlag, useTheme, type ThemeChoice } from "~/features/common/theme";
import { Card, CardHead, Details, EVERYTHING } from "~/features/common/ds";
import { useHidden } from "~/features/dashboard/OverviewParts";
import { RetirementSettingsPanel } from "~/features/retirement/Assumptions";
import {
  Button,
  Choice,
  ErrorText,
  Input,
  Label,
  PageHead,
  Pill,
  Switch,
  Tile,
  TileTitle,
  cn,
} from "~/features/common/ui";
import {
  browserName,
  currentSubscription,
  deviceId,
  pushSupport,
  subscribe,
  subscribeSupport,
} from "~/features/settings/push";

const SECTIONS = [
  ["household", "Household", "People, accounts, pay", I.accounts, "spending"],
  ["notifications", "Alerts", "Notifications to your browsers", I.bills, "bills"],
  ["developers", "Developers", "Read-only API keys", I.rules, "offset"],
  ["updates", "Updates and backups", "Channel, versions, restore", I.shield, "savings"],
  ["retirement", "Retirement", "Returns, fees, inflation", I.retire, "savings"],
  ["appearance", "Appearance", "How much to show, dark or light", I.settings, "neutral"],
] as const;

export function SettingsPage() {
  const search = useSearch({ from: "/_app/settings" });
  const [section, setSection] = useState<(typeof SECTIONS)[number][0]>(
    SECTIONS.find(([id]) => id === search.section)?.[0] ?? "household",
  );
  return (
    <>
      <PageHead over="Setup" title="Settings" />
      <p className="-mt-2 mb-0 text-[14px] text-ink-3">
        Running on your home server. Nothing leaves it but update checks and the notifications you set up.
      </p>
      <div className="flex flex-wrap items-start gap-4">
        <nav
          aria-label="Settings"
          className="flex flex-[0_0_220px] flex-col gap-1 max-md:flex-[1_1_100%] max-md:flex-row max-md:flex-wrap"
        >
          {SECTIONS.map(([id, label, sub, g, tone]) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? "page" : undefined}
              onClick={() => setSection(id)}
              className={cn(
                "chip-host press flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-3 text-left text-[14px] font-semibold max-md:min-h-11 max-md:flex-none max-md:py-1",
                section === id
                  ? "border-line bg-tile text-ink"
                  : "border-transparent bg-transparent text-ink-2 hover:bg-tile-2 hover:text-ink",
              )}
            >
              <Chip g={g} tone={tone} size="md" />
              <span>
                <span className="block">{label}</span>
                <span className="block text-[12px] font-normal text-ink-3 max-md:hidden">{sub}</span>
              </span>
            </button>
          ))}
        </nav>
        <div key={section} className="screen flex min-w-0 flex-[1_1_600px] flex-col gap-4">
          {section === "household" && <Household />}
          {section === "notifications" && <Notifications />}
          {section === "developers" && <Developers />}
          {section === "updates" && <Updates />}
          {section === "retirement" && <RetirementSettingsPanel />}
          {section === "appearance" && <Appearance />}
        </div>
      </div>
    </>
  );
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line py-3 first:border-t-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

type Member = { id: number; username: string; name: string };

const AVATARS = [
  "linear-gradient(135deg, #8b7bff, #f472b6)",
  "linear-gradient(135deg, #34d399, #5b84f5)",
  "linear-gradient(135deg, #f59e2e, #ec5f9c)",
  "linear-gradient(135deg, #67e8f9, #8b7bff)",
];

function Household() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const settings = useQuery(settingsQuery);
  const members = useQuery({ queryKey: ["household"], queryFn: () => apiGet<{ members: Member[] }>("household") });
  const session = useQuery({
    queryKey: ["auth", "session"],
    queryFn: () => apiGet<{ user_id: number | null; auth_enabled: boolean }>("auth/session"),
  });
  const [nm, setNm] = useState({ username: "", name: "", password: "" });
  const put = useMutation({
    mutationFn: (v: Record<string, unknown>) => apiSend("PUT", "settings", v),
    onSuccess: () => (refresh(qc), toast("Saved")),
  });
  const add = useMutation({
    mutationFn: () => apiSend("POST", "household", nm),
    onSuccess: () => (
      setNm({ username: "", name: "", password: "" }),
      qc.invalidateQueries({ queryKey: ["household"] }),
      toast("Added to the household")
    ),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiSend("DELETE", `household/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["household"] }),
  });
  const s = settings.data?.settings;
  if (!s) return null;
  return (
    <>
      <Tile i={0}>
        <TileTitle>Household</TileTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="hh-name">Name</Label>
            <Input
              id="hh-name"
              className="font-sans"
              defaultValue={s.household}
              onBlur={(e) => e.target.value !== s.household && put.mutate({ household: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="hh-tol">A check-in adds up within (dollars)</Label>
            <Input
              id="hh-tol"
              inputMode="numeric"
              defaultValue={s.tolerance}
              onBlur={(e) =>
                Number(e.target.value) !== s.tolerance && put.mutate({ tolerance: Number(e.target.value) })
              }
            />
          </div>
        </div>
        <div className="tt mt-2">Remind us to check in</div>
        <Choice
          label="Reminders"
          value={s.reminder}
          onChange={(reminder) => put.mutate({ reminder })}
          options={[
            { value: "payday", label: "Every payday" },
            { value: "weekly", label: "Every Sunday" },
            { value: "monthly", label: "Monthly" },
          ]}
        />
        {put.isError && <ErrorText>{errorMessage(put.error)}</ErrorText>}
      </Tile>
      <Earnings />
      {session.data?.auth_enabled !== false && (
        <Tile i={1}>
          <TileTitle>Who's in it</TileTitle>
          {(members.data?.members ?? []).map((m, i) => (
            <Row key={m.id}>
              <span className="flex min-h-12 items-center gap-3">
                <span
                  aria-hidden
                  className="inline-flex size-11 items-center justify-center rounded-full text-[16px] font-semibold text-white"
                  style={{ background: AVATARS[i % AVATARS.length] }}
                >
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <span className="block font-semibold">{m.name}</span>
                  <span className="mono block text-xs text-ink-3">{m.username}</span>
                </span>
                {m.id === session.data?.user_id && <Pill tone="teal">You</Pill>}
              </span>
              {m.id !== session.data?.user_id && (
                <Button small onClick={() => remove.mutate(m.id)}>
                  Remove
                </Button>
              )}
            </Row>
          ))}
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Input
              className="font-sans"
              aria-label="Name"
              placeholder="Name, like Alex"
              value={nm.name}
              onChange={(e) => setNm({ ...nm, name: e.target.value })}
            />
            <Input
              className="font-sans"
              aria-label="Username"
              placeholder="Username"
              value={nm.username}
              onChange={(e) => setNm({ ...nm, username: e.target.value })}
            />
            <Input
              type="password"
              aria-label="Password"
              placeholder="Password (8 or more)"
              value={nm.password}
              onChange={(e) => setNm({ ...nm, password: e.target.value })}
            />
            <Button disabled={!nm.username || nm.password.length < 8} onClick={() => add.mutate()}>
              Add
            </Button>
          </div>
          {(add.isError || remove.isError) && <ErrorText>{errorMessage(add.error ?? remove.error)}</ErrorText>}
          <div>
            <Button
              small
              onClick={async () => (await apiSend("POST", "auth/logout"), qc.clear(), navigate({ to: "/login" }))}
            >
              Sign out
            </Button>
          </div>
        </Tile>
      )}
    </>
  );
}

type NotifyView = {
  rules: {
    id: string;
    name: string;
    about: string;
    enabled: boolean;
    values: Record<string, number>;
    units: Record<string, string>;
  }[];
  devices: { id: string; name: string; service: string; last_sent: number | null; last_error: string | null }[];
  options: { quiet: { enabled: boolean; start: string; end: string }; daily_cap: number };
  history: { id: number; ts: number; title: string; body: string; results: Record<string, string> }[];
};

function Notifications() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => apiGet<NotifyView>("notifications") });
  const support = useSyncExternalStore(
    subscribeSupport,
    () => (typeof window === "undefined" ? "unsupported" : pushSupport()),
    () => "unsupported",
  );
  const [mine, setMine] = useState<string | null>(null);
  useQuery({
    queryKey: ["push-mine"],
    queryFn: async () => {
      if (pushSupport() !== "ready") return null;
      const sub = await currentSubscription();
      const id = sub ? await deviceId(sub.endpoint) : null;
      setMine(id);
      return id;
    },
  });
  const set = (data: NotifyView) => qc.setQueryData(["notifications"], data);
  const run = useMutation({
    mutationFn: ({ method, path, body }: { method: "POST" | "PUT" | "DELETE"; path: string; body?: unknown }) =>
      apiSend<NotifyView>(method, path, body),
    onSuccess: (d) => d && "rules" in d && set(d),
  });
  const turnOn = useMutation({
    mutationFn: async () => {
      const { public_key } = await apiGet<{ public_key: string }>("notifications/push");
      const sub = await subscribe(public_key);
      await apiSend("POST", "notifications/push/devices", { subscription: sub.toJSON(), name: browserName() });
      setMine(await deviceId(sub.endpoint));
    },
    onSuccess: () => (
      qc.invalidateQueries({ queryKey: ["notifications"] }),
      toast("Notifications are on for this device")
    ),
  });
  const v = q.data;
  if (!v) return null;
  const why = {
    insecure:
      "Browsers only allow notifications on an https:// address (or localhost). Open WheresMyMoney over HTTPS on this device.",
    "ios-install":
      "On an iPhone or iPad, add WheresMyMoney to the Home Screen first (Share → Add to Home Screen), then open it from there.",
    unsupported: "This browser doesn't do web notifications.",
    denied: "Notifications are blocked for this site in the browser's settings.",
    ready: "",
  }[support];
  const mineDevice = v.devices.find((d) => d.id === mine);
  const turnOff = () =>
    mineDevice &&
    run.mutate(
      { method: "DELETE", path: `notifications/push/devices/${mineDevice.id}` },
      {
        onSuccess: () => {
          setMine(null);
          qc.invalidateQueries({ queryKey: ["notifications"] });
          toast("Notifications are off for this browser");
        },
      },
    );
  const ruleRow = (r: NotifyView["rules"][number]) => (
    <Row key={r.id}>
      <span>
        {r.name}
        <span className="block text-xs text-ink-3">{r.about}</span>
      </span>
      <span className="flex items-center gap-2">
        {Object.entries(r.values).map(([k, val]) => (
          <label key={k} className="flex items-center gap-1.5 text-[12px] whitespace-nowrap text-ink-3">
            <Input
              aria-label={`${r.name}: ${r.units[k] ?? k}`}
              inputMode="numeric"
              className="w-16 text-center"
              defaultValue={val}
              onBlur={(e) =>
                Number(e.target.value) !== val &&
                run.mutate({
                  method: "PUT",
                  path: `notifications/rules/${r.id}`,
                  body: { values: { [k]: Number(e.target.value) } },
                })
              }
            />
            {r.units[k]}
          </label>
        ))}
        <Switch
          label={r.name}
          checked={r.enabled}
          onChange={(enabled) => run.mutate({ method: "PUT", path: `notifications/rules/${r.id}`, body: { enabled } })}
        />
      </span>
    </Row>
  );
  const FIRST = 5;
  return (
    <>
      <Card aria-labelledby="nt-browser" className="flex flex-col gap-3">
        <CardHead
          id="nt-browser"
          title="This browser"
          right={
            <Pill tone={mineDevice ? "good" : support === "denied" ? "bad" : "mute"}>
              {mineDevice ? "On" : support === "denied" ? "Blocked" : "Off"}
            </Pill>
          }
        />
        <p className="m-0 text-[14px] text-ink-2">
          Notifications from your home server to the browsers you choose. Nothing goes through anyone else&apos;s
          service.
        </p>
        {mineDevice ? (
          <>
            <p className="m-0 text-[14px] text-ink">On for {mineDevice.name}.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  run.mutate(
                    { method: "POST", path: "notifications/test", body: { target: mineDevice.id } },
                    { onSuccess: () => toast("A test is on its way") },
                  )
                }
              >
                Send a test
              </Button>
              <Button onClick={turnOff}>Turn off on this browser</Button>
            </div>
          </>
        ) : support === "ready" ? (
          <>
            <p className="m-0 text-[14px] text-ink">Notifications aren&apos;t on in this browser yet.</p>
            <p className="m-0 text-[13px] text-ink-2">
              Turn them on and you&apos;ll hear when a bill&apos;s due or it&apos;s time to check in, even with
              WheresMyMoney closed. Your browser will ask first: that&apos;s the browser asking, not WheresMyMoney.
            </p>
            <div>
              <Button primary disabled={turnOn.isPending} onClick={() => turnOn.mutate()}>
                Allow notifications
              </Button>
            </div>
          </>
        ) : support === "denied" ? (
          <>
            <p className="m-0 text-[14px] text-ink">Notifications are blocked for this site.</p>
            <p className="m-0 text-[13px] text-ink-2">The browser remembers the block, so only you can lift it:</p>
            <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-[13px] text-ink-2">
              <li>Click the icon at the left of the address bar.</li>
              <li>Find Notifications and set it to Allow.</li>
              <li>Reload this page, then Allow notifications here.</li>
            </ol>
          </>
        ) : support === "ios-install" ? (
          <>
            <p className="m-0 text-[14px] text-ink">On iPhone, add it to the Home Screen first.</p>
            <p className="m-0 text-[13px] text-ink-2">
              Safari only allows notifications for sites opened from a Home Screen icon:
            </p>
            <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-[13px] text-ink-2">
              <li>Tap Share at the bottom of Safari.</li>
              <li>Choose Add to Home Screen.</li>
              <li>Open WheresMyMoney from the new icon and come back here.</li>
            </ol>
          </>
        ) : (
          <p className="m-0 text-[13px] text-warn">{why}</p>
        )}
        {(turnOn.isError || run.isError) && <ErrorText>{errorMessage(turnOn.error ?? run.error)}</ErrorText>}
      </Card>

      <Card aria-labelledby="nt-what" className="flex flex-col gap-1">
        <CardHead
          id="nt-what"
          title="What to tell you about"
          right={<span className="text-[13px] text-ink-3">Saved as you change them · goes to every device below</span>}
        />
        {v.rules.slice(0, FIRST).map(ruleRow)}
        {v.rules.length > FIRST && (
          <Details label={`${v.rules.length - FIRST} more from the app`}>{v.rules.slice(FIRST).map(ruleRow)}</Details>
        )}
      </Card>

      <Card aria-labelledby="nt-quiet" className="flex flex-col gap-2">
        <CardHead
          id="nt-quiet"
          title="Quiet hours"
          right={
            <Switch
              label="Quiet hours"
              checked={v.options.quiet.enabled}
              onChange={(enabled) =>
                run.mutate({ method: "PUT", path: "notifications/options", body: { quiet: { enabled } } })
              }
            />
          }
        />
        <div className="flex flex-wrap items-center gap-3 text-[14px]">
          <label className="flex items-center gap-2">
            <span className="text-ink-2">Quiet from</span>
            <Input
              aria-label="Quiet from"
              type="time"
              className="w-28"
              defaultValue={v.options.quiet.start}
              onBlur={(e) =>
                run.mutate({ method: "PUT", path: "notifications/options", body: { quiet: { start: e.target.value } } })
              }
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-ink-2">Until</span>
            <Input
              aria-label="Quiet until"
              type="time"
              className="w-28"
              defaultValue={v.options.quiet.end}
              onBlur={(e) =>
                run.mutate({ method: "PUT", path: "notifications/options", body: { quiet: { end: e.target.value } } })
              }
            />
          </label>
        </div>
        <p className="m-0 text-[13px] text-ink-3">
          Anything due overnight waits until morning. With no bank feed, nothing changes while you sleep.
        </p>
      </Card>

      <Card aria-labelledby="nt-devices" className="flex flex-col gap-1">
        <CardHead
          id="nt-devices"
          title="Devices getting alerts"
          right={<span className="text-[13px] text-ink-3">{v.devices.length}</span>}
        />
        {v.devices.map((d) => (
          <Row key={d.id}>
            <span>
              {d.name} {d.id === mine && <Pill tone="teal">This browser</Pill>}
              <span className="block text-xs text-ink-3">
                {d.last_sent ? `Last sent ${ago(d.last_sent)}` : "Nothing sent yet"}
              </span>
              {d.last_error && <span className="block text-xs text-warn">{d.last_error}</span>}
            </span>
            <span className="flex gap-2">
              <Button
                small
                onClick={() => run.mutate({ method: "POST", path: "notifications/test", body: { target: d.id } })}
              >
                Test
              </Button>
              <Button
                small
                onClick={() =>
                  run.mutate(
                    { method: "DELETE", path: `notifications/push/devices/${d.id}` },
                    { onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) },
                  )
                }
              >
                Remove
              </Button>
            </span>
          </Row>
        ))}
        {!v.devices.length && (
          <p className="m-0 text-[14px] text-ink-3">
            No devices yet. Allow notifications above, then do the same on your phone.
          </p>
        )}
      </Card>

      {v.history.length > 0 && (
        <Card aria-labelledby="nt-sent" className="flex flex-col gap-1">
          <CardHead id="nt-sent" title="Recently sent" />
          {v.history.slice(0, 10).map((h) => (
            <Row key={h.id}>
              <span>
                {h.title}
                <span className="block text-xs text-ink-3">{h.body}</span>
              </span>
              <span className="text-xs whitespace-nowrap text-ink-3">{ago(h.ts)}</span>
            </Row>
          ))}
        </Card>
      )}
    </>
  );
}

type Keys = {
  keys: { id: string; name: string; prefix: string; scopes: string[]; created_at: number; last_used: number | null }[];
  scopes: { id: string; name: string; about: string; default: boolean }[];
};

function ago(ts: number | null): string {
  if (!ts) return "Never";
  const s = Date.now() / 1000 - ts;
  if (s < 120) return "Just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

function Developers() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["keys"], queryFn: () => apiGet<Keys>("keys") });
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const scopes = chosen ?? new Set((q.data?.scopes ?? []).filter((s) => s.default).map((s) => s.id));
  const make = useMutation({
    mutationFn: () => apiSend<{ key: string }>("POST", "keys", { name, scopes: [...scopes] }),
    onSuccess: (r) => (setMade(r.key), setName(""), qc.invalidateQueries({ queryKey: ["keys"] })),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiSend("DELETE", `keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["keys"] }),
  });
  const host = typeof window !== "undefined" ? window.location.origin : "http://<this machine>:8080";
  return (
    <Tile i={0}>
      <TileTitle>Developers · API keys</TileTitle>
      <div className="text-[13px] text-ink-2">
        Let other apps on your network, like the Home Hub, read your figures. You choose what each key can see. A key
        never opens the app itself.
      </div>
      {(q.data?.keys ?? []).map((k) => (
        <Row key={k.id}>
          <span>
            {k.name} <span className="mono text-xs text-ink-3">{k.prefix}…</span>
            <span className="mono block text-xs text-ink-3">{k.scopes.map((s) => s.split(":")[0]).join(" ")}</span>
          </span>
          <span className="flex items-center gap-3">
            <span className="text-xs text-ink-3">{ago(k.last_used)}</span>
            <Button small onClick={() => remove.mutate(k.id)}>
              Remove
            </Button>
          </span>
        </Row>
      ))}
      {made && (
        <div className="reveal rounded-lg border border-teal/50 bg-teal/8 px-3.5 py-3 text-[13px]">
          <b>Copy it now: it's only shown this once.</b>
          <div className="mono mt-1 break-all select-all">{made}</div>
        </div>
      )}
      <div className="tt mt-2">Make a key</div>
      <div>
        <Label htmlFor="key-name">Name</Label>
        <Input
          id="key-name"
          className="font-sans"
          placeholder="Home Hub"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {(q.data?.scopes ?? []).map((s) => (
        <Row key={s.id}>
          <span>
            <span className="mono">{s.id}</span>
            <span className="block text-xs text-ink-3">{s.about}</span>
          </span>
          <Switch
            label={s.id}
            checked={scopes.has(s.id)}
            onChange={(on) => {
              const n = new Set(scopes);
              if (on) n.add(s.id);
              else n.delete(s.id);
              setChosen(n);
            }}
          />
        </Row>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-3">The whole key is shown once. Only a hash is kept.</span>
        <Button primary disabled={!name || !scopes.size} onClick={() => make.mutate()}>
          Make a key
        </Button>
      </div>
      {make.isError && <ErrorText>{errorMessage(make.error)}</ErrorText>}
      <pre className="mono overflow-x-auto rounded-lg bg-page px-3 py-2.5 text-xs text-ink-2">
        curl -H "Authorization: Bearer wmm_…" {host}/api/v1/accounts
      </pre>
    </Tile>
  );
}

type UpdateStatus = {
  enabled: boolean;
  channel: "nightly" | "beta" | "stable";
  current: { version: string; release: string | null; commit: string | null };
  latest: { version: string; commit: string; tag: string | null; changes: number | null } | null;
  move: "update" | "older" | null;
  available: boolean;
  checked_at: number | null;
  error: string | null;
  install: { ready: boolean; why: string | null; state: string; error: string | null; log: string[] };
};

function Updates() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ["updates"],
    queryFn: () => apiGet<UpdateStatus>("updates"),
    refetchInterval: 10_000,
  });
  const backups = useQuery({
    queryKey: ["backups"],
    queryFn: () => apiGet<{ backups: { name: string; kind: string; size: number }[] }>("backups"),
  });
  const settings = useQuery(settingsQuery);
  const set = (d: UpdateStatus) => qc.setQueryData(["updates"], d);
  const check = useMutation({ mutationFn: () => apiSend<UpdateStatus>("POST", "updates/check"), onSuccess: set });
  const channel = useMutation({
    mutationFn: (c: string) => apiSend<UpdateStatus>("PUT", "updates/channel", { channel: c }),
    onSuccess: set,
  });
  const install = useMutation({
    mutationFn: () => apiSend<UpdateStatus>("POST", "updates/install"),
    onSuccess: (d) => (set(d), toast("The update starts within a minute")),
  });
  const backup = useMutation({
    mutationFn: () => apiSend("POST", "backups"),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["backups"] }), toast("Backed up")),
  });
  const auto = useMutation({
    mutationFn: (on: boolean) => apiSend("PUT", "settings", { update_check: on }),
    onSuccess: () => refresh(qc),
  });
  const u = q.data;
  return (
    <>
      <Tile i={0}>
        <TileTitle>Updates</TileTitle>
        <div className="text-[13px] text-ink-2">
          Checked every few hours. Your data is backed up before every update.
        </div>
        {u && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={u.available ? "warn" : "good"}>
                {u.available
                  ? `UPDATE · ${u.latest?.version}`
                  : u.move === "older"
                    ? `OLDER ON ${u.channel.toUpperCase()} · ${u.latest?.version}`
                    : `UP TO DATE · ${u.current.version}`}
              </Pill>
              {u.current.release && <Pill>{u.current.release.toUpperCase()}</Pill>}
              {u.error && <span className="text-xs text-warn">{u.error}</span>}
            </div>
            <div className="tt mt-1">Channel</div>
            <Choice
              label="Channel"
              value={u.channel}
              onChange={(c) => channel.mutate(c)}
              options={[
                { value: "nightly", label: "Nightly" },
                { value: "beta", label: "Beta" },
                { value: "stable", label: "Stable" },
              ]}
            />
            <div className="text-xs text-ink-3">
              {
                {
                  nightly: "Nightly gets every change as it's merged.",
                  beta: "Beta gets each release and pre-release as it's tagged.",
                  stable: "Stable gets releases only.",
                }[u.channel]
              }
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => check.mutate()} disabled={check.isPending}>
                Check now
              </Button>
              {u.move && (
                <Button
                  primary
                  disabled={!u.install.ready || ["requested", "running"].includes(u.install.state)}
                  onClick={() => install.mutate()}
                >
                  {u.install.state === "running"
                    ? "Updating…"
                    : u.install.state === "requested"
                      ? "Starting…"
                      : u.move === "update"
                        ? "Update now"
                        : "Install this version"}
                </Button>
              )}
            </div>
            {u.move && u.install.why && <div className="text-xs text-ink-3">{u.install.why}</div>}
            {u.install.log.length > 0 && (
              <pre className="mono max-h-48 overflow-auto rounded-lg bg-page p-3 text-xs text-ink-2">
                {u.install.log.join("\n")}
              </pre>
            )}
            <Row>
              <span id="upd-auto">Check for updates every few hours</span>
              <Switch
                labelledBy="upd-auto"
                checked={!!settings.data?.settings.update_check}
                onChange={(on) => auto.mutate(on)}
              />
            </Row>
          </>
        )}
        {(check.isError || channel.isError || install.isError) && (
          <ErrorText>{errorMessage(check.error ?? channel.error ?? install.error)}</ErrorText>
        )}
      </Tile>
      <Tile i={1}>
        <TileTitle
          right={
            <Button small onClick={() => backup.mutate()}>
              Back up now
            </Button>
          }
        >
          Backups · data/backups
        </TileTitle>
        {(backups.data?.backups ?? []).slice(0, 8).map((b) => (
          <Row key={b.name}>
            <span className="mono text-xs break-all">{b.name}</span>
            <span className="mono text-xs text-ink-3">
              {b.kind.toUpperCase()} · {Math.round(b.size / 1024)} KB
            </span>
          </Row>
        ))}
        {!backups.data?.backups.length && (
          <div className="text-ink-3">None yet: one is made each night at 3am, and before every update.</div>
        )}
        <div className="tt mt-2">Install or update from the command line</div>
        <pre className="mono overflow-x-auto rounded-lg bg-page px-3 py-2.5 text-xs text-ink-2">
          curl -fsSL https://raw.githubusercontent.com/KlemmyDev/WheresMyMoney/main/install.sh | bash{"\n"}bash
          install.sh --channel stable
        </pre>
        <div className="text-xs text-ink-3">
          Backups sit on the same disk as the app. Copy data/ and .env somewhere else now and then.
        </div>
      </Tile>
    </>
  );
}

/** Dark, light or the device's choice, and whether balances start hidden. Both are per browser. */
function Appearance() {
  const [theme, setTheme] = useTheme();
  const [hidden, setHidden] = useHidden();
  const [everything, setEverything] = useStoredFlag(EVERYTHING);
  const themes: { value: ThemeChoice; label: string; bg: string; card: string }[] = [
    { value: "dark", label: "Dark", bg: "#0a0b12", card: "#171827" },
    { value: "light", label: "Light", bg: "#ebebe7", card: "#ffffff" },
    {
      value: "auto",
      label: "Match this device",
      bg: "linear-gradient(90deg,#0a0b12 50%,#ebebe7 50%)",
      card: "rgb(128 128 140 / 0.45)",
    },
  ];
  return (
    <>
      <Tile aria-labelledby="ap-show">
        <TileTitle id="ap-show">How much to show</TileTitle>
        <p className="m-0 text-[14px] text-ink-3">
          Just for you, on this device. Everyone in the house can choose their own.
        </p>
        <div role="radiogroup" aria-label="How much to show" className="grid gap-3 sm:grid-cols-2">
          {(
            [
              [
                false,
                "The essentials",
                "Each page says what it means in a sentence. Charts and breakdowns are a tap away.",
              ],
              [true, "Everything", "Every chart, breakdown and what-if is open, for whoever likes the detail."],
            ] as const
          ).map(([v, title, sub]) => (
            <button
              key={title}
              type="button"
              role="radio"
              aria-checked={everything === v}
              onClick={() => setEverything(v)}
              className={cn(
                "press flex cursor-pointer flex-col gap-1 rounded-[18px] border bg-tile-2 p-4 text-left",
                everything === v
                  ? "border-teal text-ink shadow-[0_0_0_1px_var(--color-teal)]"
                  : "border-line text-ink-2",
              )}
            >
              <span className="text-[16px] font-semibold text-ink">{title}</span>
              <span className="text-[13px] text-ink-3">{sub}</span>
            </button>
          ))}
        </div>
      </Tile>
      <Tile aria-labelledby="ap-h">
        <TileTitle id="ap-h">Appearance</TileTitle>
        <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
          {themes.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={theme === t.value}
              onClick={() => setTheme(t.value)}
              className={cn(
                "press flex cursor-pointer flex-col gap-2.5 rounded-[18px] border bg-tile-2 p-2.5 text-left text-[14px] font-semibold",
                theme === t.value
                  ? "border-teal text-ink shadow-[0_0_0_1px_var(--color-teal)]"
                  : "border-line text-ink-2",
              )}
            >
              <span aria-hidden className="flex h-20 gap-1.5 rounded-xl p-2.5" style={{ background: t.bg }}>
                <span className="flex-1 rounded-md" style={{ background: t.card }} />
                <span className="flex-[2] rounded-md" style={{ background: t.card }} />
              </span>
              {t.label}
            </button>
          ))}
        </div>
        <Row>
          <span>
            <span className="block">Hide balances when the app opens</span>
            <span className="block text-[13px] text-ink-3">Tap the eye on the Overview to show them</span>
          </span>
          <Switch checked={hidden} onChange={setHidden} label="Hide balances" />
        </Row>
        <Row>
          <span>
            <span className="block">Design system</span>
            <span className="block text-[13px] text-ink-3">Every colour and component, live</span>
          </span>
          <Link to="/design" className="text-[14px] font-semibold text-teal no-underline">
            Open
          </Link>
        </Row>
      </Tile>
    </>
  );
}
