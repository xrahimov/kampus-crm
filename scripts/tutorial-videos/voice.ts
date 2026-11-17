/**
 * The voice of the tutorial videos: every caption read aloud by an Azure
 * neural voice in the language of the video.
 *
 * A sentence is asked for once and kept as a `.wav` file named after its text
 * and voice, so recording again costs nothing and needs no network. The key
 * never goes into the repository or a command line: it is read from
 * `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`, or from the file named in
 * `AZURE_SPEECH_FILE` that holds those two lines.
 *
 * `TUTORIAL_VOICE_FAKE=1` stands in a quiet tone of about the right length
 * for each sentence, to try the timing and the sound track without a key.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Locale } from "./words";

export type Clip = { file: string; seconds: number };

const VOICES: Record<Locale, { lang: string; name: string }> = {
  en: { lang: "en-US", name: process.env.AZURE_SPEECH_VOICE_EN ?? "en-US-JennyNeural" },
  ru: { lang: "ru-RU", name: process.env.AZURE_SPEECH_VOICE_RU ?? "ru-RU-SvetlanaNeural" },
  uz: { lang: "uz-UZ", name: process.env.AZURE_SPEECH_VOICE_UZ ?? "uz-UZ-MadinaNeural" },
};

/** The free tier takes 20 requests a minute: one every 3.2 seconds stays under it. */
const PAUSE_MS = 3200;
const FAKE = process.env.TUTORIAL_VOICE_FAKE === "1";

function credentials(): { key: string; region: string } {
  let key = process.env.AZURE_SPEECH_KEY;
  let region = process.env.AZURE_SPEECH_REGION;
  const file = process.env.AZURE_SPEECH_FILE?.replace(/^~(?=\/)/, os.homedir());
  if ((!key || !region) && file && existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const [, name, value] = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line) ?? [];
      const bare = value?.replace(/^["']|["']$/g, "");
      if (name === "AZURE_SPEECH_KEY") key ||= bare;
      if (name === "AZURE_SPEECH_REGION") region ||= bare;
    }
  }
  if (!key || !region) {
    throw new Error(
      "no Azure Speech key: set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION, or AZURE_SPEECH_FILE to a file with those two lines",
    );
  }
  return { key, region };
}

/** How long a PCM `.wav` plays, from its own header and size. */
function wavSeconds(file: string): number {
  const bytes = readFileSync(file);
  let at = 12;
  let rate = 0;
  while (at + 8 <= bytes.length) {
    const id = bytes.toString("ascii", at, at + 4);
    const size = bytes.readUInt32LE(at + 4);
    if (id === "fmt ") rate = bytes.readUInt32LE(at + 16);
    // A streamed file may not know its own length: what follows the header is the sound.
    if (id === "data") return rate > 0 ? (bytes.length - (at + 8)) / rate : 0;
    at += 8 + size + (size % 2);
  }
  return 0;
}

/** A quiet tone of `seconds`, 24 kHz 16-bit mono: the stand-in when there is no key. */
function tone(seconds: number): Buffer {
  const rate = 24000;
  const samples = Math.round(seconds * rate);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const edge = Math.min(1, i / 1200, (samples - i) / 1200);
    wav.writeInt16LE(
      Math.round(Math.sin((i / rate) * 2 * Math.PI * 196) * 1600 * edge),
      44 + i * 2,
    );
  }
  return wav;
}

const xml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
  );

export class Voice {
  private last = 0;

  constructor(
    private readonly locale: Locale,
    /** Where the sentences of this language are kept. */
    private readonly dir: string,
  ) {
    mkdirSync(dir, { recursive: true });
    if (!FAKE) credentials();
  }

  /** The sentence as it is said: arrows become a pause, Uzbek letters get their own apostrophes. */
  private spoken(text: string): string {
    const plain = text
      .replace(/\s*→\s*/g, ", ")
      .replace(/\s+/g, " ")
      .trim();
    return this.locale === "uz" ? plain.replace(/‘/g, "ʻ").replace(/’/g, "ʼ") : plain;
  }

  private file(text: string): string {
    const voice = FAKE ? "tone" : VOICES[this.locale].name;
    const name = createHash("sha1")
      .update(`${voice}\n${this.spoken(text)}`)
      .digest("hex");
    return path.join(this.dir, `${name.slice(0, 20)}.wav`);
  }

  /** The recording of `text`; `ensure` has to have asked for it before. */
  get(text: string): Clip {
    const file = this.file(text);
    if (!existsSync(file)) throw new Error(`no voice recording for "${text.slice(0, 40)}…"`);
    return { file, seconds: wavSeconds(file) };
  }

  /** Asks for every sentence that is not kept yet. Returns how many were new. */
  async ensure(texts: string[]): Promise<number> {
    let made = 0;
    for (const text of new Set(texts)) {
      const file = this.file(text);
      if (existsSync(file)) continue;
      writeFileSync(file, FAKE ? tone(1 + this.spoken(text).length / 15) : await this.ask(text));
      made++;
    }
    return made;
  }

  private async ask(text: string): Promise<Buffer> {
    const { key, region } = credentials();
    const { lang, name } = VOICES[this.locale];
    const body = `<speak version="1.0" xml:lang="${lang}"><voice name="${name}">${xml(this.spoken(text))}</voice></speak>`;
    for (let attempt = 1; ; attempt++) {
      const wait = this.last + PAUSE_MS - Date.now();
      if (wait > 0) await new Promise((done) => setTimeout(done, wait));
      this.last = Date.now();
      const response = await fetch(
        `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
            "User-Agent": "tutorial-videos",
          },
          body,
        },
      );
      if (response.ok) {
        const sound = Buffer.from(await response.arrayBuffer());
        if (sound.length > 1000) return sound;
        throw new Error(`Azure Speech sent no sound for "${text.slice(0, 40)}…" (${name})`);
      }
      // Too many requests, or the service is busy: wait and ask again.
      if ((response.status === 429 || response.status >= 500) && attempt < 6) {
        const after = Number(response.headers.get("retry-after")) || 15;
        await new Promise((done) => setTimeout(done, after * 1000));
        continue;
      }
      const why =
        response.status === 401 || response.status === 403
          ? "the key or the region was not accepted"
          : response.status === 400
            ? `the voice ${name} or the text was not accepted`
            : response.statusText;
      throw new Error(`Azure Speech answered ${response.status}: ${why}`);
    }
  }
}
