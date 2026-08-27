import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brain Box AI — Think it. Say it. Automate it.",
  description: "AI-first conversational automation platform. Connect Gmail, Calendar, Slack, Discord, Telegram, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 dark:bg-slate-950">
        {children}
      </body>
    </html>
  );
}
