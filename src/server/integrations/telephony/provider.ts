/**
 * Telephony behind an interface (A-20, A-86). The provider is unknown, so v1
 * ships only the fake adapter: click-to-call returns a call id and the generic
 * webhook records calls that any PBX can post.
 */
export interface TelephonyProvider {
  readonly name: "fake";
  originateCall(input: { from: string; to: string }): Promise<{ externalId: string }>;
}

export const fakeCalls: Array<{ from: string; to: string; externalId: string }> = [];

export class FakeTelephonyProvider implements TelephonyProvider {
  readonly name = "fake" as const;
  async originateCall(input: { from: string; to: string }) {
    const externalId = `fake-call-${Date.now()}-${fakeCalls.length + 1}`;
    fakeCalls.push({ ...input, externalId });
    if (fakeCalls.length > 500) fakeCalls.splice(0, fakeCalls.length - 500);
    return { externalId };
  }
}

let fake: FakeTelephonyProvider | null = null;

export function createTelephonyProvider(): TelephonyProvider {
  fake ??= new FakeTelephonyProvider();
  return fake;
}
