import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PMP Trainer",
    short_name: "PMP",
    description: "Private PMP exam prep",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#1f4f8f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
