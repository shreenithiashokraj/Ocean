import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.replace(/^["']|["']$/g, "").trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const rawCols = lines[i].split(",");
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = rawCols[j] ? rawCols[j].replace(/^["']|["']$/g, "").trim() : "";
    }
    rows.push(row);
  }
  return rows;
}

export async function POST(req: Request) {
  try {
    const session = await getCurrentUser();
    let csvText = "";
    let filename = "uploaded_fisheries.csv";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file uploaded in form-data" }, { status: 400 });
      }
      filename = file.name;
      csvText = await file.text();
    } else {
      const body = await req.json();
      csvText = body.csvText || "";
      if (body.filename) filename = body.filename;
    }

    if (!csvText.trim()) {
      return NextResponse.json({ error: "CSV content is empty" }, { status: 400 });
    }

    const rawRows = parseCsv(csvText);
    if (rawRows.length === 0) {
      return NextResponse.json(
        { error: "Could not parse CSV. Header and at least one data row required." },
        { status: 422 }
      );
    }

    // Resolve owner
    let userId = session?.id;
    if (!userId) {
      const fisherUser = await db.user.findFirst({
        where: { role: { in: ["FISHERMAN", "RESEARCHER", "ADMIN"] } },
      });
      userId = fisherUser ? fisherUser.id : "system-user";
    }

    const validRecords: any[] = [];
    const errors: { row: number; error: string; data: Record<string, string> }[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i];
      const rowNum = i + 2;

      const species = r.species || r.fishSpecies || r.name || "";
      if (!species.trim()) {
        errors.push({ row: rowNum, error: "Missing species name", data: r });
        continue;
      }

      const qtyRaw = r.quantity || r.qty || r.weight || "";
      const quantity = parseFloat(qtyRaw);
      if (Number.isNaN(quantity) || quantity <= 0) {
        errors.push({ row: rowNum, error: `Invalid quantity: ${qtyRaw}`, data: r });
        continue;
      }

      const dateRaw = r.date || r.catchDate || "";
      let catchDate = new Date();
      if (dateRaw.trim()) {
        const d = new Date(dateRaw);
        if (!Number.isNaN(d.getTime())) catchDate = d;
      }

      const location = r.location || r.port || r.harbour || "Coastal Waters";
      const unit = r.unit && ["kg", "count"].includes(r.unit.toLowerCase()) ? r.unit.toLowerCase() : "kg";
      const avgSize = r.averageSize || r.size ? parseFloat(r.averageSize || r.size) : null;
      const estWeight = r.estimatedWeight ? parseFloat(r.estimatedWeight) : quantity;
      const catchType = r.catchType && ["CATCH", "BYCATCH"].includes(r.catchType.toUpperCase()) ? r.catchType.toUpperCase() : "CATCH";

      const created = await db.catchRecord.create({
        data: {
          userId,
          date: catchDate,
          species,
          quantity,
          unit,
          location,
          averageSize: avgSize,
          estimatedWeight: estWeight,
          catchType,
          notes: `Batch imported from ${filename}`,
        },
      });

      validRecords.push(created);
    }

    return NextResponse.json({
      ok: true,
      message: `Processed ${filename}: ${validRecords.length} catch records logged, ${errors.length} skipped.`,
      summary: {
        totalRows: rawRows.length,
        acceptedCount: validRecords.length,
        rejectedCount: errors.length,
      },
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to upload catches" },
      { status: 500 }
    );
  }
}
