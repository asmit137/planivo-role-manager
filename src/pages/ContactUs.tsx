import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import emailjs from "@emailjs/browser";
import { ArrowLeft, Send, Phone, Mail, MapPin, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const formSchema = z.object({
    name: z.string().min(2, { message: "Name must be at least 2 characters." }),
    email: z.string().email({ message: "Please enter a valid email address." }),
    phone: z.string().min(10, { message: "Please enter a valid phone number." }),
    message: z.string().min(10, { message: "Message must be at least 10 characters." }),
});

type FormData = z.infer<typeof formSchema>;

export default function ContactUs() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<FormData>({
        resolver: zodResolver(formSchema),
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        try {
            // NOTE: Replace these placeholder IDs with your actual EmailJS credentials
            // You can find these in your EmailJS dashboard: https://dashboard.emailjs.com/
            const result = await emailjs.send(
                "service_oije1nm", // EmailJS Service ID
                "template_i7hk578", // EmailJS Template ID
                {
                    from_name: data.name,
                    reply_to: data.email,
                    phone_number: data.phone,
                    message: data.message,
                    to_email: data.email, // This could be used for the confirmation if your template supports it
                },
                "BUUl8C9CV_tsY8W69" // EmailJS Public Key
            );

            if (result.status === 200) {
                toast.success("Message sent successfully!");
                setIsSuccess(true);
                reset();
            }
        } catch (error) {
            console.error("EmailJS Error:", error);
            toast.error("Failed to send message. Please try again later.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Background Decorative Elements */}
            <div className="absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
                <div className="absolute top-[20%] -right-[5%] w-[30%] h-[30%] bg-secondary/10 rounded-full blur-[100px]" />
            </div>

            <div className="container mx-auto px-4 py-12 md:py-24 max-w-7xl relative">
                <div className="mb-8">
                    <Button variant="ghost" asChild className="pl-0 hover:bg-transparent hover:text-primary transition-colors">
                        <Link to="/" className="flex items-center gap-2">
                            <ArrowLeft className="h-4 w-4" />
                            Back to Home
                        </Link>
                    </Button>
                </div>

                <div className="grid lg:grid-cols-2 gap-16 items-start">
                    {/* Left Side: Contact Information */}
                    <div className="space-y-12">
                        <div className="space-y-6">
                            <h1 className="text-4xl md:text-6xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                                Let's start a <br />
                                <span className="text-primary">conversation</span>
                            </h1>
                            <p className="text-xl text-muted-foreground leading-relaxed max-w-lg">
                                Have questions about our enterprise plans or need technical support? We're here to help you grow.
                            </p>
                        </div>

                        <div className="space-y-8">
                            <div className="flex gap-6 items-start">
                                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                                    <Mail className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-xl mb-1">Email Us</h3>
                                    <p className="text-muted-foreground mb-2">Our friendly team is here to help.</p>
                                    <a href="mailto:sales@planivo.com" className="text-primary font-medium hover:underline text-lg">
                                        sales@planivo.com
                                    </a>
                                </div>
                            </div>

                            <div className="flex gap-6 items-start">
                                <div className="h-12 w-12 rounded-2xl bg-secondary/10 flex items-center justify-center shrink-0">
                                    <Phone className="h-6 w-6 text-secondary-foreground" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-xl mb-1">Call Us</h3>
                                    <p className="text-muted-foreground mb-2">Mon-Fri from 9am to 6pm EST.</p>
                                    <a href="tel:+1234567890" className="text-primary font-medium hover:underline text-lg">
                                        +1 (555) 000-0000
                                    </a>
                                </div>
                            </div>

                            <div className="flex gap-6 items-start">
                                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                                    <MapPin className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-xl mb-1">Visit Us</h3>
                                    <p className="text-muted-foreground mb-2">Come say hello at our office.</p>
                                    <p className="text-foreground font-medium text-lg">
                                        123 Innovation Drive, Tech Valley, CA 94043
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Contact Form */}
                    <div>
                        <Card className="border-border/50 bg-card/50 backdrop-blur-sm shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-primary" />

                            <CardHeader className="space-y-2 pb-8">
                                <CardTitle className="text-3xl font-bold">Send us a message</CardTitle>
                                <CardDescription className="text-base">
                                    Fill out the form below and we'll get back to you within 24 hours.
                                </CardDescription>
                            </CardHeader>

                            <CardContent>
                                {isSuccess ? (
                                    <div className="py-12 flex flex-col items-center text-center space-y-6 animate-in fade-in zoom-in duration-500">
                                        <div className="h-20 w-20 rounded-full bg-success/10 flex items-center justify-center">
                                            <CheckCircle2 className="h-12 w-12 text-success" />
                                        </div>
                                        <div className="space-y-2">
                                            <h3 className="text-2xl font-bold">Message Sent!</h3>
                                            <p className="text-muted-foreground max-w-sm mx-auto">
                                                Thank you for reaching out. We've received your inquiry and will be in touch shortly.
                                            </p>
                                        </div>
                                        <Button onClick={() => setIsSuccess(false)} variant="outline" className="mt-4">
                                            Send another message
                                        </Button>
                                    </div>
                                ) : (
                                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                                        <div className="grid md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <Label htmlFor="name" className="text-sm font-medium">Full Name</Label>
                                                <Input
                                                    id="name"
                                                    placeholder="John Doe"
                                                    className="bg-background/50 border-border focus:ring-primary"
                                                    {...register("name")}
                                                />
                                                {errors.name && (
                                                    <p className="text-xs text-destructive mt-1 font-medium">{errors.name.message}</p>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                                                <Input
                                                    id="email"
                                                    type="email"
                                                    placeholder="john@example.com"
                                                    className="bg-background/50 border-border focus:ring-primary"
                                                    {...register("email")}
                                                />
                                                {errors.email && (
                                                    <p className="text-xs text-destructive mt-1 font-medium">{errors.email.message}</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
                                            <Input
                                                id="phone"
                                                type="tel"
                                                placeholder="+1 (555) 000-0000"
                                                className="bg-background/50 border-border focus:ring-primary"
                                                {...register("phone")}
                                            />
                                            {errors.phone && (
                                                <p className="text-xs text-destructive mt-1 font-medium">{errors.phone.message}</p>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="message" className="text-sm font-medium">Your Message</Label>
                                            <Textarea
                                                id="message"
                                                placeholder="Tell us about your needs..."
                                                className="min-h-[150px] bg-background/50 border-border focus:ring-primary resize-none"
                                                {...register("message")}
                                            />
                                            {errors.message && (
                                                <p className="text-xs text-destructive mt-1 font-medium">{errors.message.message}</p>
                                            )}
                                        </div>

                                        <Button
                                            type="submit"
                                            className="w-full h-12 text-base font-semibold transition-all duration-300 shadow-lg shadow-primary/20 hover:shadow-primary/40 group"
                                            disabled={isSubmitting}
                                        >
                                            {isSubmitting ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                                                    Sending...
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    Send Message
                                                    <Send className="h-4 w-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                                                </div>
                                            )}
                                        </Button>
                                    </form>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
