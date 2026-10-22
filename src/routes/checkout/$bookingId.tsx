import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadCheckout, payCheckout, syncCheckout } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PublicFrame } from "@/components/site-chrome";
import { Button, EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/checkout/$bookingId")({ component: CheckoutPage });

type StripeGlobal = {
  Stripe: (key: string) => {
    elements: (options: { clientSecret: string }) => {
      create: (type: "payment") => { mount: (selector: string) => void };
    };
    confirmPayment: (options: { elements: unknown; confirmParams: { return_url: string } }) => Promise<{ error?: { message?: string } }>;
  };
};

function CheckoutPage() {
  const { bookingId } = Route.useParams();
  const [row, setRow] = useState<Awaited<ReturnType<typeof loadCheckout>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const load = params.get("redirect_status") ? syncCheckout({ data: { bookingId } }) : loadCheckout({ data: { bookingId } });
    load
      .then((next) => { if (!cancelled) setRow(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not open checkout."); });
    return () => { cancelled = true; };
  }, [bookingId]);

  useEffect(() => {
    if (!row?.hold_expires_at || row.status !== "PENDING") return;
    const tick = () => setLeft(Math.max(0, new Date(row.hold_expires_at!).getTime() - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [row]);

  async function pay() {
    if (!accepted) { setError("Agree to the cancellation policy before paying."); return; }
    setPaying(true);
    setError(null);
    try {
      const payment = await payCheckout({ data: { bookingId } });
      if (!payment.publishableKey || !payment.clientSecret) throw new Error("Stripe publishable key is missing.");
      await loadStripe();
      const stripe = (window as unknown as StripeGlobal).Stripe(payment.publishableKey);
      const elements = stripe.elements({ clientSecret: payment.clientSecret });
      const paymentElement = elements.create("payment");
      paymentElement.mount("#payment-element");
      const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.href } });
      if (result.error) setError(result.error.message ?? "The card was not charged.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Payment could not start.");
    } finally {
      setPaying(false);
    }
  }

  const minutes = left == null ? null : Math.floor(left / 60000);
  const seconds = left == null ? null : Math.floor((left % 60000) / 1000);

  return (
    <PublicFrame>
      <div className="mx-auto max-w-xl px-4 py-12">
        <h1 className="font-display text-4xl">Checkout</h1>
        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
        {!row && !error ? <Skeleton className="mt-6 h-40" /> : null}
        {row?.status === "CONFIRMED" ? (
          <EmptyState title="You're booked" body={`${row.title} is confirmed. A receipt is on the trip page.`} action={<Link to="/trips/$bookingId" params={{ bookingId }} className="text-sm font-medium text-primary">Open the trip</Link>} />
        ) : null}
        {row && row.status !== "CONFIRMED" ? (
          <div className="mt-6 space-y-4 rounded-card bg-surface p-5 shadow-soft">
            <p className="font-display text-2xl">{row.title}</p>
            <p className="text-sm text-muted">{row.check_in} → {row.check_out}</p>
            <p className="font-display text-3xl tabular-nums">{formatMoney(row.total_cents, row.currency.toUpperCase())}</p>
            {minutes != null && seconds != null && row.status === "PENDING" ? (
              <p className="text-sm">Dates held for {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</p>
            ) : null}
            <label className="flex min-h-11 items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              I agree to the listing's cancellation policy. Nestora does not store my card number.
            </label>
            {row.paymentsReady ? (
              <>
                <div id="payment-element" />
                <Button type="button" disabled={paying || left === 0} onClick={() => void pay()}>{paying ? "Contacting the card network…" : "Pay now"}</Button>
              </>
            ) : (
              <p className="text-sm text-muted">Card checkout needs STRIPE_SECRET_KEY and VITE_STRIPE_PUBLISHABLE_KEY. The dates stay held, and nothing is charged until those are set. No card form is shown, because Nestora will not collect card numbers itself.</p>
            )}
          </div>
        ) : null}
      </div>
    </PublicFrame>
  );
}

function loadStripe() {
  if ("Stripe" in window) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Stripe.js did not load."));
    document.head.appendChild(script);
  });
}
