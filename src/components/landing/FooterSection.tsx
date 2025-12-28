import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";

export function FooterSection() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
              <Building2 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">Planivo</span>
          </Link>

          {/* Copyright */}
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Planivo. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}