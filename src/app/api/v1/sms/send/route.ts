import { sendSmsSchema } from "@/lib/validation/integrations";
import { json, route } from "@/server/http/handler";
import { sendSms } from "@/server/services/sms/sms.service";

/** Every "SMS YUBORISH" button and the student/parents/column/group senders (EXP). */
export const POST = route<typeof sendSmsSchema._output>(
  { permission: "sms.send", body: sendSmsSchema },
  async ({ current, body }) => json(await sendSms(current.actor, body), { status: 201 }),
);
