import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function showSuccess(title: string, description?: string) {
  toast.success(title, {
    description,
    icon: <CheckCircle2 className="h-5 w-5 text-success" />,
  });
}
