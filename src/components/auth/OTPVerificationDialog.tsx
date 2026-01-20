import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

interface OTPVerificationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onVerify: () => void;
    title?: string;
    description?: string;
    actionLabel?: string;
}

/**
 * A reusable OTP Verification Dialog for critical actions.
 * In a real-world scenario, this would interface with a backend to send and verify a real OTP.
 * For this implementation, we simulate the OTP process.
 */
export const OTPVerificationDialog = ({
    open,
    onOpenChange,
    onVerify,
    title = "Verify Your Identity",
    description = "A verification code has been sent to your registered email/phone. Please enter it below to proceed.",
    actionLabel = "Confirm Action",
}: OTPVerificationDialogProps) => {
    const [otp, setOtp] = useState("");
    const [isVerifying, setIsVerifying] = useState(false);
    const [generatedCode, setGeneratedCode] = useState("");

    // Simulate sending OTP when dialog opens
    useEffect(() => {
        if (open) {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            setGeneratedCode(code);
            // console.log(`[SECURITY] OTP for critical action: ${code}`);

            toast.info("Security code sent! (Check console in development)", {
                description: `Code: ${code}`,
                duration: 10000,
            });

            setOtp("");
        }
    }, [open]);

    const handleVerify = async () => {
        if (otp.length !== 6) {
            toast.error("Please enter a 6-digit code");
            return;
        }

        setIsVerifying(true);

        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 800));

        if (otp === generatedCode) {
            toast.success("Identity verified successfully");
            onVerify();
            onOpenChange(false);
        } else {
            toast.error("Invalid verification code. Please try again.");
        }

        setIsVerifying(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-4">
                        <ShieldCheck className="h-6 w-6 text-primary" />
                    </div>
                    <DialogTitle className="text-center text-xl">{title}</DialogTitle>
                    <DialogDescription className="text-center">
                        {description}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="flex flex-col items-center gap-2">
                        <Label htmlFor="otp" className="sr-only">
                            6-Digit Code
                        </Label>
                        <Input
                            id="otp"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="000000"
                            className="text-center text-2xl tracking-[0.5em] font-bold h-14"
                            autoFocus
                            autoComplete="one-time-code"
                            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                        />
                    </div>
                </div>

                <DialogFooter className="sm:flex-col gap-2">
                    <Button
                        onClick={handleVerify}
                        disabled={isVerifying || otp.length !== 6}
                        className="w-full h-11"
                    >
                        {isVerifying ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Verifying...
                            </>
                        ) : (
                            actionLabel
                        )}
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="w-full"
                        disabled={isVerifying}
                    >
                        Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
