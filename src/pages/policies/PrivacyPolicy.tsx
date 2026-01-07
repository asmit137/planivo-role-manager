import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto px-4 py-8">
                <div className="mb-8">
                    <Button variant="ghost" asChild className="pl-0 hover:bg-transparent hover:text-primary">
                        <Link to="/" className="flex items-center gap-2">
                            <ArrowLeft className="h-4 w-4" />
                            Back to Home
                        </Link>
                    </Button>
                </div>

                <div className="max-w-3xl mx-auto space-y-8">
                    <div className="space-y-4">
                        <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
                        <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
                    </div>

                    <div className="prose prose-slate dark:prose-invert max-w-none">
                        <h3>1. Information Collection</h3>
                        <p>
                            We collect information you provide directly to us, such as when you create or modify your account, request on-demand services, contact customer support, or otherwise communicate with us.
                        </p>

                        <h3>2. How We Use Information</h3>
                        <p>
                            We use the information we collect to provider, maintain, and improve our services, such as to process transactions, verify your identity, and send you product updates.
                        </p>

                        <h3>3. Information Sharing</h3>
                        <p>
                            We may share the information we collect about you as described in this policy or as described at the time of collection or sharing, including with third party vendors.
                        </p>

                        <h3>4. Data Security</h3>
                        <p>
                            We implement appropriate technical and organizational measures to protect specific personal data against unauthorized or unlawful processing and against accidental loss, destruction, or damage.
                        </p>

                        <h3>5. Contact Us</h3>
                        <p>
                            If you have any questions about this Privacy Policy, please contact us at <a href="mailto:privacy@planivo.com" className="text-primary hover:underline">privacy@planivo.com</a>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
