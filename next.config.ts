import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // exceljs is CommonJS with Node-only dependencies; keep it out of the server bundle.
  serverExternalPackages: ["exceljs"],
};

export default withNextIntl(nextConfig);
