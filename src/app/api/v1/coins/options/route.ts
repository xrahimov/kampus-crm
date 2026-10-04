import { json, route } from "@/server/http/handler";
import { getCoinReportOptions } from "@/server/services/coins/coins.service";

export const GET = route({}, async ({ current }) =>
  json(await getCoinReportOptions(current.actor)),
);
