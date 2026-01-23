import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Pencil, Save, User, Info, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface LeaveType {
    id: string;
    name: string;
}

interface StaffOverrideCardProps {
    member: any;
    leaveTypes: LeaveType[];
    balances: any[];
    defaults: any[];
    editingId: string | null;
    setEditingId: (id: string | null) => void;
    updatingId: string | null;
    onUpdate: (data: { staffId: string; typeId: string; accrued: number; staffName: string; typeName: string }) => void;
}

export function StaffOverrideCard({
    member,
    leaveTypes,
    balances,
    defaults,
    editingId,
    setEditingId,
    updatingId,
    onUpdate,
}: StaffOverrideCardProps) {
    const staffName = member.profiles?.full_name || 'Staff Member';
    const staffEmail = member.profiles?.email || '';
    const staffRole = member.role?.replace('_', ' ') || 'Staff';
    const initials = staffName
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase();

    return (
        <Card className="overflow-hidden border-border/50 hover:border-primary/20 transition-all duration-300 group shadow-sm hover:shadow-md">
            <CardHeader className="p-4 bg-muted/20 border-b">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                            <AvatarFallback className="bg-primary/5 text-primary text-xs font-bold">
                                {initials}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <h3 className="font-bold text-sm truncate">{staffName}</h3>
                            <p className="text-[10px] text-muted-foreground truncate">{staffEmail}</p>
                        </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] capitalize shrink-0 py-0 h-5">
                        {staffRole}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {leaveTypes.map((type) => {
                        const individualBalance = balances.find(
                            (b: any) => b.staff_id === member.user_id && b.vacation_type_id === type.id
                        );
                        const roleDefault = defaults.find(
                            (d: any) => d.role === member.role && d.vacation_type_id === type.id
                        );

                        const isCustom = !!individualBalance;
                        const displayValue = individualBalance ? individualBalance.accrued : (roleDefault?.default_days || 0);
                        const isEditing = editingId === `${member.user_id}-${type.id}`;
                        const isUpdating = updatingId === `${member.user_id}-${type.id}`;

                        return (
                            <div
                                key={type.id}
                                className={cn(
                                    "flex flex-col gap-1.5 p-3 rounded-xl border transition-all group/item",
                                    isCustom ? "bg-primary/[0.02] border-primary/10" : "bg-background border-border/50"
                                )}
                            >
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                                        {type.name}
                                    </span>
                                    {isCustom ? (
                                        <Badge variant="outline" className="text-[9px] h-4 px-1 text-primary border-primary/20 bg-primary/5">
                                            Custom
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-[9px] h-4 px-1 text-muted-foreground border-transparent">
                                            Auto
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <Input
                                            type="number"
                                            className={cn(
                                                "h-8 font-semibold transition-all text-sm",
                                                !isCustom && "text-muted-foreground italic",
                                                isEditing ? "ring-2 ring-primary/20" : "bg-transparent border-transparent hover:bg-muted/30"
                                            )}
                                            defaultValue={displayValue}
                                            disabled={!isEditing && !isUpdating}
                                            onBlur={(e) => {
                                                setEditingId(null);
                                                const val = parseInt(e.target.value);
                                                if (val < 0) {
                                                    toast.error("Balance cannot be negative");
                                                    return;
                                                }
                                                if (val !== displayValue) {
                                                    onUpdate({
                                                        staffId: member.user_id,
                                                        typeId: type.id,
                                                        accrued: val,
                                                        staffName: staffName,
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
                                    <div className="flex items-center">
                                        {isUpdating ? (
                                            <RefreshCcw className="h-4 w-4 animate-spin text-muted-foreground" />
                                        ) : (
                                            <Button
                                                variant={isEditing ? "default" : "ghost"}
                                                size="icon"
                                                className={cn(
                                                    "h-8 w-8 shrink-0",
                                                    !isEditing && "opacity-0 group-hover/item:opacity-100"
                                                )}
                                                onClick={() => setEditingId(isEditing ? null : `${member.user_id}-${type.id}`)}
                                            >
                                                {isEditing ? <Save className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                {isCustom && (
                                    <div className="flex justify-between items-center text-[9px] mt-0.5 text-muted-foreground">
                                        <span className="opacity-70">Used: <span className="font-bold text-foreground">{individualBalance.used}</span></span>
                                        <span className="bg-primary/10 text-primary px-1 rounded-sm">Rem: <span className="font-bold">{individualBalance.balance}</span></span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
