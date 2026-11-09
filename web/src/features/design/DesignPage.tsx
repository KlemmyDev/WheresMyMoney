/**
 * The design system, live: every token and component in the current theme. Use it to check a component looks right
 * in dark and light before it goes on a page, and as the reference for which piece to reach for.
 */
import { MerchantMark } from "~/features/spending/MerchantIcon";
import { CATALOGUE, PLACES } from "~/features/spending/merchantMarks";
import { useState, type ReactNode } from "react";
import {
  Banner,
  Bar,
  BigNumber,
  Card,
  CardHead,
  ChoiceChip,
  EmptyState,
  Eyebrow,
  IconButton,
  Keypad,
  ROLE,
  Ring,
  Row,
  Sheet,
  Stat,
} from "~/features/common/ds";
import {
  EditPanel,
  EntityHeader,
  EntityHero,
  Legend,
  LikelyCard,
  MONTH_RANGES,
  MonthBars,
  Timeframe,
  type MonthRange,
} from "~/features/common/entity";
import { money } from "~/features/common/format";
import { Chip, I, type Tone } from "~/features/common/icons";
import { useToast } from "~/features/common/overlay";
import { useTheme, type ThemeChoice } from "~/features/common/theme";
import { Button, Choice, Input, PageHead, Pill, Segmented, Switch } from "~/features/common/ui";

const TOKENS = [
  ["page", "Canvas"],
  ["tile", "Card"],
  ["tile-2", "Card, inner"],
  ["sunken", "Inputs"],
  ["raised", "Raised"],
  ["line", "Line"],
  ["line-2", "Line, strong"],
  ["ink", "Ink"],
  ["ink-2", "Ink 2"],
  ["ink-3", "Ink 3"],
  ["teal", "Accent"],
  ["accent-fill", "Accent fill"],
  ["offset-fill", "Offset"],
  ["bills-fill", "Bills"],
  ["spending-fill", "Spending"],
  ["savings-fill", "Savings"],
  ["invest", "Invest"],
  ["bad", "Bad"],
] as const;

const TONES: Tone[] = ["", "offset", "bills", "spending", "savings", "invest", "neutral", "bad", "grad"];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHead title={title} right={note ? <span className="text-[13px] text-ink-3">{note}</span> : undefined} />
      {children}
    </Card>
  );
}

export function DesignPage() {
  const [theme, setTheme] = useTheme();
  const [chip, setChip] = useState("week");
  const [seg, setSeg] = useState("3M");
  const [on, setOn] = useState(true);
  const [amt, setAmt] = useState("64.8");
  const [sheet, setSheet] = useState(false);
  const toast = useToast();

  return (
    <>
      <PageHead
        over="Design system"
        title="Nightfall"
        actions={
          <Segmented<ThemeChoice>
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
              { value: "auto", label: "Match device" },
            ]}
          />
        }
      />

      <Section title="Colour" note="Tokens: bg-page, text-ink-2, border-line… Role colours are for money roles only.">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
          {TOKENS.map(([k, label]) => (
            <div key={k} className="flex flex-col gap-1.5">
              <span className="h-14 rounded-xl border border-line" style={{ background: `var(--color-${k})` }} />
              <span className="text-[13px] font-semibold">{label}</span>
              <span className="mono text-[11px] text-ink-3">{k}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type" note="Instrument Sans for words, Geist Mono for figures">
        <Eyebrow>Eyebrow · small capitals</Eyebrow>
        <BigNumber size="xl">$69,019.75</BigNumber>
        <BigNumber>$185.82</BigNumber>
        <div className="text-[22px] leading-7 font-semibold tracking-[-0.02em]">Page title, 22 on phone</div>
        <div className="text-[17px] font-semibold">Card heading, 17</div>
        <div className="text-[15px]">Body, 15. Plain words, sentence case, no jargon.</div>
        <div className="text-[13px] text-ink-3">Secondary, 13, ink 3</div>
        <div className="num text-[15px]">Figures −$1,140.25 · 12.7%</div>
      </Section>

      <Section
        title="Icon chips"
        note="Duotone glyph on a tint. Inside .chip-host they go solid on hover, press or current."
      >
        <div className="flex flex-wrap items-end gap-3">
          {(["sm", "md", undefined, "lg", "xl", "xxl"] as const).map((s, i) => (
            <Chip key={i} g={I.loan} tone="offset" size={s} />
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {TONES.map((t) => (
            <span key={t || "accent"} className="chip-host press flex flex-col items-center gap-1.5 rounded-xl p-1.5">
              <Chip g={I.spending} tone={t} size="lg" />
              <span className="mono text-[11px] text-ink-3">{t || "accent"}</span>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2.5">
          {Object.entries(I).map(([k, g]) => (
            <span key={k} title={k} className="chip-host flex flex-col items-center gap-1 rounded-xl p-1">
              <Chip g={g} tone="neutral" size="lg" />
              <span className="mono text-[10px] text-ink-3">{k}</span>
            </span>
          ))}
        </div>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Buttons">
          <div className="flex flex-wrap gap-2.5">
            <Button primary>Primary</Button>
            <Button>Secondary</Button>
            <Button small>Small</Button>
            <Button disabled>Disabled</Button>
            <IconButton label="Back">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </IconButton>
          </div>
        </Section>
        <Section title="Pills">
          <div className="flex flex-wrap gap-2">
            {(["good", "warn", "bad", "info", "teal", "mute", "role"] as const).map((t) => (
              <Pill key={t} tone={t}>
                {t}
              </Pill>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Choices">
          <div className="flex flex-wrap gap-2">
            {["day", "week", "month"].map((k) => (
              <ChoiceChip key={k} pressed={chip === k} onClick={() => setChip(k)}>
                {k}
              </ChoiceChip>
            ))}
            <ChoiceChip pressed g={I.savings} tone="savings" role="savings" onClick={() => {}}>
              With a chip
            </ChoiceChip>
          </div>
          <Segmented
            label="Range"
            value={seg}
            onChange={setSeg}
            options={["1M", "3M", "6M", "1Y"].map((v) => ({ value: v, label: v }))}
          />
          <Choice
            label="Older choice row"
            value={seg}
            onChange={setSeg}
            options={["1M", "3M"].map((v) => ({ value: v, label: v }))}
          />
          <div className="flex items-center gap-3">
            <Switch checked={on} onChange={setOn} label="Example switch" />
            <span className="text-[13px] text-ink-3">Switch, 44 by 26</span>
          </div>
        </Section>
        <Section title="Inputs and the keypad" note="Money uses the keypad on a phone">
          <Input value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Amount" />
          <div className="max-w-[300px]">
            <Keypad value={amt} onChange={setAmt} />
          </div>
        </Section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card lit tint="accent">
          <Eyebrow>Card · lit, tinted</Eyebrow>
          <BigNumber>$185.82</BigNumber>
          <Bar
            label="Spent $1,140, likely $4,248 more"
            max={5600}
            segments={[
              { value: 1140, role: "spending" },
              { value: 4248, role: "spending", likely: true },
            ]}
          />
          <div className="text-[13px] text-ink-3">Striped happened · hatched likely</div>
        </Card>
        <Section title="Stats and rings">
          <div className="grid grid-cols-2 gap-2.5">
            <Stat label="Offset saves" value="$352" note="this month" role="offset" />
            <Stat label="Bills held" value="3.1 months" note="aim 3" role="bills" />
          </div>
          <div className="flex items-center gap-4">
            <Ring value={42} extra={6} role="spending" label="Japan trip 42%">
              <span className="num text-[15px]">42%</span>
            </Ring>
            <Bar label="Bills 3.1 of 4 months, aim 3" max={4} marker={3} segments={[{ value: 3.1, role: "bills" }]} />
          </div>
        </Section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Rows">
          <Row
            g={I.loan}
            tone="loan"
            title="Loan repayment"
            sub="Mon 10 · from Bills"
            right={<span className="num">−$3,180.00</span>}
            onClick={() => {}}
          />
          <Row
            g={I.pay}
            tone="savings"
            title="Pay day"
            sub="Fri 14 · into Offset"
            right={<span className="num text-good">+$4,860.00</span>}
          />
        </Section>
        <Section title="Messages">
          <Banner g={I.shield} tone="bills" title="A rule didn't add up" action={<Button small>Look</Button>}>
            Japan trip goal wasn't in either balance.
          </Banner>
          <div className="flex gap-2">
            <Button onClick={() => toast("Loan repayment paid", () => {})}>Show a toast</Button>
            <Button onClick={() => setSheet(true)}>Open a sheet</Button>
          </div>
        </Section>
      </div>

      <EmptyState g={I.bills} tone="bills" title="No bills yet" action={<Button primary>Add a bill</Button>}>
        Enter each bill once with its amount and how often.
      </EmptyState>

      <EntityDemo />

      <Section
        title="Merchant marks"
        note={`${CATALOGUE.length} businesses (businesses.json), then kinds of place for merchants without one`}
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-2 gap-y-4">
          {CATALOGUE.map((b) => (
            <div key={b.key} className="flex min-w-0 flex-col items-center gap-1.5 text-center">
              <MerchantMark name={b.key} size="xl" />
              <span className="w-full truncate text-[11px] text-ink-3" title={`${b.name} · ${b.category}`}>
                {b.name}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-2 gap-y-4">
          {PLACES.map((p) => {
            const example = p.re.source.match(/[A-Z][A-Z ]+/)?.[0] ?? "";
            return (
              <div key={p.re.source} className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                <MerchantMark name={example} size="lg" />
                <span className="w-full truncate text-[11px] text-ink-3">{example.toLowerCase()}</span>
              </div>
            );
          })}
        </div>
      </Section>

      <div className="text-[13px] text-ink-3">
        Role colours: {Object.keys(ROLE).join(", ")}. Every tap target is at least 44px.
      </div>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="A sheet"
        footer={
          <Button primary onClick={() => setSheet(false)}>
            Done
          </Button>
        }
      >
        <p className="m-0 text-ink-2">
          Sheets slide up on a phone and sit in the middle on a desktop. The handle, the X, Escape and the scrim all
          close it.
        </p>
      </Sheet>
    </>
  );
}

/** Sample months for the entity page demo, in cents, oldest first (November is this month, so far). */
const DEMO_MONTHS = [
  ["2025-12", 224000],
  ["2026-01", 171500],
  ["2026-02", 168200],
  ["2026-03", 189000],
  ["2026-04", 176400],
  ["2026-05", 192300],
  ["2026-06", 181000],
  ["2026-07", 187600],
  ["2026-08", 179900],
  ["2026-09", 194100],
  ["2026-10", 183200],
  ["2026-11", 41230],
] as const;

/** The entity page pieces (common/entity.tsx) with sample numbers, in the order a page uses them. */
function EntityDemo() {
  const [range, setRange] = useState<MonthRange>("3");
  const [editing, setEditing] = useState(false);
  const [budget, setBudget] = useState("2000");
  const toast = useToast();
  const months = DEMO_MONTHS.map(([key, value]) => ({
    key,
    label: new Date(`${key}-01T00:00`).toLocaleDateString("en-AU", { month: "short", year: "2-digit" }),
    value,
  }));
  const litFrom = DEMO_MONTHS[DEMO_MONTHS.length - Number(range)][0];
  return (
    <Section title="Entity page" note="common/entity.tsx: header, hero, month bars, what's likely, edit panel">
      <div className="flex flex-col gap-4">
        <EntityHeader
          back={{ to: "/design", label: "Spending" }}
          mark={<Chip g={I.spending} tone="spending" size="xl" />}
          title="Groceries"
          sub="A spending category · $2,000 a month budget"
          timeframe={<Timeframe options={MONTH_RANGES} value={range} onChange={setRange} />}
          actions={<Button onClick={() => setEditing(true)}>Change</Button>}
        />
        <EditPanel
          open={editing}
          onClose={() => setEditing(false)}
          title="Change Groceries"
          canSave={budget !== "2000"}
          onSave={() => {
            setEditing(false);
            toast(`Groceries: $${budget} a month`, () => setBudget("2000"));
          }}
          remove={{
            label: "Remove the budget",
            onClick: () => {
              setEditing(false);
              toast("Groceries has no budget now", () => setBudget("2000"));
            },
          }}
        >
          <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
            Budget each month
            <Input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
        </EditPanel>
        <EntityHero
          tint="spending"
          label="Groceries in a sentence"
          numbers={[
            { label: "This month", value: money(41230), note: "day 8 of 30" },
            { label: "Usual month", value: money(186000), note: "last 6 months" },
            { label: "Most in a month", value: money(224000), note: "Dec 2025" },
            { label: "Last 12 months", value: money(2232000), note: "since Dec 2025" },
          ]}
        >
          <p className="m-0 text-[17px] leading-relaxed text-ink">
            Groceries is running about <b>$60 under</b> a usual month.
          </p>
        </EntityHero>
        <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
          <Card className="md:col-span-8">
            <CardHead
              title="Month by month"
              right={
                <Legend
                  items={[
                    { label: "Spent", kind: "solid", role: "spending" },
                    { label: "Likely", kind: "likely", role: "spending" },
                    { label: "Budget", kind: "line", role: "ink" },
                  ]}
                />
              }
            />
            <MonthBars
              name="What went on Groceries"
              months={months}
              rest={152770}
              line={{ value: 200000, label: "Budget" }}
              litFrom={litFrom}
              format={money}
            />
          </Card>
          <LikelyCard
            id="demo-likely"
            className="md:col-span-4"
            now={{
              label: "This month",
              total: money(194000),
              bar: {
                label: "Spent $412.30, likely $1,527.70 more, against a $2,000 budget",
                max: 200000,
                marker: 200000,
                segments: [
                  { value: 41230, role: "spending" },
                  { value: 152770, role: "spending", likely: true },
                ],
              },
              text: "$412.30 so far, likely $1,850 to $2,030 by the end of the month. That leaves about $60 of the budget.",
            }}
            next={{ label: "December", total: money(218000), text: "Likely $2,050 to $2,310." }}
          />
        </div>
      </div>
    </Section>
  );
}
