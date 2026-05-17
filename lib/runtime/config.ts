function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

const HOSTED_INTEL_API_BASE_URL = "https://api.kebabkartta.fi";
const LOCAL_INTEL_API_BASE_URL = "http://127.0.0.1:8000";

export function getIntelApiBaseUrl(): string {
  const mode =
    process.env.INTEL_BACKEND_MODE ??
    process.env.NEXT_PUBLIC_INTEL_BACKEND_MODE ??
    "hosted";

  if (mode === "local") {
    return normalizeBaseUrl(
      process.env.INTEL_LOCAL_API_BASE_URL ??
        process.env.NEXT_PUBLIC_INTEL_LOCAL_API_BASE_URL ??
        LOCAL_INTEL_API_BASE_URL,
    );
  }

  return normalizeBaseUrl(
    process.env.INTEL_API_BASE_URL ??
      process.env.NEXT_PUBLIC_INTEL_API_BASE_URL ??
      HOSTED_INTEL_API_BASE_URL,
  );
}

export function getTileApiBaseUrl(): string {
  return normalizeBaseUrl(
    process.env.NEXT_PUBLIC_MAP_TILE_BASE_URL ??
      process.env.NEXT_PUBLIC_INTEL_API_BASE_URL ??
      HOSTED_INTEL_API_BASE_URL,
  );
}
