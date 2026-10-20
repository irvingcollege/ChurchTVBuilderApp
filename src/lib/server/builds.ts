import type { ChurchConfig } from "../config";
export function simulateBuild(platform: string, config: ChurchConfig) {
  return {
    status: "failed" as const,
    artifact_path: null,
    error: `SIMULATION ONLY: ${platform} config v${config.schemaVersion} validated. Native toolchain/worker not installed; no artifact was compiled.`,
  };
}
