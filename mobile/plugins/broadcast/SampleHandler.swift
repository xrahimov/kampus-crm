import CoreImage
import CoreMedia
import Foundation
import ReplayKit

/*
 * Kampus's screen-share extension (A-223). While someone shares the screen of
 * an iPhone or iPad, iOS runs this in a process of its own and hands it every
 * frame. The frames go to the app through a socket in the folder the two share
 * (the app group), in the form the app's WebRTC library reads: one HTTP-like
 * message per frame, with a JPEG as its body.
 *
 * The app is told that sharing began and ended with Darwin notifications,
 * which cross between processes and carry nothing but their name.
 */

private enum Names {
  static let started = "center.kampus.app.broadcast.started"
  static let stopped = "center.kampus.app.broadcast.stopped"
  /** The file the app's WebRTC library listens on, inside the shared folder. */
  static let socketFile = "rtc_SSFD"
  /** The Info.plist key that names the shared folder (written when the project is generated). */
  static let groupKey = "KampusAppGroup"
}

/** Why the extension ends a broadcast itself, in words iOS shows the person. */
private enum Ending {
  case stoppedInApp
  case noLesson

  var text: String {
    let language = String(Locale.preferredLanguages.first?.prefix(2) ?? "en")
    switch (self, language) {
    case (.stoppedInApp, "uz"): return "Ekranni ko'rsatish to'xtatildi."
    case (.stoppedInApp, "ru"): return "Показ экрана остановлен."
    case (.stoppedInApp, _): return "Screen sharing has stopped."
    case (.noLesson, "uz"):
      return "Avval Kampus ilovasida darsga kiring va \"Ekranni ko'rsatish\" tugmasini bosing."
    case (.noLesson, "ru"):
      return "Сначала войдите в урок в приложении Kampus и нажмите «Показать экран»."
    case (.noLesson, _):
      return "Join a lesson in the Kampus app first, then press Share screen there."
    }
  }

  var code: Int {
    switch self {
    case .stoppedInApp: return 1
    case .noLesson: return 2
    }
  }
}

/** The extension's end of the socket. Everything runs on the queue it is given. */
private final class AppSocket {
  private var descriptor: Int32 = -1
  private var reader: DispatchSourceRead?
  private let queue: DispatchQueue
  /** Called once when the app closes its end. */
  var onClosed: (() -> Void)?

  init(queue: DispatchQueue) {
    self.queue = queue
  }

  var isOpen: Bool { descriptor >= 0 }

  /** Connects to the app's socket file. False while the app is not listening yet. */
  func open(path: String) -> Bool {
    let fd = socket(AF_UNIX, SOCK_STREAM, 0)
    guard fd >= 0 else { return false }
    // Writing to a socket the app has closed must fail, not end this process.
    var on: Int32 = 1
    setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))

    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    let bytes = Array(path.utf8)
    guard bytes.count < MemoryLayout.size(ofValue: address.sun_path) else {
      Darwin.close(fd)
      return false
    }
    withUnsafeMutableBytes(of: &address.sun_path) { raw in
      raw.copyBytes(from: bytes)
    }
    let length = socklen_t(MemoryLayout<sockaddr_un>.size)
    let result = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.connect(fd, $0, length) }
    }
    guard result == 0 else {
      Darwin.close(fd)
      return false
    }
    descriptor = fd

    // The app sends nothing back, so anything to read here means it hung up.
    let source = DispatchSource.makeReadSource(fileDescriptor: fd, queue: queue)
    source.setEventHandler { [weak self] in
      var byte: UInt8 = 0
      let count = Darwin.recv(fd, &byte, 1, 0)
      if count == 0 || (count < 0 && errno != EAGAIN && errno != EINTR) {
        self?.hungUp()
      }
    }
    source.resume()
    reader = source
    return true
  }

  /** Sends the whole of `data`. False when the app's end is gone. */
  func write(_ data: Data) -> Bool {
    let fd = descriptor
    guard fd >= 0 else { return false }
    return data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) -> Bool in
      guard let base = raw.baseAddress else { return true }
      var sent = 0
      while sent < raw.count {
        let count = Darwin.send(fd, base + sent, raw.count - sent, 0)
        if count < 0 && errno == EINTR { continue }
        if count <= 0 { return false }
        sent += count
      }
      return true
    }
  }

  func shut() {
    reader?.cancel()
    reader = nil
    if descriptor >= 0 {
      Darwin.close(descriptor)
      descriptor = -1
    }
  }

  private func hungUp() {
    guard isOpen else { return }
    shut()
    onClosed?()
  }
}

/** Turns a frame of the screen into the message the app reads. */
private final class FrameWriter {
  /** The longer side of what is sent, in dots: enough to read text, light enough for a phone. */
  private static let longestSide: CGFloat = 1440
  private static let quality: CGFloat = 0.8
  private let context = CIContext(options: nil)

  func message(for sample: CMSampleBuffer) -> Data? {
    guard let pixels = CMSampleBufferGetImageBuffer(sample) else { return nil }
    let fullWidth = CGFloat(CVPixelBufferGetWidth(pixels))
    let fullHeight = CGFloat(CVPixelBufferGetHeight(pixels))
    guard fullWidth > 0, fullHeight > 0 else { return nil }
    let shrink = min(1, FrameWriter.longestSide / max(fullWidth, fullHeight))
    let width = max(1, (fullWidth * shrink).rounded(.down))
    let height = max(1, (fullHeight * shrink).rounded(.down))

    var image = CIImage(cvPixelBuffer: pixels)
    if shrink < 1 {
      image = image.transformed(
        by: CGAffineTransform(scaleX: width / fullWidth, y: height / fullHeight))
    }
    image = image.cropped(to: CGRect(x: 0, y: 0, width: width, height: height))

    guard let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
    let options: [CIImageRepresentationOption: Any] = [
      kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: FrameWriter.quality
    ]
    guard let jpeg = context.jpegRepresentation(of: image, colorSpace: space, options: options)
    else { return nil }

    // Which way up the screen was held; the app turns the picture by it.
    var orientation = CGImagePropertyOrientation.up.rawValue
    if let held = CMGetAttachment(
      sample, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber
    {
      orientation = held.uint32Value
    }

    let message = CFHTTPMessageCreateResponse(kCFAllocatorDefault, 200, nil, kCFHTTPVersion1_1)
      .takeRetainedValue()
    let set = { (name: String, value: String) in
      CFHTTPMessageSetHeaderFieldValue(message, name as CFString, value as CFString)
    }
    set("Content-Length", String(jpeg.count))
    set("Buffer-Width", String(Int(width)))
    set("Buffer-Height", String(Int(height)))
    set("Buffer-Orientation", String(orientation))
    CFHTTPMessageSetBody(message, jpeg as CFData)
    guard let whole = CFHTTPMessageCopySerializedMessage(message)?.takeRetainedValue() else {
      return nil
    }
    return whole as Data
  }
}

final class SampleHandler: RPBroadcastSampleHandler {
  /** At most this many frames a second leave the phone. */
  private static let framesPerSecond: Double = 15
  /** How long the app gets to open its end after sharing began: 40 tries, a quarter second apart. */
  private static let tries = 40
  private static let tryGap = DispatchTimeInterval.milliseconds(250)

  private let work = DispatchQueue(label: "center.kampus.app.broadcast")
  private lazy var socket = AppSocket(queue: work)
  private let frames = FrameWriter()
  private let lock = NSLock()
  private var busy = false
  private var lastTaken: TimeInterval = 0
  /** Read and written on `work` only. */
  private var finished = false

  override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
    work.async { [weak self] in
      guard let self = self else { return }
      self.socket.onClosed = { [weak self] in self?.end(.stoppedInApp) }
      SampleHandler.tell(Names.started)
      self.reach(triesLeft: SampleHandler.tries)
    }
  }

  override func broadcastFinished() {
    work.async { [weak self] in
      guard let self = self, !self.finished else { return }
      self.finished = true
      self.socket.shut()
      SampleHandler.tell(Names.stopped)
    }
  }

  override func processSampleBuffer(
    _ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType
  ) {
    guard sampleBufferType == .video else { return }
    // One frame at a time, and no more often than the rate above; the rest are let go.
    let now = ProcessInfo.processInfo.systemUptime
    lock.lock()
    let take = !busy && now - lastTaken >= 1 / SampleHandler.framesPerSecond
    if take {
      busy = true
      lastTaken = now
    }
    lock.unlock()
    guard take else { return }

    work.async { [weak self] in
      guard let self = self else { return }
      defer {
        self.lock.lock()
        self.busy = false
        self.lock.unlock()
      }
      guard !self.finished, self.socket.isOpen,
        let message = self.frames.message(for: sampleBuffer)
      else { return }
      if !self.socket.write(message) {
        self.end(.stoppedInApp)
      }
    }
  }

  /** Runs on `work`. Tries the app's socket until it answers or the tries run out. */
  private func reach(triesLeft: Int) {
    guard !finished else { return }
    if let path = SampleHandler.socketPath(), socket.open(path: path) { return }
    guard triesLeft > 0 else {
      end(.noLesson)
      return
    }
    work.asyncAfter(deadline: .now() + SampleHandler.tryGap) { [weak self] in
      self?.reach(triesLeft: triesLeft - 1)
    }
  }

  /** Runs on `work`. Ends the broadcast from this side, with words for the person. */
  private func end(_ why: Ending) {
    guard !finished else { return }
    finished = true
    socket.shut()
    SampleHandler.tell(Names.stopped)
    let error = NSError(
      domain: "center.kampus.app.broadcast", code: why.code,
      userInfo: [
        NSLocalizedDescriptionKey: why.text,
        NSLocalizedFailureReasonErrorKey: why.text,
      ])
    finishBroadcastWithError(error)
  }

  private static func socketPath() -> String? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: Names.groupKey) as? String,
      let folder = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: group)
    else { return nil }
    return folder.appendingPathComponent(Names.socketFile).path
  }

  private static func tell(_ name: String) {
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(), CFNotificationName(name as CFString), nil, nil,
      true)
  }
}
