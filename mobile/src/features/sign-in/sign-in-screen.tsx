import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { MessageCircle, Send } from "lucide-react-native";
import { useRef, useState, type ComponentRef } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/button";
import { ChoiceList } from "@/components/choice-list";
import { Field } from "@/components/field";
import { KampusMark } from "@/components/logo";
import { Notice, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { TileWall } from "@/components/tile-wall";
import { api } from "@/lib/api";
import { errorText, LOCALES, useLocaleChoice, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { phoneTyped } from "@/lib/phone";
import { useSession } from "@/lib/session";
import { palette, radius, space, useTheme } from "@/lib/theme";

import { HowToVideo } from "./how-to-video";
import {
  normalizePhone,
  type CodeTicket,
  type Door,
  type JoinState,
  type PasswordResponse,
  type Side,
  type SignInOptions,
  type VerifyResponse,
} from "./types";

/*
 * Signing in (A-196, A-203): the same steps as the website's sign-in page.
 * Phone and password by default; "Get a code in Telegram" for the first
 * sign-in, a forgotten password, or anyone who prefers it. A phone Kampus does
 * not know ends on the waiting list. On a tablet the form sits beside the
 * lapis tile wall, as on the site; on a phone the mark sits above the form.
 */

type Step =
  | { name: "form" }
  | { name: "phoneCode"; ticket: CodeTicket; phone: string }
  | { name: "challenge"; challengeId: string }
  | { name: "join"; join: JoinState; phone: string };

export function SignInScreen() {
  const t = useTranslations();
  const { colors } = useTheme();
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const { locale, setLocale } = useLocaleChoice();

  const form = (
    <View style={styles.form}>
      <SignInSteps />
      <View
        style={styles.locales}
        accessibilityRole="radiogroup"
        accessibilityLabel={t("mobile.language")}
      >
        {LOCALES.map((code) => (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityState={{ checked: code === locale }}
            onPress={() => setLocale(code)}
            testID={`locale-${code}`}
            style={styles.locale}
          >
            <Text
              variant="smallStrong"
              tone={code === locale ? "foreground" : "mutedForeground"}
              style={code === locale ? styles.localeChosen : undefined}
            >
              {t(`locales.${code}`)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  if (wide) {
    return (
      <View style={[styles.split, { backgroundColor: colors.background }]}>
        <View style={[styles.wall, { backgroundColor: palette.light.sidebar }]}>
          <TileWall />
          {/* As on the site: the name and what Kampus is, at the foot of the wall. */}
          <View
            style={[styles.wallBrand, { paddingBottom: insets.bottom + space[10] }]}
            pointerEvents="none"
          >
            <Text variant="display" style={styles.wallName}>
              {t("app.name")}
            </Text>
            <Text style={styles.wallTagline}>{t("app.tagline")}</Text>
          </View>
        </View>
        <KeyboardAvoidingView
          style={styles.side}
          // Android draws under the keyboard (edge to edge), so it needs the room made as well:
          // on a tablet lying on its side the keyboard covered the password and the button.
          behavior="padding"
        >
          <ScrollView
            contentContainerStyle={[styles.sideScroll, { paddingTop: insets.top + space[8] }]}
            keyboardShouldPersistTaps="handled"
          >
            {form}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.fill, { backgroundColor: colors.background }]}
      behavior="padding"
    >
      <ScrollView
        contentContainerStyle={[
          styles.phoneScroll,
          { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[6] },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.phoneBrand}>
          <KampusMark size={40} />
          <Text variant="heading">{t("app.name")}</Text>
        </View>
        {form}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SignInSteps() {
  const t = useTranslations();
  const router = useRouter();
  const { signIn } = useSession();
  const [door, setDoor] = useState<Door>("STUDENT");
  const [step, setStep] = useState<Step>({ name: "form" });
  const options = useQuery({
    queryKey: ["sign-in-options"],
    queryFn: () => api<SignInOptions>("/auth/options", { anonymous: true }),
    staleTime: 5 * 60 * 1000,
  });
  const bot = options.data?.bot ?? { username: null, url: null };
  const botName = bot.username ? `@${bot.username}` : t("auth.theBot");

  async function finish(to: Side, token: string, offerPassword = false) {
    await signIn(to, token);
    // The guards have opened that side of the app; the password offer goes on top of it.
    router.replace(offerPassword ? "/set-password" : "/");
  }

  if (step.name === "join") {
    return (
      <JoinStep
        join={step.join}
        phone={step.phone}
        onChange={(join) => setStep({ name: "join", join, phone: step.phone })}
        onBack={() => setStep({ name: "form" })}
      />
    );
  }
  if (step.name === "phoneCode") {
    return (
      <PhoneCodeStep
        ticket={step.ticket}
        phone={step.phone}
        door={door}
        botName={botName}
        botUrl={bot.url}
        onSignedIn={finish}
        onJoin={(join) => setStep({ name: "join", join, phone: step.phone })}
        onNewTicket={(ticket) => setStep({ name: "phoneCode", ticket, phone: step.phone })}
        onStartOver={() => setStep({ name: "form" })}
      />
    );
  }
  if (step.name === "challenge") {
    return (
      <ChallengeStep
        challengeId={step.challengeId}
        onSignedIn={(token) => finish("staff", token)}
        onStartOver={() => setStep({ name: "form" })}
      />
    );
  }
  return (
    <FormStep
      door={door}
      onDoor={setDoor}
      codeOffered={options.data?.code ?? false}
      botName={botName}
      botUrl={bot.url}
      onSignedIn={finish}
      onChallenge={(challengeId) => setStep({ name: "challenge", challengeId })}
      onTicket={(ticket, phone) => setStep({ name: "phoneCode", ticket, phone })}
    />
  );
}

function FormStep({
  door,
  onDoor,
  codeOffered,
  botName,
  botUrl,
  onSignedIn,
  onChallenge,
  onTicket,
}: {
  door: Door;
  onDoor: (door: Door) => void;
  codeOffered: boolean;
  botName: string;
  botUrl: string | null;
  onSignedIn: (to: Side, token: string) => Promise<void>;
  onChallenge: (challengeId: string) => void;
  onTicket: (ticket: CodeTicket, phone: string) => void;
}) {
  const t = useTranslations();
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [phone, setPhone] = useState("+998");
  const [password, setPassword] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"password" | "code" | null>(null);

  function checkedPhone(): string | null {
    const value = normalizePhone(phone);
    setPhoneError(value ? null : t("validation.phone"));
    return value;
  }

  async function submit() {
    setServerError(null);
    const value = checkedPhone();
    const short = password.length < 8;
    setPasswordError(short ? t("validation.passwordMin") : null);
    if (!value || short) return;
    setBusy("password");
    try {
      const result = await api<PasswordResponse>("/auth/login", {
        method: "POST",
        anonymous: true,
        body: { phone: value, password, door },
      });
      if (!result.ok) onChallenge(result.challenge.id);
      else await onSignedIn(result.to, result.token);
    } catch (error) {
      setServerError(errorText(t, error));
    } finally {
      setBusy(null);
    }
  }

  async function askForCode() {
    setServerError(null);
    setPasswordError(null);
    const value = checkedPhone();
    if (!value) return;
    setBusy("code");
    try {
      const ticket = await api<CodeTicket>("/auth/code", {
        method: "POST",
        anonymous: true,
        body: { phone: value, door },
      });
      onTicket(ticket, value);
    } catch (error) {
      setServerError(errorText(t, error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.step}>
      <View style={styles.heading}>
        <Text variant="display" accessibilityRole="header">
          {t("auth.signInTitle")}
        </Text>
        <Text tone="mutedForeground">
          {codeOffered ? t("auth.signInSubtitleCode") : t("auth.signInSubtitle")}
        </Text>
      </View>
      <Segmented
        testID="door"
        value={door}
        onChange={onDoor}
        options={[
          { value: "STUDENT", label: t("mobile.doorStudent") },
          { value: "STAFF", label: t("mobile.doorStaff") },
        ]}
      />
      {serverError ? (
        <Notice tone="destructive" testID="sign-in-error">
          {serverError}
        </Notice>
      ) : null}
      <Field
        label={t("auth.phone")}
        value={phone}
        onChangeText={(text) => setPhone(phoneTyped(text))}
        error={phoneError}
        placeholder={t("auth.phonePlaceholder")}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        testID="phone"
      />
      <Field
        inputRef={passwordRef}
        label={t("auth.password")}
        value={password}
        onChangeText={setPassword}
        error={passwordError}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        testID="password"
      />
      <Button
        label={busy === "password" ? t("auth.signingIn") : t("auth.signIn")}
        onPress={submit}
        loading={busy === "password"}
        disabled={busy !== null}
        testID="sign-in"
      />
      {codeOffered ? (
        <>
          <OrLine label={t("auth.orTelegram")} />
          <Button
            variant="outline"
            label={busy === "code" ? t("auth.gettingCode") : t("auth.getCode")}
            icon={<IconSend />}
            onPress={askForCode}
            loading={busy === "code"}
            disabled={busy !== null}
            testID="get-code"
          />
          <TelegramHowTo botName={botName} botUrl={botUrl} />
        </>
      ) : null}
      {/* What a first sign-in takes: the how-to video where the server has it, and who approves (A-229). */}
      <HowToVideo id={door === "STAFF" ? "app-sign-in" : "app-student"} />
    </View>
  );
}

function IconSend() {
  const { colors } = useTheme();
  return <Send size={18} color={colors.foreground} />;
}

function OrLine({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.orLine}>
      <View style={[styles.rule, { backgroundColor: colors.border }]} />
      <Text variant="small" tone="mutedForeground">
        {label}
      </Text>
      <View style={[styles.rule, { backgroundColor: colors.border }]} />
    </View>
  );
}

function OpenBot({ botName, botUrl }: { botName: string; botUrl: string | null }) {
  const t = useTranslations();
  const { colors } = useTheme();
  if (!botUrl) return null;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(botUrl)}
      style={styles.openBot}
      testID="open-bot"
    >
      <MessageCircle size={18} color={colors.primary} />
      <Text variant="bodyStrong" tone="primary">
        {t("auth.openBot", { bot: botName })}
      </Text>
    </Pressable>
  );
}

/** The steps of a sign-in with Telegram, always on the screen: first-timers need them most. */
function TelegramHowTo({ botName, botUrl }: { botName: string; botUrl: string | null }) {
  const t = useTranslations();
  const { colors } = useTheme();
  const steps = [t("auth.how1"), t("auth.how2", { bot: botName }), t("auth.how3"), t("auth.how4")];
  return (
    <View
      style={[styles.how, { backgroundColor: colors.muted, borderColor: colors.border }]}
      testID="telegram-how"
    >
      <Text variant="bodyStrong">{t("auth.howTitle")}</Text>
      <Text variant="small" tone="mutedForeground">
        {t("auth.howWhen")}
      </Text>
      <View style={styles.howSteps}>
        {steps.map((text, index) => (
          <View key={index} style={styles.howStep}>
            <Text variant="smallStrong" style={styles.howNumber}>
              {index + 1}.
            </Text>
            <Text variant="small" tone="mutedForeground" style={styles.fill}>
              {text}
            </Text>
          </View>
        ))}
      </View>
      <OpenBot botName={botName} botUrl={botUrl} />
    </View>
  );
}

function CodeField({
  value,
  onChange,
  error,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  onSubmit: () => void;
}) {
  const t = useTranslations();
  return (
    <Field
      label={t("auth.code")}
      value={value}
      onChangeText={(text) => onChange(text.replace(/\D/g, "").slice(0, 6))}
      error={error}
      keyboardType="number-pad"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      maxLength={6}
      autoFocus
      returnKeyType="go"
      onSubmitEditing={onSubmit}
      style={styles.code}
      testID="code"
    />
  );
}

/** The code the bot sent to the phone's Telegram chat (A-196). */
function PhoneCodeStep({
  ticket,
  phone,
  door,
  botName,
  botUrl,
  onSignedIn,
  onJoin,
  onNewTicket,
  onStartOver,
}: {
  ticket: CodeTicket;
  phone: string;
  door: Door;
  botName: string;
  botUrl: string | null;
  onSignedIn: (to: Side, token: string, offerPassword: boolean) => Promise<void>;
  onJoin: (join: JoinState) => void;
  onNewTicket: (ticket: CodeTicket) => void;
  onStartOver: () => void;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState<"verify" | "resend" | null>(null);

  async function verify() {
    setServerError(null);
    setResent(false);
    if (!/^\d{6}$/.test(code)) {
      setCodeError(t("validation.code"));
      return;
    }
    setCodeError(null);
    setBusy("verify");
    try {
      const result = await api<VerifyResponse>("/auth/code/verify", {
        method: "POST",
        anonymous: true,
        body: { id: ticket.id, code, door },
      });
      if (!result.ok) onJoin(result.join);
      else await onSignedIn(result.to, result.token, result.offerPassword);
    } catch (error) {
      setServerError(errorText(t, error));
    } finally {
      setBusy(null);
    }
  }

  async function resend() {
    setServerError(null);
    setBusy("resend");
    try {
      const made = await api<CodeTicket>("/auth/code", {
        method: "POST",
        anonymous: true,
        body: { phone, door },
      });
      setCode("");
      setResent(true);
      onNewTicket(made);
    } catch (error) {
      setServerError(errorText(t, error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.step} testID="phone-code-step">
      <View style={styles.heading}>
        <Text variant="title" accessibilityRole="header">
          {t("auth.phoneCodeTitle")}
        </Text>
        <Text tone="mutedForeground">{t("auth.phoneCodeSubtitle", { phone, bot: botName })}</Text>
      </View>
      {serverError ? (
        <Notice tone="destructive" testID="code-error">
          {serverError}
        </Notice>
      ) : null}
      {resent ? <Notice tone="accent">{t("auth.codeResent")}</Notice> : null}
      <CodeField value={code} onChange={setCode} error={codeError} onSubmit={verify} />
      <Button
        label={busy === "verify" ? t("auth.signingIn") : t("auth.confirmCode")}
        onPress={verify}
        loading={busy === "verify"}
        disabled={busy !== null}
        testID="confirm-code"
      />
      <View style={[styles.how, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Text variant="bodyStrong">{t("auth.noMessageTitle")}</Text>
        <Text variant="small" tone="mutedForeground">
          {t("auth.noMessage", { bot: botName })}
        </Text>
        <OpenBot botName={botName} botUrl={botUrl} />
      </View>
      <View style={[styles.pair, styles.pairWrap]}>
        <Button
          variant="ghost"
          label={t("auth.startOver")}
          onPress={onStartOver}
          disabled={busy !== null}
          style={styles.grow}
        />
        <Button
          variant="ghost"
          label={t("auth.codeAgain")}
          onPress={resend}
          loading={busy === "resend"}
          disabled={busy !== null}
          style={styles.grow}
          testID="code-again"
        />
      </View>
    </View>
  );
}

/** The password was right and the account also asks for a Telegram code (A-124). */
function ChallengeStep({
  challengeId,
  onSignedIn,
  onStartOver,
}: {
  challengeId: string;
  onSignedIn: (token: string) => Promise<void>;
  onStartOver: () => void;
}) {
  const t = useTranslations();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    setServerError(null);
    if (!/^\d{6}$/.test(code)) {
      setCodeError(t("validation.code"));
      return;
    }
    setCodeError(null);
    setBusy(true);
    try {
      const result = await api<{ ok: true; token: string }>("/auth/verify-code", {
        method: "POST",
        anonymous: true,
        body: { challengeId, code },
      });
      await onSignedIn(result.token);
    } catch (error) {
      setServerError(errorText(t, error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.step} testID="challenge-step">
      <View style={styles.heading}>
        <Text variant="title" accessibilityRole="header">
          {t("auth.codeTitle")}
        </Text>
        <Text tone="mutedForeground">{t("auth.codeSubtitle")}</Text>
      </View>
      {serverError ? <Notice tone="destructive">{serverError}</Notice> : null}
      <CodeField value={code} onChange={setCode} error={codeError} onSubmit={verify} />
      <Button
        label={busy ? t("auth.signingIn") : t("auth.confirmCode")}
        onPress={verify}
        loading={busy}
      />
      <Button variant="ghost" label={t("auth.startOver")} onPress={onStartOver} disabled={busy} />
    </View>
  );
}

/** A proven phone Kampus does not know: the person says who they are and waits to be let in. */
function JoinStep({
  join,
  phone,
  onChange,
  onBack,
}: {
  join: JoinState;
  phone: string;
  onChange: (join: JoinState) => void;
  onBack: () => void;
}) {
  const t = useTranslations();
  const centres = join.state === "draft" ? join.centres : [];
  const [fullName, setFullName] = useState(join.state === "draft" ? join.fullName : "");
  const [organizationId, setOrganizationId] = useState<string | null>(
    centres.length === 1 ? centres[0]!.id : null,
  );
  const [branchId, setBranchId] = useState<string | null>(
    centres.length === 1 && centres[0]!.branches.length === 1 ? centres[0]!.branches[0]!.id : null,
  );
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ name?: string; centre?: string; branch?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const centre = centres.find((c) => c.id === organizationId) ?? null;

  if (join.state !== "draft") {
    const declined = join.state === "declined";
    return (
      <View style={styles.step} testID={declined ? "join-declined" : "join-sent"}>
        <View style={styles.heading}>
          <Text variant="title" accessibilityRole="header">
            {t(declined ? "auth.join.declinedTitle" : "auth.join.sentTitle")}
          </Text>
          <Text tone="mutedForeground">
            {t(declined ? "auth.join.declined" : "auth.join.sent", {
              centre: join.centre ?? t("app.name"),
              phone,
            })}
          </Text>
        </View>
        <Button variant="outline" label={t("auth.join.back")} onPress={onBack} />
      </View>
    );
  }
  const draft = join;

  async function send() {
    setServerError(null);
    const next: typeof errors = {};
    if (fullName.trim().length < 2) next.name = t("validation.required");
    if (!organizationId) next.centre = t("validation.required");
    if (centre && centre.branches.length > 1 && !branchId) next.branch = t("validation.required");
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      const result = await api<{ join: JoinState }>("/auth/join", {
        method: "POST",
        anonymous: true,
        body: {
          token: draft.token,
          fullName: fullName.trim(),
          organizationId,
          ...(branchId ? { branchId } : {}),
          note,
        },
      });
      onChange(result.join);
    } catch (error) {
      setServerError(errorText(t, error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.step} testID="join-step">
      <View style={styles.heading}>
        <Text variant="title" accessibilityRole="header">
          {t("auth.join.title")}
        </Text>
        <Text tone="mutedForeground">{t("auth.join.intro", { phone })}</Text>
      </View>
      {serverError ? <Notice tone="destructive">{serverError}</Notice> : null}
      <Field
        label={t("auth.join.name")}
        value={fullName}
        onChangeText={setFullName}
        error={errors.name}
        autoComplete="name"
        textContentType="name"
      />
      {centres.length > 1 ? (
        <ChoiceList
          label={t("auth.join.centre")}
          value={organizationId}
          error={errors.centre}
          options={centres.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(id) => {
            setOrganizationId(id);
            const chosen = centres.find((c) => c.id === id);
            setBranchId(chosen?.branches.length === 1 ? chosen.branches[0]!.id : null);
          }}
        />
      ) : null}
      {centre && centre.branches.length > 1 ? (
        <ChoiceList
          label={t("auth.join.branch")}
          value={branchId}
          error={errors.branch}
          options={centre.branches.map((b) => ({ value: b.id, label: b.name }))}
          onChange={setBranchId}
        />
      ) : null}
      <Field
        label={t("auth.join.note")}
        value={note}
        onChangeText={setNote}
        placeholder={t("auth.join.notePlaceholder")}
        maxLength={300}
      />
      <Button
        label={busy ? t("common.saving") : t("auth.join.send")}
        onPress={send}
        loading={busy}
        testID="join-send"
      />
      <Button variant="ghost" label={t("auth.join.back")} onPress={onBack} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  split: { flex: 1, flexDirection: "row" },
  wall: { flex: 5, overflow: "hidden" },
  side: { flex: 6 },
  wallBrand: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: space[10],
    gap: space[3],
    maxWidth: 460,
  },
  wallName: { color: "#ffffff", fontSize: 36, lineHeight: 42 },
  wallTagline: { color: palette.light.sidebarForeground, fontSize: 18, lineHeight: 26 },
  sideScroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: space[10],
    paddingBottom: space[10],
  },
  phoneScroll: { flexGrow: 1, paddingHorizontal: space[5], gap: space[8] },
  phoneBrand: { flexDirection: "row", alignItems: "center", gap: space[3] },
  form: { width: "100%", maxWidth: 420, alignSelf: "center", gap: space[8] },
  step: { gap: space[4] },
  heading: { gap: space[2], marginBottom: space[2] },
  orLine: { flexDirection: "row", alignItems: "center", gap: space[3] },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  how: { borderWidth: 1, borderRadius: radius.lg, padding: space[4], gap: space[2] },
  howSteps: { gap: space[2], marginTop: space[1] },
  howStep: { flexDirection: "row", gap: space[2] },
  howNumber: { width: 18 },
  openBot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    minHeight: 44,
    marginTop: space[1],
  },
  code: { fontSize: 24, letterSpacing: 6, textAlign: "center" },
  pair: { flexDirection: "row", gap: space[2] },
  // Two links side by side where both fit; a long one (Russian) drops under the other whole.
  pairWrap: { flexWrap: "wrap", justifyContent: "center" },
  grow: { flexGrow: 1 },
  locales: { flexDirection: "row", justifyContent: "center", gap: space[2] },
  locale: { minHeight: 44, paddingHorizontal: space[3], justifyContent: "center" },
  localeChosen: { textDecorationLine: "underline" },
});
