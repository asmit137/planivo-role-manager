import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Save, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface LeaveType {
    id: string;
    name: string;
}

interface RoleDefaultCardProps {
    role: string;
    leaveTypes: LeaveType[];
    defaults: any[];
    editingId: string | null;
    setEditingId: (id: string | null) => void;
    onUpdate: (data: { role: string; typeId: string; default_days: number; typeName: string }) => void;
}

export function RoleDefaultCard({
    role,
    leaveTypes,
    defaults,
    editingId,
    setEditingId,
    onUpdate,
}: RoleDefaultCardProps) {
    const roleName = role.replace('_', ' ');

    return (
        <Card className="overflow-hidden border-border/50 hover:border-primary/20 transition-all duration-300 group">
            <CardHeader className="bg-muted/30 p-4 border-b">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-bold capitalize flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary/70" />
                        {roleName}
                    </CardTitle>
                    <Badge variant="outline" className="bg-background/50 backdrop-blur-sm">
                        System Role
                    </Badge>
                </div>
                <CardDescription className="text-xs mt-1">
                    Default allowances for all users with this role.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {leaveTypes.map((type) => {
                        const roleDefault = defaults.find(
                            (d: any) => d.role === role && d.vacation_type_id === type.id
                        );
                        const isEditing = editingId === `${role}-${type.id}`;

                        return (
                            <div
                                key={type.id}
                                className="flex flex-col gap-1.5 p-3 rounded-xl bg-background border border-border/50 shadow-sm hover:shadow-md transition-shadow group/item"
                            >
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                        {type.name}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <Input
                                            type="number"
                                            className={cn(
                                                "h-9 font-semibold transition-all",
                                                isEditing ? "ring-2 ring-primary/20" : "bg-muted/20 border-transparent hover:border-border"
                                            )}
                                            defaultValue={roleDefault?.default_days || 0}
                                            disabled={!isEditing}
                                            autoFocus={isEditing}
                                            onBlur={(e) => {
                                                setEditingId(null);
                                                const val = parseInt(e.target.value);
                                                if (val < 0) {
                                                    toast.error("Default cannot be negative");
                                                    return;
                                                }
                                                if (val !== (roleDefault?.default_days || 0)) {
                                                    onUpdate({
                                                        role,
                                                        typeId: type.id,
                                                        default_days: val,
                                                        typeName: type.name,
                                                    });
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') e.currentTarget.blur();
                                                if (e.key === 'Escape') setEditingId(null);
                                            }}
                                        />
                                    </div>
                                    <Button
                                        variant={isEditing ? "default" : "ghost"}
                                        size="icon"
                                        className={cn(
                                            "h-9 w-9 shrink-0 transition-all",
                                            !isEditing && "opacity-0 group-hover/item:opacity-100"
                                        )}
                                        onClick={() => setEditingId(isEditing ? null : `${role}-${type.id}`)}
                                    >
                                        {isEditing ? <Save className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
