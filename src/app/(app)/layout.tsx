import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { countUrgent } from "@/lib/reminders";
import { AppShell } from "@/components/shell/app-shell";
import { RealtimeProvider } from "@/components/shell/realtime";
import { ToastProvider } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [notifs, [{ n: unread }], urgent] = await Promise.all([
    db.select().from(schema.notifications).where(eq(schema.notifications.userId, user.id)).orderBy(desc(schema.notifications.createdAt)).limit(20),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.notifications).where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt))),
    countUrgent(user),
  ]);
  return (
    <ToastProvider>
      <RealtimeProvider>
        <AppShell
          user={{ name: user.name, role: user.role, permissions: user.permissions }}
          urgentCount={urgent}
          unread={unread}
          notifications={notifs.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }))}>
          {children}
        </AppShell>
      </RealtimeProvider>
    </ToastProvider>
  );
}
