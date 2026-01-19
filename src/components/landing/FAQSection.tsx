import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
    {
        question: "How does the pricing model work?",
        answer: "We offer flexible pricing tiers based on the size of your organization and the specific modules you need. Contact our sales team for a custom quote tailored to your requirements."
    },
    {
        question: "Can I manage multiple facilities?",
        answer: "Yes! Planivo is designed for multi-site management. You can create and manage unlimited facilities, each with its own departments, staff, and schedules, all from a unified dashboard."
    },
    {
        question: "Is technical support included?",
        answer: "Absolutely. All plans include access to our standard support via email and chat. Enterprise plans receive priority 24/7 support and a dedicated account manager."
    },
    {
        question: "Can I integrate Planivo with other software?",
        answer: "We offer API access for Enterprise plans, allowing you to integrate Planivo with your existing HR, payroll, and ERP systems for a seamless workflow."
    },
    {
        question: "How secure is my data?",
        answer: "Security is our top priority. We use enterprise-grade encryption for data in transit and at rest, and we comply with major industry standards to ensure your workforce data remains protected."
    }
];

export function FAQSection() {
    return (
        <section className="py-24 bg-background">
            <div className="container px-4 md:px-6">
                <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
                    <div className="inline-block rounded-lg bg-primary/10 px-3 py-1 text-sm text-primary">
                        FAQ
                    </div>
                    <h2 className="text-3xl font-bold tracking-tighter md:text-4xl">
                        Frequently Asked Questions
                    </h2>
                    <p className="max-w-[700px] text-muted-foreground md:text-xl">
                        Everything you need to know about Planivo's features and services.
                    </p>
                </div>
                <div className="max-w-3xl mx-auto">
                    <Accordion type="single" collapsible className="w-full">
                        {faqs.map((faq, index) => (
                            <AccordionItem key={index} value={`item-${index}`}>
                                <AccordionTrigger className="text-left text-lg font-medium">
                                    {faq.question}
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground leading-relaxed">
                                    {faq.answer}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            </div>
        </section>
    );
}
