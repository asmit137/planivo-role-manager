import { Link } from "react-router-dom";
import { Building2, Facebook, Twitter, Linkedin, Instagram } from "lucide-react";

export function FooterSection() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">

          {/* Brand & Description */}
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Building2 className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-xl text-foreground">Planivo</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Empowering organizations with intelligent workforce management solutions. Streamline scheduling, enhance communication, and optimize productivity.
            </p>
            <div className="flex gap-4 pt-2">
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Linkedin className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="font-semibold text-foreground">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/" className="text-muted-foreground hover:text-primary transition-colors">Home</Link>
              </li>
              <li>
                {/* Scroll to pricing section if on home, or link to home#pricing */}
                <a href="/#pricing" className="text-muted-foreground hover:text-primary transition-colors">Pricing</a>
              </li>
              <li>
                <a href="/contact-us" className="text-muted-foreground hover:text-primary transition-colors">Contact Support</a>
              </li>
              <li>
                <Link to="/auth" className="text-muted-foreground hover:text-primary transition-colors">Login / Sign Up</Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div className="space-y-4">
            <h4 className="font-semibold text-foreground">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/policies/terms" className="text-muted-foreground hover:text-primary transition-colors">Terms of Service</Link>
              </li>
              <li>
                <Link to="/policies/privacy" className="text-muted-foreground hover:text-primary transition-colors">Privacy Policy</Link>
              </li>
              <li>
                <Link to="/policies/cookies" className="text-muted-foreground hover:text-primary transition-colors">Cookie Policy</Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h4 className="font-semibold text-foreground">Contact</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>123 Business Avenue</li>
              <li>Tech District, Suite 400</li>
              <li>New York, NY 10001</li>
              <li className="pt-2">
                <a href="mailto:hello@planivo.com" className="hover:text-primary transition-colors">hello@planivo.com</a>
              </li>
              <li>
                <a href="tel:+15551234567" className="hover:text-primary transition-colors">+1 (555) 123-4567</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Planivo Inc. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link to="/policies/privacy" className="hover:text-primary transition-colors">Privacy</Link>
            <Link to="/policies/terms" className="hover:text-primary transition-colors">Terms</Link>
            <Link to="/policies/cookies" className="hover:text-primary transition-colors">Cookies</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}