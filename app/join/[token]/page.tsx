import { requireUser } from "@/app/auth";
import { JoinWorkspace } from "@/components/research/join-workspace";
export const dynamic = "force-dynamic";
export const metadata = { title: "Join a brand workspace", robots: { index:false, follow:false }, referrer:"no-referrer" };
export default async function JoinPage({ params }: { params:Promise<{token:string}> }) {
  const { token } = await params; const user = await requireUser(`/join/${token}`);
  return <JoinWorkspace token={token} email={user.email}/>;
}
