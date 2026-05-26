import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Landing: route to the role-appropriate dashboard if signed in,
// else send to /signin.
export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const role = (session.user as { role?: string }).role;
  if (role === "PHYSICIAN") redirect("/physician");
  if (role === "PHARMACY") redirect("/pharmacy");
  if (role === "OPS") redirect("/physician"); // ops can see both; default to physician view

  // No role assigned — fall back to sign-out
  redirect("/signin/error?reason=no-role");
}
