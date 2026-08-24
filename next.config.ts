import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const isGitHubPagesRoot = repositoryName.endsWith(".github.io");
const githubBasePath = process.env.GITHUB_ACTIONS === "true" && repositoryName && !isGitHubPagesRoot
  ? `/${repositoryName}`
  : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: githubBasePath,
  images: { unoptimized: true },
};

export default nextConfig;
