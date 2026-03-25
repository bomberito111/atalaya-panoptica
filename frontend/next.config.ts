import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export para hosting en GitHub Pages (costo $0)
  output: "export",
  // Trailing slash necesario para GitHub Pages
  trailingSlash: true,
  // Desactivar optimización de imágenes (no compatible con static export)
  images: {
    unoptimized: true,
  },
  // Base path si el repo no está en la raíz (ajustar al nombre del repo)
  // basePath: "/atalaya-panoptica",
};

export default nextConfig;
