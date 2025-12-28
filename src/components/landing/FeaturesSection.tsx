import {
  Calendar,
  Users,
  ClipboardList,
  GraduationCap,
  Palmtree,
  Bell,
  Shield,
  BarChart3,
  MessageSquare,
  Building2,
  Clock,
  Workflow,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description: "Create and manage complex shift schedules with drag-and-drop simplicity. Automatic conflict detection.",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    icon: Palmtree,
    title: "Vacation Management",
    description: "Streamlined vacation requests with multi-level approval workflows and calendar integration.",
    color: "text-success",
    bgColor: "bg-success/10",
  },
  {
    icon: ClipboardList,
    title: "Task Management",
    description: "Assign, track, and complete tasks across departments. Real-time status updates for everyone.",
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
  {
    icon: GraduationCap,
    title: "Training & Events",
    description: "Schedule training sessions, track attendance, and host virtual meetings with built-in video.",
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
  {
    icon: Users,
    title: "Staff Management",
    description: "Comprehensive employee profiles, role management, and organizational hierarchy.",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    icon: Building2,
    title: "Multi-Location",
    description: "Manage multiple workspaces, facilities, and departments from a single dashboard.",
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  {
    icon: Bell,
    title: "Smart Notifications",
    description: "Real-time alerts for schedule changes, task assignments, and approval requests.",
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
  {
    icon: MessageSquare,
    title: "Team Messaging",
    description: "Built-in messaging system for seamless team communication and collaboration.",
    color: "text-success",
    bgColor: "bg-success/10",
  },
  {
    icon: BarChart3,
    title: "Analytics & Reports",
    description: "Comprehensive analytics on workforce metrics, attendance patterns, and productivity.",
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Role-based access control, audit logs, and enterprise-grade data protection.",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    icon: Clock,
    title: "Time Tracking",
    description: "Track working hours, overtime, and break times with precision and accuracy.",
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
  {
    icon: Workflow,
    title: "Custom Workflows",
    description: "Design approval workflows that match your organization's unique processes.",
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
];

export function FeaturesSection() {
  return (
    <section className="bg-muted/30 py-20 md:py-32">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            Features
          </span>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
            Everything You Need to Manage Your Workforce
          </h2>
          <p className="text-lg text-muted-foreground">
            From scheduling to training, Planivo provides all the tools your organization needs
            to operate efficiently and keep your team productive.
          </p>
        </div>

        {/* Features grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="group border-border/50 bg-card/50 backdrop-blur-sm transition-all hover:border-primary/30 hover:shadow-lg"
            >
              <CardContent className="p-6">
                <div
                  className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${feature.bgColor} transition-transform group-hover:scale-110`}
                >
                  <feature.icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
