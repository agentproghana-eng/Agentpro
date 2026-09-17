import { NextRequest, NextResponse } from "next/server";

import { validateSameOriginMutation } from "@/features/auth/server/request-security";
import {
  authenticatedMarketplaceRequest,
  marketplaceResponse,
  publicMarketplaceRequest,
} from "@/features/marketplace/server/session-request";

export const runtime = "nodejs";

const MAX_PHOTOS = 8;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_BYTES =
  MAX_PHOTOS * MAX_FILE_BYTES + 2 * 1024 * 1024;

const ALLOWED_QUERY_KEYS = new Set([
  "category_id",
  "search",
  "location",
  "min_price",
  "max_price",
  "min_rating",
  "sort",
  "page",
  "limit",
]);

const TEXT_FIELDS = {
  title: 200,
  description: 10_000,
  price: 50,
  category_id: 64,
  location: 200,
  contact_phone: 32,
} as const;

const REQUIRED_TEXT_FIELDS = [
  "title",
  "description",
  "category_id",
  "location",
  "contact_phone",
] as const;

function errorResponse(
  status: number,
  code: string,
  message: string,
) {
  return NextResponse.json(
    {
      success: false,
      code,
      message,
    },
    {
      status,
    },
  );
}

export async function GET(request: NextRequest) {
  const params = new URLSearchParams();

  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (ALLOWED_QUERY_KEYS.has(key)) {
      params.append(key, value);
    }
  }

  const query = params.toString();

  try {
    const result = await publicMarketplaceRequest(
      request,
      query ? `/?${query}` : "/",
    );

    return marketplaceResponse(result);
  } catch {
    return errorResponse(
      503,
      "MARKETPLACE_UNAVAILABLE",
      "Marketplace is temporarily unavailable.",
    );
  }
}

export async function POST(request: NextRequest) {
  const originError = validateSameOriginMutation(
    request,
    "Marketplace listing",
  );

  if (originError) {
    return originError;
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return errorResponse(
      415,
      "MULTIPART_REQUIRED",
      "Marketplace listings must be submitted as multipart form data.",
    );
  }

  const rawLength = request.headers.get("content-length");

  if (rawLength) {
    const contentLength = Number(rawLength);

    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_MULTIPART_BYTES
    ) {
      return errorResponse(
        413,
        "MARKETPLACE_UPLOAD_TOO_LARGE",
        "The Marketplace upload is too large.",
      );
    }
  }

  let incoming: FormData;

  try {
    incoming = await request.formData();
  } catch {
    return errorResponse(
      400,
      "INVALID_MULTIPART_REQUEST",
      "The Marketplace listing could not be read.",
    );
  }

  const output = new FormData();

  for (const [field, maxLength] of Object.entries(TEXT_FIELDS)) {
    const value = incoming.get(field);

    if (value === null) {
      continue;
    }

    if (typeof value !== "string") {
      return errorResponse(
        422,
        "INVALID_MARKETPLACE_FIELD",
        `Invalid ${field} value.`,
      );
    }

    const normalized = value.trim();

    if (normalized.length > maxLength) {
      return errorResponse(
        422,
        "MARKETPLACE_FIELD_TOO_LONG",
        `${field} is too long.`,
      );
    }

    if (normalized) {
      output.append(field, normalized);
    }
  }

  for (const field of REQUIRED_TEXT_FIELDS) {
    const value = output.get(field);

    if (typeof value !== "string" || !value.trim()) {
      return errorResponse(
        422,
        "MARKETPLACE_FIELD_REQUIRED",
        `${field} is required.`,
      );
    }
  }

  const price = output.get("price");

  if (typeof price === "string" && price) {
    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return errorResponse(
        422,
        "INVALID_MARKETPLACE_PRICE",
        "Price must be a valid non-negative number.",
      );
    }
  }

  const rawImages = incoming.getAll("images");

  if (rawImages.some((entry) => !(entry instanceof File))) {
    return errorResponse(
      422,
      "INVALID_MARKETPLACE_IMAGE",
      "Marketplace photos must be image files.",
    );
  }

  const images = rawImages as File[];

  if (images.length < 1 || images.length > MAX_PHOTOS) {
    return errorResponse(
      422,
      "INVALID_MARKETPLACE_PHOTO_COUNT",
      `Add between 1 and ${MAX_PHOTOS} photos.`,
    );
  }

  for (const image of images) {
    if (
      !image.type.toLowerCase().startsWith("image/") ||
      image.size < 1
    ) {
      return errorResponse(
        422,
        "INVALID_MARKETPLACE_IMAGE",
        "Every Marketplace photo must be a valid image.",
      );
    }

    if (image.size > MAX_FILE_BYTES) {
      return errorResponse(
        413,
        "MARKETPLACE_IMAGE_TOO_LARGE",
        "Each Marketplace photo must be 5 MB or smaller.",
      );
    }

    output.append(
      "images",
      image,
      image.name || "agentpro-marketplace-image",
    );
  }

  try {
    const result = await authenticatedMarketplaceRequest(
      request,
      "/",
      {
        method: "POST",
        body: output,
      },
    );

    return marketplaceResponse(result);
  } catch {
    return errorResponse(
      503,
      "MARKETPLACE_UNAVAILABLE",
      "Marketplace is temporarily unavailable.",
    );
  }
}
