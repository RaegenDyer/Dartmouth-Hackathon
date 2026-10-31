import type { Metadata } from "next";
import { CompanionApp } from "../companion-app";

export const metadata: Metadata = {
  title: "Your space | Candid",
};

export default function AppPage() {
  return <CompanionApp />;
}
