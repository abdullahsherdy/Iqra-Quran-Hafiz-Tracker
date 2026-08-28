export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center p-4"
      style={{
        backgroundImage: "url('/Sacred Light Islamic Ancient Room Illuminated By Sunrays, Islamic Architecture, Windows Ornate, Sunlight Beams Background Image And Wallpaper for Free Download.jpeg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Dark overlay so card stays readable */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      {/* Content above overlay */}
      <div className="relative z-10 w-full flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
