import { NextResponse, NextRequest } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { MODULES, DEPLOYMENT_PRESETS, checkDependencies, getDefaultEnabledModules } from "@/lib/modules/registry";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

const CONFIG_PATH = join(process.cwd(), "data", "module-config.json");

interface ModuleConfig {
  enabledModules: string[];
  deploymentType: string;
  updatedAt: string;
}

function readConfig(): ModuleConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      return JSON.parse(raw) as ModuleConfig;
    }
  } catch {
    // ignore parse errors
  }
  return {
    enabledModules: getDefaultEnabledModules(),
    deploymentType: "isp",
    updatedAt: new Date().toISOString(),
  };
}

function writeConfig(config: ModuleConfig): void {
  const dir = join(process.cwd(), "data");
  // Ensure data dir exists
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  config.updatedAt = new Date().toISOString();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ─── GET /api/modules ──────────────────────────────────────────
// Returns all module definitions with current enabled status
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }
    const config = readConfig();
    const { enabledModules, deploymentType } = config;

    // Read gateway mode from DB (real flag)
    let gatewayModeEnabled = false;
    try {
      const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
      gatewayModeEnabled = settings?.gatewayModeEnabled ?? false;
    } catch (dbErr) {
      console.error("[GET /api/modules] Failed to read gateway mode from DB:", dbErr);
      // Keep gatewayModeEnabled as false — never fallback to file-based config
    }

    // Build module list with status
    const moduleList = MODULES.map((mod) => ({
      ...mod,
      isEnabled: enabledModules.includes(mod.id),
      canDisable: mod.category !== "core",
      dependencyStatus: checkDependencies(mod.id, enabledModules),
    }));

    // Get presets
    const presets = DEPLOYMENT_PRESETS.map((p) => ({
      ...p,
      isActive: p.id === deploymentType,
    }));

    return NextResponse.json({
      modules: moduleList,
      enabledModules,
      deploymentType,
      gatewayModeEnabled,
      presets,
      totalModules: MODULES.length,
      enabledCount: enabledModules.length,
      updatedAt: config.updatedAt,
    });
  } catch (error) {
    console.error("[GET /api/modules] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch modules", enabledModules: getDefaultEnabledModules(), deploymentType: "isp" },
      { status: 500 }
    );
  }
}

// ─── PUT /api/modules ─────────────────────────────────────────
// Update enabled modules and/or deployment type
export async function PUT(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }
    const body = await request.json();
    const { enabledModules, deploymentType, applyPreset } = body;

    let finalModules: string[];
    let finalType: string;

    if (applyPreset) {
      const preset = DEPLOYMENT_PRESETS.find((p) => p.id === applyPreset);
      if (!preset) {
        return NextResponse.json({ error: `Unknown preset: ${applyPreset}` }, { status: 400 });
      }
      finalModules = preset.enabledModules;
      finalType = preset.id;
    } else {
      finalModules = enabledModules || [];
      finalType = deploymentType || "isp";

      // Always include core modules
      const coreIds = MODULES.filter((m) => m.category === "core").map((m) => m.id);
      finalModules = [...new Set([...coreIds, ...finalModules])];
    }

    // Validate all dependencies are met
    const missing: string[] = [];
    for (const moduleId of finalModules) {
      const { missing: deps } = checkDependencies(moduleId, finalModules);
      missing.push(...deps);
    }
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing dependencies: ${[...new Set(missing)].join(", ")}` },
        { status: 400 }
      );
    }

    // ─── Sync Gateway Mode to DB FIRST ─────────────────────────
    // Write to DB before file to avoid race condition: if DB fails, don't touch the file
    const gatewayEnabled = finalModules.includes("gateway");
    try {
      await db.ispSettings.upsert({
        where: { id: "default" },
        update: { gatewayModeEnabled: gatewayEnabled },
        create: { id: "default", gatewayModeEnabled: gatewayEnabled },
      });
    } catch (dbErr) {
      console.error("[PUT /api/modules] Failed to sync gateway mode to DB:", dbErr);
      return NextResponse.json(
        { error: "Failed to update gateway mode in database" },
        { status: 500 }
      );
    }

    // DB succeeded — now write config file
    writeConfig({ enabledModules: finalModules, deploymentType: finalType, updatedAt: new Date().toISOString() });

    return NextResponse.json({
      success: true,
      enabledModules: finalModules,
      deploymentType: finalType,
      gatewayModeEnabled: gatewayEnabled,
      message: `Modules updated successfully. ${finalModules.length} modules enabled. Gateway Mode: ${gatewayEnabled ? "ON" : "OFF"}`,
    });
  } catch (error) {
    console.error("[PUT /api/modules] Error:", error);
    return NextResponse.json({ error: "Failed to update modules" }, { status: 500 });
  }
}
