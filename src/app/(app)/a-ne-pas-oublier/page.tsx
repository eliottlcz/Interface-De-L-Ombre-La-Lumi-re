import { requireUser } from "@/lib/auth/session";
import { getReminders } from "@/lib/reminders";
import { listUsers } from "@/lib/queries";
import { RemindersView } from "./reminders-view";

export const metadata = { title: "À ne pas oublier" };

export default async function Page() {
  const user = await requireUser();
  const [reminders, users] = await Promise.all([getReminders(user), listUsers()]);
  return <RemindersView reminders={reminders} users={users.map((u) => ({ id: u.id, label: u.name }))} meId={user.id} />;
}
