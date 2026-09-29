import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";

// POST /api/radius-users/import — batch CSV import
export async function POST(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 });
    }

    // Parse header - support both "username"/"service username" and "password"/"service password"
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const usernameIdx = header.findIndex((h) => h === "username" || h === "service_username");
    const passwordIdx = header.findIndex((h) => h === "password" || h === "service_password");

    if (usernameIdx === -1 || passwordIdx === -1) {
      return NextResponse.json({ error: "CSV must have 'username' and 'password' columns" }, { status: 400 });
    }

    // Load password policy from settings
    const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
    const policy = settings
      ? {
          minLength: settings.passwordMinLength || 8,
          requireUppercase: !!settings.passwordRequireUppercase,
          requireLowercase: !!settings.passwordRequireLowercase,
          requireNumbers: !!settings.passwordRequireNumbers,
          requireSpecial: !!settings.passwordRequireSpecial,
        }
      : { minLength: 8, requireUppercase: false, requireLowercase: true, requireNumbers: true, requireSpecial: false };

    function validatePassword(password: string): string | null {
      if (password.length < policy.minLength) return `Password must be at least ${policy.minLength} characters`;
      if (policy.requireUppercase && !/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
      if (policy.requireLowercase && !/[a-z]/.test(password)) return "Password must contain a lowercase letter";
      if (policy.requireNumbers && !/[0-9]/.test(password)) return "Password must contain a number";
      if (policy.requireSpecial && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return "Password must contain a special character";
      return null;
    }

    let count = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process data rows
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const username = (cols[usernameIdx] || "").trim();
      const password = (cols[passwordIdx] || "").trim();

      if (!username || !password) {
        errorCount++;
        errors.push(`Row ${i + 1}: Missing username or password`);
        continue;
      }

      // Validate password policy
      const pwdErr = validatePassword(password);
      if (pwdErr) {
        errorCount++;
        errors.push(`Row ${i + 1} (${username}): ${pwdErr}`);
        continue;
      }

      // Check if a subscriber with this serviceUsername already exists
      let subscriber = await db.subscriber.findUnique({ where: { serviceUsername: username } });

      if (!subscriber) {
        // Create a minimal subscriber for this user
        try {
          subscriber = await db.subscriber.create({
            data: {
              code: `CSV-${username}`.slice(0, 50),
              name: username,
              phone: "",
              serviceUsername: username,
              servicePassword: password,
              status: "ACTIVE",
              radiusEnabled: true,
            },
          });
        } catch (createErr: unknown) {
          errorCount++;
          errors.push(`Row ${i + 1}: Failed to create subscriber for "${username}"`);
          continue;
        }
      }

      // Check if RadiusUser record already exists
      const existingRadiusUser = await db.radiusUser.findUnique({
        where: { subscriberId: subscriber.id },
      });
      if (existingRadiusUser) {
        errorCount++;
        errors.push(`Row ${i + 1}: RADIUS user already exists for "${username}"`);
        continue;
      }

      // Create thin RadiusUser record
      try {
        await db.radiusUser.create({
          data: {
            subscriberId: subscriber.id,
          },
        });

        // Ensure radiusEnabled is set to true on the subscriber
        if (!subscriber.radiusEnabled) {
          await db.subscriber.update({
            where: { id: subscriber.id },
            data: { radiusEnabled: true },
          });
        }

        count++;
      } catch {
        errorCount++;
        errors.push(`Row ${i + 1}: Database error creating user "${username}"`);
      }
    }

    const message = `Import complete: ${count} users created, ${errorCount} errors`;
    return NextResponse.json({ count, errorCount, errors, message });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = (error as any)?.statusCode || 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// Simple CSV line parser that handles quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
