import { runMigrations } from "@vendure/core";
import { config } from "./vendure-config";

runMigrations(config)
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
