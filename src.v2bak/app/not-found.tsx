export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-primary">404</h1>
        <p className="text-muted-foreground mt-2">Page not found</p>
        <a href="/" className="mt-4 inline-block text-sm text-primary hover:underline">
          Go home
        </a>
      </div>
    </div>
  );
}
