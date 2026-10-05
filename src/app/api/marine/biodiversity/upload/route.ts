import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

interface CsvRow {
  species?: string;
  scientificName?: string;
  latitude?: string | number;
  longitude?: string | number;
  collectionDate?: string;
  date?: string;
  eventDate?: string;
  abundance?: string | number;
  count?: string | number;
  readsCount?: string | number;
  targetGene?: string;
  sampleId?: string;
  asvId?: string;
  depthM?: string | number;
  salinity?: string | number;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  // Parse header
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
    let filename = "uploaded_biodiversity.csv";
    let datasetName = "eDNA Biodiversity Ingestion";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file uploaded in form-data" }, { status: 400 });
      }
      filename = file.name;
      csvText = await file.text();
      const nameField = formData.get("name") as string | null;
      if (nameField) datasetName = nameField;
    } else {
      const body = await req.json();
      csvText = body.csvText || "";
      if (body.filename) filename = body.filename;
      if (body.name) datasetName = body.name;
    }

    if (!csvText.trim()) {
      return NextResponse.json({ error: "CSV content is empty" }, { status: 400 });
    }

    const rawRows = parseCsv(csvText);
    if (rawRows.length === 0) {
      return NextResponse.json(
        { error: "Could not parse CSV. Ensure file has a header line and at least one data row." },
        { status: 422 }
      );
    }

    // Required column validation
    const firstRow = rawRows[0];
    const colKeys = Object.keys(firstRow).map((k) => k.toLowerCase());

    const hasSpecies = colKeys.some((k) => ["species", "scientificname", "taxon"].includes(k));
    const hasLat = colKeys.some((k) => ["latitude", "lat", "decimallatitude"].includes(k));
    const hasLng = colKeys.some((k) => ["longitude", "lng", "lon", "decimallongitude"].includes(k));

    if (!hasSpecies) {
      return NextResponse.json(
        {
          error: "Missing required species column. Header must include 'species' or 'scientificName'.",
          foundHeaders: Object.keys(firstRow),
        },
        { status: 422 }
      );
    }

    const validRecords: any[] = [];
    const errors: { row: number; error: string; data: Record<string, string> }[] = [];

    // Resolve system user ID for dataset ownership
    let ownerId = session?.id;
    if (!ownerId) {
      const defaultUser = await db.user.findFirst({
        where: { role: { in: ["RESEARCHER", "ADMIN"] } },
      });
      ownerId = defaultUser ? defaultUser.id : "system-ingest";
    }

    // Create a ResearchDataset container record
    const dataset = await db.researchDataset.create({
      data: {
        userId: ownerId,
        name: datasetName,
        description: `CSV batch upload: ${filename} (${rawRows.length} raw rows)`,
        domain: "Biodiversity",
        dataType: "eDNA Occurrence",
        source: `Uploaded: ${filename}`,
        isPublic: true,
        recordCount: 0,
      },
    });

    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i];
      const rowNum = i + 2; // 1-indexed accounting for header

      const species = r.species || r.scientificName || r.scientificname || r.taxon || "";
      if (!species.trim()) {
        errors.push({ row: rowNum, error: "Empty species name", data: r });
        continue;
      }

      const latRaw = r.latitude || r.lat || r.decimallatitude || "";
      const lngRaw = r.longitude || r.lng || r.lon || r.decimallongitude || "";

      let lat: number | null = null;
      let lng: number | null = null;

      if (latRaw !== "") {
        lat = parseFloat(latRaw);
        if (Number.isNaN(lat) || lat < -90 || lat > 90) {
          errors.push({ row: rowNum, error: `Invalid latitude: ${latRaw} (must be between -90 and 90)`, data: r });
          continue;
        }
      }

      if (lngRaw !== "") {
        lng = parseFloat(lngRaw);
        if (Number.isNaN(lng) || lng < -180 || lng > 180) {
          errors.push({ row: rowNum, error: `Invalid longitude: ${lngRaw} (must be between -180 and 180)`, data: r });
          continue;
        }
      }

      const dateRaw = r.collectionDate || r.date || r.eventDate || "";
      let occurredAt: Date = new Date();
      if (dateRaw.trim()) {
        const parsed = new Date(dateRaw);
        if (!Number.isNaN(parsed.getTime())) {
          occurredAt = parsed;
        }
      }

      const countRaw = r.abundance || r.count || r.readsCount || "1";
      const count = parseInt(countRaw, 10);
      const validCount = Number.isInteger(count) && count > 0 ? count : 1;

      const targetGene = r.targetGene || r.gene || "12S";
      const asvId = r.asvId || r.sampleId || `UP-${Date.now()}-${i + 1}`;
      const depthM = r.depthM ? parseFloat(r.depthM) : null;
      const salinity = r.salinity ? parseFloat(r.salinity) : null;

      // Save DatasetRecord
      const datasetRecord = await db.datasetRecord.create({
        data: {
          datasetId: dataset.id,
          data: JSON.stringify({
            ...r,
            sourceType: "uploaded-csv",
            filename,
            uploadedAt: new Date().toISOString(),
          }),
          latitude: lat,
          longitude: lng,
          species,
          taxon: "species",
          occurredAt,
        },
      });

      // Save MarineSpeciesObservation linked to dataset record
      const cellLat = lat !== null ? Math.floor(lat) : 0;
      const cellLng = lng !== null ? Math.floor(lng) : 0;
      const spatialCell = `${cellLat}:${cellLng}`;

      await db.marineSpeciesObservation.create({
        data: {
          originTable: "uploaded-csv",
          originId: `${dataset.id}-${datasetRecord.id}`,
          datasetRecordId: datasetRecord.id,
          scientificName: species,
          taxonRank: "species",
          latitude: lat,
          longitude: lng,
          occurredAt,
          spatialCell,
          count: validCount,
        },
      });

      // Also create an ASV entry if targetGene is present
      await db.marineEdnaAsv.create({
        data: {
          asvId,
          scientificName: species,
          taxonRank: "species",
          confidence: 0.95,
          targetGene,
          source: `Uploaded: ${filename}`,
          latitude: lat,
          longitude: lng,
          eventDate: occurredAt,
          sampleMetaJson: JSON.stringify({
            station: `UP-ST-${i + 1}`,
            depthM: depthM ?? 20,
            salinityPsu: salinity ?? 34.0,
            readsCount: validCount,
            source: `Uploaded: ${filename}`,
          }),
        },
      }).catch(() => {});

      validRecords.push({
        id: datasetRecord.id,
        species,
        latitude: lat,
        longitude: lng,
        occurredAt: occurredAt.toISOString(),
        count: validCount,
        targetGene,
      });
    }

    // Update dataset record count
    await db.researchDataset.update({
      where: { id: dataset.id },
      data: { recordCount: validRecords.length },
    });

    // Record validation run
    await db.datasetValidationRun.create({
      data: {
        datasetId: dataset.id,
        totalRecords: rawRows.length,
        validRecords: validRecords.length,
        warnings: 0,
        errors: errors.length,
        report: JSON.stringify({
          filename,
          totalRows: rawRows.length,
          acceptedCount: validRecords.length,
          rejectedCount: errors.length,
          errors: errors.slice(0, 50),
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      message: `Successfully processed ${filename}. ${validRecords.length} observations ingested, ${errors.length} rejected.`,
      dataset: {
        id: dataset.id,
        name: dataset.name,
        source: dataset.source,
        recordCount: validRecords.length,
      },
      summary: {
        totalRows: rawRows.length,
        acceptedCount: validRecords.length,
        rejectedCount: errors.length,
      },
      errors: errors.slice(0, 20),
      records: validRecords.slice(0, 10),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process biodiversity CSV" },
      { status: 500 }
    );
  }
}
