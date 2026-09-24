-- CreateTable
CREATE TABLE "MarineSpeciesObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originTable" TEXT NOT NULL,
    "originId" TEXT NOT NULL,
    "datasetRecordId" TEXT,
    "dwc" TEXT,
    "scientificName" TEXT,
    "taxonRank" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "occurredAt" DATETIME,
    "spatialCell" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarineSpeciesObservation_datasetRecordId_fkey" FOREIGN KEY ("datasetRecordId") REFERENCES "DatasetRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarineDiversityMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "observationId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'spatial-cell',
    "cellKey" TEXT,
    "shannonH" REAL NOT NULL,
    "speciesCount" INTEGER NOT NULL,
    "individualCount" INTEGER NOT NULL,
    "proportionsJson" TEXT NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarineDiversityMetric_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "MarineSpeciesObservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MarineSpeciesObservation_scientificName_idx" ON "MarineSpeciesObservation"("scientificName");

-- CreateIndex
CREATE INDEX "MarineSpeciesObservation_spatialCell_idx" ON "MarineSpeciesObservation"("spatialCell");

-- CreateIndex
CREATE INDEX "MarineSpeciesObservation_occurredAt_idx" ON "MarineSpeciesObservation"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarineSpeciesObservation_originTable_originId_key" ON "MarineSpeciesObservation"("originTable", "originId");

-- CreateIndex
CREATE INDEX "MarineDiversityMetric_cellKey_idx" ON "MarineDiversityMetric"("cellKey");

-- CreateIndex
CREATE UNIQUE INDEX "MarineDiversityMetric_scope_cellKey_key" ON "MarineDiversityMetric"("scope", "cellKey");

