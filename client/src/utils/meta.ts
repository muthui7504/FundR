export const meta = (title: string, description: string) => ({
  meta: [
    { title: `${title} — Fundraise` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — Fundraise` },
    { property: "og:description", content: description },
  ],
});
