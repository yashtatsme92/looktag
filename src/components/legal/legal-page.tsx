import { AppShell } from "@/components/layout/app-shell";

export type LegalKind = "impressum" | "privacy" | "terms" | "about";

const TITLES: Record<LegalKind, string> = {
  impressum: "Impressum",
  privacy: "Privacy",
  terms: "Terms",
  about: "About Looktag",
};

function Body({ kind, email }: { kind: LegalKind; email: string }) {
  const mail = <a className="underline" href={`mailto:${email}`}>{email}</a>;
  if (kind === "impressum") {
    return <p>Looktag. Contact: {mail}.</p>;
  }
  if (kind === "privacy") {
    return (
      <p>
        Looktag stores the account details you give it (name, email) and the looks you publish.
        Questions or deletion requests: {mail}.
      </p>
    );
  }
  if (kind === "terms") {
    return <p>By using Looktag you agree to post only images you have the right to share. Questions: {mail}.</p>;
  }
  return <p>Looktag is a place for shoppable looks: pin the pieces, tap to shop them. Say hello: {mail}.</p>;
}

export function LegalPage({ kind, email }: { kind: LegalKind; email: string }) {
  return (
    <AppShell title={TITLES[kind]} backTo="/">
      <article className="mx-auto max-w-prose py-6 text-sm leading-relaxed" data-testid={`legal-${kind}`}>
        <h1 className="font-display text-3xl mb-4">{TITLES[kind]}</h1>
        <Body kind={kind} email={email} />
      </article>
    </AppShell>
  );
}
