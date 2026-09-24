-- CreateTable
CREATE TABLE "MarineEdnaAsv" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "asvId" TEXT NOT NULL,
    "scientificName" TEXT,
    "taxonRank" TEXT,
    "fallbackJson" TEXT,
    "confidence" REAL,
    "targetGene" TEXT,
    "sequence" TEXT,
    "source" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "eventDate" DATETIME,
    "sampleMetaJson" TEXT,
    "observationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarineEdnaAsv_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "MarineSpeciesObservation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MarineEdnaAsv_asvId_key" ON "MarineEdnaAsv"("asvId");

-- CreateIndex
CREATE INDEX "MarineEdnaAsv_scientificName_idx" ON "MarineEdnaAsv"("scientificName");

-- CreateIndex
CREATE INDEX "MarineEdnaAsv_taxonRank_idx" ON "MarineEdnaAsv"("taxonRank");

-- CreateIndex
CREATE INDEX "MarineEdnaAsv_targetGene_idx" ON "MarineEdnaAsv"("targetGene");

-- CreateIndex
CREATE INDEX "MarineEdnaAsv_eventDate_idx" ON "MarineEdnaAsv"("eventDate");

-- CreateIndex
CREATE INDEX "MarineEdnaAsv_latitude_longitude_idx" ON "MarineEdnaAsv"("latitude", "longitude");

