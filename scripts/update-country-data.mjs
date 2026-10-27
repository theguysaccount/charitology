// Retired current-data writer. The Oct25 normalized snapshot is historical
// comparison evidence; current HTML/API now read the versioned observation graph.
process.stderr.write(
  "Country refresh moved to the observation pipeline. Use npm run observations:prepare, then npm run observations:capture with a request and prepared directory to preview. Writing requires its exact --write-reviewed-hash. The historical src/data/countries.json is never overwritten.\n",
);
process.exitCode = 1;
