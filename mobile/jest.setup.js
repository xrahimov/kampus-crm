/* global jest */
/*
 * Native packages of the lesson room's stage (A-210) that a test cannot load:
 * the PDF view, the video player and the web view. Each is a plain element a
 * test can find and send events to. (WebRTC and the loudspeaker are mocked by
 * the test files that draw a room.)
 */

jest.mock("react-native-webview", () => ({ WebView: "WebView" }));

jest.mock("react-native-pdf", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: (props) => React.createElement("Pdf", { ...props, testID: "material-pdf" }),
  };
});

jest.mock("expo-video", () => {
  const React = require("react");
  /** Every player made since the last reset, newest last; a test reads and drives them. */
  const players = [];
  function makePlayer(source) {
    const listeners = new Map();
    const player = {
      source,
      currentTime: 0,
      duration: 120,
      playing: false,
      status: "readyToPlay",
      addListener(name, listener) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(listener);
        return { remove: () => listeners.get(name).delete(listener) };
      },
      removeListener(name, listener) {
        listeners.get(name)?.delete(listener);
      },
      emit(name, payload) {
        for (const listener of listeners.get(name) ?? []) listener(payload);
      },
      play: jest.fn(() => {
        player.playing = true;
        player.emit("playingChange", { isPlaying: true });
      }),
      pause: jest.fn(() => {
        player.playing = false;
        player.emit("playingChange", { isPlaying: false });
      }),
    };
    return player;
  }
  return {
    __players: players,
    useVideoPlayer(source, setup) {
      const ref = React.useRef(null);
      if (!ref.current) {
        ref.current = makePlayer(source);
        if (setup) setup(ref.current);
        players.push(ref.current);
      }
      return ref.current;
    },
    VideoView: "VideoView",
  };
});

/*
 * What a student uses to answer homework (A-212): the camera, the gallery and
 * file pickers, and the recorder. A test decides what each hands back.
 */
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  launchCameraAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: null })),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: null })),
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: null })),
}));

// The tests run as on a real phone: the simulator has no camera, and the app does not open one there.
jest.mock("expo-device", () => ({ ...jest.requireActual("expo-device"), isDevice: true }));

jest.mock("expo-audio", () => {
  const React = require("react");
  /** The one recorder and the players made since the last reset; a test reads and drives them. */
  const state = { recorder: null, players: [] };
  function makeRecorder() {
    const listeners = new Set();
    const recorder = {
      uri: null,
      isRecording: false,
      durationMillis: 0,
      prepareToRecordAsync: jest.fn(() => Promise.resolve()),
      record: jest.fn(() => {
        recorder.isRecording = true;
        listeners.forEach((listener) => listener());
      }),
      stop: jest.fn(() => {
        recorder.isRecording = false;
        recorder.uri = "file:///recordings/answer.m4a";
        listeners.forEach((listener) => listener());
        return Promise.resolve();
      }),
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    return recorder;
  }
  return {
    __state: state,
    RecordingPresets: { HIGH_QUALITY: {} },
    requestRecordingPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
    useAudioRecorder() {
      const ref = React.useRef(null);
      if (!ref.current) {
        ref.current = makeRecorder();
        state.recorder = ref.current;
      }
      return ref.current;
    },
    useAudioRecorderState(recorder) {
      const [, bump] = React.useReducer((n) => n + 1, 0);
      React.useEffect(() => recorder.subscribe(bump), [recorder]);
      return {
        canRecord: true,
        isRecording: recorder.isRecording,
        durationMillis: recorder.durationMillis,
      };
    },
    useAudioPlayer(source) {
      const ref = React.useRef(null);
      if (!ref.current) {
        ref.current = { source, play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() };
        state.players.push(ref.current);
      }
      return ref.current;
    },
    useAudioPlayerStatus() {
      return { playing: false, currentTime: 0, duration: 12 };
    },
  };
});

/*
 * A phone sends a form with its own request (src/lib/send-form.native.ts,
 * which has a test of its own). In every other test a form goes through
 * `fetch`, so the server a test makes up answers it too.
 */
jest.mock("./src/lib/send-form", () => jest.requireActual("./src/lib/send-form.ts"));

/*
 * The window a sheet opens in. As on an iPhone, taking it away is told back
 * with `onDismiss`: a sheet waits for that before the next one may open
 * (src/components/sheet.tsx).
 */
jest.mock("react-native/Libraries/Modal/Modal", () => {
  const React = require("react");
  function Modal({ visible = true, onDismiss, children, ...rest }) {
    const was = React.useRef(visible);
    React.useEffect(() => {
      if (was.current && !visible && onDismiss) onDismiss();
      was.current = visible;
    }, [visible, onDismiss]);
    return visible ? React.createElement("Modal", rest, children) : null;
  }
  return { __esModule: true, default: Modal };
});
