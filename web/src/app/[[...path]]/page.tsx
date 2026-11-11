import { SpaRoot } from "@/spa/spa-root";

// The only route: one static index.html. Every URL is served that file and drawn by src/spa/routes.tsx.
export function generateStaticParams() {
  return [{ path: [] }];
}

export default function Page() {
  return <SpaRoot />;
}
