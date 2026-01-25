import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function CookiePolicy() {
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
                        <h1 className="text-4xl font-bold tracking-tight">Cookie Policy</h1>
                        <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
                    </div>

                    <div className="prose prose-slate dark:prose-invert max-w-none">
                        <h3>1. What Are Cookies</h3>
                        <p>
                            Cookies are small pieces of text sent by your web browser by a website you visit. A cookie file is stored in your web browser and allows the Service or a third-party to recognize you and make your next visit easier and the Service more useful to you.
                        </p>

                        <h3>2. How We Use Cookies</h3>
                        <p>
                            When you use and access the Service, we may place a number of cookies files in your web browser. We use cookies for the following purposes: to enable certain functions of the Service, to provide analytics, to store your preferences, to enable advertisements delivery, including behavioral advertising.
                        </p>

                        <h3>3. Your Choices</h3>
                        <p>
                            If you'd like to delete cookies or instruct your web browser to delete or refuse cookies, please visit the help pages of your web browser. Please note, however, that if you delete cookies or refuse to accept them, you might not be able to use all of the features we offer.
                        </p>

                        <h3>4. Contact Us</h3>
                        <p>
                            If you have any questions about our Cookie Policy, please contact us at <a href="mailto:konshedo@gmail.com" className="text-primary hover:underline">konshedo@gmail.com</a>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
