import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ─── GET: Fetch available widgets and user configurations ───────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "list-available";
    const userId = searchParams.get("userId") || "";
    const category = searchParams.get("category") || "";

    switch (action) {
      // ── list-available: List all available dashboard widgets ───────────────
      case "list-available": {
        const where: Record<string, unknown> = {};
        if (category) {
          where.category = category.toUpperCase();
        }

        const widgets = await db.dashboardWidget.findMany({
          where: Object.keys(where).length > 0 ? where : undefined,
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        });

        const transformed = widgets.map((w) => ({
          id: w.id,
          name: w.name,
          category: w.category,
          description: w.description,
          widgetType: w.widgetType,
          configSchema: JSON.parse(w.configSchema),
          defaultConfig: JSON.parse(w.defaultConfig),
          sortOrder: w.sortOrder,
          enabled: w.enabled,
          createdAt: w.createdAt.toISOString(),
          updatedAt: w.updatedAt.toISOString(),
        }));

        return NextResponse.json({ success: true, data: transformed });
      }

      // ── user-config: Get widget configuration for a specific user ─────────
      case "user-config": {
        if (!userId) {
          return NextResponse.json({ error: "userId is required" }, { status: 400 });
        }

        const configs = await db.userWidgetConfig.findMany({
          where: { userId },
          include: {
            widget: true,
          },
          orderBy: { position: "asc" },
        });

        // Also fetch all available widgets so frontend knows what's available
        const allWidgets = await db.dashboardWidget.findMany({
          where: { enabled: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        });

        const configuredWidgetIds = new Set(configs.map((c) => c.widgetId));
        const unconfigured = allWidgets.filter((w) => !configuredWidgetIds.has(w.id));

        const transformedConfigs = configs.map((c) => ({
          id: c.id,
          userId: c.userId,
          widgetId: c.widgetId,
          widgetName: c.widget.name,
          widgetCategory: c.widget.category,
          widgetType: c.widget.widgetType,
          widgetDescription: c.widget.description,
          configSchema: JSON.parse(c.widget.configSchema),
          defaultConfig: JSON.parse(c.widget.defaultConfig),
          userConfig: JSON.parse(c.config),
          position: c.position,
          visible: c.visible,
          createdAt: c.createdAt.toISOString(),
        }));

        const transformedUnconfigured = unconfigured.map((w) => ({
          id: w.id,
          widgetId: w.id,
          widgetName: w.name,
          widgetCategory: w.category,
          widgetType: w.widgetType,
          widgetDescription: w.description,
          configSchema: JSON.parse(w.configSchema),
          defaultConfig: JSON.parse(w.defaultConfig),
          configured: false,
        }));

        return NextResponse.json({
          success: true,
          data: {
            configured: transformedConfigs,
            available: transformedUnconfigured,
          },
        });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Dashboard widgets GET error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard widgets" }, { status: 500 });
  }
}

// ─── POST: Create / update / delete widgets and user configurations ─────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ── create-widget: Create a new dashboard widget definition ────────────
      case "create-widget": {
        const { name, category, description, widgetType, configSchema, defaultConfig, sortOrder, enabled } = body;

        if (!name) {
          return NextResponse.json({ error: "Widget name is required" }, { status: 400 });
        }

        // Check uniqueness
        const existing = await db.dashboardWidget.findUnique({ where: { name } });
        if (existing) {
          return NextResponse.json({ error: "Widget with this name already exists" }, { status: 409 });
        }

        const widget = await db.dashboardWidget.create({
          data: {
            name,
            category: category ? category.toUpperCase() : "SYSTEM",
            description: description || "",
            widgetType: widgetType || "chart",
            configSchema: configSchema ? JSON.stringify(configSchema) : "{}",
            defaultConfig: defaultConfig ? JSON.stringify(defaultConfig) : "{}",
            sortOrder: sortOrder || 0,
            enabled: enabled !== undefined ? enabled : true,
          },
        });

        return NextResponse.json({ success: true, data: widget });
      }

      // ── update-widget: Update an existing widget definition ────────────────
      case "update-widget": {
        const { id, name, category, description, widgetType, configSchema, defaultConfig, sortOrder, enabled } = body;

        if (!id) {
          return NextResponse.json({ error: "Widget ID is required" }, { status: 400 });
        }

        const current = await db.dashboardWidget.findUnique({ where: { id } });
        if (!current) {
          return NextResponse.json({ error: "Widget not found" }, { status: 404 });
        }

        // If name is changing, check uniqueness
        if (name && name !== current.name) {
          const nameConflict = await db.dashboardWidget.findUnique({ where: { name } });
          if (nameConflict) {
            return NextResponse.json({ error: "Widget with this name already exists" }, { status: 409 });
          }
        }

        const updated = await db.dashboardWidget.update({
          where: { id },
          data: {
            name: name !== undefined ? name : current.name,
            category: category !== undefined ? category.toUpperCase() : current.category,
            description: description !== undefined ? description : current.description,
            widgetType: widgetType !== undefined ? widgetType : current.widgetType,
            configSchema: configSchema !== undefined ? JSON.stringify(configSchema) : current.configSchema,
            defaultConfig: defaultConfig !== undefined ? JSON.stringify(defaultConfig) : current.defaultConfig,
            sortOrder: sortOrder !== undefined ? sortOrder : current.sortOrder,
            enabled: enabled !== undefined ? enabled : current.enabled,
          },
        });

        return NextResponse.json({ success: true, data: updated });
      }

      // ── delete-widget: Delete a widget definition ──────────────────────────
      case "delete-widget": {
        const { id } = body;

        if (!id) {
          return NextResponse.json({ error: "Widget ID is required" }, { status: 400 });
        }

        const current = await db.dashboardWidget.findUnique({ where: { id } });
        if (!current) {
          return NextResponse.json({ error: "Widget not found" }, { status: 404 });
        }

        // Deleting the widget will cascade-delete all UserWidgetConfig records
        await db.dashboardWidget.delete({ where: { id } });
        return NextResponse.json({ success: true, message: "Widget deleted successfully" });
      }

      // ── save-user-config: Save or update a user's widget configuration ────
      case "save-user-config": {
        const { userId, widgetId, config, visible } = body;

        if (!userId || !widgetId) {
          return NextResponse.json({ error: "userId and widgetId are required" }, { status: 400 });
        }

        // Validate widget exists
        const widget = await db.dashboardWidget.findUnique({ where: { id: widgetId } });
        if (!widget) {
          return NextResponse.json({ error: "Widget not found" }, { status: 404 });
        }

        // Upsert: create or update the user's widget config
        const saved = await db.userWidgetConfig.upsert({
          where: {
            userId_widgetId: { userId, widgetId },
          },
          create: {
            userId,
            widgetId,
            config: config ? JSON.stringify(config) : "{}",
            visible: visible !== undefined ? visible : true,
            position: 0, // Default position, can be updated via update-position
          },
          update: {
            config: config !== undefined ? JSON.stringify(config) : undefined,
            visible: visible !== undefined ? visible : undefined,
          },
        });

        return NextResponse.json({ success: true, data: saved });
      }

      // ── update-position: Update widget positions (drag-and-drop reorder) ──
      case "update-position": {
        const { userId, positions } = body;

        if (!userId || !positions || !Array.isArray(positions)) {
          return NextResponse.json({ error: "userId and positions array are required" }, { status: 400 });
        }

        // positions should be: [{ widgetId: string, position: number }, ...]
        const updatePromises = positions.map(
          (item: { widgetId: string; position: number }) =>
            db.userWidgetConfig.updateMany({
              where: {
                userId,
                widgetId: item.widgetId,
              },
              data: {
                position: item.position,
              },
            })
        );

        await Promise.all(updatePromises);

        return NextResponse.json({
          success: true,
          message: `${positions.length} widget positions updated`,
        });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Dashboard widgets POST error:", error);
    return NextResponse.json({ error: "Failed to process dashboard widget request" }, { status: 500 });
  }
}
