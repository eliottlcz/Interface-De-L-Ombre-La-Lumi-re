import { requireUser } from "@/lib/auth/session";
export default async function Home() {
  const u = await requireUser();
  return <h1 className="display text-3xl">Bonjour {u.name}</h1>;
}
