export type CreateUploadPresentation = {
  title: string;
  body: string;
  primaryAction: "camera" | "library";
  primaryLabel: string;
  secondaryLabel: string | null;
};

export function getCreateUploadPresentation({
  phone,
}: {
  phone: boolean;
  reading?: boolean;
}): CreateUploadPresentation {
  if (phone) {
    return {
      title: "Start with a look",
      body: "Pin pieces on your photo. Guests can craft locally — Publish asks for an account.",
      primaryAction: "library",
      primaryLabel: "Choose photo",
      secondaryLabel: "Camera",
    };
  }

  return {
    title: "Add a look photo",
    body: "Upload a full-body photo, or drag and drop one here, then pin each piece from the preview.",
    primaryAction: "library",
    primaryLabel: "Upload photo",
    secondaryLabel: null,
  };
}

export function formatCreateUploadError(error: string | null): string | null {
  if (!error) return null;
  if (/try|choose .*photo/i.test(error)) return error;
  return `${error} Choose another photo and try again.`;
}
