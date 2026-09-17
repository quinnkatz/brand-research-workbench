import { getChatGPTUser } from "./chatgpt-auth";
import { Workbench } from "@/components/research/workbench";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getChatGPTUser();
  return <Workbench user={user ? { displayName: user.displayName } : null}/>;
}
