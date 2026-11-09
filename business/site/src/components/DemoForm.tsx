import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Reveal } from "../effects";
import { salesEmail, submitDemoRequest } from "../api";

const EMPTY = { name: "", role: "", institution: "", city: "", approx_students: "", work_email: "", phone: "", message: "", consent: false, website: "" };
type Values = typeof EMPTY;
type Errors = Partial<Record<keyof Values | "form", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The same checks the backend makes, so most mistakes show before sending. */
export function validate(values: Values): Errors {
  const errors: Errors = {};
  if (values.name.trim().length < 2) errors.name = "Please tell us your name.";
  if (!values.role.trim()) errors.role = "Please tell us your role.";
  if (values.institution.trim().length < 2) errors.institution = "Please tell us which college or university you are from.";
  if (!EMAIL.test(values.work_email.trim())) errors.work_email = "Please enter a valid work email.";
  if (values.approx_students && !(Number(values.approx_students) >= 1)) errors.approx_students = "Use a whole number, or leave it blank.";
  if (values.phone && !/^[0-9+()\-.\s]{6,32}$/.test(values.phone.trim())) errors.phone = "Use digits, spaces and + ( ) - only.";
  if (!values.consent) errors.consent = "Please agree to be contacted so we can reply.";
  return errors;
}

function Field({ id, label, error, optional, children }: { id: string; label: string; error?: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold" style={{ color: "var(--text)" }}>
        {label} {optional && <span className="font-normal" style={{ color: "var(--text-dim)" }}>(optional)</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error && <p id={`${id}-error`} className="field-error mt-1.5 text-sm">{error}</p>}
    </div>
  );
}

export function DemoForm() {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const email = salesEmail();

  const set = (key: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.type === "checkbox" ? (event.target as HTMLInputElement).checked : event.target.value;
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
  };

  const input = (key: keyof Values, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => ({
    id: `demo-${key}`,
    name: key,
    value: values[key] as string,
    onChange: set(key),
    className: "field",
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `demo-${key}-error` : undefined,
    ...extra,
  });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`demo-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setSending(true);
    const result = await submitDemoRequest({
      ...values,
      name: values.name.trim(),
      work_email: values.work_email.trim(),
      approx_students: values.approx_students ? Number(values.approx_students) : null,
    });
    setSending(false);
    if (result.ok) {
      setSent(true);
      return;
    }
    const fallback = email ? ` You can also write to ${email}.` : "";
    if (result.kind === "invalid") setErrors({ ...result.fields, form: "Please check the highlighted fields." });
    else if (result.kind === "throttled") setErrors({ form: `We have had several requests from you already. Please try again later.${fallback}` });
    else setErrors({ form: `We could not send your request just now. Please try again in a moment.${fallback}` });
  };

  return (
    <section id="demo" aria-labelledby="demo-title" className="cta-panel relative scroll-mt-16 overflow-hidden py-20 text-white sm:py-28">
      <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--color-brand-gold-bright)" }}>Request a demo</p>
          <h2 id="demo-title" className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">See EduAI Suite with your own college's colours</h2>
          <p className="mt-4 text-lg text-white/75">
            Tell us a little about your college. We will reply to set up a call, show you the portals and answer questions about pricing and setup.
          </p>
          {email && (
            <p className="mt-6 text-sm text-white/70">
              Prefer email? Write to <a href={`mailto:${email}`} className="font-semibold text-white underline underline-offset-4">{email}</a>.
            </p>
          )}
        </Reveal>

        <Reveal delay={100}>
          <div className="rounded-3xl border p-6 shadow-2xl sm:p-8" style={{ borderColor: "var(--line)", background: "var(--card)", color: "var(--text)" }}>
            {sent ? (
              <div role="status" className="py-10 text-center">
                <CheckCircle2 size={40} className="mx-auto" style={{ color: "var(--color-brand-accent)" }} aria-hidden="true" />
                <h3 className="mt-4 text-2xl font-extrabold">Thank you, we have your request</h3>
                <p className="mt-2" style={{ color: "var(--text-sub)" }}>Someone from our team will email you at {values.work_email.trim()} to arrange the demo.</p>
              </div>
            ) : (
              <form noValidate onSubmit={onSubmit} aria-label="Request a demo" className="grid gap-4 sm:grid-cols-2">
                <Field id="demo-name" label="Your name" error={errors.name}>
                  <input {...input("name", { autoComplete: "name", required: true })} />
                </Field>
                <Field id="demo-role" label="Your role" error={errors.role}>
                  <input {...input("role", { autoComplete: "organization-title", placeholder: "e.g. Registrar, Head of IT", required: true })} />
                </Field>
                <Field id="demo-institution" label="College or university" error={errors.institution}>
                  <input {...input("institution", { autoComplete: "organization", required: true })} />
                </Field>
                <Field id="demo-city" label="City" optional error={errors.city}>
                  <input {...input("city", { autoComplete: "address-level2" })} />
                </Field>
                <Field id="demo-work_email" label="Work email" error={errors.work_email}>
                  <input {...input("work_email", { type: "email", autoComplete: "email", required: true })} />
                </Field>
                <Field id="demo-phone" label="Phone" optional error={errors.phone}>
                  <input {...input("phone", { type: "tel", autoComplete: "tel" })} />
                </Field>
                <Field id="demo-approx_students" label="Roughly how many students?" optional error={errors.approx_students}>
                  <input {...input("approx_students", { type: "number", min: 1, inputMode: "numeric" })} />
                </Field>
                <div className="sm:col-span-2">
                  <Field id="demo-message" label="Anything we should know?" optional error={errors.message}>
                    <textarea
                      id="demo-message"
                      name="message"
                      rows={3}
                      maxLength={2000}
                      value={values.message}
                      onChange={set("message")}
                      className="field"
                    />
                  </Field>
                </div>

                {/* Honeypot for bots. People never see or reach it. */}
                <div className="honeypot" aria-hidden="true">
                  <label htmlFor="demo-website">Website</label>
                  <input id="demo-website" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} />
                </div>

                <div className="sm:col-span-2">
                  <label className="flex items-start gap-3 text-sm" style={{ color: "var(--text-sub)" }}>
                    <input
                      id="demo-consent"
                      type="checkbox"
                      checked={values.consent}
                      onChange={set("consent")}
                      className="mt-0.5 h-4 w-4 shrink-0"
                      style={{ accentColor: "var(--color-brand-blue-fill)" }}
                      aria-invalid={errors.consent ? true : undefined}
                      aria-describedby={errors.consent ? "demo-consent-error" : undefined}
                    />
                    <span>I agree that EduAI Suite may contact me about this request. We use these details only to reply to you.</span>
                  </label>
                  {errors.consent && <p id="demo-consent-error" className="field-error mt-1.5 text-sm">{errors.consent}</p>}
                </div>

                {errors.form && <p role="alert" className="field-error text-sm sm:col-span-2">{errors.form}</p>}

                <div className="sm:col-span-2">
                  <button type="submit" disabled={sending} className="btn-primary inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-bold text-white disabled:opacity-70 sm:w-auto">
                    {sending ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
                    {sending ? "Sending" : "Request a demo"}
                    {!sending && <ArrowRight size={18} aria-hidden="true" />}
                  </button>
                </div>
              </form>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
