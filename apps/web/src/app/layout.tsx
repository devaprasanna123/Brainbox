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
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            const originalFetch = window.fetch;
            window.fetch = async function(...args) {
              const res = await originalFetch(...args);
              const originalJson = res.json;
              res.json = async function() {
                const data = await originalJson.call(res);
                if (data && typeof data === 'object' && 'success' in data) {
                  if (data.success === true && 'data' in data) {
                    return data.data;
                  }
                  if (data.success === false && 'error' in data) {
                    return data;
                  }
                }
                return data;
              };
              return res;
            };
          })();
        ` }} />
        {children}
      </body>
    </html>
  );
}
