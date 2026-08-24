import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vocabulary Collector",
    short_name: "Vocabulary",
    description: "Collect and review the English words you actually encounter.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f3eb",
    theme_color: "#365f49",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
