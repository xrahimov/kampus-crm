/**
 * What a phone number field keeps of what was typed. The phone's own number
 * pad has only these signs, but a keyboard beside an iPad (or a paste) can
 * bring letters, which the server would refuse only after the press.
 */
export function phoneTyped(text: string): string {
  return text.replace(/[^\d+\s()-]/g, "");
}
