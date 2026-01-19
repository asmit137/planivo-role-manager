import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Quote } from "lucide-react";

const testimonials = [
    {
        name: "Sarah Johnson",
        role: "HR Director",
        company: "TechFlow Inc.",
        content: "Planivo has completely transformed how we handle employee scheduling. The automated conflict detection alone has saved us hours every week.",
        avatar: "SJ"
    },
    {
        name: "Michael Chen",
        role: "Operations Manager",
        company: "Global Logistics",
        content: "The facility management features are outstanding. We can now manage multiple sites and their specific staffing requirements from a single dashboard.",
        avatar: "MC"
    },
    {
        name: "Emily Rodriguez",
        role: "Department Head",
        company: "Westside Hospital",
        content: "User role management is intuitive and secure. Assigning permissions and tracking certifications for our medical staff has never been easier.",
        avatar: "ER"
    }
];

export function TestimonialSection() {
    return (
        <section className="py-24 bg-muted/50">
            <div className="container px-4 md:px-6">
                <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
                    <div className="inline-block rounded-lg bg-primary/10 px-3 py-1 text-sm text-primary">
                        Testimonials
                    </div>
                    <h2 className="text-3xl font-bold tracking-tighter md:text-4xl">
                        Trusted by Industry Leaders
                    </h2>
                    <p className="max-w-[700px] text-muted-foreground md:text-xl">
                        See what our customers have to say about streamlining their workforce management with Planivo.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {testimonials.map((testimonial, index) => (
                        <Card key={index} className="bg-background border-none shadow-sm hover:shadow-md transition-shadow">
                            <CardHeader className="flex flex-row items-center gap-4 pb-4">
                                <Avatar className="h-12 w-12 border-2 border-primary/10">
                                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${testimonial.avatar}`} alt={testimonial.name} />
                                    <AvatarFallback>{testimonial.avatar}</AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col">
                                    <p className="text-sm font-semibold">{testimonial.name}</p>
                                    <p className="text-xs text-muted-foreground">{testimonial.role}, {testimonial.company}</p>
                                </div>
                            </CardHeader>
                            <CardContent className="relative">
                                <Quote className="absolute top-0 right-0 h-8 w-8 text-primary/10 -mt-2 -mr-2" />
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    "{testimonial.content}"
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
    );
}
