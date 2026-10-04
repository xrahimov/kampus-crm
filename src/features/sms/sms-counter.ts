/** Characters and SMS parts, as the reference's template editor shows them (EXP §8 Auto SMS). */
export function smsParts(text: string): { chars: number; parts: number } {
  const chars = text.length;
  if (chars === 0) return { chars: 0, parts: 0 };
  // GSM-7 holds 160 characters per single SMS (153 when concatenated); anything
  // outside Latin falls back to UCS-2 with 70 (67) per part.
  const gsm =
    /^[A-Za-z0-9 @£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà\n\r{}[\]~\\|^€]*$/.test(
      text,
    );
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return { chars, parts: chars <= single ? 1 : Math.ceil(chars / multi) };
}
