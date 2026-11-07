/**
 * The design system, live: every token and component in the current theme. Use it to check a component looks right
 * in dark and light before it goes on a page, and as the reference for which piece to reach for.
 */
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
