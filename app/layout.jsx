import './globals.css';

export const metadata = {
  title: 'SimCare CACREP Alignment Mapper',
  description: 'Map any counseling syllabus to CACREP 2024 standards and named SimCare avatars in fifteen seconds.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased text-ink-800">
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
