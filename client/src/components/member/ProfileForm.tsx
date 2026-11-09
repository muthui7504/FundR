import { useEffect, useState } from "react";
import { Eye, ImageIcon, Loader2, Upload, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, ProgressBar, inputCls, textareaCls } from "@/components/kit";
import type { Campaign, FundraisingProfile } from "@/types";
import { useDemo } from "@/context/DemoStore";

export type ProfileInput = Pick<FundraisingProfile, "campaignId" | "title" | "message" | "target" | "avatarUrl" | "coverImageUrl"> & {
  avatarImage?: string;
};

function campaignDefaults(campaign: Campaign, memberName?: string): Partial<ProfileInput> {
  const campaignDetails = campaign.shortDescription || campaign.description;
  return {
    title: `${memberName?.trim() ? `${memberName.trim()}'s` : "My"} ${campaign.name} Fundraising Page`,
    message: `I'm raising funds for ${campaign.name}. ${campaignDetails || "Please support this campaign and help us reach our goal."}`,
    target: campaign.target > 0 ? campaign.target : undefined,
    coverImageUrl: campaign.coverImageUrl ?? campaign.imageUrls?.[0],
  };
}

function ImageUploadField({ id, label, file, imageUrl, error, recommendation, onChange }: {
  id: string;
  label: string;
  file: File | null;
  imageUrl: string;
  error?: string;
  recommendation: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="peer sr-only"
        aria-label={label}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        aria-invalid={Boolean(error)}
        onChange={onChange}
      />
      <label
        htmlFor={id}
        title={`Choose ${label.toLowerCase()}`}
        className={`group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-xl border bg-muted transition hover:border-primary focus-within:ring-2 focus-within:ring-ring peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${id === "pi" ? "h-20 w-20 rounded-full" : "h-24 w-full"}`}
      >
        {imageUrl
          ? <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          : <Upload className="h-7 w-7 text-muted-foreground" aria-hidden="true" />}
        <span className="sr-only">{file?.name ?? recommendation}</span>
      </label>
      <p id={`${id}-hint`} className="sr-only">Select a JPEG, PNG, or WebP image up to 5 MB.</p>
      {error && <p id={`${id}-error`} className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}

export function ProfileForm({ eligible, initial, lockCampaign, memberName, showPrefillNote, submitLabel, onSubmit, onCancel }: {
  eligible: Campaign[]; initial?: Partial<ProfileInput>; lockCampaign?: boolean; submitLabel: string;
  memberName?: string; showPrefillNote?: boolean;
  onSubmit: (v: ProfileInput, draft: boolean) => void | Promise<void>; onCancel: () => void;
}) {
  const { org } = useDemo();
  const [v, setV] = useState<ProfileInput>(() => {
    const campaignId = initial?.campaignId ?? eligible[0]?.id ?? "";
    const selectedCampaign = eligible.find((campaign) => campaign.id === campaignId);
    return {
      campaignId,
      title: "",
      message: "",
      ...(selectedCampaign ? campaignDefaults(selectedCampaign, memberName) : {}),
      ...initial,
      coverImageUrl:
        org.logoUrl ?? selectedCampaign?.coverImageUrl ?? selectedCampaign?.imageUrls?.[0],
    };
  });
  const [er, setEr] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!profileImage) {
      setProfileImageUrl(v.avatarUrl ?? "");
      return;
    }
    const url = URL.createObjectURL(profileImage);
    setProfileImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [profileImage, v.avatarUrl]);
  const fileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to read image file."));
      reader.onerror = () => reject(new Error("Unable to read image file."));
      reader.readAsDataURL(file);
    });
  const onImageSelected = (
    event: React.ChangeEvent<HTMLInputElement>,
    field: "profileImage",
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setEr((errors) => ({ ...errors, [field]: "Choose a JPEG, PNG, or WebP image." }));
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setEr((errors) => ({ ...errors, [field]: "Choose an image smaller than 5 MB." }));
      event.target.value = "";
      return;
    }
    setEr((errors) => ({ ...errors, [field]: "", images: "" }));
    setProfileImage(file);
  };
  const go = async (draft: boolean) => {
    if (busy) return;
    const e: Record<string, string> = {};
    if (!v.campaignId) e.campaignId = "Choose a campaign.";
    if (v.title.trim().length < 5) e.title = "Title must be at least 5 characters.";
    if (v.message.trim().length < 20) e.message = "Tell supporters why this matters (20+ characters).";
    if (v.target !== undefined && v.target !== null && !(v.target > 0)) e.target = "Target must be greater than 0, or leave it empty.";
    setEr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await onSubmit({
        ...v,
        ...(profileImage ? { avatarImage: await fileAsDataUrl(profileImage) } : {}),
      }, draft);
    } catch (cause) {
      setEr((errors) => ({
        ...errors,
        images: cause instanceof Error ? cause.message : "Unable to process the selected images.",
      }));
    } finally {
      setBusy(false);
    }
  };
  const camp = eligible.find((c) => c.id === v.campaignId);
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <form className="space-y-5 lg:col-span-3" noValidate onSubmit={(e) => { e.preventDefault(); void go(false); }}>
        <Field label="Campaign" htmlFor="pc" error={er.campaignId}>
          <select id="pc" disabled={lockCampaign} className={inputCls} value={v.campaignId} onChange={(e) => {
            const campaignId = e.target.value;
            const selectedCampaign = eligible.find((campaign) => campaign.id === campaignId);
            setV((current) => ({
              ...current,
              ...(selectedCampaign ? campaignDefaults(selectedCampaign, memberName) : {}),
              campaignId,
              coverImageUrl:
                org.logoUrl ??
                selectedCampaign?.coverImageUrl ??
                selectedCampaign?.imageUrls?.[0],
            }));
            setEr((errors) => ({ ...errors, campaignId: "", title: "", message: "", target: "" }));
          }}>
            {eligible.length === 0 && <option value="">No eligible campaigns</option>}
            {eligible.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {showPrefillNote && <p className="text-sm text-muted-foreground">We filled in suggestions from your campaign and account. Edit any detail before saving or publishing.</p>}
        <Field label="Page title" htmlFor="pt" error={er.title}><input id="pt" className={inputCls} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} aria-invalid={!!er.title} /></Field>
        <Field label="Personal message" htmlFor="pm" error={er.message}><textarea id="pm" className={textareaCls} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} aria-invalid={!!er.message} /></Field>
        <Field label="Personal target (KSh, optional)" htmlFor="ptg" error={er.target}><input id="ptg" type="number" min={1} className={inputCls} value={v.target ?? ""} onChange={(e) => setV({ ...v, target: e.target.value ? Number(e.target.value) : undefined })} /></Field>
        <div className="space-y-2">
          <p className="text-sm font-medium">Profile image</p>
          <ImageUploadField id="pi" label="Profile image" file={profileImage} imageUrl={profileImageUrl} error={er.profileImage} recommendation="Choose profile image" onChange={onImageSelected} />
        </div>
        <p className="text-xs text-muted-foreground">Your profile image is shown alongside the organisation or campaign cover on your fundraising page.</p>
        {er.images && <p role="alert" className="text-xs text-destructive">{er.images}</p>}
        <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="button" variant="outline" className="lg:hidden" onClick={() => setPreview(!preview)}><Eye className="h-4 w-4" />Preview</Button>
          <Button type="button" variant="outline" onClick={() => void go(true)} disabled={busy || eligible.length === 0}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save draft</Button>
          <Button type="submit" disabled={busy || eligible.length === 0}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? "Saving…" : submitLabel}</Button>
        </div>
      </form>
      <div className={`${preview ? "block" : "hidden"} lg:col-span-2 lg:block`}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview</p>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
          <div className="relative grid h-24 place-items-center overflow-hidden bg-primary-soft text-primary">
            {v.coverImageUrl ? <img src={v.coverImageUrl} alt="Organisation or campaign cover preview" className="absolute inset-0 h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6" />}
          </div>
          <div className="p-5">
            <div className="-mt-12 relative grid h-14 w-14 place-items-center overflow-hidden rounded-full border-4 border-card bg-muted">
              {profileImageUrl ? <img src={profileImageUrl} alt="Selected profile preview" className="absolute inset-0 h-full w-full object-cover" /> : <UserRound className="h-6 w-6 text-muted-foreground" />}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{camp?.name ?? "Campaign"}</p>
            <p className="font-semibold">{v.title || "Your page title"}</p>
            <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">{v.message || "Your personal message will appear here."}</p>
            <p className="mt-4 text-sm font-semibold">KSh 0 {v.target ? <span className="font-normal text-muted-foreground">of KSh {v.target.toLocaleString()}</span> : null}</p>
            <ProgressBar value={0} className="mt-2" />
          </div>
        </div>
      </div>
    </div>
  );
}
