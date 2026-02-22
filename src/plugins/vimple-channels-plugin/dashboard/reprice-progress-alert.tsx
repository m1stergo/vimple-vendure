import {
  api,
  DashboardAlertDefinition,
  defineDashboardExtension,
} from "@vendure/dashboard";
import { graphql } from "@/gql";

interface RepriceJobSnapshot {
  id: string;
  state: string;
  progress: number;
  data?: {
    channelId?: number;
    requestedMarkup?: number;
  } | null;
}

interface RepriceAlertData {
  activeJobs: number;
  currentJob?: RepriceJobSnapshot;
}

const activeRepriceJobsQuery = graphql(`
  query GetActiveChannelRepriceJobs {
    jobs(
      options: {
        take: 5
        sort: { createdAt: DESC }
        filter: {
          queueName: { eq: "channel-markup-reprice" }
          state: { in: ["PENDING", "RUNNING", "RETRYING"] }
        }
      }
    ) {
      items {
        id
        state
        progress
        data
      }
      totalItems
    }
  }
`);

const repriceProgressAlert: DashboardAlertDefinition<RepriceAlertData> = {
  id: "channel-markup-reprice-progress",
  check: async () => {
    try {
      const result = await api.query(activeRepriceJobsQuery);
      const items = result.jobs.items ?? [];
      const normalized: RepriceJobSnapshot[] = items.map((job) => ({
        id: String(job.id),
        state: job.state,
        progress: Math.round(Number(job.progress ?? 0)),
        data: (job.data as RepriceJobSnapshot["data"]) ?? null,
      }));

      return {
        activeJobs: result.jobs.totalItems ?? normalized.length,
        currentJob: normalized[0],
      };
    } catch {
      return { activeJobs: 0 };
    }
  },
  recheckInterval: 3000,
  shouldShow: (data) => (data?.activeJobs ?? 0) > 0,
  severity: (data) =>
    data?.currentJob?.state === "RETRYING" ? "warning" : "info",
  title: (data) => {
    const progress = data?.currentJob?.progress ?? 0;
    const state = data?.currentJob?.state ?? "RUNNING";
    return `Repricing de canal en progreso (${progress}%) - ${state}`;
  },
  description: (data) => {
    const channelId = data?.currentJob?.data?.channelId;
    const requestedMarkup = data?.currentJob?.data?.requestedMarkup;
    const activeJobsLabel =
      (data?.activeJobs ?? 0) > 1
        ? `${data?.activeJobs} jobs activos`
        : "1 job activo";
    const channelLabel =
      channelId != null ? `Canal ${channelId}` : "Canal desconocido";
    const markupLabel =
      requestedMarkup != null ? `markup ${requestedMarkup}%` : "markup n/a";
    return `${activeJobsLabel}. ${channelLabel}, ${markupLabel}.`;
  },
};

export default defineDashboardExtension({
  alerts: [repriceProgressAlert],
});
