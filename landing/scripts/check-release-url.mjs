const rawUrl = process.env.NEXT_PUBLIC_SITE_URL;
const release = process.env.NEXT_PUBLIC_RELEASE === "true";
const fallback = "https://strike-everywhere.example";
const resolved = (rawUrl ?? fallback).replace(/\/$/, "");

if (release && (!rawUrl || resolved.endsWith(".example"))) {
  console.error(
    "Release build refused: NEXT_PUBLIC_RELEASE=true requires a real NEXT_PUBLIC_SITE_URL. " +
      "Set it to the deployed domain before running npm run build:release.",
  );
  process.exit(1);
}

if (!rawUrl) {
  console.warn(
    "NEXT_PUBLIC_SITE_URL is not set. Using the preview fallback https://strike-everywhere.example. " +
      "Set it before a release build.",
  );
}

console.log(`Site URL for this build: ${resolved}`);
