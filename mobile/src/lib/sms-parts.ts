/**
 * Characters and SMS parts, counted as the site's "Send SMS" counts them
 * (`src/features/sms/sms-counter.ts`): Latin text holds 160 characters in one
 * SMS (153 in each part of a longer one), any other alphabet 70 (67).
 */
export function smsParts(text: string): { chars: number; parts: number } {
  const chars = text.length;
  if (chars === 0) return { chars: 0, parts: 0 };
  const gsm =
    /^[A-Za-z0-9 @£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà\n\r{}[\]~\\|^€]*$/.test(
      text,
    );
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return { chars, parts: chars <= single ? 1 : Math.ceil(chars / multi) };
}
