import {
  TOPIC_BLOCK_KINDS,
  TOPIC_BLOCKS_MAX,
  youtubeId,
  type TopicBlockKindInput,
} from "@kampus/lib/validation/topic-content";
import { useLocalSearchParams } from "expo-router";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { uploadDocument } from "@/api/group-pages";
import {
  useSaveTopicContent,
  useTopicContent,
  type TopicBlockInput,
  type TopicContent,
} from "@/api/topic-content";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Card, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { Attach } from "@/features/files/attach";
import { PendingScreen } from "@/features/shared/pending-screen";
import { Block } from "@/features/student/course-screen";
import type { PickedFile } from "@/lib/api";
import { errorText, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { space, useTheme } from "@/lib/theme";

import { ExercisesPanel } from "./exercises-panel";
import { RowButton } from "./row-button";
import { WordsPanel } from "./words-panel";

/** A block in the list being put together: `key` tells the rows apart while they move. */
type Draft = TopicBlockInput & { key: number };

/**
 * What students read, watch and download for one topic of a course plan
 * (A-157, in the app A-263), with the topic's exercises and its words for the
 * trainer. The office or a teacher of the course puts the blocks in reading
 * order and saves the list as a whole, as on the site; everybody else sees
 * what the students get.
 */
export function TopicContentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations("groups.syllabus.content");
  const query = useTopicContent(id);
  const header = (
    <Header
      back
      title={query.data ? t("title", { topic: query.data.title }) : t("loading")}
      subtitle={query.data?.courseName}
    />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  return <Content data={query.data} header={header} onRefresh={() => void query.refetch()} />;
}

function Content({
  data,
  header,
  onRefresh,
}: {
  data: TopicContent;
  header: ReactNode;
  onRefresh: () => void;
}) {
  const t = useTranslations();
  const tc = useTranslations("groups.syllabus.content");
  const { wide } = useLayout();
  const { colors } = useTheme();
  const save = useSaveTopicContent(data.topicId);
  const [draft, setDraft] = useState<Draft[]>(() =>
    data.blocks.map((block, index) => ({ ...asInput(block), key: index + 1 })),
  );
  const [next, setNext] = useState(data.blocks.length + 1);
  const [changed, setChanged] = useState(false);
  const [saved, setSaved] = useState(false);
  const [adding, setAdding] = useState(false);
  const canEdit = data.canEdit;

  const change = (update: (list: Draft[]) => Draft[]) => {
    setDraft(update);
    setChanged(true);
    setSaved(false);
  };
  const move = (index: number, by: -1 | 1) =>
    change((list) => {
      const to = index + by;
      if (to < 0 || to >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[to]] = [copy[to]!, copy[index]!];
      return copy;
    });

  const blocks = (
    <View style={styles.block}>
      <Text tone="mutedForeground">{canEdit ? tc("hint") : tc("readOnly")}</Text>
      {draft.length === 0 ? (
        <Card>
          <Text tone="mutedForeground" testID="content-empty">
            {tc("empty")}
          </Text>
        </Card>
      ) : (
        draft.map((block, index) => (
          <Card key={block.key} style={styles.one} testID={`content-block-${index}`}>
            <View style={styles.head}>
              <Text variant="small" tone="mutedForeground" style={styles.fill}>
                {index + 1}. {tc(`kinds.${block.kind}`)}
              </Text>
              {canEdit ? (
                <>
                  <RowButton
                    icon={ArrowUp}
                    label={tc("moveUp")}
                    disabled={index === 0}
                    onPress={() => move(index, -1)}
                    testID={`content-up-${index}`}
                  />
                  <RowButton
                    icon={ArrowDown}
                    label={tc("moveDown")}
                    disabled={index === draft.length - 1}
                    onPress={() => move(index, 1)}
                    testID={`content-down-${index}`}
                  />
                  <RowButton
                    icon={Trash2}
                    label={tc("remove")}
                    destructive
                    onPress={() => change((list) => list.filter((_, at) => at !== index))}
                    testID={`content-remove-${index}`}
                  />
                </>
              ) : null}
            </View>
            <Block block={{ ...block, id: String(block.key) }} />
          </Card>
        ))
      )}
      {save.error ? (
        <Notice tone="destructive" testID="content-problem">
          {errorText(t, save.error)}
        </Notice>
      ) : null}
      {saved ? (
        <Notice tone="success" testID="content-saved">
          {t("common.saved")}
        </Notice>
      ) : null}
      {canEdit ? (
        <View style={styles.actions}>
          {draft.length < TOPIC_BLOCKS_MAX ? (
            <Button
              variant="outline"
              label={tc("add")}
              icon={<Plus size={16} color={colors.foreground} />}
              onPress={() => setAdding(true)}
              testID="content-add"
            />
          ) : null}
          {changed ? (
            <Button
              label={t("common.save")}
              loading={save.isPending}
              onPress={() =>
                save.mutate(draft.map(asInput), {
                  onSuccess: () => {
                    setChanged(false);
                    setSaved(true);
                  },
                })
              }
              testID="content-save"
            />
          ) : null}
        </View>
      ) : null}
      {changed ? (
        <Text variant="small" tone="mutedForeground" testID="content-unsaved">
          {t("mobile.topics.unsaved")}
        </Text>
      ) : null}
    </View>
  );

  const rest = (
    <View style={styles.block}>
      <ExercisesPanel anchor={{ topicId: data.topicId }} />
      <WordsPanel topicId={data.topicId} />
    </View>
  );

  return (
    <Screen
      header={header}
      onRefresh={changed ? undefined : onRefresh}
      contentStyle={wide ? styles.split : styles.column}
    >
      {wide ? (
        <>
          <View style={styles.wideBlocks}>{blocks}</View>
          <View style={styles.wideRest}>{rest}</View>
        </>
      ) : (
        <>
          {blocks}
          {rest}
        </>
      )}
      <AddBlockSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={(block) => {
          change((list) => [...list, { ...block, key: next }]);
          setNext((n) => n + 1);
          setAdding(false);
        }}
      />
    </Screen>
  );
}

const asInput = ({ kind, title, body, url }: TopicBlockInput): TopicBlockInput => ({
  kind,
  title,
  body,
  url,
});

/**
 * One new block: text, a video (a YouTube address or a file from this device),
 * a file or a link. A file goes to the server when the block joins the list,
 * so the list holds only addresses, as the site's does.
 */
function AddBlockSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (block: TopicBlockInput) => void;
}) {
  const t = useTranslations();
  const tc = useTranslations("groups.syllabus.content");
  const [kind, setKind] = useState<TopicBlockKindInput>("TEXT");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [problems, setProblems] = useState<Partial<Record<"title" | "body" | "url", string>>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle("");
      setBody("");
      setUrl("");
      setFile(null);
      setProblems({});
      setFailure(null);
    }
  }

  const add = async () => {
    const heading = title.trim();
    const address = url.trim();
    const found: typeof problems = {};
    if (!heading) found.title = "validation.required";
    if (kind === "TEXT" && !body.trim()) found.body = "validation.required";
    if (kind === "LINK" && !/^https?:\/\//i.test(address)) found.url = "validation.url";
    if (kind === "FILE" && !file) found.url = "validation.fileRequired";
    if (kind === "VIDEO" && !file && !youtubeId(address)) found.url = "validation.videoUrl";
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    setFailure(null);
    try {
      let stored: string | null = null;
      if (file && (kind === "FILE" || kind === "VIDEO")) {
        setBusy(true);
        stored = (await uploadDocument(file)).url;
      }
      onAdd({
        kind,
        title: heading,
        body: kind === "TEXT" ? body.trim() : null,
        url: kind === "TEXT" ? null : (stored ?? address),
      });
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };
  const said = (key: string | undefined) => (key ? t(key) : null);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tc("add")}
      testID="content-new"
      footer={
        <Button
          label={tc("addBlock")}
          loading={busy}
          onPress={() => void add()}
          testID="content-new-add"
        />
      }
    >
      <View style={styles.block}>
        <Select
          label={tc("kind")}
          value={kind}
          onChange={(next) => {
            if (!next) return;
            setKind(next);
            setProblems({});
          }}
          options={TOPIC_BLOCK_KINDS.map((one) => ({ value: one, label: tc(`kinds.${one}`) }))}
          testID="content-new-kind"
        />
        <Field
          label={tc("blockTitle")}
          value={title}
          onChangeText={setTitle}
          maxLength={200}
          error={said(problems.title)}
          testID="content-new-title"
        />
        {kind === "TEXT" ? (
          <Field
            label={tc("text")}
            value={body}
            onChangeText={setBody}
            multiline
            style={styles.text}
            error={said(problems.body)}
            testID="content-new-text"
          />
        ) : null}
        {kind === "LINK" || kind === "VIDEO" ? (
          <Field
            label={kind === "VIDEO" ? tc("youtube") : tc("url")}
            value={url}
            onChangeText={setUrl}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={kind === "VIDEO" ? "https://youtu.be/…" : "https://"}
            error={kind === "VIDEO" && file ? null : said(problems.url)}
            testID="content-new-url"
          />
        ) : null}
        {kind === "FILE" || kind === "VIDEO" ? (
          <View style={styles.file}>
            <Text variant="smallStrong">{kind === "VIDEO" ? tc("videoFile") : tc("file")}</Text>
            <Attach file={file} onFile={setFile} disabled={busy} testID="content-new-file" />
            {kind === "FILE" && problems.url ? (
              <Text variant="small" tone="destructive" testID="content-new-file-problem">
                {said(problems.url)}
              </Text>
            ) : null}
          </View>
        ) : null}
        {failure ? (
          <Notice tone="destructive" testID="content-new-problem">
            {errorText(t, failure)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space[6] },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  wideBlocks: { flex: 3 },
  wideRest: { flex: 2 },
  block: { gap: space[4] },
  one: { gap: space[2] },
  head: { flexDirection: "row", alignItems: "center", gap: space[1] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  text: { minHeight: 144, textAlignVertical: "top" },
  file: { gap: space[2] },
});
