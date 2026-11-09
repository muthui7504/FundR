export const meta = (title: string, description: string) => ({
  meta: [
    { title: `${title} — FundR` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — FundR` },
    { property: "og:description", content: description },
  ],
});
