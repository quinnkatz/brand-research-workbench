import { getUser, signInPath, signOutPath } from "./auth";
import { Workbench } from "@/components/research/workbench";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getUser();
  return <Workbench user={user ? { displayName: user.displayName } : null} signInHref={signInPath("/")} signOutHref={signOutPath("/")}/>;
}
