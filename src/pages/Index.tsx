import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Building2, 
  CalendarCheck, 
  CheckCircle2, 
  Shield, 
  Briefcase,
  ListChecks,
  UserCog,
  Crown,
  ArrowRight
} from "lucide-react";

const Index = () => {
  const roles = [
    {
      icon: Crown,
      title: "Super Admin",
      color: "text-primary",
      bgColor: "bg-primary/10",
      description: "Create workspaces, manage vacation types, system-wide settings",
      features: ["All workspace access", "System configuration", "Global user management"]
    },
    {
      icon: Shield,
      title: "General System Admin",
      color: "text-accent",
      bgColor: "bg-accent/10",
      description: "Manage facilities, departments, and workspace configuration",
      features: ["Facility management", "Department setup", "Workspace settings"]
    },
    {
      icon: Building2,
      title: "Workplace Supervisor",
      color: "text-success",
      bgColor: "bg-success/10",
      description: "Final approval authority and workspace-wide task creation",
      features: ["Level 3 approvals", "Workspace tasks", "Coverage oversight"]
    },
    {
      icon: UserCog,
      title: "Facility Supervisor",
      color: "text-warning",
      bgColor: "bg-warning/10",
      description: "Approve department plans and manage facility operations",
      features: ["Level 2 approvals", "Facility tasks", "Department oversight"]
    },
    {
      icon: Briefcase,
      title: "Department Head",
      color: "text-primary",
      bgColor: "bg-primary/10",
      description: "Create staff accounts, plan vacations, manage department tasks",
      features: ["Staff account creation", "Vacation planning", "Team management"]
    },
    {
      icon: Users,
      title: "Staff",
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      description: "View schedules, complete tasks, track vacation balance",
      features: ["Personal schedule", "Task completion", "Balance tracking"]
    },
  ];

  const features = [
    {
      icon: CalendarCheck,
      title: "Smart Vacation Planning",
      description: "Plan up to 6 vacation splits with intelligent conflict detection and coverage analysis"
    },
    {
      icon: CheckCircle2,
      title: "3-Level Approval Workflow",
      description: "Streamlined approval process from Department Head → Facility Supervisor → Workplace Supervisor"
    },
    {
      icon: ListChecks,
      title: "Task Management",
      description: "Create and assign tasks at workspace, facility, or department levels"
    },
    {
      icon: Building2,
      title: "Organizational Hierarchy",
      description: "Manage facilities, departments, and subdepartments with complete flexibility"
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-background" />
        <div className="container relative mx-auto px-4 py-20 sm:py-28">
          <div className="mx-auto max-w-4xl text-center">
            <Badge className="mb-6 bg-accent/10 text-accent border-accent/20 hover:bg-accent/20" variant="outline">
              Enterprise Workforce Management
            </Badge>
            <h1 className="mb-6 text-5xl font-display font-bold tracking-tight sm:text-6xl lg:text-7xl bg-gradient-primary bg-clip-text text-transparent">
              Planivo
            </h1>
            <p className="mb-8 text-xl text-muted-foreground leading-relaxed">
              Intelligent vacation planning and workforce management with multi-tiered approval workflows
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Button size="lg" className="bg-gradient-primary shadow-medium hover:shadow-strong transition-all duration-300">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="border-2 hover:border-primary/50 transition-colors">
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-display font-bold mb-4">Powerful Features</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Everything you need to manage your workforce efficiently
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="p-6 border-2 hover:border-primary/20 hover:shadow-medium transition-all duration-300">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Roles Section */}
      <section className="border-t border-border bg-muted/30">
        <div className="container mx-auto px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-display font-bold mb-4">Role-Based Access Control</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Six specialized roles with tailored dashboards and permissions
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {roles.map((role, index) => (
                <Card key={index} className="p-6 border-2 hover:border-primary/20 hover:shadow-medium transition-all duration-300 group">
                  <div className={`inline-flex p-3 rounded-lg ${role.bgColor} mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    <role.icon className={`h-6 w-6 ${role.color}`} />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{role.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{role.description}</p>
                  <ul className="space-y-2">
                    {role.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center gap-2 text-sm">
                        <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                        <span className="text-foreground/80">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-display font-bold mb-4">Approval Workflow</h2>
            <p className="text-muted-foreground text-lg">
              Streamlined 3-level approval process ensuring coverage and compliance
            </p>
          </div>
          <div className="relative">
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary via-accent to-success -translate-x-1/2" />
            <div className="space-y-12">
              {[
                { level: "Level 1", role: "Department Head", action: "Creates vacation plan", color: "primary" },
                { level: "Level 2", role: "Facility Supervisor", action: "Reviews and approves", color: "accent" },
                { level: "Level 3", role: "Workplace Supervisor", action: "Final approval", color: "success" },
              ].map((step, index) => (
                <div key={index} className={`flex items-center gap-6 ${index % 2 === 0 ? 'flex-row' : 'flex-row-reverse'}`}>
                  <div className="flex-1" />
                  <div className="relative z-10">
                    <div className={`h-12 w-12 rounded-full bg-${step.color} flex items-center justify-center shadow-medium`}>
                      <span className="text-white font-bold">{index + 1}</span>
                    </div>
                  </div>
                  <Card className="flex-1 p-6 border-2 shadow-soft hover:shadow-medium transition-shadow">
                    <div className={`text-sm font-semibold text-${step.color} mb-1`}>{step.level}</div>
                    <div className="font-semibold mb-1">{step.role}</div>
                    <div className="text-sm text-muted-foreground">{step.action}</div>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border bg-gradient-primary">
        <div className="container mx-auto px-4 py-20 text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-display font-bold mb-4 text-primary-foreground">
              Ready to Transform Your Workforce Management?
            </h2>
            <p className="text-primary-foreground/90 text-lg mb-8">
              Join organizations using Planivo to streamline vacation planning and improve operational efficiency
            </p>
            <Button size="lg" variant="secondary" className="shadow-strong hover:shadow-medium transition-all duration-300">
              Start Free Trial
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
