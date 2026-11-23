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
