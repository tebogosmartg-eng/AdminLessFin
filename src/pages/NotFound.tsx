import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { AppIcon } from "@/components/brand";
import { BRAND } from "@/config/brand";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  useDocumentTitle("Page not found");

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-6">
      <AppIcon size="md" />
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-2">404</h1>
        <p className="text-lg text-muted-foreground mb-6">This page doesn&apos;t exist in {BRAND.product}.</p>
        <Button asChild>
          <Link to="/">Return to dashboard</Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
