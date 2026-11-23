import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { Mic, Square, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { clock } from "@/features/room/file-source";
import type { PickedFile } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";

import { AudioClip } from "./audio-clip";

/** What a finished recording is called and sent as, by the device that made it. */
export async function recordingFile(uri: string): Promise<PickedFile> {
  if (Platform.OS !== "web") return { uri, name: "answer.m4a", type: "audio/mp4" };
  // A browser records what it can (WebM in Chrome, MP4 in Safari) and says which.
  const blob = await (await fetch(uri)).blob();
  const type = blob.type.split(";")[0] || "audio/webm";
  const name =
    type === "audio/mp4" ? "answer.m4a" : type === "audio/ogg" ? "answer.ogg" : "answer.weba";
  return {
    uri,
    name,
    type: name === "answer.weba" ? "audio/webm" : type,
    size: blob.size,
    file: blob,
  };
}

/**
 * Recording a spoken answer with the phone's microphone (A-212): Record, the
 * running time, Stop, then the recording to listen to before sending.
 */
export function VoiceRecorder({
  value,
  onChange,
  label,
}: {
  value: PickedFile | null;
  onChange: (file: PickedFile | null) => void;
  /** What the finished recording is called beside its play button. */
  label: string;
}) {
  const t = useTranslations("mobile.homework");
  const tp = useTranslations("mobile.room");
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 500);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  // How long the last recording ran, to show at once beside it.
  const [seconds, setSeconds] = useState(0);

  const start = async () => {
    setBusy(true);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setDenied(true);
        return;
      }
      setDenied(false);
      onChange(null);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setDenied(true);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      setSeconds(state.durationMillis / 1000);
      await recorder.stop();
      // Back to the loudspeaker for listening.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (recorder.uri) onChange(await recordingFile(recorder.uri));
    } finally {
      setBusy(false);
    }
  };

  if (state.isRecording) {
    return (
      <View style={styles.row} testID="recorder-recording">
        <View style={[styles.dot, { backgroundColor: colors.destructive }]} />
        <Text style={styles.fill}>
          {t("recording", { time: clock(state.durationMillis / 1000) })}
        </Text>
        <Button
          variant="outline"
          label={t("stopRecording")}
          icon={<Square size={16} color={colors.foreground} />}
          onPress={() => void stop()}
          disabled={busy}
          testID="recorder-stop"
        />
      </View>
    );
  }
  return (
    <View style={styles.block}>
      {value ? (
        <AudioClip
          source={{ uri: value.uri }}
          label={label}
          seconds={seconds}
          testID="recorder-clip"
        />
      ) : null}
      <View style={styles.row}>
        <Button
          variant="outline"
          label={value ? t("recordAgain") : t("record")}
          icon={<Mic size={16} color={colors.foreground} />}
          onPress={() => void start()}
          disabled={busy}
          testID="recorder-start"
        />
        {value ? (
          <Button
            variant="ghost"
            label={t("removeRecording")}
            icon={<Trash2 size={16} color={colors.foreground} />}
            onPress={() => onChange(null)}
            testID="recorder-remove"
          />
        ) : null}
      </View>
      {denied ? (
        <View style={styles.block} testID="recorder-denied">
          <Text variant="small" tone="destructive">
            {t("micDenied")}
          </Text>
          {Platform.OS !== "web" ? (
            <Button
              variant="outline"
              label={tp("openSettings")}
              onPress={() => void Linking.openSettings()}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  block: { gap: space[2] },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
