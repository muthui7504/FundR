import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, textareaCls } from "@/components/kit";
import type { Campaign } from "@/types";

type CampaignFields = Pick<
  Campaign,
  "name" | "shortDescription" | "description" | "target" | "startDate" | "endDate"
>;
export type CampaignInput = CampaignFields & { imageUploads?: string[] };

const MAX_CAMPAIGN_IMAGES = 8;
const MAX_SOURCE_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_OPTIMIZED_IMAGE_SIZE = 1024 * 1024;

type SelectedImage = { file: File; previewUrl: string };

async function optimizeImage(file: File) {
  const image = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    while (scale >= 0.25) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Unable to prepare the selected image.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (result) =>
              result
                ? resolve(result)
                : reject(new Error("Unable to optimize the selected image.")),
            "image/jpeg",
            quality,
          );
        });
        if (blob.size <= MAX_OPTIMIZED_IMAGE_SIZE) {
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              typeof reader.result === "string"
                ? resolve(reader.result)
                : reject(new Error("Unable to read the optimized image."));
            reader.onerror = () => reject(new Error("Unable to read the optimized image."));
            reader.readAsDataURL(blob);
          });
        }
      }
      scale *= 0.8;
    }
  } finally {
    image.close();
  }
  throw new Error("This image could not be reduced enough. Choose a smaller image.");
}

export function validateCampaign(v: CampaignFields) {
  const e: Record<string, string> = {};
  if (v.name.trim().length < 3) e.name = "Name must be at least 3 characters.";
  if (v.shortDescription.trim().length < 10)
    e.shortDescription = "Add a short description (10+ characters).";
  if (!(v.target > 0)) e.target = "Target must be greater than KSh 0.";
  if (!v.startDate) e.startDate = "Choose a start date.";
  if (!v.endDate) e.endDate = "Choose an end date.";
  else if (v.startDate && v.endDate <= v.startDate)
    e.endDate = "End date must be after the start date.";
  return e;
}

export function CampaignForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<Campaign>;
  submitLabel: string;
  onSubmit: (v: CampaignInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState<CampaignFields>({
    name: "",
    shortDescription: "",
    description: "",
    target: 0,
    startDate: "",
    endDate: "",
    ...initial,
  });
  const [er, setEr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const previewUrls = useRef(new Set<string>());
  const existingImageUrls = initial?.imageUrls ?? [];

  useEffect(
    () => () => {
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const go = async () => {
    if (busy) return;
    const errors = validateCampaign(v);
    setEr(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const imageUploads = await Promise.all(
        selectedImages.map(({ file }) => optimizeImage(file)),
      );
      await onSubmit({ ...v, ...(imageUploads.length ? { imageUploads } : {}) });
    } catch (cause) {
      setEr((current) => ({
        ...current,
        images: cause instanceof Error ? cause.message : "Unable to process the selected images.",
      }));
    } finally {
      setBusy(false);
    }
  };

  const setField =
    (key: keyof CampaignFields) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((current) => ({
        ...current,
        [key]: key === "target" ? Number(event.target.value) : event.target.value,
      }));

  const addImages = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0) return;

    if (existingImageUrls.length + selectedImages.length + files.length > MAX_CAMPAIGN_IMAGES) {
      setEr((current) => ({
        ...current,
        images: `Choose up to ${MAX_CAMPAIGN_IMAGES} campaign images in total.`,
      }));
      return;
    }
    const invalidFile = files.find(
      (file) =>
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > MAX_SOURCE_IMAGE_SIZE,
    );
    if (invalidFile) {
      setEr((current) => ({
        ...current,
        images:
          invalidFile.size > MAX_SOURCE_IMAGE_SIZE
            ? "Each image must be smaller than 20 MB."
            : "Choose JPEG, PNG, or WebP images.",
      }));
      return;
    }

    const added = files.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      return { file, previewUrl };
    });
    setSelectedImages((current) => [...current, ...added]);
    setEr((current) => ({ ...current, images: "" }));
  };

  const removeImage = (index: number) => {
    setSelectedImages((current) => {
      const removed = current[index];
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
        previewUrls.current.delete(removed.previewUrl);
      }
      return current.filter((_, currentIndex) => currentIndex !== index);
    });
    setEr((current) => ({ ...current, images: "" }));
  };

  const imageCount = existingImageUrls.length + selectedImages.length;

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void go();
      }}
    >
      <Field label="Campaign name" htmlFor="cn" error={er.name}>
        <input
          id="cn"
          className={inputCls}
          value={v.name}
          onChange={setField("name")}
          aria-invalid={!!er.name}
        />
      </Field>
      <Field label="Short description" htmlFor="cs" error={er.shortDescription}>
        <input
          id="cs"
          className={inputCls}
          value={v.shortDescription}
          onChange={setField("shortDescription")}
          aria-invalid={!!er.shortDescription}
        />
      </Field>
      <Field label="Detailed description" htmlFor="cd">
        <textarea
          id="cd"
          className={textareaCls}
          value={v.description}
          onChange={setField("description")}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Target (KSh)" htmlFor="ct" error={er.target}>
          <input
            id="ct"
            type="number"
            min={1}
            className={inputCls}
            value={v.target || ""}
            onChange={setField("target")}
            aria-invalid={!!er.target}
          />
        </Field>
        <Field label="Start date" htmlFor="sd" error={er.startDate}>
          <input id="sd" type="date" className={inputCls} value={v.startDate} onChange={setField("startDate")} />
        </Field>
        <Field label="End date" htmlFor="ed" error={er.endDate}>
          <input id="ed" type="date" className={inputCls} value={v.endDate} onChange={setField("endDate")} />
        </Field>
      </div>
      <Field
        label="Project and progress photos"
        htmlFor="campaign-images"
        hint={`Add up to ${MAX_CAMPAIGN_IMAGES} JPEG, PNG, or WebP images. Large photos are optimized before upload.`}
        error={er.images}
      >
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 px-4 py-4 text-sm font-medium text-muted-foreground transition hover:border-primary hover:text-primary">
            <Upload className="size-4" aria-hidden="true" />
            <span>{imageCount ? "Add more photos" : "Choose project photos"}</span>
            <input
              id="campaign-images"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={addImages}
              disabled={imageCount >= MAX_CAMPAIGN_IMAGES}
            />
          </label>
          <p className="text-xs text-muted-foreground">{imageCount} of {MAX_CAMPAIGN_IMAGES} photos selected</p>
          {imageCount > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {existingImageUrls.map((url, index) => (
                <img
                  key={`${url}-${index}`}
                  src={url}
                  alt={`Campaign photo ${index + 1}`}
                  className="aspect-[4/3] w-full rounded-xl border object-cover"
                />
              ))}
              {selectedImages.map((image, index) => (
                <div key={image.previewUrl} className="relative">
                  <img
                    src={image.previewUrl}
                    alt={`Selected campaign photo ${existingImageUrls.length + index + 1}`}
                    className="aspect-[4/3] w-full rounded-xl border object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Remove selected photo ${index + 1}`}
                    onClick={() => removeImage(index)}
                    className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-background/90 text-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Field>
      <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Preparing…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
