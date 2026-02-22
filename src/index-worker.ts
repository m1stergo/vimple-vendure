import { bootstrapWorker } from "@vendure/core";
import { config } from "./vendure-config";

const workerHealthPort = Number(process.env.WORKER_HEALTH_PORT || 3020);

bootstrapWorker(config)
  .then(async (worker) => {
    await worker.startJobQueue();
    await worker.startHealthCheckServer({ port: workerHealthPort });
  })
  .catch((err) => {
    console.log(err);
  });
