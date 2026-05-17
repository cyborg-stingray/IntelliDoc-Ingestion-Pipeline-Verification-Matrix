import './globals.css';

export const metadata = {
  title: 'IntelliDoc Ingestion Matrix',
  description: 'Human-in-the-loop Edge AI document processing prototype.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full bg-slate-900">
      <body className="h-full antialiased text-slate-100 selection:bg-blue-500/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
