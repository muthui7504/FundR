import { useState } from "react";
import { Check, Copy, Loader2, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/services/api";
import { publicAppUrl } from "@/utils/public-url";

export function ShareCampaignButton({
  campaignName,
  joinCode,
  size = "sm",
}: {
  campaignName: string;
  joinCode: string;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const createLink = async () => {
    setLoading(true);
    setError("");
    try {
      const invitation = await api.organisations.inviteMember();
      const url = new URL(publicAppUrl(`/join/${encodeURIComponent(joinCode)}`));
      url.searchParams.set("invite", invitation.token);
      setLink(url.toString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create a campaign link.");
    } finally {
      setLoading(false);
    }
  };

  const openDialog = () => {
    setOpen(true);
    setLink("");
    setCopied(false);
    void createLink();
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Campaign link copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Unable to copy the campaign link. Select and copy the link shown.");
    }
  };

  const whatsappUrl = link
    ? `https://wa.me/?text=${encodeURIComponent(`Join ${campaignName} on FundR: ${link}`)}`
    : "";

  return (
    <>
      <Button type="button" size={size} variant="outline" onClick={openDialog}>
        <Share2 className="size-4" />
        Share
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share this campaign</DialogTitle>
            <DialogDescription>
              Share the invitation link so people can view the campaign and eligible members can
              join your organisation’s team.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <p role="status" className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Creating your campaign link…
            </p>
          ) : error ? (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">{error}</p>
              <Button type="button" variant="outline" onClick={() => void createLink()}>
                Try again
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="break-all rounded-xl border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
                {link}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="outline" onClick={() => void copyLink()}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied!" : "Copy campaign link"}
                </Button>
                <Button asChild>
                  <a href={whatsappUrl} target="_blank" rel="noreferrer">
                    <MessageCircle className="size-4" />
                    Share on WhatsApp
                  </a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
