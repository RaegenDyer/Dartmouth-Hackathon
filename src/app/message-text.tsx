// MB-5: model output is rendered only as React text. It is never parsed as HTML
// and URLs are never turned into links.
export function MessageText({ text }: { text: string }) {
  return <p>{text}</p>;
}
