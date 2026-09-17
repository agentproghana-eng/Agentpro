"use client";

import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  LoaderCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import styles from "./marketplace-post-form.module.css";

const MAX_PHOTOS = 8;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2000;
const WEBP_QUALITY = 0.82;

type Category = {
  id: string | number;
  name: string;
};

type CategoryResponse = {
  success?: boolean;
  message?: string;
  data?: Category[];
};

type PostResponse = {
  success?: boolean;
  message?: string;
  data?: {
    id?: string;
    status?: string;
  };
};

type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function optimizedFilename(name: string) {
  const stem = name.replace(/\.[^.]+$/, "").trim();

  return `${stem || "agentpro-listing"}.webp`;
}

async function optimizePhoto(file: File): Promise<File> {
  if (!file.type.toLowerCase().startsWith("image/")) {
    throw new Error(`${file.name} is not an image.`);
  }

  if (file.size < 1) {
    throw new Error(`${file.name} is empty.`);
  }

  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (file.size <= MAX_FILE_BYTES) {
      return file;
    }

    throw new Error(
      `${file.name} could not be optimized and is larger than 5 MB.`,
    );
  }

  const longestSide = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / longestSide);

  if (scale === 1 && file.size <= MAX_FILE_BYTES) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement("canvas");

  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    throw new Error(`${file.name} could not be optimized.`);
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY);
  });

  if (!blob) {
    throw new Error(`${file.name} could not be optimized.`);
  }

  if (blob.size > MAX_FILE_BYTES) {
    throw new Error(
      `${file.name} is still larger than 5 MB after optimization.`,
    );
  }

  return new File(
    [blob],
    optimizedFilename(file.name),
    {
      type: "image/webp",
      lastModified: file.lastModified,
    },
  );
}

export function MarketplacePostForm() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [processingPhotos, setProcessingPhotos] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const previewUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const ownedPreviewUrls = previewUrls.current;

    async function loadCategories() {
      try {
        const response = await fetch(
          "/api/marketplace/categories",
          {
            cache: "no-store",
          },
        );

        const body = await readJson<CategoryResponse>(response);

        if (!active) {
          return;
        }

        if (!response.ok || !Array.isArray(body?.data)) {
          setCategoryError(
            body?.message ??
              "Marketplace categories could not be loaded.",
          );
          return;
        }

        setCategories(body.data);
        setCategoryError(null);
      } catch {
        if (active) {
          setCategoryError(
            "Marketplace categories could not be loaded.",
          );
        }
      } finally {
        if (active) {
          setCategoriesLoading(false);
        }
      }
    }

    void loadCategories();

    return () => {
      active = false;

      for (const url of ownedPreviewUrls) {
        URL.revokeObjectURL(url);
      }

      ownedPreviewUrls.clear();
    };
  }, []);

  async function handlePhotoSelection(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const selected = Array.from(event.target.files ?? []);

    event.target.value = "";

    if (selected.length === 0) {
      return;
    }

    const availableSlots = MAX_PHOTOS - photos.length;

    if (availableSlots < 1) {
      setMediaError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const accepted = selected.slice(0, availableSlots);
    const messages: string[] = [];

    if (selected.length > availableSlots) {
      messages.push(
        `Only ${availableSlots} more photo${
          availableSlots === 1 ? "" : "s"
        } could be added.`,
      );
    }

    setProcessingPhotos(true);
    setMediaError(null);

    const nextPhotos: SelectedPhoto[] = [];

    for (const source of accepted) {
      try {
        const file = await optimizePhoto(source);
        const previewUrl = URL.createObjectURL(file);

        previewUrls.current.add(previewUrl);

        nextPhotos.push({
          id: crypto.randomUUID(),
          file,
          previewUrl,
        });
      } catch (error) {
        messages.push(
          error instanceof Error
            ? error.message
            : `${source.name} could not be added.`,
        );
      }
    }

    setPhotos((current) =>
      [...current, ...nextPhotos].slice(0, MAX_PHOTOS),
    );

    if (messages.length > 0) {
      setMediaError(messages.join(" "));
    }

    setProcessingPhotos(false);
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      const target = current[index];

      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrls.current.delete(target.previewUrl);
      }

      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  function movePhoto(index: number, delta: number) {
    setPhotos((current) => {
      const target = index + delta;

      if (
        index < 0 ||
        index >= current.length ||
        target < 0 ||
        target >= current.length
      ) {
        return current;
      }

      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];

      return next;
    });
  }

  function makeCover(index: number) {
    if (index === 0) {
      return;
    }

    setPhotos((current) => {
      if (index < 0 || index >= current.length) {
        return current;
      }

      const next = [...current];
      const [selected] = next.splice(index, 1);

      next.unshift(selected);

      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (photos.length < 1 || photos.length > MAX_PHOTOS) {
      setMediaError(
        `Add between 1 and ${MAX_PHOTOS} Marketplace photos.`,
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const payload = new FormData(event.currentTarget);

    for (const photo of photos) {
      payload.append(
        "images",
        photo.file,
        photo.file.name,
      );
    }

    try {
      const response = await fetch("/api/marketplace", {
        method: "POST",
        body: payload,
      });

      const body = await readJson<PostResponse>(response);

      if (response.status === 401) {
        router.replace(
          `/login?next=${encodeURIComponent(
            "/marketplace/post",
          )}`,
        );
        return;
      }

      if (!response.ok || body?.success !== true) {
        setSubmitError(
          body?.message ??
            "Your Marketplace listing could not be submitted.",
        );
        return;
      }

      const adId = body.data?.id;

      if (adId) {
        router.push(
          `/marketplace/${encodeURIComponent(adId)}`,
        );
      } else {
        router.push("/");
      }

      router.refresh();
    } catch {
      setSubmitError(
        "Your listing could not be submitted. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const busy =
    submitting ||
    processingPhotos ||
    categoriesLoading ||
    Boolean(categoryError);

  return (
    <main id="main-content" className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>AgentPro Marketplace</p>
          <h1>Post an Ad</h1>
          <p>
            Add clear details and up to eight useful photos.
            Your listing will be reviewed before it goes live.
          </p>

          <div className={styles.trustNote}>
            <ShieldCheck size={19} aria-hidden="true" />
            <span>
              AgentPro reviews listings to help keep the
              Marketplace useful and trustworthy.
            </span>
          </div>
        </section>

        <form className={styles.form} onSubmit={submit}>
          <section className={styles.card}>
            <div className={styles.sectionHeading}>
              <span>1</span>
              <div>
                <h2>Listing details</h2>
                <p>Tell buyers exactly what you are offering.</p>
              </div>
            </div>

            <div className={styles.fields}>
              <label className={styles.fullField}>
                <span>Ad title</span>
                <input
                  name="title"
                  type="text"
                  required
                  maxLength={200}
                  placeholder="e.g. iPhone 13 Pro Max"
                />
              </label>

              <label className={styles.fullField}>
                <span>Description</span>
                <textarea
                  name="description"
                  required
                  maxLength={10_000}
                  rows={6}
                  placeholder="Describe the item or service, condition, important features and anything a buyer should know."
                />
              </label>

              <label>
                <span>Category</span>
                <select
                  name="category_id"
                  required
                  defaultValue=""
                  disabled={categoriesLoading || Boolean(categoryError)}
                >
                  <option value="" disabled>
                    {categoriesLoading
                      ? "Loading categories…"
                      : "Choose a category"}
                  </option>

                  {categories.map((category) => (
                    <option
                      key={String(category.id)}
                      value={String(category.id)}
                    >
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Price (GHS)</span>
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Leave blank for price on request"
                />
              </label>

              <label>
                <span>Location</span>
                <input
                  name="location"
                  type="text"
                  required
                  maxLength={200}
                  placeholder="e.g. Madina, Accra"
                />
              </label>

              <label>
                <span>Contact phone</span>
                <input
                  name="contact_phone"
                  type="tel"
                  required
                  maxLength={32}
                  autoComplete="tel"
                  placeholder="Phone buyers can contact"
                />
              </label>
            </div>

            {categoryError && (
              <p className={styles.error} role="alert">
                {categoryError} Refresh the page to try again.
              </p>
            )}
          </section>

          <section className={styles.card}>
            <div className={styles.sectionHeading}>
              <span>2</span>
              <div>
                <h2>Photos</h2>
                <p>
                  Add 1–8 photos. The first photo becomes
                  the listing cover.
                </p>
              </div>
            </div>

            <div className={styles.uploadRow}>
              <label
                className={`${styles.uploadButton} ${
                  photos.length >= MAX_PHOTOS ||
                  processingPhotos
                    ? styles.uploadDisabled
                    : ""
                }`}
              >
                {processingPhotos ? (
                  <LoaderCircle
                    className={styles.spinner}
                    size={20}
                    aria-hidden="true"
                  />
                ) : (
                  <ImagePlus size={20} aria-hidden="true" />
                )}

                <span>
                  {processingPhotos
                    ? "Optimizing photos…"
                    : "Choose photos"}
                </span>

                <input
                  className={styles.fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={
                    photos.length >= MAX_PHOTOS ||
                    processingPhotos
                  }
                  onChange={handlePhotoSelection}
                />
              </label>

              <span className={styles.photoCount}>
                {photos.length}/{MAX_PHOTOS} photos
              </span>
            </div>

            <p className={styles.mediaHelp}>
              Large images are resized to a maximum of
              2000px before upload. Each final image must
              be 5 MB or smaller.
            </p>

            {mediaError && (
              <p className={styles.error} role="alert">
                {mediaError}
              </p>
            )}

            {photos.length > 0 && (
              <div className={styles.photoGrid}>
                {photos.map((photo, index) => (
                  <article
                    className={styles.photoCard}
                    key={photo.id}
                  >
                    <div className={styles.preview}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.previewUrl}
                        alt={`Marketplace photo ${index + 1}`}
                      />

                      {index === 0 && (
                        <span className={styles.coverBadge}>
                          Cover
                        </span>
                      )}
                    </div>

                    <div className={styles.photoMeta}>
                      <span>Photo {index + 1}</span>

                      {index !== 0 && (
                        <button
                          type="button"
                          onClick={() => makeCover(index)}
                        >
                          Make cover
                        </button>
                      )}
                    </div>

                    <div className={styles.photoActions}>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => movePhoto(index, -1)}
                        aria-label={`Move photo ${index + 1} left`}
                      >
                        <ArrowLeft size={16} />
                      </button>

                      <button
                        type="button"
                        disabled={index === photos.length - 1}
                        onClick={() => movePhoto(index, 1)}
                        aria-label={`Move photo ${index + 1} right`}
                      >
                        <ArrowRight size={16} />
                      </button>

                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => removePhoto(index)}
                        aria-label={`Remove photo ${index + 1}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {submitError && (
            <p
              className={`${styles.error} ${styles.submitError}`}
              role="alert"
            >
              {submitError}
            </p>
          )}

          <div className={styles.submitRow}>
            <p>
              Your ad will be submitted as
              <strong> pending review</strong>.
            </p>

            <button
              className={styles.submitButton}
              type="submit"
              disabled={busy || photos.length < 1}
            >
              {submitting && (
                <LoaderCircle
                  className={styles.spinner}
                  size={19}
                  aria-hidden="true"
                />
              )}

              {submitting
                ? "Submitting…"
                : "Submit for review"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
